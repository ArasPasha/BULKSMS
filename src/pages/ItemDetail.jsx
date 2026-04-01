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
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Edit form state
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
        const data = { id: snap.id, ...snap.data() };
        setItem(data);
        setEditName(data.name || '');
        setEditStore(data.storeName || '');
        setEditPrice(data.pricePaid != null ? String(data.pricePaid) : '');
        setEditRoom(data.room || '');
        setEditDirections(data.directions || '');
        setEditLendable(data.isLendable || false);
        setEditForSale(data.isForSale || false);
        setEditAskingPrice(data.askingPrice != null ? String(data.askingPrice) : '');
      }
      setLoading(false);
    });
  }, [itemId]);

  async function handleSave() {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const updates = {
        name: editName.trim(),
        storeName: editStore.trim(),
        pricePaid: editPrice ? Number(editPrice) : null,
        room: editRoom,
        directions: editDirections.trim(),
        isLendable: editLendable,
        isForSale: editForSale,
        askingPrice: editForSale && editAskingPrice ? Number(editAskingPrice) : null,
      };
      await updateDoc(doc(db, 'items', itemId), updates);
      setItem(prev => ({ ...prev, ...updates }));
      setEditing(false);
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Delete this item?')) return;
    setDeleting(true);
    try {
      if (item.photoURL) {
        try {
          const storageRef = ref(storage, item.photoURL);
          await deleteObject(storageRef);
        } catch { /* photo may already be gone */ }
      }
      await deleteDoc(doc(db, 'items', itemId));
      navigate('/my-stuff');
    } catch {
      setError('Failed to delete item.');
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <span className="spinner" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="page">
        <div className="page-header">
          <button className="btn-icon" onClick={() => navigate(-1)}>←</button>
        </div>
        <div className="empty-state">
          <span className="empty-icon">🔍</span>
          <h3>Item not found</h3>
        </div>
      </div>
    );
  }

  const isOwner = item.userId === user?.uid;

  return (
    <div className="page" style={{ paddingBottom: '90px' }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '52px 16px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <button className="btn-icon" onClick={() => navigate(-1)}>←</button>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700 }}>
          {editing ? 'Edit Item' : 'Item Details'}
        </h1>
        {isOwner && !editing && (
          <button className="btn-icon" onClick={() => setEditing(true)} title="Edit">✏️</button>
        )}
        {editing && (
          <button className="btn-icon" onClick={() => setEditing(false)}>✕</button>
        )}
        {!editing && !isOwner && <div style={{ width: 40 }} />}
      </div>

      {error && <div className="alert alert-error" style={{ margin: '12px 16px 0' }}>{error}</div>}

      {/* Photo */}
      {item.photoURL ? (
        <img className="item-detail-img" src={item.photoURL} alt={item.name} />
      ) : (
        <div className="item-detail-img">{roomEmoji(item.room)}</div>
      )}

      <div className="page-body">
        {editing ? (
          /* ── Edit form ── */
          <>
            <div className="form-group">
              <label>Item Name *</label>
              <input value={editName} onChange={e => setEditName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Store / Source</label>
              <input value={editStore} onChange={e => setEditStore(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Price Paid ($)</label>
              <input type="number" min="0" step="0.01" value={editPrice} onChange={e => setEditPrice(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Room</label>
              <select value={editRoom} onChange={e => setEditRoom(e.target.value)}>
                <option value="">Select a room…</option>
                {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>How to Find It</label>
              <textarea value={editDirections} onChange={e => setEditDirections(e.target.value)} rows={3} />
            </div>

            <div className="card" style={{ padding: '0 16px', marginBottom: 16 }}>
              <div className="toggle-row">
                <div>
                  <div className="toggle-row-label">🤝 Available to Lend</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={editLendable} onChange={e => setEditLendable(e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
              <div className="toggle-row">
                <div>
                  <div className="toggle-row-label">💰 For Sale</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={editForSale} onChange={e => setEditForSale(e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
            </div>

            {editForSale && (
              <div className="form-group">
                <label>Asking Price ($)</label>
                <input type="number" min="0" step="0.01" value={editAskingPrice} onChange={e => setEditAskingPrice(e.target.value)} />
              </div>
            )}

            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving…</> : '💾 Save Changes'}
            </button>
            <button
              className="btn btn-ghost"
              style={{ marginTop: 8, color: 'var(--coral)', borderColor: 'var(--coral)' }}
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <span className="spinner" /> : '🗑️ Delete Item'}
            </button>
          </>
        ) : (
          /* ── View mode ── */
          <>
            {/* Title + badges */}
            <div className="detail-section">
              <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 8 }}>{item.name}</h2>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {item.room && <span className={`badge ${roomBadgeClass(item.room)}`}>{item.room}</span>}
                {item.isLendable && <span className="badge badge-lend">🤝 Lendable</span>}
                {item.isForSale && (
                  <span className="badge badge-sale">
                    💰 {item.askingPrice ? `$${item.askingPrice}` : 'For Sale'}
                  </span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="detail-section">
              <h3>Details</h3>
              <div className="detail-row">
                <span className="label">Store / Source</span>
                <span className="value">{item.storeName || '—'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Price Paid</span>
                <span className="value">{item.pricePaid != null ? `$${Number(item.pricePaid).toLocaleString()}` : '—'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Room</span>
                <span className="value">{item.room || '—'}</span>
              </div>
              {item.isForSale && (
                <div className="detail-row">
                  <span className="label">Asking Price</span>
                  <span className="value" style={{ color: 'var(--teal)', fontWeight: 700 }}>
                    {item.askingPrice ? `$${item.askingPrice}` : 'Open to offers'}
                  </span>
                </div>
              )}
            </div>

            {/* Find this item */}
            {item.directions && (
              <div className="detail-section">
                <h3>📍 Find This Item</h3>
                <p style={{ fontSize: '0.92rem', lineHeight: 1.6, color: 'var(--text)' }}>
                  {item.directions}
                </p>
              </div>
            )}

            {/* Location breadcrumb */}
            {item.room && (
              <div className="detail-section" style={{ background: 'var(--primary-light)' }}>
                <h3 style={{ color: 'var(--primary)' }}>Step-by-step Location</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>🏠 Home</span>
                  <span style={{ color: 'var(--text-muted)' }}>→</span>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                    {roomEmoji(item.room)} {item.room}
                  </span>
                  {item.directions && (
                    <>
                      <span style={{ color: 'var(--text-muted)' }}>→</span>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                        {item.directions.slice(0, 60)}{item.directions.length > 60 ? '…' : ''}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {isOwner && (
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                ✏️ Edit Item
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
