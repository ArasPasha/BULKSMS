import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  watchContacts, sendSms, broadcastSms, normalizePhone, formatPhone,
  countSegments, isQuietHours, getContactsCount, getContactsByTag,
  getAllEligibleContacts,
} from '../lib/sms';

const PAGE_SIZE = 500;

export default function Compose() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState([]);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(null);
  const [mode, setMode] = useState('single');
  const [phone, setPhone] = useState('');
  // selected: Map<id, contact> so we can keep full data for contacts not in the loaded page
  const [selected, setSelected] = useState(new Map());
  const [tagFilter, setTagFilter] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    return watchContacts(user.uid, setContacts, pageLimit);
  }, [user, pageLimit]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getContactsCount(user.uid).then(c => { if (active) setTotalCount(c); }).catch(() => {});
    return () => { active = false; };
  }, [user]);

  const eligible = useMemo(() => contacts.filter(c => !c.optedOut), [contacts]);

  const tags = useMemo(() => {
    const set = new Set();
    eligible.forEach(c => c.tags?.forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [eligible]);

  const filtered = useMemo(() => {
    if (!tagFilter) return eligible;
    return eligible.filter(c => c.tags?.includes(tagFilter));
  }, [eligible, tagFilter]);

  const seg = countSegments(body);
  const gatewayConfigured = !!(profile?.gatewayUrl && profile?.gatewayUser && profile?.gatewayPass);
  const quiet = profile?.respectQuietHours && isQuietHours();
  const throttleMs = profile?.sendThrottleMs || 1500;

  const recipientCount = mode === 'single' ? (phone.trim() ? 1 : 0) : selected.size;
  const recipients = useMemo(() => {
    if (mode === 'single') {
      const e164 = normalizePhone(phone);
      return e164 ? [{ id: null, name: '', phone: e164 }] : [];
    }
    return Array.from(selected.values());
  }, [mode, phone, selected]);

  const etaMs = recipientCount * throttleMs;
  const etaText = formatDuration(etaMs);

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

  function selectAllLoaded() {
    setSelected(prev => {
      const next = new Map(prev);
      filtered.forEach(c => next.set(c.id, c));
      return next;
    });
  }

  function clearAll() { setSelected(new Map()); }

  async function selectByTag() {
    if (!tagFilter || !user) return;
    setBulkLoading(true);
    try {
      const all = await getContactsByTag(user.uid, tagFilter);
      setSelected(prev => {
        const next = new Map(prev);
        all.forEach(c => next.set(c.id, c));
        return next;
      });
    } catch (e) {
      setError(e.message);
    } finally { setBulkLoading(false); }
  }

  async function selectAllEligible() {
    if (!user) return;
    if (totalCount && totalCount > 1000) {
      const ok = confirm(
        `Select all ${totalCount.toLocaleString()} contacts?\n\n` +
        `Sending to this many from one personal number will almost certainly get your number suspended. ` +
        `Strongly consider sending to a tag-filtered subset instead.`
      );
      if (!ok) return;
    }
    setBulkLoading(true);
    try {
      const all = await getAllEligibleContacts(user.uid);
      const m = new Map();
      all.forEach(c => m.set(c.id, c));
      setSelected(m);
    } catch (e) {
      setError(e.message);
    } finally { setBulkLoading(false); }
  }

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
    if (quiet && !confirm('Quiet hours (9pm–8am). Send anyway?')) return;

    if (recipientCount > 1000) {
      const ok = confirm(
        `🚨 You're about to send to ${recipientCount.toLocaleString()} numbers.\n\n` +
        `Estimated time: ${etaText}\n` +
        `Throttle: ${throttleMs}ms between sends\n\n` +
        `Carriers WILL flag your number as spam at this volume. Your phone number will likely be suspended ` +
        `for SMS by the carrier within minutes.\n\n` +
        `For broadcasts this large, use a registered A2P provider (Twilio + 10DLC), not a personal phone.\n\n` +
        `Type-to-confirm not implemented — proceed at your own risk.\n\nReally send?`
      );
      if (!ok) return;
      const ok2 = confirm(`Last chance. Send to ${recipientCount.toLocaleString()} numbers?`);
      if (!ok2) return;
    } else if (recipientCount > 200) {
      const ok = confirm(
        `⚠️ Sending to ${recipientCount.toLocaleString()} numbers (~${etaText}).\n\n` +
        `Carriers may flag your number for sending this volume. Consider splitting into smaller groups ` +
        `over multiple days.\n\nContinue?`
      );
      if (!ok) return;
    } else if (recipientCount > 1) {
      const ok = confirm(`Send to ${recipientCount} contacts? (~${etaText})`);
      if (!ok) return;
    }

    setSending(true);
    setProgress({ index: 0, total: recipients.length, sent: 0, failed: 0 });
    const gateway = {
      url: profile.gatewayUrl, user: profile.gatewayUser, pass: profile.gatewayPass,
    };
    try {
      if (recipients.length === 1) {
        await sendSms({ uid: user.uid, gateway, to: recipients[0].phone, body, contactId: recipients[0].id });
        setResult({ sent: 1, failed: 0 });
      } else {
        const r = await broadcastSms({
          uid: user.uid, gateway, recipients, body,
          throttleMs,
          onProgress: setProgress,
        });
        setResult({ sent: r.sent.length, failed: r.failed.length, failedList: r.failed });
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
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Failed</span>
            <span className="text-2xl font-extrabold text-coral">{result.failed}</span>
          </div>
        </div>
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
            className="flex-1 py-3 rounded-lg bg-white border border-border font-semibold text-sm">
            Send another
          </button>
          <button onClick={() => navigate('/history')}
            className="flex-1 py-3 rounded-lg bg-primary text-white font-semibold text-sm">
            View history
          </button>
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
            className={`flex-1 py-2 rounded ${mode === 'single' ? 'bg-primary text-white' : 'text-muted'}`}>
            Single
          </button>
          <button onClick={() => setMode('broadcast')}
            className={`flex-1 py-2 rounded ${mode === 'broadcast' ? 'bg-primary text-white' : 'text-muted'}`}>
            Broadcast
          </button>
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
                  <button type="button" onClick={selectByTag} disabled={bulkLoading}
                    className="text-primary font-semibold disabled:opacity-50">
                    {bulkLoading ? '…' : `All in "${tagFilter}"`}
                  </button>
                ) : (
                  <button type="button" onClick={selectAllLoaded} className="text-primary font-semibold">
                    Loaded ({filtered.length.toLocaleString()})
                  </button>
                )}
                <button type="button" onClick={selectAllEligible} disabled={bulkLoading}
                  className="text-amber font-semibold disabled:opacity-50">
                  {bulkLoading ? '…' : `All (${totalCount?.toLocaleString() || '…'})`}
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
                        <input
                          type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c)}
                          className="w-4 h-4 accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-ink truncate">{c.name || formatPhone(c.phone)}</div>
                          <div className="text-xs text-muted">{formatPhone(c.phone)}</div>
                        </div>
                      </label>
                    </li>
                  ))}
                </ul>
                {totalCount !== null && contacts.length < totalCount && (
                  <button type="button" onClick={() => setPageLimit(p => p + PAGE_SIZE)}
                    className="w-full mt-2 py-2 rounded-lg bg-white border border-border text-primary font-semibold text-xs">
                    Load {Math.min(PAGE_SIZE, totalCount - contacts.length).toLocaleString()} more contacts
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
            className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary resize-none"
          />
          {mode === 'broadcast' && (
            <p className="text-[0.7rem] text-muted mt-1.5">
              Use <code className="bg-surface-2 px-1 rounded">{'{{name}}'}</code> to personalize.
            </p>
          )}
        </div>

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
              <span className="text-teal font-semibold">{progress.sent} sent · {progress.failed} failed</span>
            </div>
            <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all"
                style={{ width: `${(progress.index / progress.total) * 100}%` }} />
            </div>
          </div>
        )}

        <button type="submit" disabled={sending || recipientCount === 0 || !body.trim()}
          className="w-full py-3.5 rounded-lg bg-primary text-white font-semibold text-[0.95rem] disabled:opacity-50 active:scale-[.98]">
          {sending
            ? `Sending… ${progress?.index || 0}/${progress?.total || 0}`
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
    critical: `${count.toLocaleString()} contacts (~${eta}) from a personal number will almost certainly get your number suspended for SMS. Use a registered A2P provider (Twilio + 10DLC) for this scale.`,
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
