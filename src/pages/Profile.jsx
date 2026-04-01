import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, collection, query, where, getCountFromServer } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import { db, storage, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';

export default function Profile() {
  const { user, profile, logout, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [displayName, setDisplayName] = useState(profile?.displayName || user?.displayName || '');
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [stats, setStats] = useState({ total: 0, lendable: 0, forSale: 0, value: 0 });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      const base = collection(db, 'items');
      const uid = user.uid;
      const [total, lendable, forSale] = await Promise.all([
        getCountFromServer(query(base, where('userId', '==', uid))),
        getCountFromServer(query(base, where('userId', '==', uid), where('isLendable', '==', true))),
        getCountFromServer(query(base, where('userId', '==', uid), where('isForSale', '==', true))),
      ]);
      setStats({
        total: total.data().count,
        lendable: lendable.data().count,
        forSale: forSale.data().count,
      });
    }
    loadStats();
  }, [user]);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      await refreshProfile();
      setMessage('Photo updated!');
    } catch {
      setMessage('Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  }

  async function handleSaveName() {
    if (!displayName.trim()) return;
    setSavingName(true);
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: displayName.trim() });
      await refreshProfile();
      setEditingName(false);
      setMessage('Name updated!');
    } catch {
      setMessage('Failed to update name.');
    } finally {
      setSavingName(false);
    }
  }

  async function handleSignOut() {
    await logout();
    navigate('/sign-in');
  }

  const photoURL = profile?.photoURL || user?.photoURL;
  const name = profile?.displayName || user?.displayName || 'You';
  const email = user?.email || '';
  const isGoogleUser = user?.providerData?.some(p => p.providerId === 'google.com');

  return (
    <div className="page" style={{ paddingBottom: '90px' }}>
      {/* Purple gradient header */}
      <div className="profile-header">
        <div style={{ position: 'absolute', top: 16, right: 16 }}>
          <button
            className="btn-icon"
            style={{ background: 'rgba(255,255,255,.2)', color: '#fff' }}
            onClick={() => navigate(-1)}
          >
            ←
          </button>
        </div>

        <div className="profile-avatar-wrap">
          {photoURL ? (
            <img
              src={photoURL}
              alt={name}
              style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,.4)' }}
            />
          ) : (
            <div style={{
              width: 84, height: 84, borderRadius: '50%',
              background: 'rgba(255,255,255,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '2rem', fontWeight: 700, color: '#fff',
              border: '3px solid rgba(255,255,255,.4)',
            }}>
              {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div
            className="profile-avatar-edit"
            onClick={() => fileRef.current?.click()}
            title="Change photo"
          >
            {uploadingPhoto ? '…' : '📷'}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} />
        </div>

        <div className="profile-name">{name}</div>
        <div className="profile-email">{email}</div>
      </div>

      <div className="page-body">
        {message && (
          <div className="alert alert-success" style={{ marginBottom: 12 }}>
            {message}
          </div>
        )}

        {/* Stats */}
        <p className="section-title">My Stats</p>
        <div className="stats-bar" style={{ marginBottom: 20 }}>
          <div className="stat-card">
            <span className="stat-val">{stats.total}</span>
            <span className="stat-label">Items</span>
          </div>
          <div className="stat-card">
            <span className="stat-val" style={{ color: 'var(--teal)' }}>{stats.lendable}</span>
            <span className="stat-label">Lendable</span>
          </div>
          <div className="stat-card">
            <span className="stat-val" style={{ color: 'var(--amber)' }}>{stats.forSale}</span>
            <span className="stat-label">For Sale</span>
          </div>
          <div className="stat-card">
            <span className="stat-val" style={{ color: 'var(--coral)', fontSize: '0.9rem' }}>
              {(profile?.friends || []).length}
            </span>
            <span className="stat-label">Friends</span>
          </div>
        </div>

        {/* Account details */}
        <p className="section-title">Account</p>
        <div className="card" style={{ padding: '0 16px', marginBottom: 16 }}>
          {/* Display name */}
          <div className="toggle-row" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <span className="toggle-row-label">Display Name</span>
              <button className="btn-icon" style={{ width: 32, height: 32, fontSize: '0.85rem' }} onClick={() => setEditingName(e => !e)}>
                {editingName ? '✕' : '✏️'}
              </button>
            </div>
            {editingName ? (
              <div style={{ width: '100%', display: 'flex', gap: 8 }}>
                <input
                  style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--primary)', borderRadius: 8, fontSize: '0.9rem', fontFamily: 'inherit', outline: 'none' }}
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  autoFocus
                />
                <button className="btn btn-primary btn-sm" onClick={handleSaveName} disabled={savingName}>
                  {savingName ? '…' : 'Save'}
                </button>
              </div>
            ) : (
              <span style={{ fontSize: '0.9rem', color: 'var(--text)' }}>{name}</span>
            )}
          </div>

          {/* Email */}
          <div className="toggle-row">
            <span className="toggle-row-label">Email</span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{email}</span>
          </div>
        </div>

        {/* Connected accounts */}
        <p className="section-title">Connected Accounts</p>
        <div className="card" style={{ padding: '0 16px', marginBottom: 16 }}>
          <div className="toggle-row">
            <div className="row">
              <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <div>
                <div className="toggle-row-label">Google</div>
                <div className="toggle-row-sub">{isGoogleUser ? email : 'Not connected'}</div>
              </div>
            </div>
            <span className={`badge ${isGoogleUser ? 'badge-lend' : 'badge-other'}`}>
              {isGoogleUser ? '✓ Connected' : 'Not linked'}
            </span>
          </div>
        </div>

        {/* Preferences */}
        <p className="section-title">Preferences</p>
        <div className="card" style={{ padding: '0 16px', marginBottom: 20 }}>
          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Borrow Notifications</div>
              <div className="toggle-row-sub">Get notified when friends request to borrow</div>
            </div>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span className="toggle-track" />
            </label>
          </div>
          <div className="toggle-row">
            <div>
              <div className="toggle-row-label">Marketplace Alerts</div>
              <div className="toggle-row-sub">Notify me of new listings from friends</div>
            </div>
            <label className="toggle">
              <input type="checkbox" defaultChecked />
              <span className="toggle-track" />
            </label>
          </div>
        </div>

        {/* Sign out */}
        <button
          className="btn btn-ghost"
          style={{ color: 'var(--coral)', borderColor: 'var(--coral)' }}
          onClick={handleSignOut}
        >
          🚪 Sign Out
        </button>

        <p style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 24 }}>
          Inventory · Built with ♥
        </p>
      </div>
    </div>
  );
}
