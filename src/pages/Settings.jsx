import { useEffect, useRef, useState } from 'react';
import { useContacts, useMessages, useOptOuts, useSettings } from '../lib/hooks';
import { store } from '../lib/store';
import { gatewayPing, setOptOut, formatPhone, timeToMinutes, minutesToTime } from '../lib/sms';

export default function Settings() {
  const settings = useSettings();
  const optOuts = useOptOuts();
  const contacts = useContacts();
  const messages = useMessages();
  const [form, setForm] = useState({
    gatewayUrl: '', gatewayUser: '', gatewayPass: '',
    senderName: '',
    optOutKeywords: '', sendThrottleMs: 1500, respectQuietHours: true,
    autoAppendStop: true, enforceQuietHours: true, enforceDailyCap: true,
    dailyCapOverride: '',
    sendStartHour: 8, sendEndHour: 21,
    senderWindowEnabled: true,
    senderStartTime: '11:05',
    senderEndTime: '18:50',
    pollingEnabled: true, pollingIntervalMs: 20000,
    autoReplyEnabled: true, autoReplyCooldownMs: 3600000,
    aiReplyEnabled: false, aiReplySenderName: '', aiReplyCompanyName: 'The Broker Shop',
    aiApiKey: '',
  });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const importFileRef = useRef(null);

  useEffect(() => {
    setForm({
      gatewayUrl: settings.gatewayUrl || '',
      gatewayUser: settings.gatewayUser || '',
      gatewayPass: settings.gatewayPass || '',
      senderName: settings.senderName || settings.aiReplySenderName || '',
      optOutKeywords: (settings.optOutKeywords || []).join(', '),
      sendThrottleMs: settings.sendThrottleMs ?? 1500,
      respectQuietHours: settings.respectQuietHours ?? true,
      autoAppendStop: settings.autoAppendStop ?? true,
      enforceQuietHours: settings.enforceQuietHours ?? true,
      enforceDailyCap: settings.enforceDailyCap ?? true,
      dailyCapOverride: settings.dailyCapOverride ?? '',
      sendStartHour: settings.sendStartHour ?? 8,
      sendEndHour: settings.sendEndHour ?? 21,
      senderWindowEnabled: settings.senderWindowEnabled ?? true,
      senderStartTime: minutesToTime(settings.senderStartMinute ?? (11 * 60 + 5)),
      senderEndTime: minutesToTime(settings.senderEndMinute ?? (18 * 60 + 50)),
      pollingEnabled: settings.pollingEnabled ?? true,
      pollingIntervalMs: settings.pollingIntervalMs ?? 20000,
      autoReplyEnabled: settings.autoReplyEnabled ?? true,
      autoReplyCooldownMs: settings.autoReplyCooldownMs ?? 3600000,
      aiReplyEnabled: settings.aiReplyEnabled ?? false,
      aiReplySenderName: settings.aiReplySenderName ?? '',
      aiReplyCompanyName: settings.aiReplyCompanyName ?? 'The Broker Shop',
      aiApiKey: settings.aiApiKey ?? '',
    });
  }, [settings]);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await store.updateSettings({
        gatewayUrl: form.gatewayUrl.trim(),
        gatewayUser: form.gatewayUser.trim(),
        gatewayPass: form.gatewayPass,
        senderName: form.senderName.trim(),
        aiReplySenderName: form.senderName.trim() || form.aiReplySenderName?.trim() || '',
        optOutKeywords: form.optOutKeywords.split(',').map(k => k.trim().toUpperCase()).filter(Boolean),
        sendThrottleMs: Math.max(500, parseInt(form.sendThrottleMs, 10) || 1500),
        respectQuietHours: !!form.respectQuietHours,
        autoAppendStop: !!form.autoAppendStop,
        enforceQuietHours: !!form.enforceQuietHours,
        enforceDailyCap: !!form.enforceDailyCap,
        dailyCapOverride: form.dailyCapOverride === '' ? null : Math.max(1, parseInt(form.dailyCapOverride, 10) || 0) || null,
        sendStartHour: Math.max(8, Math.min(20, parseInt(form.sendStartHour, 10) || 8)),
        sendEndHour: Math.max(9, Math.min(21, parseInt(form.sendEndHour, 10) || 21)),
        senderWindowEnabled: !!form.senderWindowEnabled,
        senderStartMinute: timeToMinutes(form.senderStartTime),
        senderEndMinute: timeToMinutes(form.senderEndTime),
        pollingEnabled: !!form.pollingEnabled,
        pollingIntervalMs: Math.max(5000, parseInt(form.pollingIntervalMs, 10) || 20000),
        autoReplyEnabled: !!form.autoReplyEnabled,
        autoReplyCooldownMs: Math.max(60000, parseInt(form.autoReplyCooldownMs, 10) || 3600000),
        aiReplyEnabled: !!form.aiReplyEnabled,
        aiReplyCompanyName: form.aiReplyCompanyName.trim(),
        aiApiKey: form.aiApiKey.trim(),
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2500);
    } finally { setSaving(false); }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await gatewayPing({
        url: form.gatewayUrl, user: form.gatewayUser, pass: form.gatewayPass,
      });
      setTestResult({ ok: true, message: 'Gateway reachable.', data });
    } catch (e) {
      setTestResult({ ok: false, message: e.message });
    } finally { setTesting(false); }
  }

  async function unblockOptOut(phone) {
    if (!confirm(`Remove opt-out for ${formatPhone(phone)}?`)) return;
    await setOptOut(phone, false);
  }

  function handleExport() {
    const data = store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sms-sender-backup-${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e) {
    setImportError('');
    setImportResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const mode = confirm(
        `Import from ${file.name}?\n\n` +
        `OK = Merge (keep your current data, add what's not already there)\n` +
        `Cancel = pick "Replace" next (wipes current data first)`
      )
        ? 'merge'
        : (confirm('Replace ALL current data with the backup? This wipes everything first.') ? 'replace' : null);
      if (!mode) {
        if (importFileRef.current) importFileRef.current.value = '';
        return;
      }
      const counts = await store.importAll(data, { mode });
      setImportResult({ ...counts, mode });
    } catch (err) {
      setImportError(err.message);
    }
    if (importFileRef.current) importFileRef.current.value = '';
  }

  async function clearAllData() {
    const ok = confirm(
      'This will delete ALL contacts, messages, opt-outs, and settings from this browser.\n\n' +
      'Are you absolutely sure?'
    );
    if (!ok) return;
    const ok2 = confirm('Last chance. Permanently wipe everything?');
    if (!ok2) return;
    await indexedDB.deleteDatabase('sms-sender');
    location.reload();
  }

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-extrabold text-ink">Settings</h1>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        <Section
          title="Phone gateway"
          subtitle="Install SMS Gateway for Android (capcom6/android-sms-gateway). In the app, switch to Local Server mode and copy the URL + credentials shown.">
          <Field label="Gateway URL">
            <input value={form.gatewayUrl} onChange={e => update('gatewayUrl', e.target.value)}
              placeholder="http://192.168.1.42:8080" inputMode="url" autoCapitalize="none" />
          </Field>
          <Field label="Username">
            <input value={form.gatewayUser} onChange={e => update('gatewayUser', e.target.value)}
              placeholder="sms" autoCapitalize="none" />
          </Field>
          <Field label="Password">
            <input type="password" value={form.gatewayPass} onChange={e => update('gatewayPass', e.target.value)} />
          </Field>
          <button type="button" onClick={handleTest} disabled={testing || !form.gatewayUrl}
            className="w-full mt-1 py-2.5 rounded-lg bg-white border border-border text-ink font-semibold text-sm disabled:opacity-50">
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          {testResult && (
            <div className={`mt-2 text-sm px-3 py-2 rounded-lg ${
              testResult.ok ? 'bg-teal-light text-teal' : 'bg-coral-light text-coral'
            }`}>
              {testResult.ok ? '✓' : '✗'} {testResult.message}
            </div>
          )}
        </Section>

        <Section title="Your info"
          subtitle="Used to fill in [Sender] and {{sender}} placeholders in template bodies.">
          <Field label="Your first name (or how you sign)">
            <input value={form.senderName}
              onChange={e => update('senderName', e.target.value)}
              placeholder="e.g. Tim" />
          </Field>
        </Section>

        <Section title="Compliance guardrails"
          subtitle="Automated protections against carrier suspension + TCPA fines. Turn these off only if you know exactly what you're doing.">
          <Toggle label="Enforce daily send cap (warmup tier)"
            value={form.enforceDailyCap}
            onChange={v => update('enforceDailyCap', v)} />
          <Toggle label="Enforce per-recipient quiet hours (state-aware)"
            value={form.enforceQuietHours}
            onChange={v => update('enforceQuietHours', v)} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Earliest send hour (recipient local, 24hr)">
              <input type="number" min={8} max={20} step={1}
                value={form.sendStartHour}
                onChange={e => update('sendStartHour', e.target.value)} />
            </Field>
            <Field label="Latest send hour (recipient local, 24hr)">
              <input type="number" min={9} max={21} step={1}
                value={form.sendEndHour}
                onChange={e => update('sendEndHour', e.target.value)} />
            </Field>
          </div>
          <div className="flex gap-2 -mt-1">
            <button type="button"
              onClick={() => { update('sendStartHour', 8); update('sendEndHour', 21); }}
              className="flex-1 py-2 px-2 rounded bg-white border border-border text-xs font-semibold text-ink">
              📋 Legal min (8–21)
            </button>
            <button type="button"
              onClick={() => { update('sendStartHour', 10); update('sendEndHour', 18); }}
              className="flex-1 py-2 px-2 rounded bg-white border border-border text-xs font-semibold text-ink">
              👔 Business (10–18)
            </button>
            <button type="button"
              onClick={() => { update('sendStartHour', 13); update('sendEndHour', 18); }}
              className="flex-1 py-2 px-2 rounded bg-white border border-border text-xs font-semibold text-ink">
              🎯 Peak (13–18)
            </button>
          </div>
          <p className="text-[0.7rem] text-muted -mt-1">
            App uses the STRICTER of your window vs the law (federal 8am–9pm, strict states 8am–8pm auto-enforced per recipient). Times in 24-hour. <b>Legal min</b> = whatever the law allows.
          </p>

          {/* Sender-clock guardrail — separate from recipient window */}
          <div className="pt-3 mt-1 border-t border-border">
            <Toggle
              label={`Sender-clock guardrail (${form.senderStartTime}–${form.senderEndTime} your local)`}
              value={form.senderWindowEnabled}
              onChange={v => update('senderWindowEnabled', v)}
            />
            {form.senderWindowEnabled && (
              <>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Field label="Your earliest send time">
                    <input type="time"
                      value={form.senderStartTime}
                      onChange={e => update('senderStartTime', e.target.value)} />
                  </Field>
                  <Field label="Your latest send time">
                    <input type="time"
                      value={form.senderEndTime}
                      onChange={e => update('senderEndTime', e.target.value)} />
                  </Field>
                </div>
                <p className="text-[0.7rem] text-muted mt-1">
                  Nothing sends outside these hours in YOUR local time, regardless of recipient. Belt-and-suspenders for nationwide outreach.
                </p>
              </>
            )}
          </div>
          <Toggle label='Auto-append "Reply STOP to opt out." to first message'
            value={form.autoAppendStop}
            onChange={v => update('autoAppendStop', v)} />
          <Field label="Daily cap override (leave blank to use auto tier)">
            <input type="number" min={1} step={1}
              value={form.dailyCapOverride}
              onChange={e => update('dailyCapOverride', e.target.value)}
              placeholder="Auto" />
            <p className="text-[0.7rem] text-muted mt-1">
              Warmup tiers: 50 → 100 → 250 → 500 → 1,000/day. Override only if you truly know your number's reputation is established.
            </p>
          </Field>
        </Section>

        <Section title="Sending behavior">
          <Field label="Throttle between sends (ms)">
            <input type="number" min={500} step={1000}
              value={form.sendThrottleMs} onChange={e => update('sendThrottleMs', e.target.value)} />
            <p className="text-[0.7rem] text-muted mt-1">
              {(() => {
                const ms = parseInt(form.sendThrottleMs, 10) || 30000;
                const per_min = Math.round(60000 / ms * 10) / 10;
                const per_hour = Math.round(3600000 / ms);
                return `${(ms/1000).toFixed(1)}s between sends → ~${per_min}/min → ~${per_hour.toLocaleString()}/hour`;
              })()}
              . Applied globally to every send. 30000+ (30 sec) is safe; 1500 is bot-fast and risky.
            </p>
          </Field>
          <Toggle label="Respect quiet hours (9pm–8am)"
            value={form.respectQuietHours}
            onChange={v => update('respectQuietHours', v)} />
        </Section>

        <Section title="Opt-out keywords"
          subtitle="If a reply contains any of these (case-insensitive), the contact is automatically opted out.">
          <Field label="Keywords (comma-separated)">
            <input value={form.optOutKeywords}
              onChange={e => update('optOutKeywords', e.target.value)}
              placeholder="STOP, UNSUBSCRIBE, CANCEL" />
          </Field>
        </Section>

        <div className="px-5">
          <button type="submit" disabled={saving}
            className="w-full py-3.5 rounded-lg bg-primary text-white font-semibold text-[0.95rem] disabled:opacity-50 active:scale-[.98]">
            {saving ? 'Saving…' : savedAt ? '✓ Saved' : 'Save settings'}
          </button>
        </div>
      </form>

      <Section title={`Opt-outs (${optOuts.length})`} className="mt-5">
        {optOuts.length === 0 ? (
          <p className="text-sm text-muted">No opted-out numbers.</p>
        ) : (
          <ul className="bg-white rounded-[14px] border border-border divide-y divide-border overflow-hidden">
            {optOuts.map(o => (
              <li key={o.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-ink">{formatPhone(o.phone)}</div>
                  <div className="text-[0.65rem] text-muted">
                    {o.optedOutAt ? new Date(o.optedOutAt).toLocaleString() : ''}
                  </div>
                </div>
                <button onClick={() => unblockOptOut(o.phone)}
                  className="text-xs text-amber font-semibold">Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Inbox polling & auto-reply"
        subtitle="How the app checks for inbound replies and responds to them."
        className="mt-5">
        <Toggle label="Poll phone gateway for inbound messages"
          value={form.pollingEnabled}
          onChange={v => update('pollingEnabled', v)} />
        <Field label="Poll every N milliseconds (5000+)">
          <input type="number" min={5000} step={1000}
            value={form.pollingIntervalMs}
            onChange={e => update('pollingIntervalMs', e.target.value)} />
        </Field>
        <Toggle label="Auto-reply to inbound (rule-based first, then AI if enabled)"
          value={form.autoReplyEnabled}
          onChange={v => update('autoReplyEnabled', v)} />
        <Field label="Auto-reply cooldown per contact (ms)">
          <input type="number" min={60000} step={60000}
            value={form.autoReplyCooldownMs}
            onChange={e => update('autoReplyCooldownMs', e.target.value)} />
          <p className="text-[0.7rem] text-muted mt-1">Prevents bot loops. 3600000 = 1 hour.</p>
        </Field>
      </Section>

      <Section title="AI auto-reply (Claude)"
        subtitle="When rule-based matching doesn't fire, Claude drafts a contextual response. Uses your Anthropic API key. Costs about $0.01 per reply."
        className="mt-5">
        <Toggle label="Enable AI fallback for unmatched inbound replies"
          value={form.aiReplyEnabled}
          onChange={v => update('aiReplyEnabled', v)} />
        <Field label="Your name (how Claude signs replies)">
          <input value={form.aiReplySenderName}
            onChange={e => update('aiReplySenderName', e.target.value)}
            placeholder="e.g. Tim" />
        </Field>
        <Field label="Company name">
          <input value={form.aiReplyCompanyName}
            onChange={e => update('aiReplyCompanyName', e.target.value)}
            placeholder="The Broker Shop" />
        </Field>
        <Field label="Anthropic API key (or set VITE_ANTHROPIC_API_KEY in .env.local)">
          <input type="password" value={form.aiApiKey}
            onChange={e => update('aiApiKey', e.target.value)}
            placeholder="sk-ant-…" />
          <p className="text-[0.7rem] text-muted mt-1">
            Get one at <span className="text-primary">console.anthropic.com</span>. Also usable manually from the Chat's 🪄 button.
          </p>
        </Field>
      </Section>

      <Section title="Backup & sync" subtitle="Move your data to another computer or browser. Settings, contacts, messages, and opt-outs are all included." className="mt-5">
        <div className="space-y-2">
          <button type="button" onClick={handleExport}
            className="w-full py-3 rounded-lg bg-primary text-white font-semibold text-sm active:scale-[.98]">
            Export all data ({contacts.length.toLocaleString()} contacts · {messages.length.toLocaleString()} messages)
          </button>
          <button type="button" onClick={() => importFileRef.current?.click()}
            className="w-full py-3 rounded-lg bg-white border border-border text-ink font-semibold text-sm active:scale-[.98]">
            Import from backup file
          </button>
          <input ref={importFileRef} type="file" accept=".json,application/json" onChange={handleImportFile} />
        </div>
        {importError && (
          <div className="bg-coral-light text-coral text-sm px-3 py-2 rounded-lg">⚠ {importError}</div>
        )}
        {importResult && (
          <div className="bg-teal-light text-ink text-xs px-3 py-2 rounded-lg space-y-0.5">
            <div className="font-semibold text-teal text-sm">
              ✓ Imported ({importResult.mode})
            </div>
            <div>{importResult.contacts.toLocaleString()} contacts</div>
            <div>{importResult.messages.toLocaleString()} messages</div>
            <div>{importResult.optouts.toLocaleString()} opt-outs</div>
            {importResult.skipped > 0 && <div className="text-muted">{importResult.skipped.toLocaleString()} skipped (duplicates)</div>}
          </div>
        )}
      </Section>

      <Section title="Danger zone" className="mt-5">
        <p className="text-xs text-muted mb-2">
          All data lives only in this browser's IndexedDB. Clearing site data or using another browser starts fresh.
        </p>
        <button type="button" onClick={clearAllData}
          className="w-full py-3 rounded-lg bg-white border border-coral/40 text-coral font-semibold text-sm">
          Wipe all local data
        </button>
      </Section>

      <div className="h-6" />
    </div>
  );
}

function Section({ title, subtitle, children, className = '' }) {
  return (
    <div className={`px-5 ${className}`}>
      <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-muted mb-3">{subtitle}</p>}
      <div className="bg-white rounded-[14px] border border-border p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">{label}</label>
      <div className="[&>input]:w-full [&>input]:px-3.5 [&>input]:py-3 [&>input]:border-[1.5px] [&>input]:border-border [&>input]:rounded-lg [&>input]:text-sm [&>input]:text-ink [&>input]:bg-white [&>input]:outline-none [&>input:focus]:border-primary">
        {children}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="text-sm text-ink">{label}</span>
      <span className="toggle">
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        <span className="toggle-track" />
      </span>
    </label>
  );
}
