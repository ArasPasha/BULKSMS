import { store } from './store';

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

export async function sendSms({ to, body, contactId = null }) {
  const phone = normalizePhone(to);
  if (store.isOptedOut(phone)) {
    await store.logMessage({ direction: 'out', to: phone, body, status: 'blocked-optout', contactId });
    throw new Error(`${phone} has opted out`);
  }
  const { gatewayUrl, gatewayUser, gatewayPass } = store.settings;
  let gatewayResult = null;
  let status = 'sent';
  let error = null;
  try {
    gatewayResult = await gatewaySend({ url: gatewayUrl, user: gatewayUser, pass: gatewayPass, to: phone, body });
  } catch (e) {
    status = 'failed';
    error = e.message;
  }
  await store.logMessage({
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

export async function broadcastSms({ recipients, body, throttleMs = 1500, onProgress, signal }) {
  const sent = [];
  const failed = [];
  for (let i = 0; i < recipients.length; i++) {
    if (signal?.aborted) break;
    const r = recipients[i];
    try {
      const personalized = body.replace(/\{\{\s*name\s*\}\}/g, r.name || 'there');
      await sendSms({ to: r.phone, body: personalized, contactId: r.id });
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

// Convenience helpers used by pages — they wrap store mutations
export async function addContact({ name, phone, tags = [] }) {
  const e164 = normalizePhone(phone);
  if (!e164) throw new Error('Invalid phone number');
  return store.addContact({ name: name?.trim() || '', phone: e164, tags });
}

export async function updateContact(id, updates) {
  const patch = { ...updates };
  if (updates.phone !== undefined) patch.phone = normalizePhone(updates.phone);
  return store.updateContact(id, patch);
}

export async function deleteContact(id) {
  return store.deleteContact(id);
}

export async function bulkAddContacts(rows, opts = {}) {
  const normalized = rows.map(r => ({
    name: r.name?.trim() || '',
    phone: normalizePhone(r.phone),
    tags: r.tags || [],
  }));
  return store.bulkAddContacts(normalized, opts);
}

export async function setOptOut(phone, optedOut = true) {
  return store.setOptOut(normalizePhone(phone), optedOut);
}
