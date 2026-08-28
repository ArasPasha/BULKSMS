import { AREA_CODE_STATE, STATE_TIMEZONE, STRICT_STATES } from './area-codes';

// ============================================================
// Warmup tiers — protects the number from A2P suspension.
// Sourced from: DailyStory, Kixie, IDT Express deliverability guides.
// ============================================================

export const WARMUP_TIERS = [
  { days: 0,  cap: 50,   name: 'Warmup 1', description: 'Days 1–3 · brand-new sending' },
  { days: 3,  cap: 100,  name: 'Warmup 2', description: 'Days 4–7 · building reputation' },
  { days: 7,  cap: 250,  name: 'Ramp',     description: 'Week 2 · content filtering starts here' },
  { days: 14, cap: 500,  name: 'Standard', description: 'Weeks 3–4 · warning zone' },
  { days: 30, cap: 1000, name: 'Established', description: 'Month 2+ · hard ceiling' },
];

export function getWarmupTier(firstSendAt) {
  if (!firstSendAt) return { ...WARMUP_TIERS[0], daysUsed: 0, nextTier: WARMUP_TIERS[1] };
  const daysUsed = Math.max(0, Math.floor((Date.now() - firstSendAt) / 86_400_000));
  let current = WARMUP_TIERS[0];
  let next = null;
  for (let i = 0; i < WARMUP_TIERS.length; i++) {
    if (daysUsed >= WARMUP_TIERS[i].days) {
      current = WARMUP_TIERS[i];
      next = WARMUP_TIERS[i + 1] || null;
    }
  }
  const daysUntilNextTier = next ? Math.max(0, next.days - daysUsed) : null;
  return { ...current, daysUsed, nextTier: next, daysUntilNextTier };
}

// ============================================================
// Recipient state / timezone / quiet hours
// ============================================================

export function getRecipientState(e164) {
  if (!e164) return null;
  const m = e164.match(/^\+1(\d{3})/);
  if (!m) return null;
  return AREA_CODE_STATE[m[1]] || null;
}

export function getRecipientTimezone(e164) {
  const state = getRecipientState(e164);
  return state ? STATE_TIMEZONE[state] : null;
}

// Returns hours in the recipient's local time, or null if unknown.
function getRecipientLocalHour(e164, now = new Date()) {
  const tz = getRecipientTimezone(e164);
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour: 'numeric', hour12: false,
    }).formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value, 10);
    return Number.isNaN(hour) ? null : hour;
  } catch { return null; }
}

// Returns { allowed, reason, state, tz, hour, effectiveStart, effectiveEnd }
// userStartHour / userEndHour let you enforce STRICTER hours than the law
// requires (e.g. 10am-7pm instead of the legal 8am-9pm). The stricter of
// the two always wins.
export function checkRecipientQuietHours(e164, now = new Date(), {
  respectQuietHours = true,
  userStartHour = null,
  userEndHour = null,
} = {}) {
  if (!respectQuietHours) return { allowed: true };
  const state = getRecipientState(e164);
  const tz = getRecipientTimezone(e164);
  const hour = getRecipientLocalHour(e164, now);
  const isStrict = state && STRICT_STATES.has(state);

  // Legal minimums (federal + strict-state overlay)
  const legalStart = 8;
  const legalEnd = isStrict ? 20 : 21; // 8pm strict, 9pm federal

  // Combine: user-configured hours + legal — take the stricter of each
  const effectiveStart = Math.max(legalStart, Number.isFinite(userStartHour) ? userStartHour : legalStart);
  const effectiveEnd = Math.min(legalEnd, Number.isFinite(userEndHour) ? userEndHour : legalEnd);

  // Unknown state — apply federal window using sender's own local time (conservative fallback).
  if (hour === null) {
    const localHour = now.getHours();
    const allowed = localHour >= effectiveStart && localHour < effectiveEnd;
    return {
      allowed, state: null, tz: null, hour: localHour, effectiveStart, effectiveEnd,
      reason: allowed ? null : `Outside ${effectiveStart}am–${effectiveEnd > 12 ? effectiveEnd - 12 : effectiveEnd}${effectiveEnd >= 12 ? 'pm' : 'am'} sender local time (recipient timezone unknown)`,
    };
  }

  const allowed = hour >= effectiveStart && hour < effectiveEnd;
  const beforeStart = hour < effectiveStart;
  return {
    allowed, state, tz, hour, effectiveStart, effectiveEnd,
    reason: allowed ? null : `${state}: ${
      beforeStart
        ? `before ${effectiveStart}am`
        : `after ${effectiveEnd > 12 ? effectiveEnd - 12 : effectiveEnd}${effectiveEnd >= 12 ? 'pm' : 'am'}`
    } local (${isStrict ? 'strict state' : 'federal'} cutoff ${legalEnd > 12 ? legalEnd - 12 : legalEnd}${legalEnd >= 12 ? 'pm' : 'am'})`,
  };
}

// ============================================================
// STOP / opt-out handling — fuzzy match to comply with April 2025 FCC rule.
// ============================================================

const OPT_OUT_KEYWORDS = new Set([
  'STOP','UNSUBSCRIBE','CANCEL','END','QUIT','REMOVE','OPTOUT','OPT-OUT','OPT OUT',
  'STOPALL','UNSUB',
]);

const FUZZY_OPT_OUT_PHRASES = [
  /\bstop\s+text(?:ing)?\b/i,
  /\bstop\s+messag(?:ing|es?)\b/i,
  /\bdon'?t\s+(?:text|message|contact|call)\s+me\b/i,
  /\bdo\s+not\s+(?:text|message|contact|call)\s+me\b/i,
  /\bremove\s+me\b/i,
  /\btake\s+me\s+off\b/i,
  /\bunsubscribe\s+me\b/i,
  /\bplease\s+stop\b/i,
  /\bno\s+more\s+text(?:s|ing)?\b/i,
  /\bnot?\s+interested\s+stop\b/i,
  /\bopt\s+me\s+out\b/i,
];

export function isOptOutReply(text, extraKeywords = []) {
  if (!text) return false;
  const normalized = text.trim();
  const upperFirstWord = normalized.split(/\s+/)[0]?.toUpperCase();
  if (OPT_OUT_KEYWORDS.has(upperFirstWord)) return true;
  for (const kw of extraKeywords) {
    if (upperFirstWord === kw.toUpperCase()) return true;
  }
  return FUZZY_OPT_OUT_PHRASES.some(re => re.test(normalized));
}

// ============================================================
// STOP disclosure — mandatory on first message in a new thread.
// ============================================================

const STOP_DISCLOSURE = ' Reply "Stop" to opt out';

export function hasStopDisclosure(body) {
  if (!body) return false;
  // Accept: reply STOP, reply "STOP", reply 'STOP', reply "Stop" to opt out, etc.
  return /reply\s+["']?stop["']?/i.test(body)
      || /\bstop\s+to\s+(?:opt\s*out|unsubscribe|end|cancel)\b/i.test(body)
      || /["']?stop["']?\s+to\s+(?:opt\s*out|unsubscribe|end|cancel)/i.test(body);
}

export function appendStopDisclosure(body) {
  if (!body) return body;
  if (hasStopDisclosure(body)) return body;
  return body.trimEnd() + STOP_DISCLOSURE;
}

// ============================================================
// Message body linter — surfaces filter triggers before sending.
// severity: 'error' blocks send, 'warn' shows but allows.
// ============================================================

const URL_SHORTENER_HOSTS = [
  'bit.ly','tinyurl.com','t.co','goo.gl','ow.ly','is.gd','buff.ly','bit.do',
  'cutt.ly','rebrand.ly','shorturl.at','tiny.cc','rb.gy','soo.gd','clck.ru',
  't.ly','v.gd','x.gd','y2u.be','shrtco.de','tny.im',
];

const SHAFT_PATTERNS = [
  { re: /\b(?:free\s+money|guaranteed\s+cash|cash\s+advance|payday\s+loan)\b/i, name: 'high-risk financial phrase' },
  { re: /\b(?:viagra|cialis|xanax|adderall|oxycodone)\b/i, name: 'restricted pharma keyword' },
  { re: /\b(?:cbd|weed|cannabis|marijuana)\s+(?:sale|deal|offer)\b/i, name: 'cannabis promotion' },
  { re: /\b(?:casino|betting|gambl(?:e|ing))\b/i, name: 'gambling keyword' },
  { re: /\b(?:crypto|bitcoin|nft)\s+(?:investment|opportunity|gain|profit)\b/i, name: 'crypto pitch' },
  { re: /\bguaranteed\s+(?:approval|acceptance|win|return)\b/i, name: 'guarantee claim' },
];

// Business phrases a broker might legitimately use — warn, don't block.
const SOFT_TRIGGER_PATTERNS = [
  { re: /\bloan\b/i, name: '"loan" (soft trigger — prefer "funding")' },
  { re: /\bcash\b/i, name: '"cash" (soft trigger — often filtered)' },
  { re: /\bguaranteed?\b/i, name: '"guaranteed" (soft trigger — never claim a guarantee)' },
  { re: /\bfree\b/i, name: '"free" (soft trigger)' },
];

export function lintMessageBody(body, { requireStopDisclosure = false } = {}) {
  const issues = [];
  if (!body || !body.trim()) {
    issues.push({ severity: 'error', code: 'empty', message: 'Message body is empty.' });
    return issues;
  }
  const b = body;

  // URL shorteners — hard error, they will get filtered.
  for (const host of URL_SHORTENER_HOSTS) {
    const re = new RegExp(`(?:^|\\b|https?://)${host.replace(/\./g, '\\.')}(?:/|\\b)`, 'i');
    if (re.test(b)) {
      issues.push({
        severity: 'error', code: 'url-shortener',
        message: `Contains ${host} — public URL shorteners are the #1 carrier filter trigger. Use a full URL to your own domain instead.`,
      });
    }
  }

  // SHAFT / restricted content — hard error.
  for (const { re, name } of SHAFT_PATTERNS) {
    if (re.test(b)) {
      issues.push({
        severity: 'error', code: 'shaft',
        message: `Contains ${name}. Carriers auto-filter this kind of content on personal lines.`,
      });
    }
  }

  // Soft triggers — warning only.
  for (const { re, name } of SOFT_TRIGGER_PATTERNS) {
    if (re.test(b)) {
      issues.push({ severity: 'warn', code: 'soft-trigger', message: `Contains ${name}.` });
    }
  }

  // All-caps ratio (excluding brand names).
  const letters = b.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 20) {
    const upperLetters = b.replace(/[^A-Z]/g, '').length;
    const upperRatio = upperLetters / letters.length;
    if (upperRatio > 0.5) {
      issues.push({
        severity: 'error', code: 'all-caps',
        message: `${Math.round(upperRatio * 100)}% uppercase — carriers flag messages that shout.`,
      });
    } else if (upperRatio > 0.3) {
      issues.push({
        severity: 'warn', code: 'high-caps',
        message: `${Math.round(upperRatio * 100)}% uppercase — consider lowercasing.`,
      });
    }
  }

  // Bare 10-digit or +1 phone number embedded in body (callback-scam pattern).
  // Ignore if it's inside a labeled context ("call 555-...").
  const barePhoneRe = /(?<![a-zA-Z@:])(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/;
  if (barePhoneRe.test(b) && !/(?:call|text|reach|ring|dial|contact)\s+(?:me|us|at|back)?\s*:?\s*(?:\+1|\()?/i.test(b)) {
    issues.push({
      severity: 'warn', code: 'bare-phone',
      message: 'Message contains a phone number with no calling verb — carriers score this as callback-scam pattern.',
    });
  }

  // Excessive punctuation (spam pattern).
  if (/[!?]{3,}/.test(b)) {
    issues.push({
      severity: 'warn', code: 'punctuation',
      message: 'Multiple !!! or ??? — carriers score these as promotional.',
    });
  }

  // Missing STOP disclosure on first message.
  if (requireStopDisclosure && !hasStopDisclosure(b)) {
    issues.push({
      severity: 'warn', code: 'no-stop',
      message: 'First message to a new contact should include "Reply STOP to opt out." (auto-appended on send if you leave it off).',
    });
  }

  return issues;
}

// ============================================================
// Consent tracking — TCPA requires documentation.
// ============================================================

export const CONSENT_SOURCES = [
  { value: 'form',              label: 'Web form / opt-in page',   risk: 'low' },
  { value: 'verbal',            label: 'Verbal consent (logged)',   risk: 'low' },
  { value: 'business-card',     label: 'Business card / event',     risk: 'low' },
  { value: 'existing-customer', label: 'Existing customer',         risk: 'low' },
  { value: 'inbound-reply',     label: 'They texted me first',      risk: 'low' },
  { value: 'referral',          label: 'Referred by existing customer', risk: 'medium' },
  { value: 'cold-prospect',     label: 'Cold prospect (public list)',   risk: 'high' },
  { value: 'unknown',           label: 'Unknown / legacy',          risk: 'high' },
];

export function getConsentRisk(source) {
  return CONSENT_SOURCES.find(s => s.value === source)?.risk || 'high';
}

// ============================================================
// Daily send counting
// ============================================================

export function countSentToday(messages, now = new Date()) {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  return messages.filter(m =>
    m.direction === 'out' && m.status === 'sent' && (m.createdAt || 0) >= startMs
  ).length;
}
