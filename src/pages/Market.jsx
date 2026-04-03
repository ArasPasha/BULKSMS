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
  const [actionItem, setActionItem] = useState(null);
  const [offerMode, setOfferMode] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!user) return;
    const visibleUsers = [user.uid, ...(profile?.friends || [])];
    const chunks = chunkArray(visibleUsers, 30);
    let allItems = [];
    const unsubs = chunks.map(chunk => {
      const q = query(collection(db, 'items'), where('userId', 'in', chunk), where('isForSale', '==', true), orderBy('createdAt', 'desc'));
      return onSnapshot(q, snap => {
        const chunkItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        allItems = allItems.filter(i => !chunk.includes(i.userId)).concat(chunkItems);
        setItems([...allItems]);
        [...new Set(chunkItems.map(i => i.userId))].forEach(uid => {
          if (!sellers[uid]) getDoc(doc(db, 'users', uid)).then(s => { if (s.exists()) setSellers(prev => ({ ...prev, [uid]: s.data() })); });
        });
        setLoading(false);
      });
    });
    return () => unsubs.forEach(u => u());
  }, [user, profile?.friends]);

  const filtered = items.filter(i => filter === 'Mine' ? i.userId === user?.uid : filter === "Friends'" ? i.userId !== user?.uid : true);

  async function handleBuyOrOffer(item, type) {
    setSending(true);
    try {
      const convId = await getOrCreateConversation(user.uid, item.userId);
      const msgText = type === 'buy'
        ? `Hi! I'd like to buy your "${item.name}" listed at $${item.askingPrice}.`
        : `Hi! I'd like to make an offer of $${offerPrice} for your "${item.name}".`;
      await addDoc(collection(db, 'conversations', convId, 'messages'), { senderId: user.uid, text: msgText, type: type === 'buy' ? 'buy_request' : 'offer', itemId: item.id, itemName: item.name, offerPrice: type === 'offer' ? Number(offerPrice) : null, createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'conversations', convId), { lastMessage: msgText, lastMessageAt: serverTimestamp(), unreadBy: [item.userId] });
      setActionItem(null); setOfferMode(false); setOfferPrice('');
      navigate(`/messages/${convId}`);
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  }

  return (
    <div className="pb-[calc(68px+8px)] min-h-dvh">
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10">
        <h1 className="text-[1.3rem] font-bold mb-3">🛍️ Marketplace</h1>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {['All', "Friends'", 'Mine'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[0.8rem] font-semibold border-[1.5px] transition-all whitespace-nowrap ${filter === f ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-border'}`}>{f}</button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {loading ? <div className="flex justify-center py-10"><span className="spinner text-primary" /></div>
          : filtered.length === 0 ? <EmptyState />
          : filtered.map(item => (
            <div key={item.id} onClick={() => navigate(`/item/${item.id}`)} className="bg-white rounded-[14px] overflow-hidden shadow-sm mb-3 cursor-pointer">
              {item.photoURL
                ? <img src={item.photoURL} alt={item.name} className="w-full aspect-video object-cover" />
                : <div className="w-full aspect-video bg-surface-2 flex items-center justify-center text-5xl">{roomEmoji(item.room)}</div>
              }
              <div className="p-3">
                <div className="font-bold text-base mb-0.5">{item.name}</div>
                <div className="text-lg font-extrabold text-teal mb-1.5">{item.askingPrice ? `$${Number(item.askingPrice).toLocaleString()}` : 'Open to offers'}</div>
                <div className="text-[0.78rem] text-muted mb-2.5">{item.userId === user?.uid ? '📦 Your listing' : `👤 ${sellers[item.userId]?.displayName || 'Someone'}`}{item.room ? ` · ${item.room}` : ''}</div>
                {item.userId !== user?.uid
                  ? <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setActionItem(item); setOfferMode(false); }} className="flex-1 py-2 rounded-lg bg-teal text-white text-sm font-semibold border-none cursor-pointer">🛒 Buy</button>
                      <button onClick={() => { setActionItem(item); setOfferMode(true); }} className="flex-1 py-2 rounded-lg bg-transparent text-muted border-[1.5px] border-border text-sm font-semibold cursor-pointer">💬 Offer</button>
                    </div>
                  : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-amber-light text-amber">Your listing</span>
                }
              </div>
            </div>
          ))
        }
      </div>

      {/* Bottom sheet modal */}
      {actionItem && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end" onClick={e => { if (e.target === e.currentTarget) { setActionItem(null); setOfferMode(false); } }}>
          <div className="bg-white rounded-t-[20px] px-5 pt-6 pb-9 w-full max-w-app mx-auto">
            <h3 className="font-bold text-lg mb-1">{offerMode ? '💬 Make an Offer' : '🛒 Buy Now'}</h3>
            <p className="text-sm text-muted mb-4">{actionItem.name} — asking ${actionItem.askingPrice ?? 'open to offers'}</p>
            {offerMode && (
              <div className="flex flex-col gap-1.5 mb-4">
                <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">Your Offer ($)</label>
                <input type="number" min="0" step="0.01" placeholder="Enter your offer…" value={offerPrice} onChange={e => setOfferPrice(e.target.value)} autoFocus className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-[0.95rem] text-ink bg-white outline-none focus:border-primary font-[inherit]" />
              </div>
            )}
            <button onClick={() => handleBuyOrOffer(actionItem, offerMode ? 'offer' : 'buy')} disabled={sending || (offerMode && !offerPrice)}
              className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-semibold text-white mb-2 disabled:opacity-50 ${offerMode ? 'bg-amber' : 'bg-teal'}`}>
              {sending ? <><span className="spinner" style={{width:16,height:16,borderWidth:2}} /> Sending…</> : offerMode ? 'Send Offer' : 'Send Buy Request'}
            </button>
            <button onClick={() => { setActionItem(null); setOfferMode(false); }} className="w-full py-3.5 rounded-lg bg-transparent text-muted border-[1.5px] border-border font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-12 px-6 text-muted">
      <span className="block text-5xl mb-3">🛍️</span>
      <h3 className="text-base font-semibold text-ink mb-1.5">Nothing for sale yet</h3>
      <p className="text-sm">Mark your items for sale, or add friends to see their listings.</p>
    </div>
  );
}

async function getOrCreateConversation(uid1, uid2) {
  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid1));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => (d.data().participants || []).includes(uid2));
  if (existing) return existing.id;
  const newConv = await addDoc(collection(db, 'conversations'), { participants: [uid1, uid2], lastMessage: '', lastMessageAt: serverTimestamp(), unreadBy: [], createdAt: serverTimestamp() });
  return newConv.id;
}

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks.length ? chunks : [arr];
}
