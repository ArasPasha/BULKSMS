import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useContacts, useMessages, useSettings } from '../lib/hooks';
import {
  sendSms, broadcastSms, normalizePhone, formatPhone,
  countSegments, isQuietHours,
} from '../lib/sms';
import {
  getWarmupTier, countSentToday, checkRecipientQuietHours,
  lintMessageBody, hasStopDisclosure, getConsentRisk,
} from '../lib/compliance';

const PAGE_SIZE = 500;

export default function Compose() {
  const navigate = useNavigate();
  const allContacts = useContacts();
  const allMessages = useMessages();
  const settings = useSettings();
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [mode, setMode] = useState('single');
  const [phone, setPhone] = useState('');
  const [selected, setSelected] = useState(new Map());
  const [tagFilter, setTagFilter] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const sortedAll = useMemo(
    () => [...allContacts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [allContacts]
  );
  const eligible = useMemo(() => sortedAll.filter(c => !c.optedOut), [sortedAll]);
  const totalEligible = eligible.length;
  const visible = eligible.slice(0, pageLimit);

  const tags = useMemo(() => {
    const set = new Set();
    eligible.forEach(c => c.tags?.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [eligible]);

  const filtered = useMemo(() => {
    if (!tagFilter) return visible;
    return visible.filter(c => c.tags?.includes(tagFilter));
  }, [visible, tagFilter]);

  const seg = countSegments(body);
  const gatewayConfigured = !!(settings.gatewayUrl && settings.gatewayUser && settings.gatewayPass);
  const quiet = settings.respectQuietHours && isQuietHours();
  const throttleMs = settings.sendThrottleMs || 1500;

  // Compliance state
  const tier = getWarmupTier(settings.firstSendAt);
  const dailyCap = settings.dailyCapOverride ?? tier.cap;
  const sentToday = countSentToday(allMessages);
  const remaining = Math.max(0, dailyCap - sentToday);
  const lintIssues = useMemo(() => lintMessageBody(body, { requireStopDisclosure: true }), [body]);
  const lintErrors = lintIssues.filter(i => i.severity === 'error');
  const lintWarns = lintIssues.filter(i => i.severity === 'warn');

  const recipientCount = mode === 'single' ? (phone.trim() ? 1 : 0) : selected.size;
  const recipients = useMemo(() => {
    if (mode === 'single') {
      const e164 = normalizePhone(phone);
      return e164 ? [{ id: null, name: '', phone: e164 }] : [];
    }
    return Array.from(selected.values());
  }, [mode, phone, selected]);

  // Per-recipient quiet-hours + consent risk breakdown
  const complianceScan = useMemo(() => {
    const now = new Date();
    const quietViolations = [];
    const consentRisks = { low: 0, medium: 0, high: 0 };
    for (const r of recipients) {
      if (settings.enforceQuietHours && settings.respectQuietHours) {
        const q = checkRecipientQuietHours(r.phone, now);
        if (!q.allowed) quietViolations.push({ ...r, reason: q.reason });
      }
      const risk = getConsentRisk(r.consentSource);
      consentRisks[risk] = (consentRisks[risk] || 0) + 1;
    }
    return { quietViolations, consentRisks };
  }, [recipients, settings.enforceQuietHours, settings.respectQuietHours]);
  const wouldExceedCap = settings.enforceDailyCap && recipientCount > remaining;

  const etaText = formatDuration(recipientCount * throttleMs);
  const dangerTier =
    recipientCount > 1000 ? 'critical' :
    recipientCount > 200 ? 'high' :
    recipientCount > 50 ? 'medium' : 'low';

  function toggle(c) {
    setSelected(prev => {
      const next = new Map(prev);
      next.has(c.id) ? next.delete(c.id) : next.set(c.id, c);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected(prev => {
      const next = new Map(prev);
      filtered.forEach(c => next.set(c.id, c));
      return next;
    });
  }

  function selectByTag() {
    if (!tagFilter) return;
    const matching = eligible.filter(c => c.tags?.includes(tagFilter));
    setSelected(prev => {
      const next = new Map(prev);
      matching.forEach(c => next.set(c.id, c));
      return next;
    });
  }

  function selectAllEligible() {
    if (totalEligible > 1000) {
      const ok = confirm(
        `Select all ${totalEligible.toLocaleString()} contacts?\n\n` +
        `Sending to this many from one personal number will almost certainly get your number suspended.`
      );
      if (!ok) return;
    }
    const m = new Map();
    eligible.forEach(c => m.set(c.id, c));
    setSelected(m);
  }

  function clearAll() { setSelected(new Map()); }

  async function handleSend(e) {
    e.preventDefault();
    setError('');
    setResult(null);
    if (!gatewayConfigured) {
      setError('Configure your phone gateway in Settings first.');
      return;
    }
    if (recipients.length === 0) {
      setError('Pick at least one recipient.');
      return;
    }
    if (!body.trim()) {
      setError('Message body is empty.');
      return;
    }

    // Content linter — hard errors block send
    if (lintErrors.length > 0) {
      setError(`Message blocked by linter: ${lintErrors[0].message}`);
      return;
    }

    // Daily cap
    if (wouldExceedCap) {
      const ok = confirm(
        `This batch (${recipientCount}) would exceed today's cap (${sentToday}/${dailyCap} sent, ${remaining} left).\n\n` +
        `Continue and send only the first ${remaining}? The rest will be blocked in-flight.`
      );
      if (!ok) return;
    }

    // Per-recipient quiet hours
    if (complianceScan.quietViolations.length > 0) {
      const sample = complianceScan.quietViolations.slice(0, 5).map(v => `  • ${formatPhone(v.phone)} — ${v.reason}`).join('\n');
      const more = complianceScan.quietViolations.length > 5 ? `\n  … and ${complianceScan.quietViolations.length - 5} more` : '';
      const ok = confirm(
        `⏰ ${complianceScan.quietViolations.length} recipient(s) are outside legal send hours in their state:\n\n${sample}${more}\n\n` +
        `Send anyway? (FL & OK have $500–1500/msg private-right-of-action fines for texts outside 8am–8pm local.)\n\n` +
        `OK = block those messages and send the rest\nCancel = don't send at all`
      );
      if (!ok) return;
    }

    // Legacy quiet-hours (sender's local time only — kept for backward compat)
    if (quiet && !complianceScan.quietViolations.length &&
        !confirm('Quiet hours in your local time (9pm–8am). Send anyway?')) return;

    if (recipientCount > 1000) {
      const ok = confirm(
        `🚨 You're about to send to ${recipientCount.toLocaleString()} numbers.\n\n` +
        `Estimated time: ${etaText}\n\n` +
        `Carriers WILL flag your number as spam at this volume. Your phone number will likely be suspended ` +
        `within minutes — long before the loop finishes.\n\n` +
        `For broadcasts this large, use a registered A2P provider (Twilio + 10DLC).\n\nReally send?`
      );
      if (!ok) return;
      const ok2 = confirm(`Last chance. Send to ${recipientCount.toLocaleString()} numbers?`);
      if (!ok2) return;
    } else if (recipientCount > 200) {
      const ok = confirm(
        `⚠️ Sending to ${recipientCount.toLocaleString()} numbers (~${etaText}). Carriers may flag your number for this volume. Continue?`
      );
      if (!ok) return;
    } else if (recipientCount > 1) {
      const ok = confirm(`Send to ${recipientCount} contacts? (~${etaText})`);
      if (!ok) return;
    }

    setSending(true);
    setProgress({ index: 0, total: recipients.length, sent: 0, failed: 0 });
    try {
      if (recipients.length === 1) {
        await sendSms({ to: recipients[0].phone, body, contactId: recipients[0].id });
        setResult({ sent: 1, failed: 0, skipped: 0 });
      } else {
        const r = await broadcastSms({
          recipients, body, throttleMs, onProgress: setProgress,
        });
        setResult({
          sent: r.sent.length,
          failed: r.failed.length,
          skipped: r.skipped?.length || 0,
          failedList: r.failed,
          skippedList: r.skipped || [],
        });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  if (result && !sending) {
    return (
      <div className="min-h-dvh bg-bg pb-nav px-5 pt-6">
        <h1 className="text-2xl font-extrabold text-ink mb-4">Done</h1>
        <div className="bg-white rounded-[14px] border border-border p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-muted text-sm">Sent</span>
            <span className="text-2xl font-extrabold text-teal">{result.sent}</span>
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-muted text-sm">Failed</span>
            <span className="text-2xl font-extrabold text-coral">{result.failed}</span>
          </div>
          {result.skipped > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted text-sm">Blocked by compliance</span>
              <span className="text-2xl font-extrabold text-amber">{result.skipped}</span>
            </div>
          )}
        </div>
        {result.skippedList?.length > 0 && (
          <div className="bg-white rounded-[14px] border border-border p-4 mb-4">
            <h3 className="font-semibold text-ink text-sm mb-2">Compliance blocks</h3>
            <ul className="space-y-1.5 text-xs max-h-60 overflow-y-auto">
              {result.skippedList.map(f => (
                <li key={f.phone + f.code} className="flex items-start justify-between gap-2">
                  <span>{f.name || formatPhone(f.phone)}</span>
                  <span className="text-amber text-right">{f.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.failedList?.length > 0 && (
          <div className="bg-white rounded-[14px] border border-border p-4 mb-4">
            <h3 className="font-semibold text-ink text-sm mb-2">Failed sends</h3>
            <ul className="space-y-1.5 text-xs max-h-60 overflow-y-auto">
              {result.failedList.map(f => (
                <li key={f.phone} className="flex items-start justify-between gap-2">
                  <span>{f.name || formatPhone(f.phone)}</span>
                  <span className="text-coral">{f.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={() => { setResult(null); setBody(''); setSelected(new Map()); setPhone(''); }}
            className="flex-1 py-3 rounded-lg bg-white border border-border font-semibold text-sm">Send another</button>
          <button onClick={() => navigate('/history')}
            className="flex-1 py-3 rounded-lg bg-primary text-white font-semibold text-sm">View history</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-extrabold text-ink mb-3">Compose</h1>
        <div className="flex bg-white rounded-lg border border-border p-1 text-sm font-semibold">
          <button onClick={() => setMode('single')}
            className={`flex-1 py-2 rounded ${mode === 'single' ? 'bg-primary text-white' : 'text-muted'}`}>Single</button>
          <button onClick={() => setMode('broadcast')}
            className={`flex-1 py-2 rounded ${mode === 'broadcast' ? 'bg-primary text-white' : 'text-muted'}`}>Broadcast</button>
        </div>
      </header>

      <form onSubmit={handleSend} className="px-5 space-y-4">
        {mode === 'single' ? (
          <div>
            <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">To</label>
            <input
              type="tel" inputMode="tel" placeholder="(555) 123-4567"
              value={phone} onChange={e => setPhone(e.target.value)}
              className="w-full mt-1.5 px-3.5 py-3 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary"
            />
            <p className="text-[0.7rem] text-muted mt-1.5">Enter any US format — we'll normalize to E.164.</p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">
                Recipients ({selected.size.toLocaleString()})
              </label>
              <div className="flex gap-2 text-xs">
                {tagFilter ? (
                  <button type="button" onClick={selectByTag} className="text-primary font-semibold">
                    All in "{tagFilter}"
                  </button>
                ) : (
                  <button type="button" onClick={selectAllVisible} className="text-primary font-semibold">
                    Visible ({filtered.length.toLocaleString()})
                  </button>
                )}
                <button type="button" onClick={selectAllEligible} className="text-amber font-semibold">
                  All ({totalEligible.toLocaleString()})
                </button>
                <button type="button" onClick={clearAll} className="text-muted font-semibold">None</button>
              </div>
            </div>
            {tags.length > 0 && (
              <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
                <button type="button" onClick={() => setTagFilter('')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                    tagFilter === '' ? 'bg-primary text-white' : 'bg-white border border-border text-muted'
                  }`}>All</button>
                {tags.map(t => (
                  <button type="button" key={t} onClick={() => setTagFilter(t)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${
                      tagFilter === t ? 'bg-primary text-white' : 'bg-white border border-border text-muted'
                    }`}>{t}</button>
                ))}
              </div>
            )}
            {eligible.length === 0 ? (
              <div className="text-center py-6 text-muted text-sm bg-white rounded-[14px] border border-border">
                No contacts. <Link to="/contacts" className="text-primary font-semibold">Add some first.</Link>
              </div>
            ) : (
              <>
                <ul className="bg-white rounded-[14px] border border-border max-h-[260px] overflow-y-auto divide-y divide-border">
                  {filtered.map(c => (
                    <li key={c.id}>
                      <label className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer">
                        <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c)}
                          className="w-4 h-4 accent-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-ink truncate">{c.name || formatPhone(c.phone)}</div>
                          <div className="text-xs text-muted">{formatPhone(c.phone)}</div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
                {visible.length < totalEligible && (
                  <button type="button" onClick={() => setPageLimit(p => p + PAGE_SIZE)}
                    className="w-full mt-2 py-2 rounded-lg bg-white border border-border text-primary font-semibold text-xs">
                    Load {Math.min(PAGE_SIZE, totalEligible - visible.length).toLocaleString()} more
                  </button>
                )}
              </>
            )}
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Message</label>
            <span className="text-[0.65rem] text-muted">
              {seg.chars} chars · {seg.segments} segment{seg.segments !== 1 ? 's' : ''} · {seg.encoding}
            </span>
          </div>
          <textarea
            value={body} onChange={e => setBody(e.target.value)} rows={5}
            placeholder={mode === 'broadcast' ? 'Hi {{name}}, …' : 'Type your message…'}
            className={`w-full px-3.5 py-3 border-[1.5px] rounded-lg text-sm bg-white outline-none focus:border-primary resize-none ${
              lintErrors.length ? 'border-coral' : lintWarns.length ? 'border-amber' : 'border-border'
            }`}
          />
          {mode === 'broadcast' && (
            <p className="text-[0.7rem] text-muted mt-1.5">
              Use <code className="bg-surface-2 px-1 rounded">{'{{name}}'}</code> to personalize.
            </p>
          )}

          {lintIssues.length > 0 && (
            <ul className="mt-2 space-y-1">
              {lintIssues.map((i, idx) => (
                <li key={idx} className={`text-xs px-3 py-2 rounded-lg ${
                  i.severity === 'error' ? 'bg-coral-light text-coral' : 'bg-amber-light text-ink'
                }`}>
                  {i.severity === 'error' ? '✗' : '⚠'} {i.message}
                </li>
              ))}
            </ul>
          )}
          {settings.autoAppendStop && !hasStopDisclosure(body) && body.trim() && lintErrors.length === 0 && (
            <p className="text-[0.7rem] text-muted mt-1.5">
              ℹ First message to a new contact will auto-append <em>"Reply STOP to opt out."</em>
            </p>
          )}
        </div>

        {/* Daily budget bar */}
        <div className="bg-white rounded-[14px] border border-border p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">
              Today's cap · {tier.name}
            </span>
            <span className={`text-xs font-bold ${wouldExceedCap ? 'text-coral' : 'text-ink'}`}>
              {sentToday.toLocaleString()} + {recipientCount.toLocaleString()} / {dailyCap.toLocaleString()}
            </span>
          </div>
          <div className="w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${wouldExceedCap ? 'bg-coral' : 'bg-primary'}`}
              style={{ width: `${Math.min(100, ((sentToday + recipientCount) / dailyCap) * 100)}%` }} />
          </div>
          {wouldExceedCap && (
            <p className="text-[0.7rem] text-coral mt-1">
              ⚠ This batch would exceed today's cap by {(recipientCount - remaining).toLocaleString()}. Only {remaining.toLocaleString()} will send.
            </p>
          )}
        </div>

        {/* Per-recipient quiet-hours warning */}
        {mode === 'broadcast' && complianceScan.quietViolations.length > 0 && (
          <div className="p-3 rounded-[14px] bg-amber-light border border-amber/30 text-xs">
            <div className="font-semibold text-ink mb-1">
              ⏰ {complianceScan.quietViolations.length.toLocaleString()} recipient(s) in quiet hours right now
            </div>
            <p className="text-muted">
              Their state's window is currently closed. Sending now to FL / OK recipients out-of-window carries $500–1,500/msg private-right-of-action risk.
            </p>
          </div>
        )}

        {/* Consent risk summary */}
        {mode === 'broadcast' && recipientCount > 0 && (complianceScan.consentRisks.high || complianceScan.consentRisks.medium) > 0 && (
          <div className="p-3 rounded-[14px] bg-coral-light border border-coral/30 text-xs">
            <div className="font-semibold text-ink mb-1">📝 Consent audit</div>
            <div className="text-muted space-y-0.5">
              {complianceScan.consentRisks.low > 0 && <div>✓ {complianceScan.consentRisks.low.toLocaleString()} low-risk (documented consent)</div>}
              {complianceScan.consentRisks.medium > 0 && <div>◐ {complianceScan.consentRisks.medium.toLocaleString()} medium-risk (referral)</div>}
              {complianceScan.consentRisks.high > 0 && <div className="text-coral font-semibold">✗ {complianceScan.consentRisks.high.toLocaleString()} high-risk (cold prospect / unknown consent) — TCPA exposure</div>}
            </div>
          </div>
        )}

        {recipientCount > 50 && !sending && (
          <DangerBanner tier={dangerTier} count={recipientCount} eta={etaText} />
        )}

        {error && (
          <div className="bg-coral-light text-coral text-sm px-4 py-2.5 rounded-lg">{error}</div>
        )}

        {sending && progress && (
          <div className="bg-white rounded-[14px] border border-border p-4">
            <div className="flex justify-between text-xs text-muted mb-2">
              <span>Sending… {progress.index}/{progress.total}</span>
              <span className="text-teal font-semibold">
                {progress.sent} sent · {progress.failed} failed{progress.skipped > 0 ? ` · ${progress.skipped} blocked` : ''}
              </span>
            </div>
            <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all"
                style={{ width: `${(progress.index / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        <button type="submit"
          disabled={sending || recipientCount === 0 || !body.trim() || lintErrors.length > 0}
          className="w-full py-3.5 rounded-lg bg-primary text-white font-semibold text-[0.95rem] disabled:opacity-50 active:scale-[.98]">
          {sending
            ? `Sending… ${progress?.index || 0}/${progress?.total || 0}`
            : lintErrors.length > 0
              ? 'Fix message errors first'
              : `Send${recipientCount > 1 ? ` to ${recipientCount.toLocaleString()}` : ''}`}
        </button>

        {!gatewayConfigured && (
          <p className="text-xs text-coral text-center">
            ⚠️ Gateway not configured. <Link to="/settings" className="font-semibold">Set it up.</Link>
          </p>
        )}
      </form>
    </div>
  );
}

function DangerBanner({ tier, count, eta }) {
  const styles = {
    medium: 'bg-amber-light border-amber/30 text-ink',
    high: 'bg-coral-light border-coral/40 text-ink',
    critical: 'bg-coral-light border-coral text-ink',
  };
  const titles = {
    medium: '⏱ Heads up',
    high: '⚠️ Carrier-flag risk',
    critical: '🚨 Number-suspension risk',
  };
  const messages = {
    medium: `Sending to ${count.toLocaleString()} contacts will take about ${eta}.`,
    high: `Sending to ${count.toLocaleString()} contacts (~${eta}) from a personal number can trigger carrier spam filtering. Consider splitting over multiple days.`,
    critical: `${count.toLocaleString()} contacts (~${eta}) from a personal number will almost certainly get your number suspended for SMS. Use a registered A2P provider for this scale.`,
  };
  return (
    <div className={`p-3 rounded-[14px] border ${styles[tier]}`}>
      <div className="font-semibold text-sm mb-0.5">{titles[tier]}</div>
      <p className="text-xs">{messages[tier]}</p>
    </div>
  );
}

function formatDuration(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm ? `${h}h ${rm}m` : `${h}h`;
}
