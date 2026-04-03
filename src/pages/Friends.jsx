import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, getDocs, addDoc, updateDoc, doc, serverTimestamp, arrayUnion, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Friends() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [friends, setFriends] = useState([]);
  const [friendItems, setFriendItems] = useState({});

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'friendRequests'), where('toId', '==', user.uid), where('status', '==', 'pending')), async snap => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const enriched = await Promise.all(reqs.map(async r => { const s = await getDoc(doc(db, 'users', r.fromId)); return { ...r, fromProfile: s.exists() ? s.data() : null }; }));
      setIncoming(enriched);
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'friendRequests'), where('fromId', '==', user.uid), where('status', '==', 'pending')), snap => setOutgoing(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  useEffect(() => {
    const ids = profile?.friends || [];
    if (!ids.length) { setFriends([]); return; }
    Promise.all(ids.map(uid => getDoc(doc(db, 'users', uid)))).then(snaps => setFriends(snaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() }))));
  }, [profile?.friends]);

  useEffect(() => {
    if (!friends.length) return;
    const unsubs = friends.map(f => onSnapshot(query(collection(db, 'items'), where('userId', '==', f.uid), where('isLendable', '==', true)), snap => setFriendItems(prev => ({ ...prev, [f.uid]: snap.docs.map(d => ({ id: d.id, ...d.data() })) }))));
    return () => unsubs.forEach(u => u());
  }, [friends]);

  async function handleSearch(e) {
    e.preventDefault(); if (!searchEmail.trim()) return;
    setSearching(true); setSearchResult(null); setSearchError('');
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase())));
      if (snap.empty) { setSearchError('No user found with that email.'); return; }
      const found = { uid: snap.docs[0].id, ...snap.docs[0].data() };
      if (found.uid === user.uid) { setSearchError("That's you!"); return; }
      if (profile?.friends?.includes(found.uid)) { setSearchError('Already your friend.'); return; }
      setSearchResult(found);
    } catch { setSearchError('Search failed. Try again.'); }
    finally { setSearching(false); }
  }

  async function sendRequest(toUser) {
    const existing = await getDocs(query(collection(db, 'friendRequests'), where('fromId', '==', user.uid), where('toId', '==', toUser.uid), where('status', '==', 'pending')));
    if (!existing.empty) { setSearchError('Request already sent.'); return; }
    await addDoc(collection(db, 'friendRequests'), { fromId: user.uid, toId: toUser.uid, status: 'pending', createdAt: serverTimestamp() });
    setSearchResult(null); setSearchEmail('');
  }

  async function acceptRequest(req) {
    await updateDoc(doc(db, 'friendRequests', req.id), { status: 'accepted' });
    await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(req.fromId) });
    await updateDoc(doc(db, 'users', req.fromId), { friends: arrayUnion(user.uid) });
    await refreshProfile();
  }

  async function declineRequest(req) { await updateDoc(doc(db, 'friendRequests', req.id), { status: 'declined' }); }

  return (
    <div className="pb-[calc(68px+8px)] min-h-dvh">
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10">
        <h1 className="text-[1.3rem] font-bold">Friends</h1>
      </div>

      <div className="p-4">
        <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mt-5 mb-2">Find a Friend</p>
        <form onSubmit={handleSearch} className="mb-3">
          <div className="relative mb-2">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none">👤</span>
            <input type="email" placeholder="Search by email address…" value={searchEmail} onChange={e => setSearchEmail(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 border-[1.5px] border-border rounded-lg text-sm text-ink bg-white outline-none focus:border-primary font-[inherit]" />
          </div>
          <button type="submit" disabled={searching} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary-light text-primary font-semibold text-sm disabled:opacity-50">
            {searching ? <span className="spinner" style={{width:14,height:14,borderWidth:2}} /> : '🔍 Search'}
          </button>
        </form>

        {searchError && <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg mb-4">{searchError}</div>}
        {searchResult && (
          <div className="flex items-center gap-3 p-3 bg-white rounded-[14px] mb-4 shadow-sm border-2 border-primary">
            <Avatar user={searchResult} size={42} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[0.9rem]">{searchResult.displayName}</div>
              <div className="text-[0.78rem] text-muted">{searchResult.email}</div>
            </div>
            <button onClick={() => sendRequest(searchResult)} className="px-3.5 py-2 rounded-lg bg-primary text-white text-sm font-semibold border-none cursor-pointer">+ Add</button>
          </div>
        )}

        {incoming.length > 0 && (
          <>
            <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mt-5 mb-2">Friend Requests ({incoming.length})</p>
            {incoming.map(req => (
              <div key={req.id} className="flex items-center gap-3 p-3 bg-white rounded-[14px] mb-2 shadow-sm">
                <Avatar user={req.fromProfile} size={42} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[0.9rem]">{req.fromProfile?.displayName || 'Unknown'}</div>
                  <div className="text-[0.78rem] text-muted">{req.fromProfile?.email}</div>
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => acceptRequest(req)} className="w-9 h-9 rounded-lg bg-teal text-white flex items-center justify-center border-none cursor-pointer text-sm">✓</button>
                  <button onClick={() => declineRequest(req)} className="w-9 h-9 rounded-lg bg-transparent border-[1.5px] border-border text-muted flex items-center justify-center cursor-pointer text-sm">✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {outgoing.length > 0 && (
          <>
            <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mt-5 mb-2">Pending Sent</p>
            {outgoing.map(req => (
              <div key={req.id} className="flex items-center gap-3 p-3 bg-white rounded-[14px] mb-2 shadow-sm opacity-70">
                <div className="w-[42px] h-[42px] rounded-full bg-surface-2 flex items-center justify-center text-xl flex-shrink-0">⏳</div>
                <div><div className="font-semibold text-[0.9rem]">Request sent</div><div className="text-[0.78rem] text-muted">Waiting for acceptance</div></div>
              </div>
            ))}
          </>
        )}

        <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mt-5 mb-2">My Friends ({friends.length})</p>
        {friends.length === 0 ? (
          <div className="text-center py-8 text-muted"><span className="block text-4xl mb-2">👥</span><h3 className="font-semibold text-ink mb-1">No friends yet</h3><p className="text-sm">Search by email above.</p></div>
        ) : friends.map(friend => (
          <div key={friend.uid} className="mb-3">
            <div className="flex items-center gap-3 p-3 bg-white rounded-[14px] shadow-sm">
              <Avatar user={friend} size={42} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[0.9rem]">{friend.displayName}</div>
                <div className="text-[0.78rem] text-muted">{friend.email}</div>
              </div>
              <button onClick={async () => { const id = await getOrCreateConversation(user.uid, friend.uid); navigate(`/messages/${id}`); }}
                className="px-3 py-2 rounded-lg bg-primary-light text-primary text-sm font-semibold border-none cursor-pointer">💬</button>
            </div>
            {(friendItems[friend.uid] || []).length > 0 && (
              <div className="pl-4 mt-2">
                <p className="text-[0.75rem] font-semibold text-teal uppercase tracking-wider mb-1.5">🤝 Available to borrow</p>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
                  {(friendItems[friend.uid] || []).map(item => (
                    <div key={item.id} onClick={() => navigate(`/item/${item.id}`)} className="flex-shrink-0 w-24 bg-white rounded-lg p-2 shadow-sm cursor-pointer text-center">
                      {item.photoURL
                        ? <img src={item.photoURL} alt={item.name} className="w-14 h-14 rounded-lg object-cover mx-auto mb-1" />
                        : <div className="w-14 h-14 rounded-lg bg-surface-2 flex items-center justify-center text-2xl mx-auto mb-1">📦</div>
                      }
                      <div className="text-[0.72rem] font-semibold truncate">{item.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Avatar({ user, size = 42 }) {
  const name = user?.displayName || '?';
  const photo = user?.photoURL;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full bg-primary-light flex items-center justify-center text-primary font-bold flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photo ? <img src={photo} alt={name} style={{ width: size, height: size }} className="object-cover" /> : initials}
    </div>
  );
}

async function getOrCreateConversation(uid1, uid2) {
  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid1));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => (d.data().participants || []).includes(uid2));
  if (existing) return existing.id;
  const ref = await addDoc(collection(db, 'conversations'), { participants: [uid1, uid2], lastMessage: '', lastMessageAt: serverTimestamp(), unreadBy: [], createdAt: serverTimestamp() });
  return ref.id;
}
