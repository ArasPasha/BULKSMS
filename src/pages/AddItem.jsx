import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { identifyItemFromPhoto } from '../lib/anthropic';
import { ROOMS } from '../lib/rooms';

export default function AddItem() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef(null);

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [room, setRoom] = useState('');
  const [isLendable, setIsLendable] = useState(false);
  const [isForSale, setIsForSale] = useState(false);
  const [askingPrice, setAskingPrice] = useState('');
  const [directions, setDirections] = useState('');
  const [location, setLocation] = useState(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file); setPhotoPreview(URL.createObjectURL(file)); setAiError('');
  }

  async function handleAiDetect() {
    if (!photoFile) return;
    setAiLoading(true); setAiError('');
    try {
      const base64 = await fileToBase64(photoFile);
      const detected = await identifyItemFromPhoto(base64, photoFile.type || 'image/jpeg');
      if (detected) setName(detected);
    } catch (err) { setAiError(err.message || 'AI detection failed'); }
    finally { setAiLoading(false); }
  }

  function handleGetLocation() {
    if (!navigator.geolocation) { setLocationError('Geolocation not supported by your browser.'); return; }
    setLocating(true); setLocationError('');
    navigator.geolocation.getCurrentPosition(
      pos => { setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocating(false); },
      () => { setLocationError('Could not get location. Please allow location access.'); setLocating(false); }
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Item name is required.'); return; }
    setSaving(true); setError('');
    try {
      let photoURL = '';
      if (photoFile) {
        const storageRef = ref(storage, `items/${user.uid}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(storageRef, photoFile);
        photoURL = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, 'items'), {
        userId: user.uid, name: name.trim(), photoURL,
        storeName: storeName.trim(), pricePaid: pricePaid ? Number(pricePaid) : null,
        room, isLendable, isForSale,
        askingPrice: isForSale && askingPrice ? Number(askingPrice) : null,
        directions: directions.trim(),
        location: location || null,
        createdAt: serverTimestamp(),
      });
      navigate('/my-stuff');
    } catch (err) { setError('Failed to save item. Please try again.'); console.error(err); }
    finally { setSaving(false); }
  }

  return (
    <div className="pb-20 min-h-dvh">
      {/* Header */}
      <div className="bg-white px-4 pt-14 pb-3.5 border-b border-border sticky top-0 z-10 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-surface-2 flex items-center justify-center cursor-pointer border-none text-lg">←</button>
        <h1 className="text-[1.1rem] font-bold">Add Item</h1>
        <div className="w-10" />
      </div>

      <div className="p-4">
        {error && <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg mb-4">{error}</div>}

        <form onSubmit={handleSave}>
          {/* Photo */}
          <div className="mb-3.5">
            <label className="block text-[0.75rem] font-semibold text-muted uppercase tracking-wider mb-1.5">Photo</label>
            <div onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/3] rounded-[14px] border-2 border-dashed border-border flex flex-col items-center justify-center cursor-pointer bg-surface-2 overflow-hidden relative mb-2 group">
              {photoPreview
                ? <><img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-3xl opacity-0 group-hover:opacity-100 transition-opacity">📷 Change</div></>
                : <div className="text-muted text-center"><span className="block text-4xl mb-1.5">📷</span><span className="text-sm">Tap to add a photo</span></div>
              }
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} />
            {photoFile && (
              <button type="button" onClick={handleAiDetect} disabled={aiLoading}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-primary-light text-primary font-semibold text-sm mt-1.5 disabled:opacity-50 border-none cursor-pointer">
                {aiLoading ? <><span className="spinner" style={{width:14,height:14,borderWidth:2}} /> Identifying…</> : '✨ AI Detect Item Name'}
              </button>
            )}
            {aiError && <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg mt-1.5">{aiError}</div>}
          </div>

          <Field label="Item Name *"><input type="text" placeholder="e.g. Black Leather Couch" value={name} onChange={e => setName(e.target.value)} required /></Field>
          <Field label="Store / Source"><input type="text" placeholder="e.g. IKEA, Amazon" value={storeName} onChange={e => setStoreName(e.target.value)} /></Field>
          <Field label="Price Paid ($)"><input type="number" min="0" step="0.01" placeholder="0.00" value={pricePaid} onChange={e => setPricePaid(e.target.value)} /></Field>
          <Field label="Room / Location">
            <select value={room} onChange={e => setRoom(e.target.value)}>
              <option value="">Select a room…</option>
              {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="How to Find It">
            <textarea placeholder="e.g. Living room, left side of couch under the cushion." value={directions} onChange={e => setDirections(e.target.value)} rows={3} />
          </Field>

          {/* Toggles */}
          <div className="bg-white rounded-[14px] shadow-sm px-4 mb-4">
            <ToggleRow label="🤝 Available to Lend" sub="Friends can request to borrow this" checked={isLendable} onChange={e => setIsLendable(e.target.checked)} />
            <ToggleRow label="💰 For Sale" sub="List in the marketplace" checked={isForSale} onChange={e => setIsForSale(e.target.checked)} last />
          </div>

          {isForSale && (
            <Field label="Asking Price ($)"><input type="number" min="0" step="0.01" placeholder="0.00" value={askingPrice} onChange={e => setAskingPrice(e.target.value)} /></Field>
          )}

          {/* Location pin — shown when lendable or for sale so buyers/borrowers can see distance */}
          {(isLendable || isForSale) && (
            <div className="mb-4">
              <label className="block text-[0.75rem] font-semibold text-muted uppercase tracking-wider mb-1.5">📍 Pickup / Borrow Location</label>
              {location ? (
                <div className="flex items-center gap-3 p-3 bg-teal-light rounded-lg">
                  <span className="text-teal text-xl">📍</span>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-teal">Location pinned!</div>
                    <div className="text-[0.75rem] text-teal/80">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</div>
                  </div>
                  <button type="button" onClick={() => setLocation(null)} className="text-xs text-teal underline border-none bg-transparent cursor-pointer">Remove</button>
                </div>
              ) : (
                <button type="button" onClick={handleGetLocation} disabled={locating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg border-[1.5px] border-dashed border-teal text-teal font-semibold text-sm disabled:opacity-50 bg-transparent cursor-pointer">
                  {locating ? <><span className="spinner" style={{width:14,height:14,borderWidth:2,borderColor:'currentColor'}} /> Getting location…</> : '📍 Pin My Location'}
                </button>
              )}
              {locationError && <div className="text-coral text-xs mt-1.5">{locationError}</div>}
              <p className="text-[0.72rem] text-muted mt-1.5">Helps buyers/borrowers see how far away they are. Only your general area is shown.</p>
            </div>
          )}

          <button type="submit" disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg bg-primary text-white font-semibold disabled:opacity-50">
            {saving ? <><span className="spinner" style={{width:16,height:16,borderWidth:2}} /> Saving…</> : '💾 Save Item'}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5 mb-3.5">
      <label className="text-[0.75rem] font-semibold text-muted uppercase tracking-wider">{label}</label>
      <div className="
        [&>input]:w-full [&>input]:px-3.5 [&>input]:py-3 [&>input]:border-[1.5px] [&>input]:border-border [&>input]:rounded-lg [&>input]:text-[0.95rem] [&>input]:text-ink [&>input]:bg-white [&>input]:outline-none [&>input:focus]:border-primary [&>input]:font-[inherit]
        [&>select]:w-full [&>select]:px-3.5 [&>select]:py-3 [&>select]:border-[1.5px] [&>select]:border-border [&>select]:rounded-lg [&>select]:text-[0.95rem] [&>select]:text-ink [&>select]:bg-white [&>select]:outline-none [&>select:focus]:border-primary [&>select]:font-[inherit]
        [&>textarea]:w-full [&>textarea]:px-3.5 [&>textarea]:py-3 [&>textarea]:border-[1.5px] [&>textarea]:border-border [&>textarea]:rounded-lg [&>textarea]:text-[0.95rem] [&>textarea]:text-ink [&>textarea]:bg-white [&>textarea]:outline-none [&>textarea:focus]:border-primary [&>textarea]:font-[inherit] [&>textarea]:resize-y [&>textarea]:min-h-[80px]">
        {children}
      </div>
    </div>
  );
}

function ToggleRow({ label, sub, checked, onChange, last }) {
  return (
    <div className={`flex items-center justify-between py-3.5 ${last ? '' : 'border-b border-border'}`}>
      <div>
        <div className="text-[0.9rem] font-medium">{label}</div>
        {sub && <div className="text-[0.78rem] text-muted">{sub}</div>}
      </div>
      <label className="toggle"><input type="checkbox" checked={checked} onChange={onChange} /><span className="toggle-track" /></label>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
