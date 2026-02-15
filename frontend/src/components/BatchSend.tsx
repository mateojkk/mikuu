import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2, CheckCircle, XCircle, Layers } from 'lucide-react';
import { useAccount, useWriteContract, useSwitchChain, usePublicClient } from 'wagmi';
import { parseUnits, encodeFunctionData } from 'viem';
import { Abis } from 'viem/tempo';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { isValidAddress } from '../api';


interface Recipient {
  id: string;
  address: string;
  amount: string;
  memo: string;
}

const TOKEN_ADDRESS = '0x20c0000000000000000000000000000000000000' as `0x${string}`;
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`;

const multicallAbi = [
  {
    name: 'aggregate3',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'calls', type: 'tuple[]', components: [
      { name: 'target', type: 'address' },
      { name: 'allowFailure', type: 'bool' },
      { name: 'callData', type: 'bytes' },
    ]}],
    outputs: [{ name: 'returnData', type: 'tuple[]', components: [
      { name: 'success', type: 'bool' },
      { name: 'returnData', type: 'bytes' },
    ]}],
  },
] as const;

export default function BatchSend() {
  const { address, isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [sending, setSending] = useState(false);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'pending' | 'confirmed' | 'failed'>('idle');
  const [txHash, setTxHash] = useState('');
  const [fallbackMode, setFallbackMode] = useState(false);
  const [contacts, setContacts] = useState<{name: string, address: string}[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([
    { id: crypto.randomUUID(), address: '', amount: '', memo: '' },
  ]);

  useEffect(() => {
    if (!address) return;
    axios.get(`/api/contacts?wallet=${address}`)
      .then(r => setContacts((r.data || []).map((c: any) => ({ name: c.name, address: c.address }))))
      .catch(() => {});
  }, [address]);

  const addRow = () => {
    setRecipients(prev => [...prev, { id: crypto.randomUUID(), address: '', amount: '', memo: '' }]);
  };

  const removeRow = (id: string) => {
    if (recipients.length <= 1) return;
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  const updateRow = (id: string, field: keyof Recipient, value: string) => {
    setRecipients(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const totalAmount = recipients.reduce((acc, r) => acc + (parseFloat(r.amount) || 0), 0);

  /**
   * Check if Multicall3 contract exists on the chain.
   * Falls back to parallel sends if not deployed.
   */
  const checkMulticall3 = async (): Promise<boolean> => {
    if (!publicClient) return false;
    try {
      const code = await publicClient.getCode({ address: MULTICALL3_ADDRESS });
      return !!code && code !== '0x';
    } catch {
      return false;
    }
  };

  /**
   * Fallback: send transfers in parallel (like MultiSend) 
   * when Multicall3 is not available.
   */
  const sendParallelFallback = async (
    validRecipients: Recipient[],
    decimals: number,
  ) => {
    toast('multicall3 not found — sending transfers individually', { icon: '⚠️' });
    setFallbackMode(true);

    const results = await Promise.allSettled(
      validRecipients.map(async (r) => {
        const amountWei = parseUnits(r.amount, decimals);
        const hash = await writeContractAsync({
          address: TOKEN_ADDRESS,
          abi: Abis.tip20,
          functionName: 'transfer',
          args: [r.address as `0x${string}`, amountWei],
        });
        const receipt = await publicClient!.waitForTransactionReceipt({ hash });
        if (receipt.status !== 'success') throw new Error('reverted');
        return hash;
      })
    );

    const successes = results.filter(r => r.status === 'fulfilled').length;
    const failures = results.filter(r => r.status === 'rejected').length;

    if (failures === 0) {
      setBatchStatus('confirmed');
      const firstHash = (results[0] as PromiseFulfilledResult<string>).value;
      setTxHash(firstHash);
      toast.success(`all ${successes} payments confirmed!`);
    } else {
      setBatchStatus('failed');
      toast.error(`${successes} sent, ${failures} failed`);
    }
  };

  const handleBatchSend = async () => {
    if (!isConnected || !address || !publicClient) {
      toast.error('connect your wallet first');
      return;
    }

    const validRecipients = recipients.filter(r => r.address && r.amount && parseFloat(r.amount) > 0);
    if (validRecipients.length === 0) {
      toast.error('add at least one recipient with an amount');
      return;
    }

    // Validate all addresses
    const invalid = validRecipients.filter(r => !isValidAddress(r.address));
    if (invalid.length > 0) {
      toast.error(`${invalid.length} recipient(s) have invalid addresses`);
      return;
    }

    setSending(true);
    setBatchStatus('pending');
      setTxHash('');
    setFallbackMode(false);

    try {
      await switchChainAsync({ chainId: 42431 });
    } catch { /* may already be on chain */ }

    // Fetch decimals
    let decimals: number;
    try {
      decimals = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: Abis.tip20,
        functionName: 'decimals',
      }) as number;
    } catch {
      toast.error('failed to read token decimals');
      setSending(false);
      setBatchStatus('idle');
      return;
    }

    // Balance check
    try {
      const balance = await publicClient.readContract({
        address: TOKEN_ADDRESS,
        abi: Abis.tip20,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      const totalWei = validRecipients.reduce(
        (acc, r) => acc + parseUnits(r.amount, decimals),
        0n
      );

      if (balance < totalWei) {
        toast.error('insufficient token balance for batch');
        setSending(false);
        setBatchStatus('idle');
        return;
      }
    } catch {
      toast.error('failed to check balance');
      setSending(false);
      setBatchStatus('idle');
      return;
    }

    // Check if Multicall3 exists on this chain
    const hasMulticall = await checkMulticall3();

    if (!hasMulticall) {
      // Fallback to parallel sends
      try {
        await sendParallelFallback(validRecipients, decimals);
      } catch (err: any) {
        setBatchStatus('failed');
        toast.error(err.shortMessage || err.message || 'batch failed');
      }
      setSending(false);
      return;
    }

    // ── Multicall3 atomic batch ──
    try {
      const calls = validRecipients.map(r => ({
        target: TOKEN_ADDRESS,
        allowFailure: false as const,
        callData: encodeFunctionData({
          abi: Abis.tip20,
          functionName: 'transfer',
          args: [r.address as `0x${string}`, parseUnits(r.amount, decimals)],
        }),
      }));

      const hash = await writeContractAsync({
        address: MULTICALL3_ADDRESS,
        abi: multicallAbi,
        functionName: 'aggregate3',
        args: [calls],
      });

      setTxHash(hash);
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        setBatchStatus('confirmed');
        toast.success(`batch confirmed! ${validRecipients.length} transfers in 1 tx`);
      } else {
        setBatchStatus('failed');
        toast.error('batch reverted — all transfers rolled back');
      }
    } catch (err: any) {
      setBatchStatus('failed');
      toast.error(err.shortMessage || err.message || 'batch failed');
    }

    setSending(false);
  };

  if (!isConnected) {
    return (
      <div className="glass-card animate-fade-in" style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
        <Layers size={32} style={{ marginBottom: '1rem', color: 'var(--fg-secondary)' }} />
        <p style={{ color: 'var(--fg-secondary)' }}>connect your wallet to use batch send</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ maxWidth: '700px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Layers size={24} /> batch send
        </h2>
        <span style={{ fontSize: '0.85rem', color: 'var(--fg-secondary)' }}>
          {recipients.filter(r => r.address && r.amount).length} recipient{recipients.filter(r => r.address && r.amount).length !== 1 ? 's' : ''} · ${totalAmount > 1e9 ? 'very large' : totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
      </div>

      <div style={{ 
        padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '0.5rem',
        background: 'rgba(0, 82, 255, 0.06)', border: '1px solid rgba(0, 82, 255, 0.15)',
        fontSize: '0.8rem', color: 'var(--fg-secondary)',
      }}>
        ⚡ All transfers execute in a single transaction — all succeed or all fail.
        {fallbackMode && (
          <span style={{ color: 'var(--accent)', fontWeight: 600 }}> (fallback: individual sends)</span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {recipients.map((r, i) => (
          <div key={r.id} className="glass-card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--fg-secondary)', fontWeight: 700, minWidth: '1.5rem' }}>#{i + 1}</span>
              {contacts.length > 0 && (
                <select
                  onChange={e => updateRow(r.id, 'address', e.target.value)}
                  value=""
                  style={{ width: 'auto', fontSize: '0.75rem', padding: '0.25rem 1.5rem 0.25rem 0.5rem' }}
                  disabled={batchStatus !== 'idle'}
                >
                  <option value="" disabled>contact</option>
                  {contacts.map((c, ci) => (
                    <option key={ci} value={c.address}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="0x... address"
                value={r.address}
                onChange={e => updateRow(r.id, 'address', e.target.value)}
                style={{
                  flex: '2 1 200px', fontFamily: 'monospace', fontSize: '0.85rem',
                  borderColor: r.address && !isValidAddress(r.address) ? 'var(--danger)' : undefined,
                }}
                disabled={batchStatus !== 'idle'}
              />
              <input
                type="number"
                step="0.01"
                placeholder="amount"
                value={r.amount}
                onChange={e => updateRow(r.id, 'amount', e.target.value)}
                style={{ flex: '1 1 100px' }}
                disabled={batchStatus !== 'idle'}
              />
              <button
                type="button"
                onClick={() => removeRow(r.id)}
                disabled={recipients.length <= 1 || batchStatus !== 'idle'}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '0.5rem' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Status */}
      {batchStatus !== 'idle' && (
        <div className="glass-card" style={{
          marginTop: '1rem', padding: '1rem', textAlign: 'center',
          borderColor: batchStatus === 'confirmed' ? 'var(--success)' : batchStatus === 'failed' ? 'var(--danger)' : 'var(--accent)',
        }}>
          {batchStatus === 'pending' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--accent)' }}>
              <Loader2 className="animate-spin" size={18} /> processing batch...
            </div>
          )}
          {batchStatus === 'confirmed' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--success)' }}>
              <CheckCircle size={18} /> batch confirmed!
            </div>
          )}
          {batchStatus === 'failed' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: 'var(--danger)' }}>
              <XCircle size={18} /> batch failed — all transfers rolled back
            </div>
          )}
          {txHash && (
            <a
              href={`https://explore.tempo.xyz/tx/${txHash}`}
              target="_blank"
              rel="noreferrer"
              style={{ fontSize: '0.75rem', color: 'var(--accent)', marginTop: '0.5rem', display: 'inline-block' }}
            >
              tx: {txHash.slice(0, 10)}...{txHash.slice(-6)}
            </a>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button
          type="button"
          className="btn-secondary"
          onClick={addRow}
          disabled={sending || batchStatus !== 'idle'}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          <Plus size={16} /> add recipient
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={handleBatchSend}
          disabled={sending || recipients.every(r => !r.address || !r.amount) || batchStatus !== 'idle'}
          style={{ flex: 1, justifyContent: 'center', height: '3rem' }}
        >
          {sending ? (
            <><Loader2 className="animate-spin" size={18} /> processing...</>
          ) : (
            <><Layers size={18} /> batch send (${totalAmount.toFixed(2)})</>
          )}
        </button>
      </div>

      {batchStatus !== 'idle' && (
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setBatchStatus('idle');
            setTxHash('');
            setFallbackMode(false);
            setRecipients([{ id: crypto.randomUUID(), address: '', amount: '', memo: '' }]);
          }}
          style={{ width: '100%', marginTop: '0.75rem', justifyContent: 'center' }}
        >
          new batch
        </button>
      )}
    </div>
  );
}
