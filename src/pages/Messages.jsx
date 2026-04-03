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
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid), orderBy('lastMessageAt', 'desc'));
    return onSnapshot(q, async snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setConvs(list); setLoading(false);
      const uids = [...new Set(list.flatMap(c => (c.participants || []).filter(p => p !== user.uid)))];
      const profiles = {};
      await Promise.all(uids.map(async uid => { if (!participants[uid]) { const s = await getDoc(doc(db, 'users', uid)); if (s.exists()) profiles[uid] = s.data(); } }));
      if (Object.keys(profiles).length) setParticipants(prev => ({ ...prev, ...profiles }));
    });
  }, [user]);

  function formatTime(ts) {
    if (!ts) return '';
    const d = ts.toDate?.() || new Date(ts), now = new Date(), diff = now - d;
    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    return `${Math.floor(diff / 86400000)}d`;
  }

  return (
    <div className="pb-[calc(68px+8px)] min-h-dvh">
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10">
        <h1 className="text-[1.3rem] font-bold">Messages</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><span className="spinner text-primary" /></div>
      ) : convs.length === 0 ? (
        <div className="text-center py-12 px-6 text-muted"><span className="block text-5xl mb-3">💬</span><h3 className="font-semibold text-ink mb-1">No messages yet</h3><p className="text-sm">Send a borrow request or make an offer to start a conversation.</p></div>
      ) : (
        <div className="bg-white">
          {convs.map(conv => {
            const otherUid = (conv.participants || []).find(p => p !== user?.uid);
            const other = participants[otherUid];
            const isUnread = (conv.unreadBy || []).includes(user?.uid);
            return (
              <div key={conv.id} onClick={() => navigate(`/messages/${conv.id}`)}
                className={`flex items-center gap-3 px-4 py-3.5 border-b border-border cursor-pointer transition-colors hover:bg-surface-2 ${isUnread ? 'bg-primary-light/30' : ''}`}>
                <Avatar user={other} size={46} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className={`text-[0.9rem] ${isUnread ? 'font-bold' : 'font-semibold'}`}>{other?.displayName || 'User'}</span>
                    <span className="text-[0.72rem] text-muted">{formatTime(conv.lastMessageAt)}</span>
                  </div>
                  <div className={`text-[0.8rem] truncate ${isUnread ? 'text-ink font-medium' : 'text-muted'}`}>{conv.lastMessage || 'No messages yet'}</div>
                </div>
                {isUnread && <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Avatar({ user, size = 46 }) {
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
