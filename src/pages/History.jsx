import { useMemo, useState } from 'react';
import { useMessages } from '../lib/hooks';
import { formatPhone } from '../lib/sms';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'out', label: 'Sent' },
  { key: 'in', label: 'Received' },
  { key: 'failed', label: 'Failed' },
];

export default function History() {
  const messages = useMessages(500);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let list = messages;
    if (filter === 'out') list = list.filter(m => m.direction === 'out' && m.status !== 'failed');
    else if (filter === 'in') list = list.filter(m => m.direction === 'in');
    else if (filter === 'failed') list = list.filter(m => m.status === 'failed' || m.status === 'blocked-optout');
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(m =>
        m.body?.toLowerCase().includes(s) || m.to?.includes(s) || m.from?.includes(s)
      );
    }
    return list;
  }, [messages, filter, search]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-3 sticky top-0 bg-bg z-10">
        <h1 className="text-2xl font-extrabold text-ink mb-3">History</h1>
        <input
          type="search" placeholder="Search messages, phone numbers"
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full px-4 py-2.5 rounded-lg border-[1.5px] border-border text-sm bg-white outline-none focus:border-primary mb-2.5"
        />
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${
                filter === f.key ? 'bg-primary text-white' : 'bg-white border border-border text-muted'
              }`}>{f.label}</button>
          ))}
        </div>
      </header>

      <div className="px-5 mt-3 space-y-4">
        {filtered.length === 0 ? (
          <div className="text-center py-10 text-muted text-sm bg-white rounded-[14px] border border-border">
            No messages.
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.day}>
              <h3 className="text-[0.7rem] font-bold text-muted uppercase tracking-wider mb-2 px-1">{group.label}</h3>
              <ul className="bg-white rounded-[14px] border border-border divide-y divide-border overflow-hidden">
                {group.items.map(m => (
                  <MessageRow key={m.id} m={m} />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MessageRow({ m }) {
  const [open, setOpen] = useState(false);
  const isIn = m.direction === 'in';
  const isFailed = m.status === 'failed' || m.status === 'blocked-optout';
  return (
    <li className="px-4 py-3 cursor-pointer" onClick={() => setOpen(o => !o)}>
      <div className="flex items-start gap-3">
        <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
          isIn ? 'bg-teal' :
          isFailed ? 'bg-coral' :
          m.status === 'sent' ? 'bg-primary' : 'bg-muted'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="font-semibold text-sm text-ink truncate">
              {isIn ? `From ${formatPhone(m.from)}` : `To ${formatPhone(m.to)}`}
            </span>
            <span className="text-[0.65rem] text-muted flex-shrink-0">{formatTime(new Date(m.createdAt))}</span>
          </div>
          <p className={`text-xs ${open ? 'text-ink whitespace-pre-wrap' : 'text-muted truncate'}`}>{m.body}</p>
          {open && isFailed && m.error && (
            <p className="text-xs text-coral mt-1.5">⚠ {m.error}</p>
          )}
          {open && m.status === 'blocked-optout' && (
            <p className="text-xs text-amber mt-1.5">Recipient is opted out.</p>
          )}
        </div>
      </div>
    </li>
  );
}

function formatTime(d) {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function groupByDay(messages) {
  const groups = new Map();
  for (const m of messages) {
    const d = new Date(m.createdAt);
    const key = d.toDateString();
    if (!groups.has(key)) groups.set(key, { day: key, label: dayLabel(d), items: [] });
    groups.get(key).items.push(m);
  }
  return Array.from(groups.values());
}

function dayLabel(d) {
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const target = new Date(d); target.setHours(0,0,0,0);
  if (target.getTime() === today.getTime()) return 'Today';
  if (target.getTime() === yesterday.getTime()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}
