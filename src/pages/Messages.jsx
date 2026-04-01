import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Messages() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [convs, setConvs] = useState([]);
  const [participants, setParticipants] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    );
    return onSnapshot(q, async snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConvs(list);
      setLoading(false);

      // Fetch other participant profiles
      const uids = [...new Set(
        list.flatMap(c => (c.participants || []).filter(p => p !== user.uid))
      )];
      const profiles = {};
      await Promise.all(uids.map(async uid => {
        if (!participants[uid]) {
          const s = await getDoc(doc(db, 'users', uid));
          if (s.exists()) profiles[uid] = s.data();
        }
      }));
      if (Object.keys(profiles).length) {
        setParticipants(prev => ({ ...prev, ...profiles }));
      }
    });
  }, [user]);

  function getOtherUid(conv) {
    return (conv.participants || []).find(p => p !== user?.uid);
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = ts.toDate?.() || new Date(ts);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  }

  return (
    <div className="page">
      <div className="page-header">
        <h1>Messages</h1>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <span className="spinner" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
        </div>
      ) : convs.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon">💬</span>
          <h3>No messages yet</h3>
          <p>Send a borrow request or make an offer to start a conversation.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--surface)' }}>
          {convs.map(conv => {
            const otherUid = getOtherUid(conv);
            const other = participants[otherUid];
            const isUnread = (conv.unreadBy || []).includes(user?.uid);

            return (
              <div
                key={conv.id}
                className={`conv-item${isUnread ? ' unread' : ''}`}
                onClick={() => navigate(`/messages/${conv.id}`)}
              >
                <UserAvatar user={other} size={46} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ justifyContent: 'space-between', marginBottom: 2 }}>
                    <span className="conv-name">{other?.displayName || 'User'}</span>
                    <span className="conv-time">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <div className="conv-preview">{conv.lastMessage || 'No messages yet'}</div>
                </div>
                {isUnread && (
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%',
                    background: 'var(--primary)', flexShrink: 0,
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserAvatar({ user, size = 46 }) {
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
