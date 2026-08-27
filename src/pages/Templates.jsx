import { useMemo, useState } from 'react';
import { useAutoReplyRules, useTemplates } from '../lib/hooks';
import { store } from '../lib/store';
import { countSegments } from '../lib/sms';
import { hasStopDisclosure, lintMessageBody } from '../lib/compliance';

export default function Templates() {
  const [tab, setTab] = useState('templates');

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3">
        <h1 className="text-2xl font-extrabold text-ink mb-3">Templates & Auto-Reply</h1>
        <div className="flex bg-white rounded-lg border border-border p-1 text-sm font-semibold">
          <button onClick={() => setTab('templates')}
            className={`flex-1 py-2 rounded ${tab === 'templates' ? 'bg-primary text-white' : 'text-muted'}`}>
            Templates
          </button>
          <button onClick={() => setTab('rules')}
            className={`flex-1 py-2 rounded ${tab === 'rules' ? 'bg-primary text-white' : 'text-muted'}`}>
            Auto-reply rules
          </button>
        </div>
      </header>
      {tab === 'templates' ? <TemplatesTab /> : <RulesTab />}
    </div>
  );
}

function TemplatesTab() {
  const templates = useTemplates();
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  async function save(form) {
    if (editing) await store.updateTemplate(editing.id, form);
    else await store.addTemplate(form);
    setEditing(null); setShowAdd(false);
  }
  async function del(id) {
    if (!confirm('Delete this template?')) return;
    await store.deleteTemplate(id);
  }

  return (
    <div className="px-5">
      <button onClick={() => { setEditing(null); setShowAdd(true); }}
        className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold mb-3">
        + New template
      </button>
      <ul className="space-y-2">
        {templates.length === 0 && (
          <li className="text-center py-8 text-muted text-sm bg-white rounded-[14px] border border-border">
            No templates yet.
          </li>
        )}
        {templates.map(t => {
          const seg = countSegments(t.body);
          return (
            <li key={t.id} className="bg-white rounded-[14px] border border-border p-3.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="font-semibold text-ink text-sm">{t.name}</div>
                <div className="flex items-center gap-2 text-[0.65rem] text-muted">
                  <span>{seg.chars}c · {seg.segments}seg</span>
                  {t.useCount > 0 && <span className="text-primary font-semibold">×{t.useCount}</span>}
                </div>
              </div>
              <p className="text-xs text-muted whitespace-pre-wrap mb-2">{t.body}</p>
              <div className="flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {t.tags?.map(tag => (
                    <span key={tag} className="text-[0.6rem] bg-primary-light text-primary px-1.5 py-0.5 rounded font-semibold">{tag}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(t)} className="text-xs text-primary font-semibold">Edit</button>
                  <button onClick={() => del(t.id)} className="text-xs text-coral font-semibold">Delete</button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {(showAdd || editing) && (
        <TemplateForm template={editing} onSave={save} onCancel={() => { setShowAdd(false); setEditing(null); }} />
      )}
    </div>
  );
}

function TemplateForm({ template, onSave, onCancel }) {
  const [name, setName] = useState(template?.name || '');
  const [body, setBody] = useState(template?.body || '');
  const [tags, setTags] = useState(template?.tags?.join(', ') || '');
  const [saving, setSaving] = useState(false);
  const seg = countSegments(body);
  const issues = lintMessageBody(body);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        body,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="w-full max-w-app bg-white rounded-t-[20px] p-5 pb-8">
        <h2 className="text-lg font-bold text-ink mb-4">{template ? 'Edit template' : 'New template'}</h2>
        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Cold — deposits+choice"
          className="w-full mb-3 mt-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary" required />
        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider flex justify-between">
          <span>Body</span>
          <span>{seg.chars} chars · {seg.segments} seg</span>
        </label>
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={4}
          placeholder="Use {{name}} for recipient's first name, [Sender] for your name."
          className={`w-full mb-2 mt-1 px-3 py-2 border-[1.5px] rounded-lg text-sm bg-white outline-none focus:border-primary resize-none ${
            issues.some(i => i.severity === 'error') ? 'border-coral' : issues.length ? 'border-amber' : 'border-border'
          }`} required />
        {issues.length > 0 && (
          <ul className="mb-2 space-y-1">
            {issues.map((i, idx) => (
              <li key={idx} className={`text-[0.7rem] px-2 py-1 rounded ${i.severity === 'error' ? 'bg-coral-light text-coral' : 'bg-amber-light text-ink'}`}>
                {i.severity === 'error' ? '✗' : '⚠'} {i.message}
              </li>
            ))}
          </ul>
        )}
        {!hasStopDisclosure(body) && body.trim() && (
          <p className="text-[0.7rem] text-muted mb-2">
            ℹ First message to a contact will auto-append "Reply STOP to opt out." if this doesn't include it.
          </p>
        )}
        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Tags (comma-separated)</label>
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="cold, first-touch, follow-up, objection"
          className="w-full mb-4 mt-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary" />
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-lg bg-white border border-border text-ink font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={saving}
            className="flex-1 py-3 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

function RulesTab() {
  const rules = useAutoReplyRules();
  const templates = useTemplates();
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const tmplById = useMemo(() => new Map(templates.map(t => [t.id, t])), [templates]);

  async function save(form) {
    if (editing) await store.updateAutoReply(editing.id, form);
    else await store.addAutoReply(form);
    setEditing(null); setShowAdd(false);
  }
  async function del(id) {
    if (!confirm('Delete this rule?')) return;
    await store.deleteAutoReply(id);
  }
  async function toggle(id, active) {
    await store.updateAutoReply(id, { active });
  }

  return (
    <div className="px-5">
      <div className="p-3 rounded-[14px] bg-primary-light border border-primary/30 mb-3">
        <p className="text-xs text-ink">
          <span className="font-semibold">How it works:</span> when an inbound text matches a rule's pattern, the app auto-sends the linked template. Rules run in <b>priority</b> order (lowest number first). If nothing matches and AI is enabled, Claude drafts a reply.
        </p>
      </div>

      <button onClick={() => { setEditing(null); setShowAdd(true); }}
        className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-semibold mb-3">
        + New rule
      </button>

      <ul className="space-y-2">
        {rules.length === 0 && (
          <li className="text-center py-8 text-muted text-sm bg-white rounded-[14px] border border-border">
            No auto-reply rules yet.
          </li>
        )}
        {rules.map(r => {
          const t = tmplById.get(r.templateId);
          return (
            <li key={r.id} className="bg-white rounded-[14px] border border-border p-3.5">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div>
                  <div className="font-semibold text-ink text-sm">{r.name}</div>
                  <div className="text-[0.65rem] text-muted">priority {r.priority ?? 100}</div>
                </div>
                <label className="toggle">
                  <input type="checkbox" checked={!!r.active} onChange={e => toggle(r.id, e.target.checked)} />
                  <span className="toggle-track" />
                </label>
              </div>
              <div className="text-xs text-muted mb-1"><span className="font-semibold">Trigger:</span> <code className="bg-surface-2 px-1 rounded">{r.pattern}</code></div>
              <div className="text-xs text-muted mb-2"><span className="font-semibold">Reply with:</span> {t?.name || <span className="text-coral">missing template</span>}</div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(r)} className="text-xs text-primary font-semibold">Edit</button>
                <button onClick={() => del(r.id)} className="text-xs text-coral font-semibold">Delete</button>
              </div>
            </li>
          );
        })}
      </ul>

      {(showAdd || editing) && (
        <RuleForm rule={editing} templates={templates}
          onSave={save} onCancel={() => { setShowAdd(false); setEditing(null); }} />
      )}
    </div>
  );
}

function RuleForm({ rule, templates, onSave, onCancel }) {
  const [name, setName] = useState(rule?.name || '');
  const [pattern, setPattern] = useState(rule?.pattern || '');
  const [templateId, setTemplateId] = useState(rule?.templateId || templates[0]?.id || '');
  const [priority, setPriority] = useState(rule?.priority ?? 100);
  const [active, setActive] = useState(rule?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [testStr, setTestStr] = useState('');
  const [testResult, setTestResult] = useState(null);

  function testPattern() {
    setTestResult(null);
    try {
      const re = new RegExp(pattern, 'i');
      setTestResult({ ok: re.test(testStr), valid: true });
    } catch (e) {
      setTestResult({ valid: false, error: e.message });
    }
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: name.trim(), pattern, templateId,
        priority: parseInt(priority, 10) || 100, active,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="w-full max-w-app bg-white rounded-t-[20px] p-5 pb-8">
        <h2 className="text-lg font-bold text-ink mb-4">{rule ? 'Edit rule' : 'New auto-reply rule'}</h2>

        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Positive intent (Y/yes)"
          className="w-full mb-3 mt-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary" required />

        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Trigger pattern (regex, case-insensitive)</label>
        <input value={pattern} onChange={e => setPattern(e.target.value)} placeholder="\\b(y|yes|sure)\\b"
          className="w-full mb-2 mt-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary font-mono" required />

        <div className="flex gap-2 mb-3">
          <input value={testStr} onChange={e => setTestStr(e.target.value)} placeholder="Test with sample reply"
            className="flex-1 px-3 py-2 border border-border rounded text-sm bg-white outline-none focus:border-primary" />
          <button type="button" onClick={testPattern}
            className="px-3 py-2 rounded bg-white border border-border text-sm font-semibold">Test</button>
        </div>
        {testResult && (
          <div className={`text-xs px-2 py-1 rounded mb-3 ${
            !testResult.valid ? 'bg-coral-light text-coral' :
            testResult.ok ? 'bg-teal-light text-teal' : 'bg-amber-light text-ink'
          }`}>
            {!testResult.valid ? `Invalid regex: ${testResult.error}` : testResult.ok ? '✓ Match' : '✗ No match'}
          </div>
        )}

        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Reply with template</label>
        <select value={templateId} onChange={e => setTemplateId(e.target.value)}
          className="w-full mb-3 mt-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary" required>
          <option value="">Pick a template…</option>
          {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>

        <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Priority (lower = checked first)</label>
        <input type="number" value={priority} onChange={e => setPriority(e.target.value)} min={1} step={1}
          className="w-full mb-3 mt-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary" />

        <label className="flex items-center justify-between gap-3 mb-4 cursor-pointer">
          <span className="text-sm text-ink">Active</span>
          <span className="toggle">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} />
            <span className="toggle-track" />
          </span>
        </label>

        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-lg bg-white border border-border text-ink font-semibold text-sm">Cancel</button>
          <button type="submit" disabled={saving || !templateId}
            className="flex-1 py-3 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
