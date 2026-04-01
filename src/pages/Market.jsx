import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, getDoc, doc, addDoc, updateDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { roomEmoji } from '../lib/rooms';
import { useNavigate } from 'react-router-dom';

export default function Market() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [sellers, setSellers] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [actionItem, setActionItem] = useState(null); // item for modal
  const [offerMode, setOfferMode] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    const friends = profile?.friends || [];
    const visibleUsers = [user.uid, ...friends];

    // Firestore 'in' supports up to 30 values
    const chunks = chunkArray(visibleUsers, 30);
    const unsubscribers = [];

    let allItems = [];

    chunks.forEach((chunk, idx) => {
      const q = query(
        collection(db, 'items'),
        where('userId', 'in', chunk),
        where('isForSale', '==', true),
        orderBy('createdAt', 'desc')
      );
      const unsub = onSnapshot(q, snap => {
        const chunkItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allItems = allItems.filter(i => !chunk.includes(i.userId)).concat(chunkItems);
        setItems([...allItems]);

        // Fetch seller profiles for new sellers
        const newUids = [...new Set(chunkItems.map(i => i.userId))];
        newUids.forEach(uid => {
          if (!sellers[uid]) {
            getDoc(doc(db, 'users', uid)).then(s => {
              if (s.exists()) setSellers(prev => ({ ...prev, [uid]: s.data() }));
            });
          }
        });

        setLoading(false);
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach(u => u());
  }, [user, profile?.friends]);

  const filtered = items.filter(item => {
    if (filter === 'Mine') return item.userId === user?.uid;
    if (filter === "Friends'") return item.userId !== user?.uid;
    return true;
  });

  async function handleBuyOrOffer(item, type) {
    if (!user) return;
    setSending(true);
    try {
      // Find or create conversation with seller
      const convId = await getOrCreateConversation(user.uid, item.userId);

      const msgText = type === 'buy'
        ? `Hi! I'd like to buy your "${item.name}" listed at $${item.askingPrice}.`
        : `Hi! I'd like to make an offer of $${offerPrice} for your "${item.name}".`;

      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        senderId: user.uid,
        text: msgText,
        type: type === 'buy' ? 'buy_request' : 'offer',
        itemId: item.id,
        itemName: item.name,
        offerPrice: type === 'offer' ? Number(offerPrice) : null,
        createdAt: serverTimestamp(),
      });

      // Update conversation metadata
      await updateDoc(doc(db, 'conversations', convId), {
        lastMessage: msgText,
        lastMessageAt: serverTimestamp(),
        unreadBy: [item.userId],
      });

      setActionItem(null);
      setOfferMode(false);
      setOfferPrice('');
      navigate(`/messages/${convId}`);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1 style={{ marginBottom: 12 }}>🛍️ Marketplace</h1>
        <div className="chips">
          {['All', "Friends'", 'Mine'].map(f => (
            <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
            <span className="spinner" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🛍️</span>
            <h3>Nothing for sale yet</h3>
            <p>Mark your items for sale, or add friends to see their listings.</p>
          </div>
        ) : (
          filtered.map(item => (
            <MarketCard
              key={item.id}
              item={item}
              seller={sellers[item.userId]}
              isOwn={item.userId === user?.uid}
              onBuy={() => { setActionItem(item); setOfferMode(false); }}
              onOffer={() => { setActionItem(item); setOfferMode(true); }}
              onView={() => navigate(`/item/${item.id}`)}
            />
          ))
        )}
      </div>

      {/* Action Modal */}
      {actionItem && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            zIndex: 200, display: 'flex', alignItems: 'flex-end',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setActionItem(null); setOfferMode(false); } }}
        >
          <div style={{
            background: 'var(--surface)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            padding: '24px 20px 36px', width: '100%', maxWidth: 'var(--max-w)',
            margin: '0 auto',
          }}>
            <h3 style={{ fontWeight: 700, marginBottom: 4 }}>
              {offerMode ? '💬 Make an Offer' : '🛒 Buy Now'}
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
              {actionItem.name} — asking ${actionItem.askingPrice ?? 'open to offers'}
            </p>

            {offerMode && (
              <div className="form-group">
                <label>Your Offer ($)</label>
                <input
                  type="number" min="0" step="0.01"
                  placeholder="Enter your offer…"
                  value={offerPrice}
                  onChange={e => setOfferPrice(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            <button
              className={`btn ${offerMode ? 'btn-amber' : 'btn-teal'}`}
              disabled={sending || (offerMode && !offerPrice)}
              onClick={() => handleBuyOrOffer(actionItem, offerMode ? 'offer' : 'buy')}
            >
              {sending
                ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Sending…</>
                : offerMode ? 'Send Offer' : 'Send Buy Request'}
            </button>
            <button className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => { setActionItem(null); setOfferMode(false); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketCard({ item, seller, isOwn, onBuy, onOffer, onView }) {
  const sellerName = seller?.displayName || 'Someone';
  return (
    <div className="market-card" onClick={onView} style={{ cursor: 'pointer' }}>
      {item.photoURL ? (
        <img className="market-card-img" src={item.photoURL} alt={item.name} />
      ) : (
        <div className="market-card-img">{roomEmoji(item.room)}</div>
      )}
      <div className="market-card-body">
        <div className="market-card-name">{item.name}</div>
        <div className="market-card-price">
          {item.askingPrice ? `$${Number(item.askingPrice).toLocaleString()}` : 'Open to offers'}
        </div>
        <div className="market-card-seller">
          {isOwn ? '📦 Your listing' : `👤 ${sellerName}`}
          {item.room ? ` · ${item.room}` : ''}
        </div>
        {!isOwn && (
          <div className="market-card-actions" onClick={e => e.stopPropagation()}>
            <button className="btn btn-teal btn-sm" onClick={onBuy}>🛒 Buy</button>
            <button className="btn btn-ghost btn-sm" onClick={onOffer}>💬 Offer</button>
          </div>
        )}
        {isOwn && (
          <span className="badge badge-sale">Your listing</span>
        )}
      </div>
    </div>
  );
}

async function getOrCreateConversation(uid1, uid2) {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', uid1)
  );
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => (d.data().participants || []).includes(uid2));
  if (existing) return existing.id;

  const newConv = await addDoc(collection(db, 'conversations'), {
    participants: [uid1, uid2],
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    unreadBy: [],
    createdAt: serverTimestamp(),
  });
  return newConv.id;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks.length ? chunks : [arr];
}
