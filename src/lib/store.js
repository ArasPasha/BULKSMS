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
  firstSendAt: null,           // ms since epoch — set on first successful send; drives warmup tier
  autoAppendStop: true,         // append "Reply STOP to opt out." to first thread message
  enforceQuietHours: true,      // per-recipient timezone gate on send
  enforceDailyCap: true,        // block sends past warmup-tier cap
  canaryNumbers: [],           // [{ phone, carrier }]
  dailyCapOverride: null,      // set to override the auto-calculated tier cap (advanced)
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
    const contact = {
      id,
      createdAt: Date.now(),
      optedOut: false,
      tags: [],
      consentSource: 'unknown',
      consentDate: null,
      threadStarted: false,
      ...data,
    };
    this.contacts.set(id, contact);
    await stores.contacts.setItem(id, omitId(contact));
    this.notify();
    return contact;
  }

  // Look up a contact by E.164 phone (used by send pipeline to track threads/consent)
  findContactByPhone(phone) {
    for (const c of this.contacts.values()) {
      if (c.phone === phone) return c;
    }
    return null;
  }

  // Mark the thread as started so subsequent messages don't re-append STOP disclosure
  async markThreadStarted(phone) {
    const c = this.findContactByPhone(phone);
    if (!c || c.threadStarted) return;
    const next = { ...c, threadStarted: true };
    this.contacts.set(c.id, next);
    await stores.contacts.setItem(c.id, omitId(next));
    this.notify();
  }

  // Set firstSendAt if not already set — called after first successful send
  async markFirstSendIfNeeded() {
    if (this.settings.firstSendAt) return;
    this.settings = { ...this.settings, firstSendAt: Date.now() };
    await stores.meta.setItem('settings', this.settings);
    this.notify();
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
    const consentSource = opts.consentSource || 'unknown';
    const consentDate = consentSource === 'unknown' ? null : now;
    for (const row of toWrite) {
      const id = uid();
      const contact = {
        id,
        name: row.name || '',
        phone: row.phone,
        tags: Array.isArray(row.tags) ? row.tags : [],
        optedOut: false,
        consentSource,
        consentDate,
        threadStarted: false,
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

  // ---------- Backup / Restore ----------
  exportAll() {
    return {
      version: 1,
      exportedAt: Date.now(),
      app: 'sms-sender',
      settings: this.settings,
      contacts: Array.from(this.contacts.values()),
      messages: Array.from(this.messages.values()),
      optouts: Array.from(this.optouts.values()),
    };
  }

  async importAll(data, { mode = 'merge' } = {}) {
    if (!data || typeof data !== 'object') throw new Error('Invalid backup file');
    if (data.app && data.app !== 'sms-sender') throw new Error('Backup is from a different app');

    const counts = { contacts: 0, messages: 0, optouts: 0, skipped: 0 };

    if (mode === 'replace') {
      this.contacts.clear();
      this.messages.clear();
      this.optouts.clear();
      await stores.contacts.clear();
      await stores.messages.clear();
      await stores.optouts.clear();
    }

    // Settings — always replace (last-write-wins)
    if (data.settings && typeof data.settings === 'object') {
      this.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      await stores.meta.setItem('settings', this.settings);
    }

    // Contacts (dedupe on phone in merge mode)
    if (Array.isArray(data.contacts)) {
      const existingPhones = mode === 'merge'
        ? new Set(Array.from(this.contacts.values()).map(c => c.phone))
        : new Set();
      for (const c of data.contacts) {
        if (!c.phone) { counts.skipped++; continue; }
        if (mode === 'merge' && existingPhones.has(c.phone)) { counts.skipped++; continue; }
        const id = c.id || uid();
        const contact = { ...c, id };
        this.contacts.set(id, contact);
        await stores.contacts.setItem(id, omitId(contact));
        counts.contacts++;
      }
    }

    // Messages (dedupe on id in merge mode)
    if (Array.isArray(data.messages)) {
      for (const m of data.messages) {
        const id = m.id || uid();
        if (mode === 'merge' && this.messages.has(id)) { counts.skipped++; continue; }
        const msg = { ...m, id };
        this.messages.set(id, msg);
        await stores.messages.setItem(id, omitId(msg));
        counts.messages++;
      }
    }

    // Opt-outs (keyed on phone)
    if (Array.isArray(data.optouts)) {
      for (const o of data.optouts) {
        if (!o.phone) { counts.skipped++; continue; }
        if (mode === 'merge' && this.optouts.has(o.phone)) { counts.skipped++; continue; }
        const entry = { phone: o.phone, optedOutAt: o.optedOutAt || Date.now() };
        this.optouts.set(o.phone, { id: o.phone, ...entry });
        await stores.optouts.setItem(o.phone, entry);
        counts.optouts++;
      }
    }

    this.notify();
    return counts;
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
