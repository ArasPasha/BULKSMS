import { useEffect, useReducer, useState } from 'react';
import { store } from './store';

function useStoreVersion() {
  const [, force] = useReducer(x => x + 1, 0);
  useEffect(() => store.subscribe(force), []);
}

export function useStoreLoaded() {
  const [loaded, setLoaded] = useState(store.loaded);
  useEffect(() => {
    if (store.loaded) return;
    let active = true;
    store.load().then(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);
  return loaded;
}

export function useContacts() {
  useStoreVersion();
  return store.contactsList();
}

export function useMessages(max) {
  useStoreVersion();
  return store.messagesList(max);
}

export function useOptOuts() {
  useStoreVersion();
  return store.optOutsList();
}

export function useSettings() {
  useStoreVersion();
  return store.settings;
}

export function useTemplates() {
  useStoreVersion();
  return store.templatesList();
}

export function useAutoReplyRules() {
  useStoreVersion();
  return store.autoReplyList();
}

// Returns contacts sorted for the Conversations list: unread inbound first,
// then most recent activity, then name. Only shows contacts that have ANY
// activity (inbound or outbound) — no need to show the entire contact list
// as "conversations" when most were never texted.
export function useConversations() {
  useStoreVersion();
  const contacts = store.contactsList();
  const active = [];
  for (const c of contacts) {
    const lastInboundAt = c.lastInboundAt || 0;
    const lastOutboundAt = c.lastOutboundAt || 0;
    if (!lastInboundAt && !lastOutboundAt) continue;
    const lastActivity = Math.max(lastInboundAt, lastOutboundAt);
    const hasUnread = lastInboundAt > (c.lastReadAt || 0);
    active.push({ ...c, lastActivity, hasUnread });
  }
  return active.sort((a, b) => {
    if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
    return b.lastActivity - a.lastActivity;
  });
}

// Messages filtered to a single conversation with one phone number.
// Includes 'system' direction (auto-reply skip notes etc.) so the thread
// tells the full story of what happened.
export function useConversation(phone) {
  useStoreVersion();
  if (!phone) return [];
  return Array.from(store.messages.values())
    .filter(m =>
      (m.direction === 'in' && m.from === phone) ||
      (m.direction === 'out' && m.to === phone) ||
      (m.direction === 'system' && m.to === phone)
    )
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
