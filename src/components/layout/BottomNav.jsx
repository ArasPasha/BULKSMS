import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';

export default function BottomNav() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    if (!user) return;
    const unsub1 = onSnapshot(
      query(collection(db, 'conversations'), where('participants', 'array-contains', user.uid), where('unreadBy', 'array-contains', user.uid)),
      snap => setUnreadCount(snap.size), () => {}
    );
    const unsub2 = onSnapshot(
      query(collection(db, 'friendRequests'), where('toId', '==', user.uid), where('status', '==', 'pending')),
      snap => setPendingRequests(snap.size), () => {}
    );
    return () => { unsub1(); unsub2(); };
  }, [user]);

  const tabs = [
    { to: '/my-stuff', label: 'My Stuff', icon: <BoxIcon /> },
    { to: '/market',   label: 'Market',   icon: <MarketIcon /> },
    { to: '/friends',  label: 'Friends',  icon: <FriendsIcon />, badge: pendingRequests },
    { to: '/messages', label: 'Messages', icon: <MsgIcon />,     badge: unreadCount },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app h-nav bg-white border-t border-border flex items-center justify-around z-50 pb-safe">
      {tabs.map(({ to, label, icon, badge }) => (
        <NavLink key={to} to={to}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center justify-center gap-0.5 h-full relative no-underline transition-colors ${isActive ? 'text-primary' : 'text-muted'}`
          }>
          {icon}
          {badge > 0 && (
            <span className="absolute top-1.5 right-[22%] bg-coral text-white text-[0.6rem] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5">
              {badge > 9 ? '9+' : badge}
            </span>
          )}
          <span className="text-[0.68rem] font-semibold">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

function BoxIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
}
function MarketIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>;
}
function FriendsIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
}
function MsgIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
