import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useContacts } from '../lib/hooks';
import {
  addContact, updateContact, deleteContact, bulkAddContacts,
  formatPhone, normalizePhone, setOptOut,
} from '../lib/sms';
import { CONSENT_SOURCES, getConsentRisk } from '../lib/compliance';

const PAGE_SIZE = 500;

export default function Contacts() {
  const allContacts = useContacts();
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [importProgress, setImportProgress] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const [pendingImport, setPendingImport] = useState(null); // { rows, filename }
  const [importConsent, setImportConsent] = useState('cold-prospect');
  const fileRef = useRef(null);

  const sorted = useMemo(
    () => [...allContacts].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [allContacts]
  );
  const totalCount = allContacts.length;
  const contacts = sorted.slice(0, pageLimit);

  const filtered = useMemo(() => {
    if (!search) return contacts;
    const s = search.toLowerCase();
    return contacts.filter(c =>
      c.name?.toLowerCase().includes(s) ||
      c.phone?.includes(s) ||
      c.tags?.some(t => t.toLowerCase().includes(s))
    );
  }, [contacts, search]);

  async function handleSave(form) {
    try {
      if (editing) await updateContact(editing.id, form);
      else await addContact(form);
      setShowAdd(false); setEditing(null);
    } catch (e) { alert(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this contact?')) return;
    await deleteContact(id);
  }

  async function handleToggleOptOut(c) {
    await setOptOut(c.phone, !c.optedOut);
  }

  async function confirmImport() {
    if (!pendingImport) return;
    const { rows } = pendingImport;
    setImportStatus(`Importing ${rows.length.toLocaleString()}…`);
    try {
      const summary = await bulkAddContacts(rows, {
        consentSource: importConsent,
        onProgress: (p) => {
          setImportProgress(p);
          if (p.stage === 'writing') setImportStatus(`Importing ${p.done.toLocaleString()}/${p.total.toLocaleString()}…`);
        },
      });
      setImportSummary({ ...summary, consentSource: importConsent });
      setImportStatus('');
      setImportProgress(null);
    } catch (err) {
      setImportStatus(`Failed: ${err.message}`);
      setImportProgress(null);
    }
    setPendingImport(null);
  }

  function pickField(row, ...names) {
    for (const n of names) {
      const k = Object.keys(row).find(k => k.toLowerCase().trim() === n.toLowerCase());
      if (k && row[k]) return String(row[k]).trim();
    }
    return '';
  }

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportSummary(null);
    setImportProgress(null);
    setImportStatus(`Parsing ${file.name}…`);
    Papa.parse(file, {
      header: true, skipEmptyLines: 'greedy',
      transformHeader: h => h.trim(),
      complete: async ({ data }) => {
        const rows = data.map(r => {
          const name = pickField(r, 'name', 'full name', 'fullname', 'full_name', 'first name', 'firstname', 'first_name', 'contact', 'contact name');
          const last = pickField(r, 'last name', 'lastname', 'last_name', 'surname');
          const phone = pickField(r, 'phone', 'phone number', 'phonenumber', 'phone_number', 'mobile', 'mobile number', 'cell', 'number', 'tel', 'telephone');
          const tagsStr = pickField(r, 'tags', 'tag', 'segment', 'group', 'list');
          return {
            name: [name, last].filter(Boolean).join(' ').trim(),
            phone,
            tags: tagsStr.split(/[,;|]/).map(t => t.trim()).filter(Boolean),
          };
        }).filter(r => r.phone);

        if (rows.length === 0) {
          setImportStatus(`No phone numbers found. Expected a column named: phone, mobile, number, etc.`);
          setTimeout(() => setImportStatus(''), 6000);
          if (fileRef.current) fileRef.current.value = '';
          return;
        }

        // Stage the parsed rows and open the consent-attestation modal.
        // The actual import happens in confirmImport() after the user picks a source.
        setPendingImport({ rows, filename: file.name });
        setImportStatus('');
        if (fileRef.current) fileRef.current.value = '';
      },
      error: (err) => {
        setImportStatus(`Parse error: ${err.message}`);
        if (fileRef.current) fileRef.current.value = '';
      },
    });
  }

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3 sticky top-0 bg-bg z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-ink">Contacts</h1>
          <span className="text-xs text-muted font-semibold">
            {contacts.length < totalCount
              ? `${contacts.length.toLocaleString()} of ${totalCount.toLocaleString()}`
              : totalCount.toLocaleString()}
          </span>
        </div>
        <input
          type="search"
          placeholder="Search name, phone, or tag"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border text-sm bg-white outline-none focus:border-primary"
        />
        <div className="flex gap-2 mt-2.5">
          <button
            onClick={() => { setEditing(null); setShowAdd(true); }}
            className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold active:scale-[.98]">
            + Add contact
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-2.5 rounded-lg bg-white border border-border text-sm font-semibold text-ink active:scale-[.98]">
            Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv" onChange={handleCsvFile} />
        </div>
        {importStatus && (
          <div className="mt-2 text-xs text-primary font-semibold">{importStatus}</div>
        )}
        {importProgress?.total > 0 && (
          <div className="mt-2 w-full h-1.5 bg-surface-2 rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all"
              style={{ width: `${(importProgress.done / importProgress.total) * 100}%` }} />
          </div>
        )}
        {importSummary && (
          <div className="mt-2 p-3 rounded-lg bg-teal-light border border-teal/30">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs text-ink space-y-0.5">
                <div className="font-semibold text-teal text-sm">
                  ✓ Imported {importSummary.added.toLocaleString()} of {importSummary.total.toLocaleString()}
                </div>
                {importSummary.dupesInDb > 0 && <div>{importSummary.dupesInDb.toLocaleString()} already in your contacts</div>}
                {importSummary.dupesInFile > 0 && <div>{importSummary.dupesInFile.toLocaleString()} duplicates inside the file</div>}
                {importSummary.invalid > 0 && <div>{importSummary.invalid.toLocaleString()} invalid phone numbers</div>}
              </div>
              <button onClick={() => setImportSummary(null)} className="text-muted text-lg leading-none">×</button>
            </div>
          </div>
        )}
      </header>

      <ul className="px-5 mt-3 space-y-2">
        {filtered.length === 0 && (
          <li className="text-center py-10 text-muted text-sm bg-white rounded-[14px] border border-border">
            {totalCount === 0 ? 'No contacts yet. Add one or import a CSV.' : 'No matches.'}
          </li>
        )}
        {filtered.map(c => (
          <ContactCard key={c.id} c={c}
            onEdit={() => { setEditing(c); setShowAdd(true); }}
            onToggleOptOut={() => handleToggleOptOut(c)}
            onDelete={() => handleDelete(c.id)} />
        ))}
      </ul>

      {contacts.length < totalCount && !search && (
        <div className="px-5 mt-3">
          <button
            onClick={() => setPageLimit(p => p + PAGE_SIZE)}
            className="w-full py-3 rounded-[14px] bg-white border border-border text-primary font-semibold text-sm active:scale-[.98]">
            Load {Math.min(PAGE_SIZE, totalCount - contacts.length).toLocaleString()} more
          </button>
        </div>
      )}

      {showAdd && (
        <ContactForm
          contact={editing}
          onSave={handleSave}
          onCancel={() => { setShowAdd(false); setEditing(null); }}
        />
      )}

      {pendingImport && (
        <ImportAttestationModal
          rowCount={pendingImport.rows.length}
          filename={pendingImport.filename}
          consent={importConsent}
          onChangeConsent={setImportConsent}
          onConfirm={confirmImport}
          onCancel={() => setPendingImport(null)}
        />
      )}
    </div>
  );
}

function ImportAttestationModal({ rowCount, filename, consent, onChangeConsent, onConfirm, onCancel }) {
  const risk = getConsentRisk(consent);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onCancel}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-app bg-white rounded-t-[20px] p-5 pb-8">
        <h2 className="text-lg font-bold text-ink mb-1">Confirm import</h2>
        <p className="text-xs text-muted mb-4">
          {rowCount.toLocaleString()} rows from <span className="font-semibold">{filename}</span>
        </p>

        <div className="mb-4">
          <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">
            How did you get consent for these contacts?
          </label>
          <select value={consent} onChange={e => onChangeConsent(e.target.value)}
            className="w-full mt-1.5 px-3.5 py-3 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary">
            {CONSENT_SOURCES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          <p className={`text-[0.7rem] mt-1.5 ${
            risk === 'high' ? 'text-coral' : risk === 'medium' ? 'text-amber' : 'text-teal'
          }`}>
            {risk === 'high' && '⚠ HIGH RISK — TCPA fines are $500–$1,500 per message without documented consent. Cold-prospect texting to cell phones is not exempt.'}
            {risk === 'medium' && '◐ MEDIUM RISK — document the referral source per contact if challenged.'}
            {risk === 'low' && '✓ Low legal risk if you can produce the record.'}
          </p>
        </div>

        {rowCount > 2000 && (
          <div className="p-3 rounded-lg bg-amber-light text-ink text-xs mb-4">
            ⚠ Broadcasting to {rowCount.toLocaleString()} from one personal phone will kill your number. Import is fine — just batch your sends by tag, small groups per day.
          </div>
        )}

        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-lg bg-white border border-border text-ink font-semibold text-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm}
            className="flex-1 py-3 rounded-lg bg-primary text-white font-semibold text-sm active:scale-[.98]">
            Import
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactCard({ c, onEdit, onToggleOptOut, onDelete }) {
  const risk = getConsentRisk(c.consentSource);
  const consentLabel = CONSENT_SOURCES.find(s => s.value === c.consentSource)?.label || 'Unknown';
  return (
    <li className="bg-white rounded-[14px] border border-border p-3.5">
      <div className="flex items-start gap-3">
        <Avatar name={c.name || c.phone} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{c.name || formatPhone(c.phone)}</div>
          <div className="text-xs text-muted">{formatPhone(c.phone)}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {c.tags?.map(t => (
              <span key={t} className="text-[0.65rem] bg-primary-light text-primary px-1.5 py-0.5 rounded font-semibold">{t}</span>
            ))}
            <span title={consentLabel} className={`text-[0.6rem] px-1.5 py-0.5 rounded font-semibold ${
              risk === 'high' ? 'bg-coral-light text-coral' :
              risk === 'medium' ? 'bg-amber-light text-amber' :
              'bg-teal-light text-teal'
            }`}>
              {risk === 'low' ? '✓' : risk === 'medium' ? '◐' : '✗'} {consentLabel}
            </span>
            {c.optedOut && (
              <span className="text-[0.6rem] bg-coral-light text-coral px-1.5 py-0.5 rounded font-semibold">OPTED OUT</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onEdit} className="text-xs text-primary font-semibold px-2 py-1">Edit</button>
          <button onClick={onToggleOptOut} className="text-xs text-amber font-semibold px-2 py-1">{c.optedOut ? 'Unblock' : 'Opt-out'}</button>
          <button onClick={onDelete} className="text-xs text-coral font-semibold px-2 py-1">Delete</button>
        </div>
      </div>
    </li>
  );
}

function Avatar({ name }) {
  const initials = (name || '?').split(/\s+/).map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  return (
    <div className="w-10 h-10 rounded-full bg-primary-light text-primary font-bold text-sm flex items-center justify-center flex-shrink-0">
      {initials}
    </div>
  );
}

function ContactForm({ contact, onSave, onCancel }) {
  const [name, setName] = useState(contact?.name || '');
  const [phone, setPhone] = useState(contact?.phone ? formatPhone(contact.phone) : '');
  const [tags, setTags] = useState(contact?.tags?.join(', ') || '');
  const [consentSource, setConsentSource] = useState(contact?.consentSource || 'unknown');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        phone: normalizePhone(phone),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        consentSource,
        consentDate: consentSource !== 'unknown' && !contact?.consentDate ? Date.now() : contact?.consentDate,
      });
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onCancel}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="w-full max-w-app bg-white rounded-t-[20px] p-5 pb-8">
        <h2 className="text-lg font-bold text-ink mb-4">{contact ? 'Edit contact' : 'New contact'}</h2>
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 123-4567" required inputMode="tel" />
        </Field>
        <Field label="Tags (comma-separated)">
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="vip, customer" />
        </Field>
        <div className="flex flex-col gap-1.5 mb-3">
          <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">Consent source</label>
          <select value={consentSource} onChange={e => setConsentSource(e.target.value)}
            className="w-full px-3.5 py-3 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary">
            {CONSENT_SOURCES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 mt-4">
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

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5 mb-3">
      <label className="text-[0.7rem] font-semibold text-muted uppercase tracking-wider">{label}</label>
      <div className="[&>input]:w-full [&>input]:px-3.5 [&>input]:py-3 [&>input]:border-[1.5px] [&>input]:border-border [&>input]:rounded-lg [&>input]:text-sm [&>input]:text-ink [&>input]:bg-white [&>input]:outline-none [&>input:focus]:border-primary">
        {children}
      </div>
    </div>
  );
}
