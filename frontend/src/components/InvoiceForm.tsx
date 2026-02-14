import React, { useState, useEffect } from 'react';
import { Send, Loader2, Mail, Phone, Wallet, Link2 } from 'lucide-react';
import axios from 'axios';
import { useAccount, useWalletClient, useSwitchChain, usePublicClient } from 'wagmi';
import { parseUnits } from 'viem';
import { Abis } from 'viem/tempo';
import { toast } from 'react-hot-toast';
import { isValidAddress, authAxios } from '../api';

interface InvoiceFormProps {
  onCreated: (id: string) => void;
  prefillAddress?: string | null;
}

type AppMode = 'send' | 'request';
type RecipientMode = 'wallet' | 'email' | 'phone';

const TOKEN_ADDRESS = '0x20c0000000000000000000000000000000000000' as `0x${string}`;

const InvoiceForm: React.FC<InvoiceFormProps> = ({ onCreated, prefillAddress }) => {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  const [appMode, setAppMode] = useState<AppMode>(prefillAddress ? 'send' : 'send');
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [recipientMode, setRecipientMode] = useState<RecipientMode>('wallet');
  const [lookupValue, setLookupValue] = useState('');
  const [resolvedName, setResolvedName] = useState('');
  const [contacts, setContacts] = useState<{name: string, address: string}[]>([]);
  const [txHash, setTxHash] = useState('');
  const [recipientAddress, setRecipientAddress] = useState(prefillAddress || '');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [tokenAddress, setTokenAddress] = useState(TOKEN_ADDRESS as string);

  useEffect(() => {
    if (prefillAddress) {
      setRecipientAddress(prefillAddress);
      setAppMode('send');
    }
  }, [prefillAddress]);

  useEffect(() => {
    if (!address) return;
    axios.get(`/api/contacts?wallet=${address}`)
      .then(r => setContacts((r.data || []).map((c: any) => ({ name: c.name, address: c.address }))))
      .catch(() => {});
  }, [address]);

  const handleLookup = async () => {
    if (!address || !lookupValue) return;
    setLookingUp(true);
    try {
      const params = new URLSearchParams({ wallet: address });
      if (recipientMode === 'email') params.set('email', lookupValue);
      else params.set('phone', lookupValue);

      const resp = await axios.get(`/api/contacts/lookup?${params.toString()}`);
      if (resp.data.found) {
        setRecipientAddress(resp.data.contact.address);
        setResolvedName(resp.data.contact.name);
        toast.success(`found: ${resp.data.contact.name}`);
      } else {
        setResolvedName('');
        if (appMode === 'request') {
          toast('no match. a payment link will be generated instead', { icon: '📨' });
        } else {
          toast.error('no contact found with that info');
        }
      }
    } catch {
      toast.error('lookup failed');
    } finally {
      setLookingUp(false);
    }
  };

  // ── SEND MODE: direct on-chain transfer ──
  const handleDirectSend = async () => {
    if (!address || !walletClient || !publicClient) {
      toast.error('connect your wallet first');
      return;
    }
    if (!isValidAddress(recipientAddress)) {
      toast.error('invalid recipient address');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      await switchChain({ chainId: 42431 });
    } catch { /* may already be on chain */ }

    try {
      const decimals = await publicClient.readContract({
        address: tokenAddress as `0x${string}`,
        abi: Abis.tip20,
        functionName: 'decimals',
      }) as number;

      const amountWei = parseUnits(amount, decimals);

      // Simulate first
      await publicClient.simulateContract({
        account: address,
        address: tokenAddress as `0x${string}`,
        abi: Abis.tip20,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, amountWei],
      });

      const hash = await walletClient.writeContract({
        address: tokenAddress as `0x${string}`,
        abi: Abis.tip20,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, amountWei],
      });

      setTxHash(hash);
      toast.success('transaction sent! waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        toast.success(`sent $${amount} successfully!`);
        // Also record this as a paid invoice in the backend
        try {
          const api = authAxios(address);
          const inv = await api.post('/api/invoices', {
            merchantAddress: recipientAddress,
            amount: parseFloat(amount),
            tokenAddress,
            memo: memo || `sent $${amount}`,
            customerEmail: '',
          });
          await api.post(`/api/invoices/${inv.data.id}/pay`, {
            txHash: hash,
            payerAddress: address,
          });
        } catch {
          // on-chain succeeded, backend logging failed. not critical.
        }
      } else {
        toast.error('transaction reverted on-chain');
        setTxHash('');
      }
    } catch (err: any) {
      const reason = err.shortMessage || err.message || 'unknown error';
      toast.error(`transfer failed: ${reason}`);
      setTxHash('');
    } finally {
      setLoading(false);
    }
  };

  // ── REQUEST MODE: generate payment link ──
  const handleCreateRequest = async () => {
    if (!address) {
      toast.error('connect your wallet first');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const api = authAxios(address);
      const resp = await api.post('/api/invoices', {
        merchantAddress: address, // YOU receive the money
        customerEmail: recipientMode === 'email' ? lookupValue : '',
        amount: parseFloat(amount),
        tokenAddress,
        memo: memo || `request for $${amount}`,
      });
      toast.success('payment link created!');
      onCreated(resp.data.id);
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'failed to create request';
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (appMode === 'send') {
      handleDirectSend();
    } else {
      handleCreateRequest();
    }
  };

  if (txHash) {
    return (
      <div className="glass-card animate-fade-in" style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center', padding: '2.5rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
        <h2>payment sent!</h2>
        <p style={{ color: 'var(--fg-secondary)', marginBottom: '1rem' }}>
          ${amount} sent to {resolvedName || `${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}`}
        </p>
        {memo && <p style={{ fontSize: '0.85rem', color: 'var(--fg-secondary)' }}>{memo}</p>}
        <a
          href={`https://explore.tempo.xyz/tx/${txHash}`}
          target="_blank"
          rel="noreferrer"
          style={{ color: 'var(--accent)', fontSize: '0.8rem' }}
        >
          view on explorer: {txHash.slice(0, 10)}...{txHash.slice(-6)}
        </a>
        <button
          className="btn-primary"
          style={{ width: '100%', marginTop: '1.5rem' }}
          onClick={() => {
            setTxHash('');
            setAmount('');
            setMemo('');
            setRecipientAddress('');
            setResolvedName('');
          }}
        >
          send another
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card" style={{ maxWidth: '780px', margin: '0 auto' }}>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: '0', marginBottom: '1.5rem', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid var(--border)' }}>
        <button
          type="button"
          onClick={() => setAppMode('send')}
          style={{
            flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer',
            background: appMode === 'send' ? 'var(--accent)' : 'transparent',
            color: appMode === 'send' ? '#fff' : 'var(--fg-secondary)',
            fontWeight: 700, fontSize: '0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
          }}
        >
          <Send size={16} /> send
        </button>
        <button
          type="button"
          onClick={() => setAppMode('request')}
          style={{
            flex: 1, padding: '0.75rem', border: 'none', cursor: 'pointer',
            background: appMode === 'request' ? 'var(--accent)' : 'transparent',
            color: appMode === 'request' ? '#fff' : 'var(--fg-secondary)',
            fontWeight: 700, fontSize: '0.9rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
          }}
        >
          <Link2 size={16} /> request
        </button>
      </div>

      <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        {appMode === 'send' ? (
          <><Send size={24} /> send payment</>
        ) : (
          <><Link2 size={24} /> request payment</>
        )}
      </h2>

      <form onSubmit={handleSubmit}>
        {/* Recipient (only for send mode) */}
        {appMode === 'send' && (
          <div className="input-group">
            <label>to</label>
            <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.75rem' }}>
              {([
                { mode: 'wallet' as RecipientMode, icon: <Wallet size={14} />, label: 'wallet' },
                { mode: 'email' as RecipientMode, icon: <Mail size={14} />, label: 'email' },
                { mode: 'phone' as RecipientMode, icon: <Phone size={14} />, label: 'phone' },
              ]).map(opt => (
                <button
                  key={opt.mode}
                  type="button"
                  className={`btn-secondary ${recipientMode === opt.mode ? 'active' : ''}`}
                  style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    setRecipientMode(opt.mode);
                    setResolvedName('');
                    setLookupValue('');
                    setRecipientAddress('');
                  }}
                >
                  {opt.icon} {opt.label}
                </button>
              ))}
            </div>

            {recipientMode === 'wallet' ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--fg-secondary)' }}>recipient address</span>
                  {contacts.length > 0 && (
                    <select
                      onChange={(e) => setRecipientAddress(e.target.value)}
                      value=""
                      style={{ width: 'auto', fontSize: '0.75rem', padding: '0.3rem 1.5rem 0.3rem 0.5rem' }}
                    >
                      <option value="" disabled>pick from contacts</option>
                      {contacts.map((c, i) => (
                        <option key={i} value={c.address}>{c.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={e => setRecipientAddress(e.target.value)}
                  required
                  style={{
                    borderColor: recipientAddress && !isValidAddress(recipientAddress) ? 'var(--danger)' : undefined,
                  }}
                />
                {recipientAddress && !isValidAddress(recipientAddress) && (
                  <p style={{ fontSize: '0.7rem', color: 'var(--danger)', marginTop: '0.3rem' }}>
                    invalid address format (0x + 40 hex chars)
                  </p>
                )}
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type={recipientMode === 'email' ? 'email' : 'tel'}
                    placeholder={recipientMode === 'email' ? 'friend@example.com' : '+1 555-123-4567'}
                    value={lookupValue}
                    onChange={e => setLookupValue(e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleLookup}
                    disabled={lookingUp || !lookupValue}
                    style={{ whiteSpace: 'nowrap', padding: '0.5rem 0.75rem' }}
                  >
                    {lookingUp ? <Loader2 className="animate-spin" size={16} /> : 'lookup'}
                  </button>
                </div>
                {resolvedName && (
                  <div style={{
                    marginTop: '0.5rem', padding: '0.5rem 0.75rem',
                    background: 'rgba(34, 197, 94, 0.08)', border: '1px solid rgba(34, 197, 94, 0.2)',
                    borderRadius: '0.5rem', fontSize: '0.8rem', color: 'var(--success)',
                    display: 'flex', alignItems: 'center', gap: '0.4rem'
                  }}>
                    ✓ {resolvedName} ({recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)})
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="input-group">
          <label>amount (USD)</label>
          <input
            type="number"
            step="0.01"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="input-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label>memo</label>
            <span style={{ fontSize: '0.7rem', color: memo.length > 100 ? 'var(--danger)' : 'var(--fg-secondary)' }}>
              {memo.length}/120
            </span>
          </div>
          <textarea
            placeholder={appMode === 'send' ? 'what is this for?' : 'what are you requesting for?'}
            value={memo}
            onChange={e => { if (e.target.value.length <= 120) setMemo(e.target.value); }}
            rows={2}
            style={{ resize: 'vertical', minHeight: '60px' }}
          />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
            {[
              { emoji: '🍕', label: 'dinner' },
              { emoji: '☕', label: 'coffee' },
              { emoji: '🏠', label: 'rent' },
              { emoji: '💸', label: 'repayment' },
              { emoji: '🎁', label: 'gift' },
              { emoji: '🛒', label: 'groceries' },
            ].map(tag => (
              <button
                key={tag.label}
                type="button"
                className="btn-secondary"
                style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                onClick={() => setMemo(`${tag.emoji} ${tag.label}`)}
              >
                {tag.emoji} {tag.label}
              </button>
            ))}
          </div>
        </div>

        <div className="input-group">
          <label>token</label>
          <select value={tokenAddress} onChange={e => setTokenAddress(e.target.value)}>
            <option value="0x20c0000000000000000000000000000000000000">pathUSD</option>
            <option value="0x20c0000000000000000000000000000000000001">AlphaUSD</option>
            <option value="0x20c0000000000000000000000000000000000002">BetaUSD</option>
          </select>
        </div>

        <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
          {loading ? (
            <><Loader2 className="animate-spin" /> processing...</>
          ) : appMode === 'send' ? (
            <><Send size={18} /> send ${amount || '0.00'}</>
          ) : (
            <><Link2 size={18} /> create payment link</>
          )}
        </button>
      </form>
    </div>
  );
};

export default InvoiceForm;
