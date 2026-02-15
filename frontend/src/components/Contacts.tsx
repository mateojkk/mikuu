import { useState, useEffect, type FormEvent } from 'react';
import { User, Plus, Trash2, Send, Search, Mail, Phone } from 'lucide-react';
import { useAccount } from 'wagmi';

import { toast } from 'react-hot-toast';
import { isValidAddress, authAxios, baseApi } from '../api';

interface Contact {
  id: string;
  name: string;
  address: string;
  email?: string;
  phone?: string;
}

export default function Contacts({ onSelect }: { onSelect?: (contact: Contact) => void }) {
  const { address: walletAddress } = useAccount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newName, setNewName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const fetchContacts = async () => {
    if (!walletAddress) return;
    try {
      const resp = await baseApi.get(`/contacts?wallet=${walletAddress}`);
      setContacts(resp.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [walletAddress]);

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!walletAddress || !newName || !newAddress) return;
    if (!isValidAddress(newAddress)) {
      toast.error('invalid wallet address format');
      return;
    }
    try {
      const api = authAxios(walletAddress);
      await api.post('/contacts', {
        ownerWallet: walletAddress,
        name: newName,
        walletAddress: newAddress,
        email: newEmail,
        phone: newPhone,
      });
      await fetchContacts();
      setNewName('');
      setNewAddress('');
      setNewEmail('');
      setNewPhone('');
      setShowAdd(false);
      toast.success("contact saved!");
    } catch (err) {
      console.error(err);
      toast.error('failed to save contact');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const api = authAxios(walletAddress);
      await api.delete(`/contacts/${id}`);
      await fetchContacts();
      toast.success("contact removed");
    } catch (err) {
      console.error(err);
      toast.error("failed to delete contact");
    }
  };

  const filtered = contacts.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.address.toLowerCase().includes(search.toLowerCase()) ||
    (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  if (!walletAddress) {
    return (
      <div className="animate-fade-in" style={{ width: '100%', maxWidth: '800px', margin: '0 auto', textAlign: 'center', padding: '3rem' }}>
        <p style={{ color: 'var(--fg-secondary)' }}>connect your wallet to view contacts.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <User size={24} /> address book
        </h2>
        <button className="btn-primary" onClick={() => setShowAdd(!showAdd)}>
          <Plus size={20} /> {showAdd ? 'cancel' : 'add contact'}
        </button>
      </div>

      {showAdd && (
        <div className="glass-card" style={{ marginBottom: '2rem' }}>
          <form onSubmit={handleAdd} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="input-group">
              <label>name</label>
              <input 
                type="text" 
                placeholder="e.g. alice tempo" 
                value={newName} 
                onChange={e => setNewName(e.target.value)} 
                required 
              />
            </div>
            <div className="input-group">
              <label>email (optional)</label>
              <input 
                type="email" 
                placeholder="alice@example.com" 
                value={newEmail} 
                onChange={e => setNewEmail(e.target.value)} 
              />
            </div>
            <div className="input-group">
              <label>phone (optional)</label>
              <input 
                type="tel" 
                placeholder="+1 555-123-4567" 
                value={newPhone} 
                onChange={e => setNewPhone(e.target.value)} 
              />
            </div>
            <div className="input-group">
              <label>wallet address</label>
              <input 
                type="text" 
                placeholder="0x..." 
                value={newAddress} 
                onChange={e => setNewAddress(e.target.value)} 
                required 
                style={{ fontFamily: 'monospace' }}
              />
            </div>
            <button type="submit" className="btn-primary" style={{ justifyContent: 'center' }}>
              save contact
            </button>
          </form>
        </div>
      )}

      <div className="glass-card" style={{ padding: '0' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Search size={18} color="var(--fg-secondary)" />
          <input 
            type="text" 
            placeholder="search by name, email or address..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ border: 'none', padding: '0.5rem', fontSize: '0.9rem', background: 'transparent', color: 'var(--fg)', width: '100%' }}
          />
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--fg-secondary)' }}>
            {contacts.length === 0 ? 'your address book is empty.' : 'no contacts match your search.'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((contact, index) => (
              <div 
                key={contact.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '1.25rem 1.5rem',
                  borderBottom: index === filtered.length - 1 ? 'none' : '1px solid var(--border)',
                  transition: 'background 0.2s ease',
                  cursor: onSelect ? 'pointer' : 'default'
                }}
                className="contact-item"
                onClick={() => onSelect?.(contact)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <div style={{ background: 'var(--fg)', color: 'var(--bg)', width: '40px', height: '40px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                    {contact.name[0].toLowerCase()}
                  </div>
                  <div>
                    <h4 style={{ fontWeight: '600' }}>{contact.name.toLowerCase()}</h4>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.25rem' }}>
                      <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', fontFamily: 'monospace' }}>
                        {contact.address.slice(0, 6)}...{contact.address.slice(-4)}
                      </p>
                      {contact.email && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--fg-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Mail size={12} /> {contact.email.toLowerCase()}
                        </p>
                      )}
                      {contact.phone && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <Phone size={12} /> {contact.phone}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  {onSelect && (
                    <button className="btn-secondary" style={{ padding: '0.5rem 1rem', fontSize: '0.85rem' }} onClick={(e) => { e.stopPropagation(); onSelect(contact); }}>
                      <Send size={14} /> pay
                    </button>
                  )}
                  <button 
                    style={{ background: 'none', border: 'none', color: '#ff5252', cursor: 'pointer', padding: '0.5rem' }}
                    onClick={(e) => { e.stopPropagation(); handleDelete(contact.id); }}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
