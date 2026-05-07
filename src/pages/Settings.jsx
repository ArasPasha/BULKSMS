import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { gatewayPing, watchOptOuts, setOptOut, formatPhone } from '../lib/sms';

export default function Settings() {
  const { user, profile, refreshProfile, logout } = useAuth();
  const [form, setForm] = useState({
    gatewayUrl: '', gatewayUser: '', gatewayPass: '',
    optOutKeywords: '', sendThrottleMs: 1500, respectQuietHours: true,
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [optOuts, setOptOuts] = useState([]);

  useEffect(() => {
    if (!profile) return;
    setForm({
      gatewayUrl: profile.gatewayUrl || '',
      gatewayUser: profile.gatewayUser || '',
      gatewayPass: profile.gatewayPass || '',
      optOutKeywords: (profile.optOutKeywords || []).join(', '),
      sendThrottleMs: profile.sendThrottleMs ?? 1500,
      respectQuietHours: profile.respectQuietHours ?? true,
    });
  }, [profile]);

  useEffect(() => {
    if (!user) return;
    return watchOptOuts(user.uid, setOptOuts);
  }, [user]);

  function update(k, v) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        gatewayUrl: form.gatewayUrl.trim(),
        gatewayUser: form.gatewayUser.trim(),
        gatewayPass: form.gatewayPass,
        optOutKeywords: form.optOutKeywords.split(',').map(k => k.trim().toUpperCase()).filter(Boolean),
        sendThrottleMs: Math.max(500, parseInt(form.sendThrottleMs, 10) || 1500),
        respectQuietHours: !!form.respectQuietHours,
      });
      await refreshProfile();
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
    await setOptOut(user.uid, phone, false);
  }

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-extrabold text-ink">Settings</h1>
      </header>

      <form onSubmit={handleSave} className="space-y-5">
        <Section
          title="Phone gateway"
          subtitle="Install SMS Gateway for Android on your phone (capcom6/android-sms-gateway), open the app, copy the local URL and credentials shown in Local Server."
        >
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

        <Section title="Sending behavior">
          <Field label="Throttle between sends (ms)">
            <input type="number" min={500} step={100}
              value={form.sendThrottleMs}
              onChange={e => update('sendThrottleMs', e.target.value)} />
            <p className="text-[0.7rem] text-muted mt-1">
              1500ms = ~40/min. Lower = faster but higher carrier-flag risk.
            </p>
          </Field>
          <Toggle
            label="Respect quiet hours (9pm–8am)"
            value={form.respectQuietHours}
            onChange={v => update('respectQuietHours', v)}
          />
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
            {saving ? 'Saving…' : 'Save settings'}
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
                    {o.optedOutAt?.toDate ? o.optedOutAt.toDate().toLocaleString() : ''}
                  </div>
                </div>
                <button onClick={() => unblockOptOut(o.phone)}
                  className="text-xs text-amber font-semibold">Unblock</button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="px-5 mt-6 mb-4">
        <button onClick={logout}
          className="w-full py-3 rounded-lg bg-white border border-border text-coral font-semibold text-sm">
          Sign out
        </button>
      </div>
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
