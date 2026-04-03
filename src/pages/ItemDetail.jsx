import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { roomBadgeClass, roomEmoji, ROOMS } from '../lib/rooms';

export default function ItemDetail() {
  const { itemId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [editName, setEditName] = useState('');
  const [editStore, setEditStore] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [editDirections, setEditDirections] = useState('');
  const [editLendable, setEditLendable] = useState(false);
  const [editForSale, setEditForSale] = useState(false);
  const [editAskingPrice, setEditAskingPrice] = useState('');

  useEffect(() => {
    getDoc(doc(db, 'items', itemId)).then(snap => {
      if (snap.exists()) {
        const d = { id: snap.id, ...snap.data() };
        setItem(d);
        setEditName(d.name || ''); setEditStore(d.storeName || '');
        setEditPrice(d.pricePaid != null ? String(d.pricePaid) : '');
        setEditRoom(d.room || ''); setEditDirections(d.directions || '');
        setEditLendable(d.isLendable || false); setEditForSale(d.isForSale || false);
        setEditAskingPrice(d.askingPrice != null ? String(d.askingPrice) : '');
      }
      setLoading(false);
    });
  }, [itemId]);

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updates = { name: editName.trim(), storeName: editStore.trim(), pricePaid: editPrice ? Number(editPrice) : null, room: editRoom, directions: editDirections.trim(), isLendable: editLendable, isForSale: editForSale, askingPrice: editForSale && editAskingPrice ? Number(editAskingPrice) : null };
      await updateDoc(doc(db, 'items', itemId), updates);
      setItem(prev => ({ ...prev, ...updates })); setEditing(false);
    } catch { setError('Failed to save changes.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this item?')) return;
    setDeleting(true);
    try {
      if (item.photoURL) { try { await deleteObject(ref(storage, item.photoURL)); } catch {} }
      await deleteDoc(doc(db, 'items', itemId)); navigate('/my-stuff');
    } catch { setError('Failed to delete item.'); setDeleting(false); }
  }

  if (loading) return <div className="min-h-dvh flex items-center justify-center bg-bg text-primary"><span className="spinner spinner-lg" /></div>;
  if (!item) return <div className="p-4 text-center text-muted pt-20">Item not found</div>;

  const isOwner = item.userId === user?.uid;

  return (
    <div className="pb-24 min-h-dvh">
      {/* Header */}
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center border-none cursor-pointer text-lg">←</button>
        <h1 className="text-[1.1rem] font-bold">{editing ? 'Edit Item' : 'Item Details'}</h1>
        {isOwner && !editing && <button onClick={() => setEditing(true)} className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center border-none cursor-pointer text-lg">✏️</button>}
        {editing && <button onClick={() => setEditing(false)} className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center border-none cursor-pointer text-lg">✕</button>}
        {!editing && !isOwner && <div className="w-10" />}
      </div>

      {error && <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg mx-4 mt-3">{error}</div>}

      {/* Photo */}
      {item.photoURL
        ? <img src={item.photoURL} alt={item.name} className="w-full aspect-[4/3] object-cover" />
        : <div className="w-full aspect-[4/3] bg-surface-2 flex items-center justify-center text-7xl">{roomEmoji(item.room)}</div>
      }

      <div className="p-4">
        {editing ? (
          <>
            <EditField label="Item Name *" value={editName} onChange={e => setEditName(e.target.value)} />
            <EditField label="Store / Source" value={editStore} onChange={e => setEditStore(e.target.value)} />
            <EditField label="Price Paid ($)" type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
            <div className="flex flex-col gap-1.5 mb-3.5">
              <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">Room</label>
              <select value={editRoom} onChange={e => setEditRoom(e.target.value)} className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[0.95rem] text-ink bg-white outline-none focus:border-primary font-[inherit]">
                <option value="">Select a room…</option>
                {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5 mb-3.5">
              <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">How to Find It</label>
              <textarea value={editDirections} onChange={e => setEditDirections(e.target.value)} rows={3} className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[0.95rem] text-ink bg-white outline-none focus:border-primary font-[inherit] resize-y min-h-[80px]" />
            </div>
            <div className="bg-white rounded-[14px] shadow-sm px-4 mb-4">
              <ToggleRow label="🤝 Available to Lend" checked={editLendable} onChange={e => setEditLendable(e.target.checked)} />
              <ToggleRow label="💰 For Sale" checked={editForSale} onChange={e => setEditForSale(e.target.checked)} last />
            </div>
            {editForSale && <EditField label="Asking Price ($)" type="number" value={editAskingPrice} onChange={e => setEditAskingPrice(e.target.value)} />}
            <button onClick={handleSave} disabled={saving} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-primary text-white font-semibold mb-2 disabled:opacity-50">
              {saving ? <><span className="spinner" style={{width:16,height:16,borderWidth:2}} /> Saving…</> : '💾 Save Changes'}
            </button>
            <button onClick={handleDelete} disabled={deleting} className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-transparent text-coral border-[1.5px] border-coral font-semibold disabled:opacity-50">
              {deleting ? <span className="spinner" /> : '🗑️ Delete Item'}
            </button>
          </>
        ) : (
          <>
            {/* Title + badges */}
            <div className="bg-white rounded-[14px] shadow-sm p-4 mb-3">
              <h2 className="text-xl font-bold mb-2">{item.name}</h2>
              <div className="flex gap-1.5 flex-wrap">
                {item.room && <Badge cls={roomBadgeClass(item.room)}>{item.room}</Badge>}
                {item.isLendable && <Badge cls="bg-teal-light text-teal">🤝 Lendable</Badge>}
                {item.isForSale && <Badge cls="bg-amber-light text-amber">💰 {item.askingPrice ? `$${item.askingPrice}` : 'For Sale'}</Badge>}
              </div>
            </div>

            {/* Details */}
            <div className="bg-white rounded-[14px] shadow-sm p-4 mb-3">
              <h3 className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mb-2.5">Details</h3>
              <DetailRow label="Store / Source" value={item.storeName || '—'} />
              <DetailRow label="Price Paid" value={item.pricePaid != null ? `$${Number(item.pricePaid).toLocaleString()}` : '—'} />
              <DetailRow label="Room" value={item.room || '—'} />
              {item.isForSale && <DetailRow label="Asking Price" value={item.askingPrice ? `$${item.askingPrice}` : 'Open to offers'} valueClass="text-teal font-bold" last />}
            </div>

            {item.directions && (
              <div className="bg-white rounded-[14px] shadow-sm p-4 mb-3">
                <h3 className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mb-2.5">📍 Find This Item</h3>
                <p className="text-[0.92rem] leading-relaxed">{item.directions}</p>
              </div>
            )}

            {item.room && (
              <div className="bg-primary-light rounded-[14px] p-4 mb-3">
                <h3 className="text-[0.78rem] font-bold uppercase tracking-wider text-primary mb-2">Step-by-step Location</h3>
                <div className="flex items-center gap-2 flex-wrap text-sm font-semibold">
                  <span>🏠 Home</span>
                  <span className="text-muted">→</span>
                  <span>{roomEmoji(item.room)} {item.room}</span>
                  {item.directions && <><span className="text-muted">→</span><span className="text-muted font-normal text-xs">{item.directions.slice(0, 60)}{item.directions.length > 60 ? '…' : ''}</span></>}
                </div>
              </div>
            )}

            {isOwner && (
              <button onClick={() => setEditing(true)} className="w-full py-3.5 rounded-lg bg-primary-light text-primary font-semibold flex items-center justify-center gap-2">✏️ Edit Item</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Badge({ cls, children }) {
  return <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.72rem] font-semibold ${cls}`}>{children}</span>;
}
function DetailRow({ label, value, valueClass = 'font-semibold', last }) {
  return <div className={`flex justify-between items-center py-2 ${last ? '' : 'border-b border-border'}`}><span className="text-sm text-muted">{label}</span><span className={`text-[0.9rem] ${valueClass}`}>{value}</span></div>;
}
function EditField({ label, value, onChange, type = 'text' }) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">{label}</label>
      <input type={type} value={value} onChange={onChange} className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[0.95rem] text-ink bg-white outline-none focus:border-primary font-[inherit]" />
    </div>
  );
}
function ToggleRow({ label, checked, onChange, last }) {
  return (
    <div className={`flex items-center justify-between py-3.5 ${last ? '' : 'border-b border-border'}`}>
      <div className="text-[0.9rem] font-medium">{label}</div>
      <label className="toggle"><input type="checkbox" checked={checked} onChange={onChange} /><span className="toggle-track" /></label>
    </div>
  );
}
