import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useContacts, useMessages, useOptOuts, useSettings } from '../lib/hooks';
import { formatPhone, isQuietHours } from '../lib/sms';

export default function Dashboard() {
  const contacts = useContacts();
  const messages = useMessages(50);
  const optOuts = useOptOuts();
  const settings = useSettings();

  const stats = useMemo(() => {
    const sent = messages.filter(m => m.direction === 'out' && m.status === 'sent').length;
    const failed = messages.filter(m => m.direction === 'out' && m.status === 'failed').length;
    const received = messages.filter(m => m.direction === 'in').length;
    const today = new Date(); today.setHours(0,0,0,0);
    const sentToday = messages.filter(m =>
      m.direction === 'out' && m.status === 'sent' && new Date(m.createdAt) >= today
    ).length;
    return { sent, failed, received, sentToday };
  }, [messages]);

  const gatewayConfigured = !!(settings.gatewayUrl && settings.gatewayUser && settings.gatewayPass);
  const quiet = settings.respectQuietHours && isQuietHours();

  return (
    <div className="min-h-dvh bg-bg pb-nav">
      <header className="px-5 pt-6 pb-4">
        <p className="text-xs text-muted uppercase tracking-wider font-semibold">SMS Sender</p>
        <h1 className="text-2xl font-extrabold text-ink">Dashboard</h1>
      </header>

      {!gatewayConfigured && (
        <div className="mx-5 mb-4 p-4 rounded-[14px] bg-amber-light border border-amber/30">
          <div className="flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div className="flex-1">
              <p className="font-semibold text-ink mb-1">Connect your phone</p>
              <p className="text-xs text-muted mb-2">
                Configure the SMS Gateway on your Android phone before sending.
              </p>
              <Link to="/settings" className="text-primary text-sm font-semibold">
                Set up gateway →
              </Link>
            </div>
          </div>
        </div>
      )}

      {quiet && gatewayConfigured && (
        <div className="mx-5 mb-4 p-3 rounded-[14px] bg-coral-light border border-coral/30 text-sm text-ink">
          🌙 Quiet hours (9pm–8am). Sends are disabled to protect your reputation. Disable in Settings if needed.
        </div>
      )}

      <section className="px-5 grid grid-cols-2 gap-3 mb-5">
        <Stat label="Sent today" value={stats.sentToday} accent="text-primary" />
        <Stat label="Total sent" value={stats.sent} accent="text-teal" />
        <Stat label="Replies" value={stats.received} accent="text-amber" />
        <Stat label="Opt-outs" value={optOuts.length} accent="text-coral" />
      </section>

      <section className="px-5 mb-5">
        <h2 className="text-sm font-bold text-muted uppercase tracking-wider mb-2.5">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3">
          <ActionCard to="/compose" title="New message" subtitle="Send to one or many" icon="✉️" />
          <ActionCard to="/contacts" title="Contacts" subtitle={`${contacts.length.toLocaleString()} saved`} icon="👥" />
          <ActionCard to="/history" title="History" subtitle={`${messages.length.toLocaleString()} messages`} icon="📜" />
          <ActionCard to="/settings" title="Settings" subtitle={gatewayConfigured ? 'Connected' : 'Setup needed'} icon="⚙️" />
        </div>
      </section>

      <section className="px-5">
        <div className="flex items-center justify-between mb-2.5">
          <h2 className="text-sm font-bold text-muted uppercase tracking-wider">Recent activity</h2>
          <Link to="/history" className="text-xs text-primary font-semibold">See all</Link>
        </div>
        {messages.length === 0 ? (
          <div className="text-center py-8 text-muted text-sm bg-white rounded-[14px] border border-border">
            No messages yet. <Link to="/compose" className="text-primary font-semibold">Send your first one.</Link>
          </div>
        ) : (
          <ul className="bg-white rounded-[14px] border border-border divide-y divide-border overflow-hidden">
            {messages.slice(0, 5).map(m => (
              <li key={m.id} className="px-4 py-3 flex items-start gap-3">
                <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                  m.direction === 'in' ? 'bg-teal' :
                  m.status === 'sent' ? 'bg-primary' :
                  m.status === 'failed' ? 'bg-coral' : 'bg-muted'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-sm text-ink truncate">
                      {m.direction === 'in' ? `From ${formatPhone(m.from)}` : `To ${formatPhone(m.to)}`}
                    </span>
                    <span className="text-[0.65rem] text-muted flex-shrink-0">
                      {timeAgo(new Date(m.createdAt))}
                    </span>
                  </div>
                  <p className="text-xs text-muted truncate">{m.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className="bg-white rounded-[14px] border border-border p-3.5">
      <div className={`text-2xl font-extrabold ${accent}`}>{value}</div>
      <div className="text-[0.7rem] text-muted uppercase tracking-wider font-semibold">{label}</div>
    </div>
  );
}

function ActionCard({ to, title, subtitle, icon }) {
  return (
    <Link to={to} className="block bg-white rounded-[14px] border border-border p-4 active:scale-[.98] transition-transform">
      <div className="text-2xl mb-1.5">{icon}</div>
      <div className="font-semibold text-sm text-ink">{title}</div>
      <div className="text-xs text-muted">{subtitle}</div>
    </Link>
  );
}

function timeAgo(d) {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m`;
  if (s < 86400) return `${Math.floor(s/3600)}h`;
  return `${Math.floor(s/86400)}d`;
}
