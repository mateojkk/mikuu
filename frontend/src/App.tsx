import InvoiceForm from './components/InvoiceForm';
import PaymentPage from './components/PaymentPage';
import InvoiceHistory from './components/InvoiceHistory';
import Contacts from './components/Contacts';
import MultiSend from './components/MultiSend';
import BatchSend from './components/BatchSend';
import { PlusCircle, History, Users, Send, Layers } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { Toaster } from 'react-hot-toast';

type View = 'create' | 'history' | 'payment' | 'contacts' | 'multi' | 'batch';

function App() {
  const [view, setView] = useState<View>('create');
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);
  const [prefillAddress, setPrefillAddress] = useState<string | null>(null);
  const { address } = useAccount();
  void address; // used by ConnectButton internally

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invoiceId = params.get('invoiceId');
    if (invoiceId) {
      setActiveInvoiceId(invoiceId);
      setView('payment');
    }
  }, []);

  const navigateTo = (newView: View, id?: string, prefill?: string) => {
    if (id) setActiveInvoiceId(id);
    if (prefill) setPrefillAddress(prefill);
    setView(newView);
    if (newView !== 'payment' || !id) {
       window.history.pushState({}, '', '/');
    } else {
       window.history.pushState({}, '', `?invoiceId=${id}`);
    }
  };

  return (
    <div className="container">
      <Toaster 
        position="top-right" 
        toastOptions={{ 
          style: { background: 'var(--bg-card)', color: 'var(--fg)', border: '1px solid var(--border)' } 
        }} 
      />
      <header className="header-main">
        <div className="header-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <img src="/logo.svg" alt="payme" style={{ width: '40px', height: '40px' }} />
            <div className="brand-mobile-hide">
              <h1 style={{ fontSize: '1.5rem', margin: 0 }}>payme</h1>
              <p style={{ color: 'var(--fg-secondary)', fontSize: '0.7rem', margin: 0, fontWeight: 600 }}>send money on tempo</p>
            </div>
          </div>

          <nav className="nav-tabs">
            <button 
              className={`btn-nav ${view === 'create' ? 'active' : ''}`}
              onClick={() => navigateTo('create')}
            >
              <PlusCircle size={16} /> send
            </button>
            <button 
              className={`btn-nav ${view === 'multi' ? 'active' : ''}`}
              onClick={() => navigateTo('multi')}
            >
              <Send size={16} /> multi
            </button>
            <button 
              className={`btn-nav ${view === 'batch' ? 'active' : ''}`}
              onClick={() => navigateTo('batch')}
            >
              <Layers size={16} /> batch
            </button>
            <button 
              className={`btn-nav ${view === 'contacts' ? 'active' : ''}`}
              onClick={() => navigateTo('contacts')}
            >
              <Users size={16} /> book
            </button>
            <button 
              className={`btn-nav ${view === 'history' ? 'active' : ''}`}
              onClick={() => navigateTo('history')}
            >
              <History size={16} /> activity
            </button>
          </nav>
          
          <ConnectButton 
            chainStatus="icon"
            accountStatus="address"
            showBalance={false}
          />
        </div>
      </header>

      <main className="animate-fade-in">
        {view === 'create' && (
          <InvoiceForm 
            prefillAddress={prefillAddress} 
            onCreated={(id) => {
              setPrefillAddress(null);
              navigateTo('payment', id);
            }} 
          />
        )}
        {view === 'history' && <InvoiceHistory onSelect={(id) => navigateTo('payment', id)} />}
        {view === 'contacts' && <Contacts onSelect={(contact) => navigateTo('create', undefined, contact.address)} />}
        {view === 'multi' && <MultiSend />}
        {view === 'batch' && <BatchSend />}
        {view === 'payment' && activeInvoiceId && (
          <PaymentPage invoiceId={activeInvoiceId} onBack={() => navigateTo('history')} />
        )}
      </main>

      <footer style={{ marginTop: '4rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', textAlign: 'center', color: 'var(--fg-secondary)', fontSize: '0.75rem' }}>
        <p>&copy; 2026 payme &middot; built on tempo testnet by <a href="https://x.com/MATEOINRL" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>MATEOINRL</a></p>
      </footer>
    </div>
  );
}

export default App;
