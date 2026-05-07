import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useAuth } from '../contexts/AuthContext';
import {
  watchContacts, addContact, updateContact, deleteContact,
  bulkAddContacts, formatPhone, normalizePhone, setOptOut,
  getContactsCount,
} from '../lib/sms';

const PAGE_SIZE = 500;

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [pageLimit, setPageLimit] = useState(PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const [importProgress, setImportProgress] = useState(null);
  const [importSummary, setImportSummary] = useState(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    return watchContacts(user.uid, setContacts, pageLimit);
  }, [user, pageLimit]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    getContactsCount(user.uid).then(c => { if (active) setTotalCount(c); }).catch(() => {});
    return () => { active = false; };
  }, [user, contacts.length]);

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
      if (editing) {
        await updateContact(user.uid, editing.id, form);
      } else {
        await addContact(user.uid, form);
      }
      setShowAdd(false); setEditing(null);
    } catch (e) {
      alert(e.message);
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this contact?')) return;
    await deleteContact(user.uid, id);
  }

  async function handleToggleOptOut(c) {
    await setOptOut(user.uid, c.phone, !c.optedOut);
  }

  function pickField(row, ...names) {
    for (const n of names) {
      const keys = Object.keys(row);
      const k = keys.find(k => k.toLowerCase().trim() === n.toLowerCase());
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
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: h => h.trim(),
      complete: async ({ data, errors }) => {
        if (errors?.length) {
          console.warn('CSV parse warnings:', errors);
        }
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

        if (rows.length > 2000) {
          const ok = confirm(
            `Found ${rows.length.toLocaleString()} rows.\n\n` +
            `This will write up to ${rows.length.toLocaleString()} contacts to your Firestore database. ` +
            `On the free tier you get 20K writes/day — large imports may exceed that.\n\n` +
            `Note: sending to all of these from one personal phone WILL get your number suspended. ` +
            `Use tags to send in small batches (under 100/hr).\n\n` +
            `Continue?`
          );
          if (!ok) {
            setImportStatus('');
            if (fileRef.current) fileRef.current.value = '';
            return;
          }
        }

        setImportStatus(`Found ${rows.length.toLocaleString()} rows. Checking duplicates…`);
        try {
          const summary = await bulkAddContacts(user.uid, rows, {
            onProgress: (p) => {
              setImportProgress(p);
              if (p.stage === 'checking') setImportStatus('Checking existing contacts…');
              else if (p.stage === 'writing') setImportStatus(`Importing ${p.done}/${p.total}…`);
            },
          });
          setImportSummary(summary);
          setImportStatus('');
          setImportProgress(null);
        } catch (err) {
          setImportStatus(`Failed: ${err.message}`);
          setImportProgress(null);
        }
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
            {totalCount !== null ? (
              contacts.length < totalCount
                ? `${contacts.length.toLocaleString()} of ${totalCount.toLocaleString()}`
                : totalCount.toLocaleString()
            ) : contacts.length.toLocaleString()}
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
                  ✓ Imported {importSummary.added} of {importSummary.total}
                </div>
                {importSummary.dupesInDb > 0 && (
                  <div>{importSummary.dupesInDb} already in your contacts</div>
                )}
                {importSummary.dupesInFile > 0 && (
                  <div>{importSummary.dupesInFile} duplicates inside the file</div>
                )}
                {importSummary.invalid > 0 && (
                  <div>{importSummary.invalid} invalid phone numbers</div>
                )}
              </div>
              <button onClick={() => setImportSummary(null)}
                className="text-muted text-lg leading-none">×</button>
            </div>
          </div>
        )}
      </header>

      <ul className="px-5 mt-3 space-y-2">
        {filtered.length === 0 && (
          <li className="text-center py-10 text-muted text-sm bg-white rounded-[14px] border border-border">
            {contacts.length === 0 ? 'No contacts yet. Add one or import a CSV.' : 'No matches.'}
          </li>
        )}
        {filtered.map(c => (
          <ContactCard key={c.id} c={c}
            onEdit={() => { setEditing(c); setShowAdd(true); }}
            onToggleOptOut={() => handleToggleOptOut(c)}
            onDelete={() => handleDelete(c.id)} />
        ))}
      </ul>

      {totalCount !== null && contacts.length < totalCount && !search && (
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
    </div>
  );
}

function ContactCard({ c, onEdit, onToggleOptOut, onDelete }) {
  return (
    <li className="bg-white rounded-[14px] border border-border p-3.5">
      <div className="flex items-start gap-3">
        <Avatar name={c.name || c.phone} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-ink truncate">{c.name || formatPhone(c.phone)}</div>
          <div className="text-xs text-muted">{formatPhone(c.phone)}</div>
          {c.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {c.tags.map(t => (
                <span key={t} className="text-[0.65rem] bg-primary-light text-primary px-1.5 py-0.5 rounded font-semibold">
                  {t}
                </span>
              ))}
            </div>
          )}
          {c.optedOut && (
            <span className="inline-block mt-1 text-[0.65rem] bg-coral-light text-coral px-1.5 py-0.5 rounded font-semibold">
              OPTED OUT
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button onClick={onEdit} className="text-xs text-primary font-semibold px-2 py-1">Edit</button>
          <button onClick={onToggleOptOut} className="text-xs text-amber font-semibold px-2 py-1">
            {c.optedOut ? 'Unblock' : 'Opt-out'}
          </button>
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
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        name: name.trim(),
        phone: normalizePhone(phone),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
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
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-lg bg-white border border-border text-ink font-semibold text-sm">
            Cancel
          </button>
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
