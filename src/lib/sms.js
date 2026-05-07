import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, deleteDoc, updateDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '../firebase';

export function normalizePhone(input) {
  if (!input) return '';
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (input.trim().startsWith('+')) return `+${digits}`;
  return `+${digits}`;
}

export function formatPhone(e164) {
  if (!e164) return '';
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  if (m) return `(${m[1]}) ${m[2]}-${m[3]}`;
  return e164;
}

export function isQuietHours(date = new Date()) {
  const h = date.getHours();
  return h < 8 || h >= 21;
}

export function countSegments(body) {
  if (!body) return { chars: 0, segments: 0, encoding: 'GSM' };
  const gsm7 = /^[A-Za-z0-9 \r\n@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;
  const isGSM = gsm7.test(body);
  const len = body.length;
  if (isGSM) {
    if (len <= 160) return { chars: len, segments: 1, encoding: 'GSM' };
    return { chars: len, segments: Math.ceil(len / 153), encoding: 'GSM' };
  }
  if (len <= 70) return { chars: len, segments: 1, encoding: 'UCS-2' };
  return { chars: len, segments: Math.ceil(len / 67), encoding: 'UCS-2' };
}

export async function addContact(uid, { name, phone, tags = [] }) {
  const e164 = normalizePhone(phone);
  if (!e164) throw new Error('Invalid phone number');
  return addDoc(collection(db, 'users', uid, 'contacts'), {
    name: name?.trim() || '',
    phone: e164,
    tags,
    optedOut: false,
    createdAt: serverTimestamp(),
  });
}

export async function updateContact(uid, contactId, updates) {
  const data = { ...updates };
  if (updates.phone !== undefined) data.phone = normalizePhone(updates.phone);
  return updateDoc(doc(db, 'users', uid, 'contacts', contactId), data);
}

export async function deleteContact(uid, contactId) {
  return deleteDoc(doc(db, 'users', uid, 'contacts', contactId));
}

const FIRESTORE_BATCH_LIMIT = 400;

export async function bulkAddContacts(uid, rows, opts = {}) {
  const { onProgress, dedupeExisting = true } = opts;
  const cleaned = [];
  const seenInFile = new Set();
  let invalid = 0;
  let dupesInFile = 0;

  for (const row of rows) {
    const e164 = normalizePhone(row.phone);
    if (!e164 || !/^\+\d{10,15}$/.test(e164)) { invalid++; continue; }
    if (seenInFile.has(e164)) { dupesInFile++; continue; }
    seenInFile.add(e164);
    cleaned.push({
      name: row.name?.trim() || '',
      phone: e164,
      tags: Array.isArray(row.tags) ? row.tags : [],
    });
  }

  let existing = new Set();
  if (dedupeExisting && cleaned.length > 0) {
    onProgress?.({ stage: 'checking', done: 0, total: cleaned.length });
    const snap = await getDocs(collection(db, 'users', uid, 'contacts'));
    snap.forEach(d => {
      const p = d.data().phone;
      if (p) existing.add(p);
    });
  }

  const toWrite = cleaned.filter(r => !existing.has(r.phone));
  const dupesInDb = cleaned.length - toWrite.length;

  let added = 0;
  for (let i = 0; i < toWrite.length; i += FIRESTORE_BATCH_LIMIT) {
    const chunk = toWrite.slice(i, i + FIRESTORE_BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const row of chunk) {
      const ref = doc(collection(db, 'users', uid, 'contacts'));
      batch.set(ref, {
        name: row.name,
        phone: row.phone,
        tags: row.tags,
        optedOut: false,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    added += chunk.length;
    onProgress?.({ stage: 'writing', done: added, total: toWrite.length });
  }

  return {
    added,
    skipped: invalid + dupesInFile + dupesInDb,
    invalid,
    dupesInFile,
    dupesInDb,
    total: rows.length,
  };
}

export function watchContacts(uid, cb, max = 500) {
  const q = query(
    collection(db, 'users', uid, 'contacts'),
    orderBy('createdAt', 'desc'),
    limit(max)
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function getContactsCount(uid) {
  const snap = await getCountFromServer(collection(db, 'users', uid, 'contacts'));
  return snap.data().count;
}

export async function getContactsByTag(uid, tag) {
  const q = query(
    collection(db, 'users', uid, 'contacts'),
    where('tags', 'array-contains', tag),
    where('optedOut', '==', false)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getAllEligibleContacts(uid) {
  const q = query(
    collection(db, 'users', uid, 'contacts'),
    where('optedOut', '==', false)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export function watchMessages(uid, cb, max = 200) {
  const q = query(
    collection(db, 'users', uid, 'messages'),
    orderBy('createdAt', 'desc'),
    limit(max)
  );
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export async function logMessage(uid, data) {
  return addDoc(collection(db, 'users', uid, 'messages'), {
    ...data,
    createdAt: serverTimestamp(),
  });
}

export async function isOptedOut(uid, phone) {
  const e164 = normalizePhone(phone);
  const ref = doc(db, 'users', uid, 'optouts', e164.replace('+', ''));
  const snap = await getDoc(ref);
  return snap.exists();
}

export async function setOptOut(uid, phone, optedOut = true) {
  const e164 = normalizePhone(phone);
  const ref = doc(db, 'users', uid, 'optouts', e164.replace('+', ''));
  if (optedOut) {
    await setDoc(ref, { phone: e164, optedOutAt: serverTimestamp() });
  } else {
    await deleteDoc(ref);
  }
  const cq = query(collection(db, 'users', uid, 'contacts'), where('phone', '==', e164));
  const snap = await getDocs(cq);
  const batch = writeBatch(db);
  snap.docs.forEach(d => batch.update(d.ref, { optedOut }));
  await batch.commit();
}

export function watchOptOuts(uid, cb) {
  const q = query(collection(db, 'users', uid, 'optouts'), orderBy('optedOutAt', 'desc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}

export function buildGatewayUrl(rawUrl) {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url.replace(/\/+$/, '');
}

export async function gatewayPing({ url, user, pass }) {
  const base = buildGatewayUrl(url);
  if (!base) throw new Error('Gateway URL is empty');
  const res = await fetch(`${base}/health`, {
    method: 'GET',
    headers: { Authorization: 'Basic ' + btoa(`${user}:${pass}`) },
  });
  if (!res.ok) throw new Error(`Gateway responded ${res.status}`);
  return res.json().catch(() => ({ ok: true }));
}

export async function gatewaySend({ url, user, pass, to, body }) {
  const base = buildGatewayUrl(url);
  if (!base) throw new Error('Gateway URL not configured');
  const res = await fetch(`${base}/message`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + btoa(`${user}:${pass}`),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: body,
      phoneNumbers: [normalizePhone(to)],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || data?.error || `Gateway error ${res.status}`);
  }
  return data;
}

export async function sendSms({ uid, gateway, to, body, contactId = null }) {
  const phone = normalizePhone(to);
  if (await isOptedOut(uid, phone)) {
    await logMessage(uid, {
      direction: 'out', to: phone, body,
      status: 'blocked-optout', contactId,
    });
    throw new Error(`${phone} has opted out`);
  }
  let gatewayResult = null;
  let status = 'sent';
  let error = null;
  try {
    gatewayResult = await gatewaySend({ ...gateway, to: phone, body });
  } catch (e) {
    status = 'failed';
    error = e.message;
  }
  await logMessage(uid, {
    direction: 'out',
    to: phone,
    body,
    status,
    error,
    gatewayId: gatewayResult?.id || null,
    contactId,
  });
  if (error) throw new Error(error);
  return gatewayResult;
}

export async function broadcastSms({ uid, gateway, recipients, body, throttleMs = 1500, onProgress, signal }) {
  const sent = [];
  const failed = [];
  for (let i = 0; i < recipients.length; i++) {
    if (signal?.aborted) break;
    const r = recipients[i];
    try {
      const personalized = body.replace(/\{\{\s*name\s*\}\}/g, r.name || 'there');
      await sendSms({ uid, gateway, to: r.phone, body: personalized, contactId: r.id });
      sent.push(r);
    } catch (e) {
      failed.push({ ...r, error: e.message });
    }
    onProgress?.({ index: i + 1, total: recipients.length, sent: sent.length, failed: failed.length });
    if (i < recipients.length - 1 && !signal?.aborted) {
      await new Promise(res => setTimeout(res, throttleMs));
    }
  }
  return { sent, failed };
}
