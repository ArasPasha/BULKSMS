import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useContacts, useConversation, useSettings, useTemplates } from '../lib/hooks';
import { store } from '../lib/store';
import { sendSms, formatPhone, aiReplyDraft } from '../lib/sms';
import { CONSENT_SOURCES } from '../lib/compliance';

const STATUS_OPTIONS = [
  'new','contacted','replied','interested','question','objection',
  'not-interested','opted-out','funded','dead',
];

export default function Conversation() {
  const { contactId } = useParams();
  const navigate = useNavigate();
  const contacts = useContacts();
  const settings = useSettings();
  const templates = useTemplates();
  const contact = contacts.find(c => c.id === contactId);
  const messages = useConversation(contact?.phone);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [notes, setNotes] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (contact?.id) store.markConversationRead(contact.id);
  }, [contact?.id, messages.length]);

  useEffect(() => {
    setNotes(contact?.notes || '');
  }, [contact?.id, contact?.notes]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages.length]);

  if (!contact) {
    return (
      <div className="min-h-dvh bg-bg pb-nav flex flex-col items-center justify-center gap-3 text-muted">
        <p>Contact not found.</p>
        <Link to="/chats" className="text-primary font-semibold">← Back to chats</Link>
      </div>
    );
  }

  async function handleSend(e) {
    e.preventDefault();
    setError('');
    if (!reply.trim()) return;
    setSending(true);
    try {
      await sendSms({ to: contact.phone, body: reply, contactId: contact.id });
      setReply('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  function pickTemplate(t) {
    const first = (contact.name || '').split(/\s+/)[0] || 'there';
    const senderName = settings.aiReplySenderName || '';
    const body = t.body
      .replace(/\{\{\s*name\s*\}\}/gi, first)
      .replace(/\[?Sender\]?/g, senderName || '[Sender]');
    setReply(body);
    setShowTemplates(false);
  }

  async function draftWithAI() {
    setAiLoading(true);
    setError('');
    try {
      const lastInbound = [...messages].reverse().find(m => m.direction === 'in');
      if (!lastInbound) {
        setError('No inbound message to reply to yet.');
        return;
      }
      const draft = await aiReplyDraft({ inbound: lastInbound.body, contact });
      setReply(draft);
    } catch (err) {
      setError(err.message);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleStatusChange(status) {
    await store.setContactStatus(contact.id, status);
  }

  async function saveNotes() {
    await store.setContactNotes(contact.id, notes);
  }

  const canAI = settings.aiReplyEnabled && (import.meta.env.VITE_ANTHROPIC_API_KEY || settings.aiApiKey);
  const consentLabel = CONSENT_SOURCES.find(s => s.value === contact.consentSource)?.label || 'Unknown';

  return (
    <div className="min-h-dvh bg-bg flex flex-col">
      <header className="px-4 pt-5 pb-3 bg-white border-b border-border">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => navigate('/chats')} className="text-muted text-xl leading-none px-1">←</button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-ink truncate">{contact.name || formatPhone(contact.phone)}</div>
            <div className="text-[0.7rem] text-muted">{formatPhone(contact.phone)} · {consentLabel}</div>
          </div>
          <a href={`tel:${contact.phone}`} className="text-primary text-xs font-semibold px-2">Call</a>
        </div>
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {STATUS_OPTIONS.map(s => (
            <button key={s} onClick={() => handleStatusChange(s)}
              className={`px-2 py-1 rounded-full text-[0.65rem] font-semibold whitespace-nowrap ${
                contact.status === s ? 'bg-primary text-white' : 'bg-surface-2 text-muted'
              }`}>
              {s}
            </button>
          ))}
        </div>
      </header>

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2" style={{ paddingBottom: '180px' }}>
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm">No messages yet — send the first one below.</div>
        ) : (
          messages.map(m => <MessageBubble key={m.id} m={m} />)
        )}
      </div>

      {/* Notes panel — sticky footer just above the reply box */}
      <div className="fixed bottom-nav left-1/2 -translate-x-1/2 w-full max-w-app bg-white border-t border-border">
        <details className="border-b border-border">
          <summary className="px-4 py-2 text-[0.7rem] font-semibold text-muted uppercase tracking-wider cursor-pointer">
            Notes {contact.notes ? '· ✓' : ''}
          </summary>
          <div className="px-4 pb-2">
            <textarea rows={2} value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Deal details, follow-up date, anything worth remembering"
              className="w-full px-3 py-2 border border-border rounded text-xs bg-white outline-none focus:border-primary resize-none" />
          </div>
        </details>

        <form onSubmit={handleSend} className="p-3">
          {error && <div className="text-xs text-coral mb-1.5">⚠ {error}</div>}
          <div className="flex items-end gap-2">
            <button type="button" onClick={() => setShowTemplates(true)}
              title="Insert template"
              className="p-2 text-primary text-lg leading-none">📋</button>
            {canAI && (
              <button type="button" onClick={draftWithAI} disabled={aiLoading}
                title="AI draft based on last inbound"
                className="p-2 text-amber text-lg leading-none disabled:opacity-50">
                {aiLoading ? '…' : '🪄'}
              </button>
            )}
            <textarea rows={2} value={reply}
              onChange={e => setReply(e.target.value)}
              placeholder="Type a reply…"
              className="flex-1 px-3 py-2 border-[1.5px] border-border rounded-lg text-sm bg-white outline-none focus:border-primary resize-none" />
            <button type="submit" disabled={sending || !reply.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-white font-semibold text-sm disabled:opacity-50">
              {sending ? '…' : 'Send'}
            </button>
          </div>
          <div className="text-[0.65rem] text-muted mt-1 text-right">{reply.length} chars</div>
        </form>
      </div>

      {showTemplates && (
        <TemplatePickerModal
          templates={templates}
          onPick={pickTemplate}
          onClose={() => setShowTemplates(false)}
        />
      )}
    </div>
  );
}

function MessageBubble({ m }) {
  const isIn = m.direction === 'in';
  const isFailed = m.status === 'failed' || m.status === 'blocked' || m.status === 'blocked-optout';
  return (
    <div className={`flex ${isIn ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm ${
        isIn
          ? 'bg-white border border-border rounded-bl-sm text-ink'
          : isFailed
            ? 'bg-coral-light text-coral border border-coral/30 rounded-br-sm'
            : 'bg-primary text-white rounded-br-sm'
      }`}>
        <div className="whitespace-pre-wrap break-words">{m.body}</div>
        <div className={`text-[0.6rem] mt-1 ${isIn ? 'text-muted' : 'text-white/70'}`}>
          {new Date(m.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          {isFailed && ` · ${m.error || 'failed'}`}
        </div>
      </div>
    </div>
  );
}

function TemplatePickerModal({ templates, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('');
  const tags = useMemo(() => {
    const set = new Set();
    templates.forEach(t => t.tags?.forEach(x => set.add(x)));
    return Array.from(set).sort();
  }, [templates]);
  const filtered = useMemo(() => {
    let list = templates;
    if (tag) list = list.filter(t => t.tags?.includes(tag));
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(s) || t.body.toLowerCase().includes(s));
    }
    return list;
  }, [templates, tag, search]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="w-full max-w-app bg-white rounded-t-[20px] p-4 pb-8 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-bold text-ink">Pick template</h2>
          <button onClick={onClose} className="text-muted text-2xl leading-none">×</button>
        </div>
        <input type="search" placeholder="Search templates" value={search} onChange={e => setSearch(e.target.value)}
          className="w-full mb-2 px-3 py-2 border border-border rounded text-sm bg-white outline-none focus:border-primary" />
        {tags.length > 0 && (
          <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide -mx-1 px-1">
            <button onClick={() => setTag('')} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${tag === '' ? 'bg-primary text-white' : 'bg-surface-2 text-muted'}`}>All</button>
            {tags.map(t => (
              <button key={t} onClick={() => setTag(t)} className={`px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${tag === t ? 'bg-primary text-white' : 'bg-surface-2 text-muted'}`}>{t}</button>
            ))}
          </div>
        )}
        <ul className="overflow-y-auto flex-1 space-y-1.5">
          {filtered.map(t => (
            <li key={t.id}>
              <button type="button" onClick={() => onPick(t)}
                className="w-full text-left p-3 bg-surface-2 hover:bg-primary-light rounded-lg transition-colors">
                <div className="text-sm font-semibold text-ink mb-0.5">{t.name}</div>
                <div className="text-xs text-muted line-clamp-2">{t.body}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
