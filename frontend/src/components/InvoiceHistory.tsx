import React, { useState, useEffect } from 'react';
import { FileText, Clock, ChevronRight, Trash2, Search } from 'lucide-react';

import { useAccount } from 'wagmi';
import { toast } from 'react-hot-toast';
import { authAxios, baseApi } from '../api';

interface Invoice {
  id: string;
  amount: string | number;
  status: string;
  memo: string;
  createdAt: string;
}

interface InvoiceHistoryProps {
  onSelect: (id: string) => void;
}

const InvoiceHistory: React.FC<InvoiceHistoryProps> = ({ onSelect }) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const { address } = useAccount();

  const fetchInvoices = async () => {
    try {
      const url = address ? `/invoices?wallet=${address}` : '/invoices';
      const resp = await baseApi.get(url);
      setInvoices(resp.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [address]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!window.confirm("are you sure you want to delete this invoice record?")) return;
    try {
      await authAxios(address).delete(`/invoices/${id}`);
      setInvoices(prev => prev.filter(inv => inv.id !== id));
      toast.success("record removed from history");
    } catch (err) {
      console.error(err);
      toast.error("failed to delete invoice");
    }
  };

  const filteredInvoices = invoices.filter(inv => 
    (inv.memo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inv.status || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    inv.amount.toString().includes(searchTerm)
  );

  return (
    <div className="glass-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
          <FileText size={24} /> Activity history
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '8px' }}>
          <Search size={16} />
          <input 
            type="text" 
            placeholder="Search..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ border: 'none', background: 'none', padding: 0, margin: 0, fontSize: '0.9rem', width: '150px' }}
          />
        </div>
      </div>

      {invoices.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--fg-secondary)', padding: '2rem' }}>No invoices found.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredInvoices.map((inv) => (
            <div 
              key={inv.id} 
              className="glass-card" 
              style={{ 
                padding: '1rem', 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer',
                marginBottom: 0
              }}
              onClick={() => onSelect(inv.id)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ background: '#238636', color: 'white', padding: '0.5rem', borderRadius: '8px' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h4 style={{ margin: 0 }}>{inv.memo || 'Unlabeled'}</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', margin: '0.2rem 0 0 0' }}>
                    <Clock size={12} /> {new Date(inv.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontWeight: 'bold', margin: 0 }}>${inv.amount}</p>
                  <span className={`status-badge ${inv.status === 'PAID' ? 'status-paid' : 'status-pending'}`}>
                    {inv.status.toLowerCase()}
                  </span>
                </div>
                <button 
                  onClick={(e) => handleDelete(e, inv.id)}
                  style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', padding: '0.5rem' }}
                >
                  <Trash2 size={18} />
                </button>
                <ChevronRight size={20} color="#8b949e" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default InvoiceHistory;
