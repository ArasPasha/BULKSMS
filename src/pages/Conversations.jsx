import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useConversations } from '../lib/hooks';
import { formatPhone } from '../lib/sms';

const STATUS_FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'unread',       label: 'Unread' },
  { key: 'interested',   label: 'Interested' },
  { key: 'question',     label: 'Questions' },
  { key: 'objection',    label: 'Objections' },
  { key: 'replied',      label: 'Replied' },
  { key: 'contacted',    label: 'Contacted' },
  { key: 'not-interested', label: 'Not interested' },
];

export default function Conversations() {
  const conversations = useConversations();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = conversations;
    if (filter === 'unread') list = list.filter(c => c.hasUnread);
    else if (filter !== 'all') list = list.filter(c => c.status === filter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        c.name?.toLowerCase().includes(s) ||
        c.phone?.includes(s) ||
        c.lastInboundBody?.toLowerCase().includes(s)
      );
    }
    return list;
  }, [conversations, filter, search]);

  const unreadCount = conversations.filter(c => c.hasUnread).length;

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3 sticky top-0 bg-bg z-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-extrabold text-ink">Chats</h1>
          {unreadCount > 0 && (
            <span className="text-xs bg-coral text-white px-2 py-1 rounded-full font-bold">
              {unreadCount} new
            </span>
          )}
        </div>
        <input
          type="search" placeholder="Search name, phone, message"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border text-sm bg-white outline-none focus:border-primary mb-2.5"
        />
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                filter === f.key ? 'bg-primary text-white' : 'bg-white border border-border text-muted'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <ul className="px-5 mt-3 space-y-2">
        {filtered.length === 0 && (
          <li className="text-center py-10 text-muted text-sm bg-white rounded-[14px] border border-border">
            {conversations.length === 0 ? (
              <>No conversations yet. <Link to="/compose" className="text-primary font-semibold">Send your first message.</Link></>
            ) : 'No matches.'}
          </li>
        )}
        {filtered.map(c => <ConversationCard key={c.id} c={c} />)}
      </ul>
    </div>
  );
}

const STATUS_COLORS = {
  new: 'bg-surface-2 text-muted',
  contacted: 'bg-primary-light text-primary',
  replied: 'bg-teal-light text-teal',
  interested: 'bg-teal-light text-teal',
  question: 'bg-amber-light text-amber',
  objection: 'bg-amber-light text-amber',
  'not-interested': 'bg-coral-light text-coral',
  'opted-out': 'bg-coral-light text-coral',
  funded: 'bg-teal text-white',
  dead: 'bg-surface-2 text-muted',
};

function ConversationCard({ c }) {
  const preview = c.lastInboundBody || 'No reply yet';
  const timeStr = c.lastActivity ? timeAgo(new Date(c.lastActivity)) : '';
  return (
    <li>
      <Link to={`/chats/${c.id}`}
        className={`block bg-white rounded-[14px] border p-3.5 active:scale-[.98] transition-transform ${
          c.hasUnread ? 'border-primary shadow-sm' : 'border-border'
        }`}>
        <div className="flex items-start gap-3">
          <Avatar name={c.name || c.phone} status={c.status} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink truncate flex items-center gap-1.5">
                {c.hasUnread && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                {c.name || formatPhone(c.phone)}
              </span>
              <span className="text-[0.65rem] text-muted flex-shrink-0">{timeStr}</span>
            </div>
            <p className={`text-xs truncate mt-0.5 ${c.hasUnread ? 'text-ink font-semibold' : 'text-muted'}`}>
              {preview}
            </p>
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              <span className={`text-[0.6rem] px-1.5 py-0.5 rounded font-semibold ${STATUS_COLORS[c.status] || 'bg-surface-2 text-muted'}`}>
                {c.status || 'new'}
              </span>
              {c.tags?.slice(0, 2).map(t => (
                <span key={t} className="text-[0.6rem] bg-primary-light text-primary px-1.5 py-0.5 rounded font-semibold">
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Link>
    </li>
  );
}

function Avatar({ name, status }) {
  const initials = (name || '?').split(/\s+/).map(s => s[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  const ringColor = status === 'interested' ? 'ring-teal' :
    status === 'question' || status === 'objection' ? 'ring-amber' :
    status === 'opted-out' || status === 'not-interested' ? 'ring-coral' : 'ring-transparent';
  return (
    <div className={`w-10 h-10 rounded-full bg-primary-light text-primary font-bold text-sm flex items-center justify-center flex-shrink-0 ring-2 ${ringColor}`}>
      {initials}
    </div>
  );
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
