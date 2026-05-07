import localforage from 'localforage';

const DB = 'sms-sender';

const stores = {
  contacts: localforage.createInstance({ name: DB, storeName: 'contacts' }),
  messages: localforage.createInstance({ name: DB, storeName: 'messages' }),
  optouts: localforage.createInstance({ name: DB, storeName: 'optouts' }),
  meta:     localforage.createInstance({ name: DB, storeName: 'meta' }),
};

const DEFAULT_SETTINGS = {
  gatewayUrl: '',
  gatewayUser: '',
  gatewayPass: '',
  optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
  sendThrottleMs: 1500,
  respectQuietHours: true,
};

class Store {
  constructor() {
    this.contacts = new Map();
    this.messages = new Map();
    this.optouts = new Map();
    this.settings = { ...DEFAULT_SETTINGS };
    this.subscribers = new Set();
    this.loaded = false;
  }

  subscribe(cb) {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  notify() {
    this.subscribers.forEach(cb => cb());
  }

  async load() {
    if (this.loaded) return;
    await stores.contacts.iterate((v, k) => { this.contacts.set(k, { id: k, ...v }); });
    await stores.messages.iterate((v, k) => { this.messages.set(k, { id: k, ...v }); });
    await stores.optouts.iterate((v, k) => { this.optouts.set(k, { id: k, ...v }); });
    const saved = await stores.meta.getItem('settings');
    if (saved) this.settings = { ...DEFAULT_SETTINGS, ...saved };
    this.loaded = true;
    this.notify();
  }

  // ---------- Settings ----------
  async updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    await stores.meta.setItem('settings', this.settings);
    this.notify();
  }

  // ---------- Contacts ----------
  contactsList() { return Array.from(this.contacts.values()); }

  async addContact(data) {
    const id = uid();
    const contact = { id, createdAt: Date.now(), optedOut: false, tags: [], ...data };
    this.contacts.set(id, contact);
    await stores.contacts.setItem(id, omitId(contact));
    this.notify();
    return contact;
  }

  async updateContact(id, patch) {
    const cur = this.contacts.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.contacts.set(id, next);
    await stores.contacts.setItem(id, omitId(next));
    this.notify();
    return next;
  }

  async deleteContact(id) {
    this.contacts.delete(id);
    await stores.contacts.removeItem(id);
    this.notify();
  }

  async bulkAddContacts(rows, opts = {}) {
    const { onProgress, dedupeExisting = true } = opts;
    const cleaned = [];
    const seenInFile = new Set();
    let invalid = 0;
    let dupesInFile = 0;

    for (const row of rows) {
      if (!row.phone || !/^\+\d{10,15}$/.test(row.phone)) { invalid++; continue; }
      if (seenInFile.has(row.phone)) { dupesInFile++; continue; }
      seenInFile.add(row.phone);
      cleaned.push(row);
    }

    let existing = new Set();
    if (dedupeExisting) {
      onProgress?.({ stage: 'checking', done: 0, total: cleaned.length });
      this.contacts.forEach(c => existing.add(c.phone));
    }
    const toWrite = cleaned.filter(r => !existing.has(r.phone));
    const dupesInDb = cleaned.length - toWrite.length;

    let added = 0;
    const now = Date.now();
    for (const row of toWrite) {
      const id = uid();
      const contact = {
        id,
        name: row.name || '',
        phone: row.phone,
        tags: Array.isArray(row.tags) ? row.tags : [],
        optedOut: false,
        createdAt: now + added,
      };
      this.contacts.set(id, contact);
      await stores.contacts.setItem(id, omitId(contact));
      added++;
      if (added % 100 === 0) onProgress?.({ stage: 'writing', done: added, total: toWrite.length });
    }
    onProgress?.({ stage: 'writing', done: added, total: toWrite.length });
    this.notify();
    return { added, skipped: invalid + dupesInFile + dupesInDb, invalid, dupesInFile, dupesInDb, total: rows.length };
  }

  // ---------- Messages ----------
  messagesList(max = Infinity) {
    const sorted = Array.from(this.messages.values())
      .sort((a, b) => b.createdAt - a.createdAt);
    return max === Infinity ? sorted : sorted.slice(0, max);
  }

  async logMessage(data) {
    const id = uid();
    const msg = { id, createdAt: Date.now(), ...data };
    this.messages.set(id, msg);
    await stores.messages.setItem(id, omitId(msg));
    this.notify();
    return msg;
  }

  async clearMessages() {
    this.messages.clear();
    await stores.messages.clear();
    this.notify();
  }

  // ---------- Opt-outs ----------
  optOutsList() {
    return Array.from(this.optouts.values())
      .sort((a, b) => (b.optedOutAt || 0) - (a.optedOutAt || 0));
  }

  isOptedOut(phone) {
    return this.optouts.has(phone);
  }

  async setOptOut(phone, optedOut = true) {
    if (optedOut) {
      const entry = { phone, optedOutAt: Date.now() };
      this.optouts.set(phone, { id: phone, ...entry });
      await stores.optouts.setItem(phone, entry);
    } else {
      this.optouts.delete(phone);
      await stores.optouts.removeItem(phone);
    }
    // Sync the contact's optedOut flag
    for (const [id, c] of this.contacts) {
      if (c.phone === phone) {
        const next = { ...c, optedOut };
        this.contacts.set(id, next);
        await stores.contacts.setItem(id, omitId(next));
      }
    }
    this.notify();
  }
}

function uid() {
  return 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function omitId(obj) {
  // eslint-disable-next-line no-unused-vars
  const { id, ...rest } = obj;
  return rest;
}

export const store = new Store();
