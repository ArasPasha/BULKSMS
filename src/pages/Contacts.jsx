import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { useAuth } from '../contexts/AuthContext';
import {
  watchContacts, addContact, updateContact, deleteContact,
  bulkAddContacts, formatPhone, normalizePhone, setOptOut,
} from '../lib/sms';

export default function Contacts() {
  const { user } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importStatus, setImportStatus] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    return watchContacts(user.uid, setContacts);
  }, [user]);

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

  function handleCsvFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportStatus('Parsing…');
    Papa.parse(file, {
      header: true, skipEmptyLines: true,
      complete: async ({ data }) => {
        const rows = data.map(r => ({
          name: r.name || r.Name || r['First Name'] || r.first_name || '',
          phone: r.phone || r.Phone || r.number || r.Number || r['Phone Number'] || '',
          tags: (r.tags || r.Tags || '').split(',').map(t => t.trim()).filter(Boolean),
        }));
        try {
          setImportStatus('Importing…');
          const { added, skipped } = await bulkAddContacts(user.uid, rows);
          setImportStatus(`Imported ${added}, skipped ${skipped}`);
          setTimeout(() => setImportStatus(''), 4000);
        } catch (err) {
          setImportStatus(`Failed: ${err.message}`);
        }
        if (fileRef.current) fileRef.current.value = '';
      },
      error: (err) => setImportStatus(`Parse error: ${err.message}`),
    });
  }

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3 sticky top-0 bg-bg z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-ink">Contacts</h1>
          <span className="text-xs text-muted font-semibold">{contacts.length}</span>
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
      </header>

      <ul className="px-5 mt-3 space-y-2">
        {filtered.length === 0 && (
          <li className="text-center py-10 text-muted text-sm bg-white rounded-[14px] border border-border">
            {contacts.length === 0 ? 'No contacts yet. Add one or import a CSV.' : 'No matches.'}
          </li>
        )}
        {filtered.map(c => (
          <li key={c.id} className="bg-white rounded-[14px] border border-border p-3.5">
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
                <button onClick={() => { setEditing(c); setShowAdd(true); }}
                  className="text-xs text-primary font-semibold px-2 py-1">Edit</button>
                <button onClick={() => handleToggleOptOut(c)}
                  className="text-xs text-amber font-semibold px-2 py-1">
                  {c.optedOut ? 'Unblock' : 'Opt-out'}
                </button>
                <button onClick={() => handleDelete(c.id)}
                  className="text-xs text-coral font-semibold px-2 py-1">Delete</button>
              </div>
            </div>
          </li>
        ))}
      </ul>

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
