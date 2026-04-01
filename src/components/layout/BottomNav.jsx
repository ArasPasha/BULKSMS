import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

export default function BottomNav() {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (!user) return;

    // Listen for unread conversations
    const convQ = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      where('unreadBy', 'array-contains', user.uid)
    );
    const unsub1 = onSnapshot(convQ, snap => setUnreadCount(snap.size), () => {});

    // Listen for pending friend requests
    const frQ = query(
      collection(db, 'friendRequests'),
      where('toId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub2 = onSnapshot(frQ, snap => setPendingRequests(snap.size), () => {});

    return () => { unsub1(); unsub2(); };
  }, [user]);

  const tabs = [
    { to: '/my-stuff',  label: 'My Stuff',  icon: <BoxIcon /> },
    { to: '/market',    label: 'Market',    icon: <MarketIcon /> },
    { to: '/friends',   label: 'Friends',   icon: <FriendsIcon />, badge: pendingRequests },
    { to: '/messages',  label: 'Messages',  icon: <MsgIcon />, badge: unreadCount },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
        >
          {icon}
          {badge > 0 && <span className="nav-badge">{badge > 9 ? '9+' : badge}</span>}
          <span className="nav-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function BoxIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
      <line x1="12" y1="22.08" x2="12" y2="12"/>
    </svg>
  );
}

function MarketIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
      <line x1="3" y1="6" x2="21" y2="6"/>
      <path d="M16 10a4 4 0 0 1-8 0"/>
    </svg>
  );
}

function FriendsIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}

function MsgIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
