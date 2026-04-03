import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, getDoc, doc, addDoc, updateDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { roomEmoji } from '../lib/rooms';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default marker icons in Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function getDistanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function Market() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [sellers, setSellers] = useState({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [viewMode, setViewMode] = useState('list');
  const [userLocation, setUserLocation] = useState(null);
  const [locationAsked, setLocationAsked] = useState(false);
  const [actionItem, setActionItem] = useState(null);
  const [offerMode, setOfferMode] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [sending, setSending] = useState(false);

  // Get user's location once
  useEffect(() => {
    if (locationAsked) return;
    setLocationAsked(true);
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {}
    );
  }, []);

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

  // Attach distance and sort by it when we have user location
  const withDistance = filtered.map(item => ({
    ...item,
    distance: (userLocation && item.location)
      ? getDistanceMiles(userLocation.lat, userLocation.lng, item.location.lat, item.location.lng)
      : null,
  })).sort((a, b) => {
    if (a.distance == null && b.distance == null) return 0;
    if (a.distance == null) return 1;
    if (b.distance == null) return -1;
    return a.distance - b.distance;
  });

  const itemsOnMap = withDistance.filter(i => i.location);

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

  const mapCenter = userLocation
    ? [userLocation.lat, userLocation.lng]
    : itemsOnMap.length ? [itemsOnMap[0].location.lat, itemsOnMap[0].location.lng]
    : [39.5, -98.35]; // center of US as fallback

  return (
    <div className="pb-[calc(68px+8px)] min-h-dvh">
      {/* Header */}
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[1.3rem] font-bold">🛍️ Marketplace</h1>
          {/* List / Map toggle */}
          <div className="flex rounded-lg border-[1.5px] border-border overflow-hidden">
            <button onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors border-none cursor-pointer ${viewMode === 'list' ? 'bg-primary text-white' : 'bg-white text-muted'}`}>
              ☰ List
            </button>
            <button onClick={() => setViewMode('map')}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors border-none cursor-pointer ${viewMode === 'map' ? 'bg-primary text-white' : 'bg-white text-muted'}`}>
              🗺 Map
            </button>
          </div>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
          {['All', "Friends'", 'Mine'].map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[0.8rem] font-semibold border-[1.5px] transition-all whitespace-nowrap ${filter === f ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-border'}`}>{f}</button>
          ))}
          {userLocation && (
            <span className="flex-shrink-0 px-3 py-1.5 rounded-full text-[0.8rem] font-semibold bg-teal-light text-teal border-[1.5px] border-teal whitespace-nowrap">📍 Sorted by distance</span>
          )}
        </div>
      </div>

      {/* MAP VIEW */}
      {viewMode === 'map' && (
        <div style={{ height: 'calc(100dvh - 200px)' }} className="relative">
          {loading ? (
            <div className="flex justify-center items-center h-full"><span className="spinner text-primary" /></div>
          ) : (
            <MapContainer center={mapCenter} zoom={userLocation ? 11 : 4} style={{ height: '100%', width: '100%' }} zoomControl={true}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />

              {/* User location dot */}
              {userLocation && (
                <CircleMarker center={[userLocation.lat, userLocation.lng]} radius={10} pathOptions={{ color: '#534AB7', fillColor: '#534AB7', fillOpacity: 1, weight: 3, opacity: 0.4 }}>
                  <Popup><strong>You are here</strong></Popup>
                </CircleMarker>
              )}

              {/* Item markers */}
              {itemsOnMap.map(item => (
                <Marker key={item.id} position={[item.location.lat, item.location.lng]}>
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      {item.photoURL && <img src={item.photoURL} alt={item.name} style={{ width: '100%', height: 80, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />}
                      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{item.name}</div>
                      <div style={{ color: '#1D9E75', fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
                        {item.askingPrice ? `$${Number(item.askingPrice).toLocaleString()}` : 'Open to offers'}
                      </div>
                      {item.distance != null && (
                        <div style={{ color: '#6B698A', fontSize: 12, marginBottom: 6 }}>📍 {item.distance < 0.1 ? 'Nearby' : `${item.distance.toFixed(1)} mi away`}</div>
                      )}
                      <div style={{ color: '#6B698A', fontSize: 12, marginBottom: 8 }}>
                        {item.userId === user?.uid ? '📦 Your listing' : `👤 ${sellers[item.userId]?.displayName || 'Someone'}`}
                      </div>
                      {item.userId !== user?.uid ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={e => { e.stopPropagation(); setActionItem(item); setOfferMode(false); }}
                            style={{ flex: 1, padding: '6px 0', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>🛒 Buy</button>
                          <button onClick={e => { e.stopPropagation(); setActionItem(item); setOfferMode(true); }}
                            style={{ flex: 1, padding: '6px 0', background: '#fff', color: '#6B698A', border: '1.5px solid #E3E1F0', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>💬 Offer</button>
                        </div>
                      ) : (
                        <button onClick={() => navigate(`/item/${item.id}`)}
                          style={{ width: '100%', padding: '6px 0', background: '#EAE8FA', color: '#534AB7', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>View listing</button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}

          {/* Map legend */}
          <div className="absolute bottom-3 left-3 z-[1000] bg-white rounded-lg shadow-sm px-3 py-2 text-[0.72rem] text-muted">
            {itemsOnMap.length} item{itemsOnMap.length !== 1 ? 's' : ''} on map
            {filtered.length - itemsOnMap.length > 0 && ` · ${filtered.length - itemsOnMap.length} without location`}
          </div>
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="p-4">
          {loading ? <div className="flex justify-center py-10"><span className="spinner text-primary" /></div>
            : withDistance.length === 0 ? <EmptyState />
            : withDistance.map(item => (
              <div key={item.id} onClick={() => navigate(`/item/${item.id}`)} className="bg-white rounded-[14px] overflow-hidden shadow-sm mb-3 cursor-pointer">
                {item.photoURL
                  ? <img src={item.photoURL} alt={item.name} className="w-full aspect-video object-cover" />
                  : <div className="w-full aspect-video bg-surface-2 flex items-center justify-center text-5xl">{roomEmoji(item.room)}</div>
                }
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div className="font-bold text-base">{item.name}</div>
                    {item.distance != null && (
                      <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.72rem] font-semibold bg-teal-light text-teal">
                        📍 {item.distance < 0.1 ? 'Nearby' : `${item.distance.toFixed(1)} mi`}
                      </span>
                    )}
                  </div>
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
      )}

      {/* Bottom sheet modal */}
      {actionItem && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end" onClick={e => { if (e.target === e.currentTarget) { setActionItem(null); setOfferMode(false); } }}>
          <div className="bg-white rounded-t-[20px] px-5 pt-6 pb-9 w-full max-w-app mx-auto">
            <h3 className="font-bold text-lg mb-1">{offerMode ? '💬 Make an Offer' : '🛒 Buy Now'}</h3>
            <p className="text-sm text-muted mb-1">{actionItem.name} — asking ${actionItem.askingPrice ?? 'open to offers'}</p>
            {actionItem.distance != null && (
              <p className="text-sm text-teal font-semibold mb-4">📍 {actionItem.distance < 0.1 ? 'Nearby' : `${actionItem.distance.toFixed(1)} miles away`}</p>
            )}
            {!actionItem.distance && <div className="mb-4" />}
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
