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

// Route every phone-gateway call through the Vite dev-server proxy so the
// browser doesn't get blocked by CORS. The middleware in vite.config.js reads
// X-Gateway-Target and forwards to the phone. In a production build without
// the Vite proxy, this will fail — that's intentional; the app is designed
// to run via `npm run dev`.
const PROXY_PREFIX = '/gateway-proxy';

function gatewayFetch({ url, user, pass, path, method = 'GET', body }) {
  const target = buildGatewayUrl(url);
  if (!target) throw new Error('Gateway URL is empty');
  const headers = {
    Authorization: 'Basic ' + btoa(`${user || ''}:${pass || ''}`),
    'X-Gateway-Target': target,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`${PROXY_PREFIX}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// The SMS Gateway for Android app changed endpoint paths across versions
// (v1: /message + /health; newer: /api/v1/message + /api/v1/health).
// We try modern first, then fall back to legacy.
const PING_PATHS = ['/health', '/api/v1/health'];
const SEND_PATHS = ['/message', '/api/v1/message'];

export async function gatewayPing({ url, user, pass }) {
  let lastErr = null;
  for (const path of PING_PATHS) {
    try {
      const res = await gatewayFetch({ url, user, pass, path });
      if (res.ok) return res.json().catch(() => ({ ok: true, path }));
      // 401/403 → server exists but auth failed
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Auth failed (${res.status}) — check username/password`);
      }
      // 404 → try next path
      lastErr = new Error(`${path} returned ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gateway not reachable');
}

export async function gatewaySend({ url, user, pass, to, body }) {
  const payload = {
    message: body,
    phoneNumbers: [normalizePhone(to)],
  };
  let lastErr = null;
  for (const path of SEND_PATHS) {
    try {
      const res = await gatewayFetch({ url, user, pass, path, method: 'POST', body: payload });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return data;
      if (res.status === 401 || res.status === 403) {
        throw new Error(`Auth failed (${res.status}) — check username/password`);
      }
      lastErr = new Error(data?.message || data?.error || `Gateway ${path} → ${res.status}`);
      // If it's not a 404, don't bother trying the next path — same server rejected us
      if (res.status !== 404) throw lastErr;
    } catch (e) {
      lastErr = e;
      // Only try next path if we hit a 404-style path miss; other errors propagate
      if (!/404|not\s+found/i.test(e.message)) throw e;
    }
  }
  throw lastErr || new Error('Gateway send failed');
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
    if (contact) {
      await store.markThreadStarted(phone);
      await store.markOutbound(phone);
    }
  }

  if (error) throw new Error(error);
  return gatewayResult;
}

// Jittered delay: baseMs +/- 30% variance so we don't look robotic
// (fixed intervals are almost as detectable as no interval)
function jitteredDelay(baseMs) {
  return Math.round(baseMs * (0.7 + Math.random() * 0.6));
}

// Every 15-25 sends we take a longer "human break" of 30-90 seconds.
// Real people don't machine-gun 100 texts in a row.
function shouldTakeBreak(indexInBatch, nextBreakAt) {
  return indexInBatch >= nextBreakAt;
}
function nextBreakInterval() {
  return 15 + Math.floor(Math.random() * 11); // 15 to 25 messages
}
function humanBreakMs() {
  return 30_000 + Math.floor(Math.random() * 60_000); // 30-90 seconds
}

export async function broadcastSms({ recipients, body, bodies, throttleMs = 1500, onProgress, signal }) {
  const sent = [];
  const failed = [];
  const skipped = [];
  // Variant rotation: if bodies array is passed, round-robin per recipient
  const variants = Array.isArray(bodies) && bodies.length > 0 ? bodies : [body];
  let sentSinceBreak = 0;
  let nextBreakAt = nextBreakInterval();

  for (let i = 0; i < recipients.length; i++) {
    if (signal?.aborted) break;
    const r = recipients[i];
    const chosenBody = variants[i % variants.length];
    const personalized = chosenBody.replace(/\{\{\s*name\s*\}\}/g, r.name || 'there');

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
        await new Promise(res => setTimeout(res, jitteredDelay(throttleMs)));
      }
      continue;
    }

    try {
      await sendSms({ to: r.phone, body: personalized, contactId: r.id, skipPreflight: true });
      sent.push(r);
      sentSinceBreak++;
    } catch (e) {
      failed.push({ ...r, error: e.message });
    }
    onProgress?.({ index: i + 1, total: recipients.length, sent: sent.length, failed: failed.length, skipped: skipped.length });
    if (i < recipients.length - 1 && !signal?.aborted) {
      // Human break every 15-25 sends — real people don't machine-gun 100 texts
      if (shouldTakeBreak(sentSinceBreak, nextBreakAt)) {
        const breakMs = humanBreakMs();
        onProgress?.({
          index: i + 1, total: recipients.length,
          sent: sent.length, failed: failed.length, skipped: skipped.length,
          breakMs, breakUntil: Date.now() + breakMs,
        });
        await new Promise(res => setTimeout(res, breakMs));
        sentSinceBreak = 0;
        nextBreakAt = nextBreakInterval();
      } else {
        await new Promise(res => setTimeout(res, jitteredDelay(throttleMs)));
      }
    }
  }
  return { sent, failed, skipped };
}

// Record an inbound reply. If it matches an opt-out pattern (fuzzy or literal),
// auto-add the sender to the opt-out list. Then run auto-reply engine.
// Callable from a webhook, the inbox poller, or the manual "log reply" button.
export async function recordInboundReply({ from, body, gatewayId = null, skipAutoReply = false }) {
  const phone = normalizePhone(from);
  await store.logMessage({ direction: 'in', from: phone, body, status: 'received', gatewayId });
  await store.markInbound(phone, body);

  const extra = store.settings.optOutKeywords || [];
  if (isOptOutReply(body, extra)) {
    await store.setOptOut(phone, true);
    const contact = store.findContactByPhone(phone);
    if (contact) await store.setContactStatus(contact.id, 'opted-out');
    return { optedOut: true, autoReplied: false };
  }

  if (!skipAutoReply && store.settings.autoReplyEnabled) {
    const replied = await runAutoReplyEngine({ from: phone, body });
    return { optedOut: false, autoReplied: replied.sent, replySource: replied.source };
  }
  return { optedOut: false, autoReplied: false };
}

// Poll the phone's /inbox endpoint on an interval, ingest new inbound messages,
// and trigger auto-reply. Returns a stop() function.
let _pollTimer = null;
let _pollBusy = false;
const _seenInboxIds = new Set();

export function startInboxPolling() {
  const s = store.settings;
  if (!s.pollingEnabled) return () => {};
  const interval = Math.max(5_000, s.pollingIntervalMs || 20_000);

  const tick = async () => {
    if (_pollBusy) return;
    if (!store.settings.gatewayUrl) return;
    _pollBusy = true;
    try {
      const res = await gatewayFetch({
        url: store.settings.gatewayUrl,
        user: store.settings.gatewayUser,
        pass: store.settings.gatewayPass,
        path: '/inbox',
      });
      if (!res.ok) return;
      const list = await res.json().catch(() => []);
      if (!Array.isArray(list)) return;
      for (const item of list) {
        // Shape (best-effort — the gateway app has slightly different fields
        // across versions): { id, phoneNumber, message, receivedAt }
        const id = item.id || item.messageId || `${item.phoneNumber}-${item.receivedAt || ''}`;
        if (_seenInboxIds.has(id)) continue;
        _seenInboxIds.add(id);
        const from = item.phoneNumber || item.from || '';
        const body = item.message || item.body || item.text || '';
        if (!from || !body) continue;
        // Skip if we've already logged this message with the same body from this phone in the last 5 minutes
        const dupe = Array.from(store.messages.values()).find(m =>
          m.direction === 'in' && m.from === normalizePhone(from) && m.body === body &&
          m.createdAt > Date.now() - 5 * 60 * 1000
        );
        if (dupe) continue;
        await recordInboundReply({ from, body, gatewayId: id });
      }
    } catch {
      // network hiccup — try again next tick
    } finally {
      _pollBusy = false;
    }
  };

  clearInterval(_pollTimer);
  _pollTimer = setInterval(tick, interval);
  // Kick off immediately too
  tick();
  return () => {
    clearInterval(_pollTimer);
    _pollTimer = null;
  };
}

// Auto-reply engine — tries rule matches first, then AI if enabled + configured.
// Respects the per-contact cooldown to avoid bot loops.
export async function runAutoReplyEngine({ from, body }) {
  const s = store.settings;
  const phone = normalizePhone(from);
  const contact = store.findContactByPhone(phone);

  // Cooldown: skip if we auto-replied recently
  if (contact?.lastAutoReplyAt && Date.now() - contact.lastAutoReplyAt < (s.autoReplyCooldownMs || 3600_000)) {
    return { sent: false, source: 'cooldown' };
  }

  // Small "typing" delay so auto-replies don't look like they fired in 50ms
  // (real people take 5-20 seconds to read + reply). Skipped if disabled.
  const humanDelayMs = 5_000 + Math.floor(Math.random() * 16_000);

  // 1) Rule-based match
  for (const rule of store.autoReplyList()) {
    if (!rule.active || !rule.pattern || !rule.templateId) continue;
    let re;
    try { re = new RegExp(rule.pattern, 'i'); } catch { continue; }
    if (!re.test(body)) continue;
    const template = store.templates.get(rule.templateId);
    if (!template) continue;
    const replyBody = personalizeBody(template.body, contact);
    try {
      await new Promise(res => setTimeout(res, humanDelayMs));
      await sendSms({ to: phone, body: replyBody, contactId: contact?.id, skipPreflight: false });
      await store.recordAutoReplyAt(phone);
      await store.incrementTemplateUse(template.id);
      return { sent: true, source: 'rule', ruleId: rule.id };
    } catch (e) {
      // preflight blocked (e.g. quiet hours) — abort silently, don't fall through to AI
      return { sent: false, source: 'rule-blocked', reason: e.message };
    }
  }

  // 2) Generic fallback — a single canned template sent when no rule matched.
  // Runs BEFORE AI so the user always has a safe, deterministic default.
  if (s.genericAutoReplyEnabled && s.genericAutoReplyTemplateId) {
    const template = store.templates.get(s.genericAutoReplyTemplateId);
    if (template) {
      const replyBody = personalizeBody(template.body, contact);
      try {
        await new Promise(res => setTimeout(res, humanDelayMs));
        await sendSms({ to: phone, body: replyBody, contactId: contact?.id, skipPreflight: false });
        await store.recordAutoReplyAt(phone);
        await store.incrementTemplateUse(template.id);
        return { sent: true, source: 'generic-fallback' };
      } catch (e) {
        return { sent: false, source: 'generic-fallback-blocked', reason: e.message };
      }
    }
  }

  // 3) AI fallback
  if (s.aiReplyEnabled && (import.meta.env.VITE_ANTHROPIC_API_KEY || s.aiApiKey)) {
    try {
      const draft = await aiReplyDraft({ inbound: body, contact });
      if (draft) {
        await new Promise(res => setTimeout(res, humanDelayMs));
        await sendSms({ to: phone, body: draft, contactId: contact?.id, skipPreflight: false });
        await store.recordAutoReplyAt(phone);
        return { sent: true, source: 'ai', body: draft };
      }
    } catch (e) {
      console.warn('AI reply failed:', e.message);
    }
  }

  return { sent: false, source: 'no-match' };
}

function personalizeBody(body, contact) {
  const first = (contact?.name || '').split(/\s+/)[0] || 'there';
  const sender = store.settings.aiReplySenderName || '';
  return body
    .replace(/\{\{\s*name\s*\}\}/gi, first)
    .replace(/\[?Sender\]?/g, sender || '[Sender]');
}

// AI reply generator using Anthropic API directly from the browser.
// Requires the user to opt in (aiReplyEnabled) and provide an API key
// (either via .env.local as VITE_ANTHROPIC_API_KEY or saved in settings).
export async function aiReplyDraft({ inbound, contact }) {
  const s = store.settings;
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || s.aiApiKey;
  if (!apiKey) throw new Error('No Anthropic API key');

  const model = s.aiReplyModel || 'claude-haiku-4-5-20251001';
  const senderName = s.aiReplySenderName || '[Sender]';
  const company = s.aiReplyCompanyName || 'The Broker Shop';

  const systemPrompt = s.aiReplySystemPrompt?.trim() || buildDefaultBrokerSystemPrompt({ senderName, company });

  const contactContext = contact
    ? `Contact: ${contact.name || 'unknown'} (${contact.phone}). Status: ${contact.status || 'new'}. Notes: ${contact.notes || 'none'}.`
    : `Unknown contact ${contact?.phone || ''}.`;

  const userMsg = `${contactContext}\n\nInbound text from them:\n"${inbound}"\n\nDraft your one-message reply (SMS — 160 char budget):`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMsg }],
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text?.trim();
  if (!text) throw new Error('Empty AI response');
  return text.replace(/^["']|["']$/g, '').slice(0, 500); // hard cap for safety
}

function buildDefaultBrokerSystemPrompt({ senderName, company }) {
  return `You are ${senderName}, a real human broker at ${company}, replying to inbound SMS from small business owners. Speak like a person, not a chatbot.

About the business (facts you can share):
- Approval based on monthly deposits, NOT credit score
- $5K to $2M available, funded in 24–72 hours
- Zero credit impact to pre-qualify
- All 50 US states
- Application: thebrokershopinc.com/apply (takes 2 minutes)
- UNIQUE: the merchant picks their own rate and offer (most brokers dictate terms)

Rules:
1. Reply in ONE message, ideally under 160 characters. Casual, direct, contractions. No greetings like "hope this finds you well."
2. NEVER quote a specific rate or APR. If asked, redirect: "That's the point — you pick it. Depends which offer you like."
3. NEVER guarantee approval. Say "approvals" or "options" not "guaranteed."
4. NEVER claim to be AI or a bot. If asked directly whether you're a person, say: "Yeah, ${senderName} — happy to hop on a call if easier."
5. When they show interest, always point to the 2-min pre-qual: thebrokershopinc.com/apply. Zero credit hit.
6. For complex/legal/rate-specific questions, hand off: "Let me have ${senderName} call you — what's the best time today?"
7. NEVER discuss compliance, TCPA, licensing, or anything legal.
8. Never use words carriers filter: "loan", "cash advance", "guaranteed", "free money", "MCA".
9. If they seem angry or say "not interested" or anything like STOP, do not send anything (the system handles opt-outs before you see them).
10. End every message either with a next step ("Reply Y for the link") or the URL, unless it's a soft/closing "have a good one" type reply.

Output ONLY the SMS reply text. No explanations, no quotes, no formatting. Just the message you'd send.`;
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
