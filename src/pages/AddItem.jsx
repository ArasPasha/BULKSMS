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

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function handlePhotoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setAiError('');
  }

  async function handleAiDetect() {
    if (!photoFile) return;
    setAiLoading(true);
    setAiError('');
    try {
      const base64 = await fileToBase64(photoFile);
      const detected = await identifyItemFromPhoto(base64, photoFile.type || 'image/jpeg');
      if (detected) setName(detected);
    } catch (err) {
      setAiError(err.message || 'AI detection failed');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) { setError('Item name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      let photoURL = '';
      if (photoFile) {
        const storageRef = ref(storage, `items/${user.uid}/${Date.now()}_${photoFile.name}`);
        await uploadBytes(storageRef, photoFile);
        photoURL = await getDownloadURL(storageRef);
      }

      await addDoc(collection(db, 'items'), {
        userId: user.uid,
        name: name.trim(),
        photoURL,
        storeName: storeName.trim(),
        pricePaid: pricePaid ? Number(pricePaid) : null,
        room,
        isLendable,
        isForSale,
        askingPrice: isForSale && askingPrice ? Number(askingPrice) : null,
        directions: directions.trim(),
        createdAt: serverTimestamp(),
      });

      navigate('/my-stuff');
    } catch (err) {
      setError('Failed to save item. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page" style={{ paddingBottom: '80px' }}>
      {/* Header */}
      <div className="page-header">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn-icon" onClick={() => navigate(-1)}>←</button>
          <h1>Add Item</h1>
          <div style={{ width: 40 }} />
        </div>
      </div>

      <div className="page-body">
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSave}>
          {/* Photo upload */}
          <div className="form-group">
            <label>Photo</label>
            <div className="photo-upload" onClick={() => fileRef.current?.click()}>
              {photoPreview ? (
                <>
                  <img src={photoPreview} alt="Preview" />
                  <div className="photo-upload-overlay">📷 Change</div>
                </>
              ) : (
                <div className="photo-upload-placeholder">
                  <span className="icon">📷</span>
                  <span>Tap to add a photo</span>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoChange}
            />

            {photoFile && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={handleAiDetect}
                disabled={aiLoading}
                style={{ width: '100%', marginTop: 6 }}
              >
                {aiLoading ? (
                  <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Identifying…</>
                ) : '✨ AI Detect Item Name'}
              </button>
            )}
            {aiError && <div className="alert alert-error" style={{ marginTop: 6 }}>{aiError}</div>}
          </div>

          {/* Item name */}
          <div className="form-group">
            <label>Item Name *</label>
            <input
              type="text"
              placeholder="e.g. Black Leather Couch"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </div>

          {/* Store */}
          <div className="form-group">
            <label>Store / Source</label>
            <input
              type="text"
              placeholder="e.g. IKEA, Amazon, Thrift Store"
              value={storeName}
              onChange={e => setStoreName(e.target.value)}
            />
          </div>

          {/* Price paid */}
          <div className="form-group">
            <label>Price Paid ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={pricePaid}
              onChange={e => setPricePaid(e.target.value)}
            />
          </div>

          {/* Room */}
          <div className="form-group">
            <label>Room / Location</label>
            <select value={room} onChange={e => setRoom(e.target.value)}>
              <option value="">Select a room…</option>
              {ROOMS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {/* Directions */}
          <div className="form-group">
            <label>How to Find It</label>
            <textarea
              placeholder="e.g. Living room, left side of couch under the cushion. Or: top shelf in garage, blue bin."
              value={directions}
              onChange={e => setDirections(e.target.value)}
              rows={3}
            />
          </div>

          {/* Toggles */}
          <div className="card" style={{ padding: '0 16px', marginBottom: 16 }}>
            <div className="toggle-row">
              <div>
                <div className="toggle-row-label">🤝 Available to Lend</div>
                <div className="toggle-row-sub">Friends can request to borrow this</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={isLendable} onChange={e => setIsLendable(e.target.checked)} />
                <span className="toggle-track" />
              </label>
            </div>

            <div className="toggle-row">
              <div>
                <div className="toggle-row-label">💰 For Sale</div>
                <div className="toggle-row-sub">List in the marketplace</div>
              </div>
              <label className="toggle">
                <input type="checkbox" checked={isForSale} onChange={e => setIsForSale(e.target.checked)} />
                <span className="toggle-track" />
              </label>
            </div>
          </div>

          {/* Asking price (conditional) */}
          {isForSale && (
            <div className="form-group">
              <label>Asking Price ($)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={askingPrice}
                onChange={e => setAskingPrice(e.target.value)}
              />
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={saving}>
            {saving ? <><span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Saving…</> : '💾 Save Item'}
          </button>
        </form>
      </div>
    </div>
  );
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Strip the data URL prefix (e.g. "data:image/jpeg;base64,")
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
