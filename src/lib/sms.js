import { store } from './store';
import {
  getWarmupTier, countSentToday, checkRecipientQuietHours,
  appendStopDisclosure, hasStopDisclosure, lintMessageBody, isOptOutReply,
} from './compliance';

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

// Runs every gate a single send has to pass. Returns { ok, reason?, code? }.
export function preflightCheck({ phone, body, now = new Date() }) {
  const s = store.settings;

  if (store.isOptedOut(phone)) {
    return { ok: false, code: 'opted-out', reason: `${phone} has opted out` };
  }

  // Daily cap (warmup tier)
  if (s.enforceDailyCap) {
    const tier = getWarmupTier(s.firstSendAt);
    const cap = s.dailyCapOverride ?? tier.cap;
    const sent = countSentToday(Array.from(store.messages.values()), now);
    if (sent >= cap) {
      return {
        ok: false, code: 'daily-cap',
        reason: `Daily cap hit (${sent}/${cap}, tier: ${tier.name}). Wait until midnight local, or raise the tier if warmup allows.`,
      };
    }
  }

  // Per-recipient quiet hours
  if (s.enforceQuietHours && s.respectQuietHours) {
    const q = checkRecipientQuietHours(phone, now);
    if (!q.allowed) {
      return { ok: false, code: 'quiet-hours', reason: `Quiet hours: ${q.reason}` };
    }
  }

  // Content linter — hard errors only (soft warnings surface in UI, not here)
  const issues = lintMessageBody(body);
  const hard = issues.find(i => i.severity === 'error');
  if (hard) {
    return { ok: false, code: `lint-${hard.code}`, reason: hard.message };
  }

  return { ok: true };
}

export async function sendSms({ to, body, contactId = null, skipPreflight = false }) {
  const phone = normalizePhone(to);
  const s = store.settings;

  // Preflight
  if (!skipPreflight) {
    const check = preflightCheck({ phone, body });
    if (!check.ok) {
      await store.logMessage({
        direction: 'out', to: phone, body,
        status: check.code === 'opted-out' ? 'blocked-optout' : 'blocked',
        error: check.reason, contactId,
      });
      throw new Error(check.reason);
    }
  }

  // Auto-append STOP disclosure on first message to this contact
  let finalBody = body;
  const contact = contactId ? store.contacts.get(contactId) : store.findContactByPhone(phone);
  const isFirstThreadMsg = !contact?.threadStarted;
  if (s.autoAppendStop && isFirstThreadMsg && !hasStopDisclosure(finalBody)) {
    finalBody = appendStopDisclosure(finalBody);
  }

  const { gatewayUrl, gatewayUser, gatewayPass } = s;
  let gatewayResult = null;
  let status = 'sent';
  let error = null;
  try {
    gatewayResult = await gatewaySend({ url: gatewayUrl, user: gatewayUser, pass: gatewayPass, to: phone, body: finalBody });
  } catch (e) {
    status = 'failed';
    error = e.message;
  }

  await store.logMessage({
    direction: 'out',
    to: phone,
    body: finalBody,
    originalBody: finalBody !== body ? body : undefined,
    status,
    error,
    gatewayId: gatewayResult?.id || null,
    contactId: contact?.id || contactId,
    stopAppended: finalBody !== body,
  });

  if (status === 'sent') {
    await store.markFirstSendIfNeeded();
    if (contact) await store.markThreadStarted(phone);
  }

  if (error) throw new Error(error);
  return gatewayResult;
}

export async function broadcastSms({ recipients, body, throttleMs = 1500, onProgress, signal }) {
  const sent = [];
  const failed = [];
  const skipped = [];
  for (let i = 0; i < recipients.length; i++) {
    if (signal?.aborted) break;
    const r = recipients[i];
    const personalized = body.replace(/\{\{\s*name\s*\}\}/g, r.name || 'there');

    // Per-message preflight — cheap enough (opt-out lookup + tier check + quiet hours)
    const check = preflightCheck({ phone: r.phone, body: personalized });
    if (!check.ok) {
      skipped.push({ ...r, reason: check.reason, code: check.code });
      // Log the skip so it shows up in History
      await store.logMessage({
        direction: 'out', to: r.phone, body: personalized,
        status: check.code === 'opted-out' ? 'blocked-optout' : 'blocked',
        error: check.reason, contactId: r.id,
      });
      onProgress?.({ index: i + 1, total: recipients.length, sent: sent.length, failed: failed.length, skipped: skipped.length });
      if (i < recipients.length - 1 && !signal?.aborted) {
        await new Promise(res => setTimeout(res, throttleMs));
      }
      continue;
    }

    try {
      await sendSms({ to: r.phone, body: personalized, contactId: r.id, skipPreflight: true });
      sent.push(r);
    } catch (e) {
      failed.push({ ...r, error: e.message });
    }
    onProgress?.({ index: i + 1, total: recipients.length, sent: sent.length, failed: failed.length, skipped: skipped.length });
    if (i < recipients.length - 1 && !signal?.aborted) {
      await new Promise(res => setTimeout(res, throttleMs));
    }
  }
  return { sent, failed, skipped };
}

// Record an inbound reply. If it matches an opt-out pattern (fuzzy or literal),
// auto-add the sender to the opt-out list. Callable from a webhook or manually.
export async function recordInboundReply({ from, body }) {
  const phone = normalizePhone(from);
  await store.logMessage({ direction: 'in', from: phone, body, status: 'received' });
  const extra = store.settings.optOutKeywords || [];
  if (isOptOutReply(body, extra)) {
    await store.setOptOut(phone, true);
    return { optedOut: true };
  }
  return { optedOut: false };
}

// Re-export the check functions so pages can preview compliance state.
export { preflightCheck as previewPreflight };

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
