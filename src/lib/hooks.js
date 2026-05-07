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
