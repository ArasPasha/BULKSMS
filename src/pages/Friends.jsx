import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection, query, where, onSnapshot, getDocs,
  addDoc, updateDoc, doc, serverTimestamp, arrayUnion, getDoc, orderBy,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Friends() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [searchEmail, setSearchEmail] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);

  const [incoming, setIncoming] = useState([]);   // pending requests TO me
  const [outgoing, setOutgoing] = useState([]);   // pending requests FROM me
  const [friends, setFriends] = useState([]);     // accepted friends profiles
  const [friendItems, setFriendItems] = useState({}); // lendable items per friend

  // Load incoming requests
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'friendRequests'),
      where('toId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, async snap => {
      const reqs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Enrich with sender profiles
      const enriched = await Promise.all(reqs.map(async r => {
        const s = await getDoc(doc(db, 'users', r.fromId));
        return { ...r, fromProfile: s.exists() ? s.data() : null };
      }));
      setIncoming(enriched);
    });
  }, [user]);

  // Load outgoing requests
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'friendRequests'),
      where('fromId', '==', user.uid),
      where('status', '==', 'pending')
    );
    return onSnapshot(q, snap => {
      setOutgoing(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // Load friend profiles
  useEffect(() => {
    const ids = profile?.friends || [];
    if (!ids.length) { setFriends([]); return; }
    Promise.all(ids.map(uid => getDoc(doc(db, 'users', uid)))).then(snaps => {
      setFriends(snaps.filter(s => s.exists()).map(s => ({ uid: s.id, ...s.data() })));
    });
  }, [profile?.friends]);

  // Load lendable items for each friend
  useEffect(() => {
    if (!friends.length) return;
    const unsubs = friends.map(friend => {
      const q = query(
        collection(db, 'items'),
        where('userId', '==', friend.uid),
        where('isLendable', '==', true)
      );
      return onSnapshot(q, snap => {
        setFriendItems(prev => ({
          ...prev,
          [friend.uid]: snap.docs.map(d => ({ id: d.id, ...d.data() })),
        }));
      });
    });
    return () => unsubs.forEach(u => u());
  }, [friends]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!searchEmail.trim()) return;
    setSearching(true);
    setSearchResult(null);
    setSearchError('');
    try {
      const q = query(collection(db, 'users'), where('email', '==', searchEmail.trim().toLowerCase()));
      const snap = await getDocs(q);
      if (snap.empty) {
        setSearchError('No user found with that email.');
      } else {
        const found = { uid: snap.docs[0].id, ...snap.docs[0].data() };
        if (found.uid === user.uid) {
          setSearchError("That's you!");
        } else if (profile?.friends?.includes(found.uid)) {
          setSearchError('Already your friend.');
        } else {
          setSearchResult(found);
        }
      }
    } catch {
      setSearchError('Search failed. Try again.');
    } finally {
      setSearching(false);
    }
  }

  async function sendRequest(toUser) {
    // Check for existing pending request
    const q = query(
      collection(db, 'friendRequests'),
      where('fromId', '==', user.uid),
      where('toId', '==', toUser.uid),
      where('status', '==', 'pending')
    );
    const existing = await getDocs(q);
    if (!existing.empty) { setSearchError('Request already sent.'); return; }

    await addDoc(collection(db, 'friendRequests'), {
      fromId: user.uid,
      toId: toUser.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    setSearchResult(null);
    setSearchEmail('');
  }

  async function acceptRequest(req) {
    await updateDoc(doc(db, 'friendRequests', req.id), { status: 'accepted' });
    // Add each other as friends
    await updateDoc(doc(db, 'users', user.uid), { friends: arrayUnion(req.fromId) });
    await updateDoc(doc(db, 'users', req.fromId), { friends: arrayUnion(user.uid) });
    await refreshProfile();
  }

  async function declineRequest(req) {
    await updateDoc(doc(db, 'friendRequests', req.id), { status: 'declined' });
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Friends</h1>
      </div>

      <div className="page-body">
        {/* Search */}
        <p className="section-title">Find a Friend</p>
        <form onSubmit={handleSearch} style={{ marginBottom: 12 }}>
          <div className="search-wrap" style={{ marginBottom: 8 }}>
            <span className="search-icon">👤</span>
            <input
              type="email"
              placeholder="Search by email address…"
              value={searchEmail}
              onChange={e => setSearchEmail(e.target.value)}
              style={{ paddingLeft: 38 }}
            />
          </div>
          <button className="btn btn-secondary btn-sm" type="submit" disabled={searching} style={{ width: '100%' }}>
            {searching ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : '🔍 Search'}
          </button>
        </form>

        {searchError && <div className="alert alert-error">{searchError}</div>}

        {searchResult && (
          <div className="friend-card" style={{ marginBottom: 16, border: '2px solid var(--primary)' }}>
            <UserAvatar user={searchResult} size={42} />
            <div className="friend-card-info">
              <div className="friend-card-name">{searchResult.displayName}</div>
              <div className="friend-card-sub">{searchResult.email}</div>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => sendRequest(searchResult)}>
              + Add
            </button>
          </div>
        )}

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <>
            <p className="section-title">Friend Requests ({incoming.length})</p>
            {incoming.map(req => (
              <div key={req.id} className="friend-card">
                <UserAvatar user={req.fromProfile} size={42} />
                <div className="friend-card-info">
                  <div className="friend-card-name">{req.fromProfile?.displayName || 'Unknown'}</div>
                  <div className="friend-card-sub">{req.fromProfile?.email}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-teal btn-sm" onClick={() => acceptRequest(req)}>✓</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => declineRequest(req)}>✕</button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Outgoing requests */}
        {outgoing.length > 0 && (
          <>
            <p className="section-title">Pending Sent</p>
            {outgoing.map(req => (
              <div key={req.id} className="friend-card" style={{ opacity: 0.7 }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>⏳</div>
                <div className="friend-card-info">
                  <div className="friend-card-name">Request sent</div>
                  <div className="friend-card-sub">Waiting for acceptance</div>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Friends list */}
        <p className="section-title">My Friends ({friends.length})</p>
        {friends.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: 24 }}>
            <span className="empty-icon">👥</span>
            <h3>No friends yet</h3>
            <p>Search for friends by their email above.</p>
          </div>
        ) : (
          friends.map(friend => (
            <div key={friend.uid}>
              <div className="friend-card">
                <UserAvatar user={friend} size={42} />
                <div className="friend-card-info">
                  <div className="friend-card-name">{friend.displayName}</div>
                  <div className="friend-card-sub">{friend.email}</div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    const convId = await getOrCreateConversation(user.uid, friend.uid);
                    navigate(`/messages/${convId}`);
                  }}
                >
                  💬
                </button>
              </div>

              {/* Lendable items from this friend */}
              {(friendItems[friend.uid] || []).length > 0 && (
                <div style={{ paddingLeft: 16, marginBottom: 12 }}>
                  <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--teal)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                    🤝 Available to borrow
                  </p>
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    {(friendItems[friend.uid] || []).map(item => (
                      <div
                        key={item.id}
                        onClick={() => navigate(`/item/${item.id}`)}
                        style={{
                          flexShrink: 0, width: 100,
                          background: 'var(--surface)', borderRadius: 'var(--radius-sm)',
                          padding: 8, boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
                          textAlign: 'center',
                        }}
                      >
                        {item.photoURL ? (
                          <img src={item.photoURL} alt={item.name} style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', marginBottom: 4 }} />
                        ) : (
                          <div style={{ width: 60, height: 60, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem', margin: '0 auto 4px' }}>📦</div>
                        )}
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function UserAvatar({ user, size = 42 }) {
  const name = user?.displayName || '?';
  const photo = user?.photoURL;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photo
        ? <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
        : initials}
    </div>
  );
}

async function getOrCreateConversation(uid1, uid2) {
  const q = query(collection(db, 'conversations'), where('participants', 'array-contains', uid1));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => (d.data().participants || []).includes(uid2));
  if (existing) return existing.id;

  const newRef = await addDoc(collection(db, 'conversations'), {
    participants: [uid1, uid2],
    lastMessage: '',
    lastMessageAt: serverTimestamp(),
    unreadBy: [],
    createdAt: serverTimestamp(),
  });
  return newRef.id;
}
