import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { roomBadgeClass, roomEmoji, ROOMS } from '../lib/rooms';

export default function MyStuff() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'items'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    return onSnapshot(q, snap => { setItems(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
  }, [user]);

  const filterOptions = ['All', 'Lendable', 'For Sale', ...ROOMS];
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name?.toLowerCase().includes(search.toLowerCase()) || item.storeName?.toLowerCase().includes(search.toLowerCase());
    let matchFilter = true;
    if (filter === 'Lendable') matchFilter = item.isLendable;
    else if (filter === 'For Sale') matchFilter = item.isForSale;
    else if (filter !== 'All') matchFilter = item.room === filter;
    return matchSearch && matchFilter;
  });

  const totalValue = items.reduce((s, i) => s + (Number(i.pricePaid) || 0), 0);
  const lendableCount = items.filter(i => i.isLendable).length;
  const forSaleCount = items.filter(i => i.isForSale).length;

  return (
    <div className="pb-[calc(68px+8px)] min-h-dvh">
      {/* Header */}
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Avatar user={user} profile={profile} size={34} />
            <h1 className="text-[1.3rem] font-bold">My Stuff</h1>
          </div>
          <Link to="/profile" className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center text-lg no-underline">⚙️</Link>
        </div>
        {/* Search */}
        <div className="relative mb-3">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-base pointer-events-none">🔍</span>
          <input type="search" placeholder="Search your items…" value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2.5 border-[1.5px] border-border rounded-lg text-sm text-ink bg-white outline-none focus:border-primary font-[inherit]" />
        </div>
        {/* Filter chips */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {filterOptions.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[0.8rem] font-semibold border-[1.5px] transition-all whitespace-nowrap
                ${filter === f ? 'bg-primary text-white border-primary' : 'bg-white text-muted border-border'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <StatCard val={items.length} label="Items" />
          <StatCard val={lendableCount} label="Lendable" color="text-teal" />
          <StatCard val={forSaleCount} label="For Sale" color="text-amber" />
          <StatCard val={`$${totalValue.toLocaleString()}`} label="Value" color="text-coral text-sm" />
        </div>

        {loading ? (
          <div className="flex justify-center py-10 text-muted"><span className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📦" title={search || filter !== 'All' ? 'No items match' : 'No items yet'} sub={search || filter !== 'All' ? 'Try a different filter' : 'Tap + to add your first item'} />
        ) : (
          filtered.map(item => <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />)
        )}
      </div>

      {/* FAB */}
      <button onClick={() => navigate('/add-item')} aria-label="Add item"
        className="fixed bottom-[calc(68px+16px)] right-[max(16px,calc(50%-215px+16px))] w-[54px] h-[54px] rounded-full bg-primary text-white text-2xl flex items-center justify-center shadow-lg z-50 active:scale-95 border-none cursor-pointer">
        +
      </button>
    </div>
  );
}

function StatCard({ val, label, color = 'text-primary' }) {
  return (
    <div className="bg-white rounded-lg p-2.5 text-center shadow-sm">
      <span className={`block text-xl font-extrabold ${color}`}>{val}</span>
      <span className="text-[0.68rem] text-muted font-medium">{label}</span>
    </div>
  );
}

function ItemCard({ item, onClick }) {
  return (
    <div onClick={onClick} className="bg-white rounded-[14px] shadow-sm flex gap-3 p-3 mb-2.5 cursor-pointer hover:shadow-DEFAULT transition-shadow">
      {item.photoURL
        ? <img src={item.photoURL} alt={item.name} className="w-[70px] h-[70px] rounded-lg object-cover flex-shrink-0" />
        : <div className="w-[70px] h-[70px] rounded-lg bg-surface-2 flex items-center justify-center text-3xl flex-shrink-0">{roomEmoji(item.room)}</div>
      }
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[0.95rem] mb-1 truncate">{item.name}</div>
        <div className="text-[0.78rem] text-muted mb-1.5">{item.storeName && `${item.storeName} · `}{item.pricePaid ? `$${Number(item.pricePaid).toLocaleString()}` : 'No price'}</div>
        <div className="flex gap-1 flex-wrap">
          {item.room && <Badge cls={roomBadgeClass(item.room)}>{item.room}</Badge>}
          {item.isLendable && <Badge cls="bg-teal-light text-teal">🤝 Lendable</Badge>}
          {item.isForSale && <Badge cls="bg-amber-light text-amber">💰 {item.askingPrice ? `$${item.askingPrice}` : 'For Sale'}</Badge>}
        </div>
      </div>
    </div>
  );
}

function Badge({ cls, children }) {
  return <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[0.72rem] font-semibold ${cls}`}>{children}</span>;
}

function EmptyState({ icon, title, sub }) {
  return (
    <div className="text-center py-12 px-6 text-muted">
      <span className="block text-5xl mb-3">{icon}</span>
      <h3 className="text-base font-semibold text-ink mb-1.5">{title}</h3>
      <p className="text-sm">{sub}</p>
    </div>
  );
}

function Avatar({ user, profile, size = 34 }) {
  const name = profile?.displayName || user?.displayName || '?';
  const photo = profile?.photoURL || user?.photoURL;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="rounded-full bg-primary-light flex items-center justify-center text-primary font-bold flex-shrink-0 overflow-hidden"
      style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {photo ? <img src={photo} alt={name} style={{ width: size, height: size }} className="object-cover" /> : initials}
    </div>
  );
}
