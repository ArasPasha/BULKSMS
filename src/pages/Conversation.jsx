import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, orderBy, onSnapshot, addDoc, updateDoc, doc, getDoc, serverTimestamp, arrayRemove } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Conversation() {
  const { convId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [otherUser, setOtherUser] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!convId || !user) return;
    getDoc(doc(db, 'conversations', convId)).then(async snap => {
      if (!snap.exists()) return;
      const data = snap.data();
      const otherUid = (data.participants || []).find(p => p !== user.uid);
      if (otherUid) { const s = await getDoc(doc(db, 'users', otherUid)); if (s.exists()) setOtherUser({ uid: otherUid, ...s.data() }); }
      if ((data.unreadBy || []).includes(user.uid)) updateDoc(doc(db, 'conversations', convId), { unreadBy: arrayRemove(user.uid) });
    });
  }, [convId, user]);

  useEffect(() => {
    if (!convId) return;
    return onSnapshot(query(collection(db, 'conversations', convId, 'messages'), orderBy('createdAt', 'asc')), snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    });
  }, [convId]);

  async function sendMessage(e) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    const content = text.trim(); setText(''); setSending(true);
    try {
      await addDoc(collection(db, 'conversations', convId, 'messages'), { senderId: user.uid, text: content, type: 'text', createdAt: serverTimestamp() });
      await updateDoc(doc(db, 'conversations', convId), { lastMessage: content, lastMessageAt: serverTimestamp(), unreadBy: otherUser?.uid ? [otherUser.uid] : [] });
    } catch (err) { console.error(err); }
    finally { setSending(false); }
  }

  function formatTime(ts) {
    if (!ts) return '';
    return (ts.toDate?.() || new Date(ts)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="flex flex-col h-dvh">
      {/* Header */}
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border flex items-center gap-3 flex-shrink-0 sticky top-0 z-10">
        <button onClick={() => navigate('/messages')} className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center border-none cursor-pointer text-lg flex-shrink-0">←</button>
        <Avatar user={otherUser} size={36} />
        <div>
          <div className="font-bold text-[0.95rem]">{otherUser?.displayName || 'Loading…'}</div>
          <div className="text-[0.72rem] text-muted">{otherUser?.email}</div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2" style={{ paddingBottom: '80px' }}>
        {messages.length === 0 && <div className="text-center text-muted text-sm py-10">Start the conversation!</div>}
        {messages.map(msg => {
          const isMine = msg.senderId === user?.uid;
          if (msg.type === 'buy_request' || msg.type === 'offer') {
            return (
              <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
                {!isMine && <Avatar user={otherUser} size={28} />}
                <div className="bg-white border-[1.5px] border-border rounded-[14px] p-3 max-w-[80%] shadow-sm">
                  <div className={`text-[0.72rem] font-bold uppercase tracking-wider mb-1 ${msg.type === 'offer' ? 'text-amber' : 'text-teal'}`}>
                    {msg.type === 'offer' ? '💬 Offer' : '🛒 Buy Request'}
                  </div>
                  <div className="font-semibold text-[0.9rem] mb-1.5">{msg.itemName}</div>
                  {msg.offerPrice && <div className="text-sm font-bold text-amber mb-1.5">Offered: ${msg.offerPrice}</div>}
                  <div className="text-[0.82rem] text-muted">{msg.text}</div>
                  <div className="text-[0.7rem] text-muted mt-1">{formatTime(msg.createdAt)}</div>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : ''}`}>
              {!isMine && <Avatar user={otherUser} size={28} />}
              <div>
                <div className={`max-w-[72%] px-3.5 py-2.5 text-[0.88rem] leading-relaxed
                  ${isMine ? 'bg-primary text-white rounded-[14px] rounded-br-sm' : 'bg-white shadow-sm rounded-[14px] rounded-bl-sm'}`}>
                  {msg.text}
                </div>
                <div className={`text-[0.68rem] text-muted mt-0.5 px-1 ${isMine ? 'text-right' : 'text-left'}`}>{formatTime(msg.createdAt)}</div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-border bg-white sticky bottom-0" style={{ paddingBottom: 'calc(68px + 8px)' }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
          placeholder="Type a message…" autoComplete="off"
          className="flex-1 px-3.5 py-2.5 border-[1.5px] border-border rounded-lg text-[0.9rem] font-[inherit] outline-none focus:border-primary" />
        <button onClick={sendMessage} disabled={!text.trim() || sending}
          className="w-[38px] h-[38px] rounded-full bg-primary text-white flex items-center justify-center border-none cursor-pointer flex-shrink-0 disabled:opacity-40">
          ➤
        </button>
      </div>
    </div>
  );
}

function Avatar({ user, size = 36 }) {
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
