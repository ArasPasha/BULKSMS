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
// then most recent activity, then name.
export function useConversations() {
  useStoreVersion();
  const contacts = store.contactsList();
  const scored = contacts.map(c => {
    const lastActivity = Math.max(c.lastInboundAt || 0, c.lastOutboundAt || 0, c.createdAt || 0);
    const hasUnread = (c.lastInboundAt || 0) > (c.lastReadAt || 0);
    return { ...c, lastActivity, hasUnread };
  });
  return scored.sort((a, b) => {
    // Unread inbound bubbles to the top
    if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
    return (b.lastActivity || 0) - (a.lastActivity || 0);
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
