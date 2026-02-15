import { useState, useEffect } from 'react';
import { ChevronLeft, CheckCircle, Copy, Share2, Mail, Smartphone, Loader2 } from 'lucide-react';

import { QRCodeSVG } from 'qrcode.react';
import { parseUnits } from 'viem';
import { Abis } from 'viem/tempo';
import { useAccount, useWalletClient, useSwitchChain, usePublicClient } from 'wagmi';
import { toast } from 'react-hot-toast';
import { authAxios, baseApi } from '../api';
import Receipt from './Receipt';


interface Invoice {
  tokenAddress: `0x${string}`;
  id: string;
  merchantAddress: string;
  amount: string;
  memo: string;
  status: string;
  paymentLink: string;
  stablecoinName: string;
  tempoTxHash?: string;
  payerAddress?: string;
  paidAt?: string;
  createdAt?: string;
}

export default function PaymentPage({ invoiceId, onBack }: { invoiceId: string, onBack: () => void }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payStatus, setPayStatus] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();

  useEffect(() => {
    const fetchInvoice = async () => {
      try {
        const resp = await baseApi.get(`/invoices/${invoiceId}`);
        setInvoice(resp.data);
      } catch (err: any) {
        console.error(err);
        if (err.response?.status === 404) {
          toast.error('Invoice not found');
        } else {
          toast.error('Failed to load invoice');
        }
      }
    };

    fetchInvoice();
    const interval = setInterval(() => {
      if (invoice?.status !== 'PAID') {
        fetchInvoice();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [invoiceId, invoice?.status]);

  if (!invoice) return <div style={{ textAlign: 'center', padding: '3rem' }}>loading invoice...</div>;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(invoice.paymentLink);
    setCopied(true);
    toast.success("link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const shareEmail = () => {
    const subject = `payment request: ${invoice.memo}`;
    const body = `hi,\n\nplease pay ${invoice.amount} usd via payme.\n\nlink: ${invoice.paymentLink}`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const shareSMS = () => {
    const body = `pay ${invoice.amount} usd to ${invoice.merchantAddress} using payme: ${invoice.paymentLink}`;
    window.location.href = `sms:?body=${encodeURIComponent(body)}`;
  };

  const handlePayWithWallet = async () => {
    if (!isConnected || !walletClient || !address || !publicClient) {
      toast.error('please connect your wallet first.');
      return;
    }

    setPaying(true);
    setPayStatus('checking balance...');
    try {
      try {
        await switchChain({ chainId: 42431 });
      } catch {
        // user may have rejected or chain already active
      }

      // 1. Fetch decimals dynamically
      const decimals = await publicClient.readContract({
        address: invoice.tokenAddress,
        abi: Abis.tip20,
        functionName: 'decimals',
      }) as number;

      // 2. Check balance
      const balance = await publicClient.readContract({
        address: invoice.tokenAddress,
        abi: Abis.tip20,
        functionName: 'balanceOf',
        args: [address],
      }) as bigint;

      const amountWei = parseUnits(invoice.amount, decimals);

      if (balance < amountWei) {
        setPaying(false);
        setPayStatus('');
        toast.error(`insufficient balance. you need ${invoice.amount} tokens.`);
        return;
      }

      setPayStatus('simulating transaction...');
      try {
        await publicClient.simulateContract({
          account: address,
          address: invoice.tokenAddress,
          abi: Abis.tip20,
          functionName: 'transfer',
          args: [invoice.merchantAddress as `0x${string}`, amountWei],
        });
      } catch (simErr: any) {
        setPaying(false);
        setPayStatus('');
        console.error('simulation failed:', simErr);
        // show a more detailed toast or alert
        const reason = simErr.shortMessage || simErr.message || 'unknown error';
        toast.error(`transaction would revert: ${reason}`, { duration: 6000 });
        return;
      }

      setPayStatus('sending transaction...');

      // use walletClient.writeContract with the official TIP-20 ABI from viem/tempo
      const hash = await walletClient.writeContract({
        address: invoice.tokenAddress,
        abi: Abis.tip20,
        functionName: 'transfer',
        args: [invoice.merchantAddress as `0x${string}`, amountWei],
      });

      setTxHash(hash);
      setPayStatus('waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        setPayStatus('confirmed!');
        toast.success("payment successful!");
        try {
          const resp = await authAxios(address).post(`/invoices/${invoiceId}/pay`, {
            txHash: hash,
            payerAddress: address,
          });
          setInvoice(resp.data);
        } catch {
          // tx succeeded on-chain, backend update failed — still okay
        }
        setPayStatus('');
      } else {
        setPayStatus('');
        toast.error('transaction reverted on-chain. ensure you have tokens for gas.');
      }

    } catch (err: any) {
      console.error(err);
      setPayStatus('');
      toast.error('payment failed: ' + (err.shortMessage || err.message || 'unknown error'));
    } finally {
      setPaying(false);
    }
  };


  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <ChevronLeft size={18} /> back to history
      </button>

      {invoice.status === 'PAID' ? (
        <>
          <Receipt invoice={invoice} />
          {(txHash || invoice.tempoTxHash) && (
            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <a
                href={`https://explore.tempo.xyz/tx/${txHash || invoice.tempoTxHash}`}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', fontSize: '0.85rem', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
              >
                track on-chain
              </a>
            </div>
          )}
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'row', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div className="glass-card" style={{ flex: '1 1 300px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <h3 style={{ marginBottom: '1.5rem', fontSize: '1.1rem' }}>scan to pay</h3>
            <div style={{ background: 'white', padding: '1.5rem', borderRadius: '1rem', marginBottom: '1.5rem', boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)' }}>
              <QRCodeSVG value={invoice.paymentLink} size={180} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', lineHeight: '1.4' }}>
              scan with any tempo-compatible wallet
            </p>
          </div>

          <div className="glass-card" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
              <div>
                <span className="status-badge status-pending">pending</span>
                <h2 style={{ marginTop: '0.75rem', fontSize: '2.5rem', fontWeight: '800' }}>${invoice.amount}</h2>
                <p style={{ color: 'var(--fg-secondary)', fontSize: '0.95rem' }}>{invoice.memo.toLowerCase() || 'general payment'}</p>
                {invoice.memo && (
                  <div style={{ 
                    background: 'rgba(0, 82, 255, 0.08)', 
                    border: '1px solid rgba(0, 82, 255, 0.15)', 
                    borderRadius: '0.6rem', 
                    padding: '0.6rem 0.8rem', 
                    marginTop: '0.75rem',
                    fontSize: '0.85rem',
                    color: 'var(--fg)',
                    fontStyle: 'italic'
                  }}>
                    📝 "{invoice.memo}"
                  </div>
                )}
              </div>
              <div style={{ color: 'var(--fg-secondary)' }}>
                <CheckCircle size={32} />
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', border: '1px solid var(--border)', borderRadius: '0.8rem', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--fg-secondary)', marginBottom: '0.4rem', fontWeight: '600' }}>recipient address</p>
              <p style={{ wordBreak: 'break-all', fontSize: '0.85rem', fontFamily: 'monospace' }}>{invoice.merchantAddress}</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', flex: '1' }}>
              <button className="btn-secondary" onClick={copyToClipboard} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Copy size={16} /> {copied ? 'copied!' : 'copy link'}</span>
                <Share2 size={16} />
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn-secondary" onClick={shareEmail} style={{ flex: '1', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <Mail size={16} /> email
                </button>
                <button className="btn-secondary" onClick={shareSMS} style={{ flex: '1', display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <Smartphone size={16} /> sms
                </button>
              </div>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <button
                className="btn-primary"
                onClick={handlePayWithWallet}
                disabled={paying}
                style={{ width: '100%', height: '3.5rem', justifyContent: 'center' }}
              >
                {paying ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Loader2 className="animate-spin" size={20} />
                    {payStatus || 'processing...'}
                  </span>
                ) : 'pay with wallet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
