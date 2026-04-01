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
    const q = query(
      collection(db, 'items'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, [user]);

  const filterOptions = ['All', 'Lendable', 'For Sale', ...ROOMS];

  const filtered = items.filter(item => {
    const matchSearch = !search ||
      item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.storeName?.toLowerCase().includes(search.toLowerCase());

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
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '12px' }}>
          <div className="row">
            <Avatar user={user} profile={profile} size={34} />
            <h1>My Stuff</h1>
          </div>
          <Link to="/profile" className="btn-icon" style={{ textDecoration: 'none' }}>
            ⚙️
          </Link>
        </div>

        {/* Search */}
        <div className="search-wrap">
          <span className="search-icon">🔍</span>
          <input
            type="search"
            placeholder="Search your items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Filters */}
        <div className="chips">
          {filterOptions.map(f => (
            <button
              key={f}
              className={`chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {/* Stats bar */}
        <div className="stats-bar">
          <div className="stat-card">
            <span className="stat-val">{items.length}</span>
            <span className="stat-label">Items</span>
          </div>
          <div className="stat-card">
            <span className="stat-val" style={{ color: 'var(--teal)' }}>{lendableCount}</span>
            <span className="stat-label">Lendable</span>
          </div>
          <div className="stat-card">
            <span className="stat-val" style={{ color: 'var(--amber)' }}>{forSaleCount}</span>
            <span className="stat-label">For Sale</span>
          </div>
          <div className="stat-card">
            <span className="stat-val" style={{ color: 'var(--coral)', fontSize: '1rem' }}>
              ${totalValue.toLocaleString()}
            </span>
            <span className="stat-label">Value</span>
          </div>
        </div>

        {/* Item list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            <span className="spinner" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📦</span>
            <h3>{search || filter !== 'All' ? 'No items match' : 'No items yet'}</h3>
            <p>{search || filter !== 'All' ? 'Try a different filter' : 'Tap + to add your first item'}</p>
          </div>
        ) : (
          filtered.map(item => <ItemCard key={item.id} item={item} onClick={() => navigate(`/item/${item.id}`)} />)
        )}
      </div>

      {/* FAB */}
      <button className="fab" onClick={() => navigate('/add-item')} aria-label="Add item">
        +
      </button>
    </div>
  );
}

function ItemCard({ item, onClick }) {
  return (
    <div className="item-card" onClick={onClick}>
      {item.photoURL ? (
        <img className="item-card-img" src={item.photoURL} alt={item.name} />
      ) : (
        <div className="item-card-img">{roomEmoji(item.room)}</div>
      )}
      <div className="item-card-info">
        <div className="item-card-name">{item.name}</div>
        <div className="item-card-meta">
          {item.storeName && `${item.storeName} · `}
          {item.pricePaid ? `$${Number(item.pricePaid).toLocaleString()}` : 'No price'}
        </div>
        <div className="item-card-badges">
          {item.room && (
            <span className={`badge ${roomBadgeClass(item.room)}`}>{item.room}</span>
          )}
          {item.isLendable && <span className="badge badge-lend">🤝 Lendable</span>}
          {item.isForSale && (
            <span className="badge badge-sale">
              💰 {item.askingPrice ? `$${item.askingPrice}` : 'For Sale'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function Avatar({ user, profile, size = 34 }) {
  const name = profile?.displayName || user?.displayName || '?';
  const photo = profile?.photoURL || user?.photoURL;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.38, marginRight: 4 }}
    >
      {photo ? (
        <img src={photo} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} />
      ) : initials}
    </div>
  );
}
