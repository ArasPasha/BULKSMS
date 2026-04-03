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
  const [stats, setStats] = useState({ total: 0, lendable: 0, forSale: 0 });
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    async function loadStats() {
      const base = collection(db, 'items'), uid = user.uid;
      const [t, l, s] = await Promise.all([
        getCountFromServer(query(base, where('userId', '==', uid))),
        getCountFromServer(query(base, where('userId', '==', uid), where('isLendable', '==', true))),
        getCountFromServer(query(base, where('userId', '==', uid), where('isForSale', '==', true))),
      ]);
      setStats({ total: t.data().count, lendable: l.data().count, forSale: s.data().count });
    }
    loadStats();
  }, [user]);

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingPhoto(true);
    try {
      const storageRef = ref(storage, `avatars/${user.uid}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await updateProfile(auth.currentUser, { photoURL: url });
      await updateDoc(doc(db, 'users', user.uid), { photoURL: url });
      await refreshProfile(); setMessage('Photo updated!');
    } catch { setMessage('Failed to upload photo.'); }
    finally { setUploadingPhoto(false); }
  }

  async function handleSaveName() {
    if (!displayName.trim()) return; setSavingName(true);
    try {
      await updateProfile(auth.currentUser, { displayName: displayName.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: displayName.trim() });
      await refreshProfile(); setEditingName(false); setMessage('Name updated!');
    } catch { setMessage('Failed to update name.'); }
    finally { setSavingName(false); }
  }

  const photoURL = profile?.photoURL || user?.photoURL;
  const name = profile?.displayName || user?.displayName || 'You';
  const email = user?.email || '';
  const isGoogleUser = user?.providerData?.some(p => p.providerId === 'google.com');

  return (
    <div className="pb-24 min-h-dvh">
      {/* Purple header */}
      <div className="relative bg-gradient-to-br from-primary to-primary-dark px-5 pt-12 pb-7 flex flex-col items-center gap-2.5 text-white">
        <button onClick={() => navigate(-1)} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center border-none cursor-pointer text-white text-lg">←</button>
        <div className="relative">
          {photoURL
            ? <img src={photoURL} alt={name} className="w-20 h-20 rounded-full object-cover border-[3px] border-white/40" />
            : <div className="w-20 h-20 rounded-full bg-white/25 border-[3px] border-white/40 flex items-center justify-center text-3xl font-bold">{name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}</div>
          }
          <div onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-teal border-2 border-white flex items-center justify-center text-[0.7rem] cursor-pointer text-white">
            {uploadingPhoto ? '…' : '📷'}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} />
        </div>
        <div className="text-lg font-bold">{name}</div>
        <div className="text-sm opacity-80">{email}</div>
      </div>

      <div className="p-4">
        {message && <div className="bg-teal-light text-teal text-sm px-4 py-2.5 rounded-lg mb-3">{message}</div>}

        <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mt-2 mb-2">My Stats</p>
        <div className="grid grid-cols-4 gap-2 mb-5">
          <StatCard val={stats.total} label="Items" />
          <StatCard val={stats.lendable} label="Lendable" color="text-teal" />
          <StatCard val={stats.forSale} label="For Sale" color="text-amber" />
          <StatCard val={(profile?.friends || []).length} label="Friends" color="text-coral" />
        </div>

        <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mb-2">Account</p>
        <div className="bg-white rounded-[14px] shadow-sm px-4 mb-4">
          {/* Name */}
          <div className="py-3.5 border-b border-border">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[0.9rem] font-medium">Display Name</span>
              <button onClick={() => setEditingName(e => !e)} className="w-8 h-8 rounded-full bg-surface-2 flex items-center justify-center border-none cursor-pointer text-sm">{editingName ? '✕' : '✏️'}</button>
            </div>
            {editingName
              ? <div className="flex gap-2">
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)} autoFocus
                    className="flex-1 px-3 py-2 border-[1.5px] border-primary rounded-lg text-[0.9rem] font-[inherit] outline-none" />
                  <button onClick={handleSaveName} disabled={savingName} className="px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold border-none cursor-pointer disabled:opacity-50">{savingName ? '…' : 'Save'}</button>
                </div>
              : <span className="text-sm text-ink">{name}</span>
            }
          </div>
          {/* Email */}
          <div className="flex justify-between items-center py-3.5">
            <span className="text-[0.9rem] font-medium">Email</span>
            <span className="text-sm text-muted">{email}</span>
          </div>
        </div>

        <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mb-2">Connected Accounts</p>
        <div className="bg-white rounded-[14px] shadow-sm px-4 mb-4">
          <div className="flex items-center justify-between py-3.5">
            <div className="flex items-center gap-2">
              <GoogleIcon />
              <div>
                <div className="text-[0.9rem] font-medium">Google</div>
                <div className="text-[0.78rem] text-muted">{isGoogleUser ? email : 'Not connected'}</div>
              </div>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[0.72rem] font-semibold ${isGoogleUser ? 'bg-teal-light text-teal' : 'bg-surface-2 text-muted'}`}>
              {isGoogleUser ? '✓ Connected' : 'Not linked'}
            </span>
          </div>
        </div>

        <p className="text-[0.78rem] font-bold uppercase tracking-wider text-muted mb-2">Preferences</p>
        <div className="bg-white rounded-[14px] shadow-sm px-4 mb-5">
          <PrefRow label="Borrow Notifications" sub="Get notified when friends request to borrow" />
          <PrefRow label="Marketplace Alerts" sub="Notify me of new listings from friends" last />
        </div>

        <button onClick={async () => { await logout(); navigate('/sign-in'); }}
          className="w-full py-3.5 rounded-lg bg-transparent text-coral border-[1.5px] border-coral font-semibold flex items-center justify-center gap-2">
          🚪 Sign Out
        </button>

        <p className="text-center text-[0.72rem] text-muted mt-6">Inventory · Built with ♥</p>
      </div>
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

function PrefRow({ label, sub, last }) {
  return (
    <div className={`flex items-center justify-between py-3.5 ${last ? '' : 'border-b border-border'}`}>
      <div>
        <div className="text-[0.9rem] font-medium">{label}</div>
        {sub && <div className="text-[0.78rem] text-muted">{sub}</div>}
      </div>
      <label className="toggle"><input type="checkbox" defaultChecked /><span className="toggle-track" /></label>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}
