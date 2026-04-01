import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  collection, query, orderBy, onSnapshot,
  addDoc, updateDoc, doc, getDoc, serverTimestamp, arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Conversation() {
  const { convId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [conv, setConv] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  // Load conversation metadata + other user
  useEffect(() => {
    if (!convId || !user) return;
    getDoc(doc(db, 'conversations', convId)).then(async snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      setConv({ id: snap.id, ...data });
      const otherUid = (data.participants || []).find(p => p !== user.uid);
      if (otherUid) {
        const s = await getDoc(doc(db, 'users', otherUid));
        if (s.exists()) setOtherUser({ uid: otherUid, ...s.data() });
      }
      // Mark as read
      if ((data.unreadBy || []).includes(user.uid)) {
        updateDoc(doc(db, 'conversations', convId), { unreadBy: arrayRemove(user.uid) });
      }
    });
  }, [convId, user]);

  // Listen for messages
  useEffect(() => {
    if (!convId) return;
    const q = query(
      collection(db, 'conversations', convId, 'messages'),
      orderBy('createdAt', 'asc')
    );
    return onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, [convId]);

  async function sendMessage(e) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      await addDoc(collection(db, 'conversations', convId, 'messages'), {
        senderId: user.uid,
        text: content,
        type: 'text',
        createdAt: serverTimestamp(),
      });
      const otherUid = otherUser?.uid;
      await updateDoc(doc(db, 'conversations', convId), {
        lastMessage: content,
        lastMessageAt: serverTimestamp(),
        unreadBy: otherUid ? [otherUid] : [],
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatTime(ts) {
    if (!ts) return '';
    const d = ts.toDate?.() || new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface)', borderBottom: '1px solid var(--border)',
        padding: '52px 16px 14px',
        display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <button className="btn-icon" onClick={() => navigate('/messages')}>←</button>
        <UserAvatar user={otherUser} size={36} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{otherUser?.displayName || 'Loading…'}</div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{otherUser?.email}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-wrap" style={{ flex: 1 }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0', fontSize: '0.85rem' }}>
            Start the conversation!
          </div>
        )}
        {messages.map(msg => {
          const isMine = msg.senderId === user?.uid;
          if (msg.type === 'buy_request' || msg.type === 'offer') {
            return (
              <div key={msg.id} className={`bubble-row${isMine ? ' mine' : ''}`}>
                {!isMine && <UserAvatar user={otherUser} size={28} />}
                <div className="bubble-special">
                  <div className="special-label" style={{ color: msg.type === 'offer' ? 'var(--amber)' : 'var(--teal)' }}>
                    {msg.type === 'offer' ? '💬 Offer' : '🛒 Buy Request'}
                  </div>
                  <div className="special-item">{msg.itemName}</div>
                  {msg.offerPrice && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--amber)', fontWeight: 700, marginBottom: 6 }}>
                      Offered: ${msg.offerPrice}
                    </div>
                  )}
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{msg.text}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    {formatTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`bubble-row${isMine ? ' mine' : ''}`}>
              {!isMine && <UserAvatar user={otherUser} size={28} />}
              <div>
                <div className={`bubble ${isMine ? 'mine' : 'theirs'}`}>{msg.text}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textAlign: isMine ? 'right' : 'left', marginTop: 2, padding: '0 4px' }}>
                  {formatTime(msg.createdAt)}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="chat-input-bar" style={{ paddingBottom: 'calc(var(--nav-h) + 8px)' }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message…"
          autoComplete="off"
        />
        <button
          className="chat-send"
          onClick={sendMessage}
          disabled={!text.trim() || sending}
          style={{ opacity: text.trim() ? 1 : 0.4 }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function UserAvatar({ user, size = 36 }) {
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
