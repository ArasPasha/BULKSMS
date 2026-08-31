import localforage from 'localforage';

const DB = 'sms-sender';

const stores = {
  contacts:  localforage.createInstance({ name: DB, storeName: 'contacts' }),
  messages:  localforage.createInstance({ name: DB, storeName: 'messages' }),
  optouts:   localforage.createInstance({ name: DB, storeName: 'optouts' }),
  templates: localforage.createInstance({ name: DB, storeName: 'templates' }),
  autoreply: localforage.createInstance({ name: DB, storeName: 'autoreply' }),
  meta:      localforage.createInstance({ name: DB, storeName: 'meta' }),
};

const DEFAULT_SETTINGS = {
  gatewayUrl: '',
  gatewayUser: '',
  gatewayPass: '',
  senderName: '',   // Your name — used to replace [Sender] in template bodies
  optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
  sendThrottleMs: 30_000,  // 30s between sends → ~2/min → realistic human pace; lower if you want to move faster
  respectQuietHours: true,
  // Strict send window (in recipient local time). The app also enforces the
  // legal minimums on top of this (federal 8am-9pm, strict states 8am-8pm) —
  // whichever is stricter wins.
  sendStartHour: 8,    // federal TCPA legal minimum (recipient local)
  sendEndHour: 21,     // federal TCPA legal max — app auto-tightens to 8pm for strict states per recipient
  // Sender-clock guardrail: never send outside YOUR local time, regardless
  // of recipient. Belt and suspenders for anyone doing nationwide outreach
  // who only wants to work certain hours. Stored as minutes since midnight
  // for minute-level precision (so you can start at 11:05, not just 11:00 —
  // helps avoid the "exactly on the hour" bot pattern).
  senderWindowEnabled: true,
  senderStartMinute: 11 * 60 + 5,  // 11:05 AM
  senderEndMinute: 18 * 60 + 50,   // 6:50 PM
  firstSendAt: null,           // ms since epoch — set on first successful send; drives warmup tier
  autoAppendStop: true,         // append "Reply STOP to opt out." to first thread message
  enforceQuietHours: true,      // per-recipient timezone gate on send
  enforceDailyCap: true,        // block sends past warmup-tier cap
  canaryNumbers: [],           // [{ phone, carrier }]
  dailyCapOverride: null,      // set to override the auto-calculated tier cap (advanced)
  // Inbox polling + auto-reply
  pollingEnabled: true,
  pollingIntervalMs: 20_000,
  autoReplyEnabled: true,
  autoReplyCooldownMs: 5 * 60_000, // 5 minutes — quick enough to feel responsive, long enough to avoid loops
  // Generic fallback — sent when no rule matches (before AI, if AI enabled)
  genericAutoReplyEnabled: true,
  genericAutoReplyTemplateId: null, // set on seed to the "Generic fallback" template
  // AI (Anthropic) settings — API key seeds from .env.local
  aiReplyEnabled: false,        // off by default; user opts in
  aiReplyModel: 'claude-haiku-4-5-20251001',
  aiReplySenderName: '',
  aiReplyCompanyName: 'The Broker Shop',
  aiReplySystemPrompt: '',      // set on first-launch seed if empty
};

class Store {
  constructor() {
    this.contacts = new Map();
    this.messages = new Map();
    this.optouts = new Map();
    this.templates = new Map();
    this.autoreply = new Map();
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
    await stores.templates.iterate((v, k) => { this.templates.set(k, { id: k, ...v }); });
    await stores.autoreply.iterate((v, k) => { this.autoreply.set(k, { id: k, ...v }); });
    const saved = await stores.meta.getItem('settings');
    if (saved) this.settings = { ...DEFAULT_SETTINGS, ...saved };

    // Seed gateway credentials from .env.local on first launch so the app
    // works out of the box without hand-entering them. Only fills fields
    // that are still empty — user-saved values always win.
    const envUrl = import.meta.env.VITE_DEFAULT_GATEWAY_URL;
    const envUser = import.meta.env.VITE_DEFAULT_GATEWAY_USER;
    const envPass = import.meta.env.VITE_DEFAULT_GATEWAY_PASS;
    let seeded = false;
    if (envUrl && !this.settings.gatewayUrl) { this.settings.gatewayUrl = envUrl; seeded = true; }
    if (envUser && !this.settings.gatewayUser) { this.settings.gatewayUser = envUser; seeded = true; }
    if (envPass && !this.settings.gatewayPass) { this.settings.gatewayPass = envPass; seeded = true; }
    if (seeded) await stores.meta.setItem('settings', this.settings);

    // Seed default templates + auto-reply rules once, if empty.
    if (this.templates.size === 0) {
      await this._seedDefaultTemplates();
    }

    this.loaded = true;
    this.notify();
  }

  async _seedDefaultTemplates() {
    const seeds = [
      // First-touch cold variants
      { name: 'Cold — deposits+choice',    body: '{{name}}, [Sender] w/ Broker Shop. Approval on deposits, not credit. You pick your rate + offer, $5K-$2M in 24 hrs. Reply Y.',            tags: ['cold', 'first-touch'] },
      { name: 'Cold — curiosity opener',   body: '{{name}}, [Sender] here. Ever pick your own rate on a funding offer? Broker Shop approves on deposits, not FICO. Reply Y.',              tags: ['cold', 'first-touch'] },
      { name: 'Cold — renewal angle',      body: '{{name}}, [Sender] @ Broker Shop. Renewal soon? Deposits-based approval, YOU pick rate + offer. Up to $2M in 24 hrs. Reply Y.',           tags: ['cold', 'first-touch'] },
      { name: 'Cold — consolidation',      body: '{{name}}, [Sender] w/ Broker Shop. Stacked positions eating revenue? We consolidate — you pick your rate. Reply Y.',                     tags: ['cold', 'first-touch'] },
      { name: 'Cold — choice-first',       body: '{{name}}, [Sender] here. Most brokers dictate. Broker Shop lets YOU pick rate + offer, approval on deposits. Reply Y.',                  tags: ['cold', 'first-touch'] },

      // Reply-to-YES follow-ups (P2P convo, link OK)
      { name: 'Reply Y — qualifier',       body: 'Great. Send me: 1) business name, 2) rough monthly deposits, 3) target amount. I\'ll come back with real numbers same day.',              tags: ['follow-up'] },
      { name: 'Reply Y — direct to app',   body: 'Nice. 2-min pre-qual, zero credit hit → thebrokershopinc.com/apply. I\'ll call you as soon as it hits.',                                  tags: ['follow-up'] },
      { name: 'Reply Y — combo',           body: 'Great — 2 min → thebrokershopinc.com/apply. Zero credit hit, and remember you pick your rate + offer. Calling as soon as it comes through.', tags: ['follow-up'] },

      // Objection handlers
      { name: 'Obj — what rate?',          body: 'That\'s the point — you pick it. Depends on the offer you want. Fastest way: 2 min at thebrokershopinc.com/apply, zero credit hit, I\'ll walk options.', tags: ['objection'] },
      { name: 'Obj — already stacked',     body: 'Understood. Broker Shop does consolidations on stacks — one payment, you pick the rate. Worth seeing options? Zero credit hit.',           tags: ['objection'] },
      { name: 'Obj — not interested',      body: 'All good. If it ever changes, this number stays with me. Have a good one.',                                                              tags: ['objection'] },
      { name: 'Obj — who is this?',        body: '[Sender] with The Broker Shop — B2B funding for restaurants/SMBs. Landed on our list; happy to remove you or send info. Which?',        tags: ['objection'] },
      { name: 'Obj — send info',           body: '2-min pre-qual → thebrokershopinc.com/apply. Zero credit hit. Once it comes through I\'ll ping you same day.',                             tags: ['objection'] },
      { name: 'Obj — rates too high',      body: 'That\'s exactly the reason for the pick-your-rate model. What rate/term are you targeting?',                                              tags: ['objection'] },
      { name: 'Obj — bad credit',          body: 'Approval on deposits, not FICO. If you\'re running the business, you likely qualify. 2 min → thebrokershopinc.com/apply.',                 tags: ['objection'] },
      { name: 'Obj — how much can I get?', body: '$5K to $2M, depends on your monthly deposits. Zero credit hit to see the number: thebrokershopinc.com/apply (2 min).',                    tags: ['objection'] },

      // Generic fallback — sent when NO rule matches the inbound reply.
      { name: 'Generic fallback',          body: 'Hey {{name}}, thanks for the reply. Fastest way to get real numbers: 2-min pre-qual at thebrokershopinc.com/apply, zero credit hit. Or reply w/ monthly deposits + amount + I\'ll come back to you.', tags: ['fallback'] },
    ];
    let genericFallbackId = null;
    for (const s of seeds) {
      const id = uid();
      const t = { id, ...s, useCount: 0, createdAt: Date.now() };
      this.templates.set(id, t);
      await stores.templates.setItem(id, omitId(t));
      if (s.name === 'Generic fallback') genericFallbackId = id;
    }
    // Wire the generic fallback into settings if not already set
    if (genericFallbackId && !this.settings.genericAutoReplyTemplateId) {
      this.settings = { ...this.settings, genericAutoReplyTemplateId: genericFallbackId };
      await stores.meta.setItem('settings', this.settings);
    }

    // Also seed auto-reply rules that map inbound patterns → templates
    // by looking them up by name (stable enough for a fresh seed).
    const nameToId = new Map();
    for (const [id, t] of this.templates) nameToId.set(t.name, id);
    const rules = [
      { name: 'Positive intent (Y/yes)',           pattern: '\\b(y|yes|sure|ok|okay|send|interested|tell me more)\\b', templateId: nameToId.get('Reply Y — combo'),        priority: 10 },
      { name: 'What rate / interest / cost',        pattern: '\\b(rate|apr|interest|cost|how much (does|is|will)|expensive|cheap)\\b', templateId: nameToId.get('Obj — what rate?'),   priority: 20 },
      { name: 'How much can I get',                 pattern: '\\b(how much (can|could|would)|amount|max|limit)\\b',    templateId: nameToId.get('Obj — how much can I get?'), priority: 25 },
      { name: 'Already stacked / positions',        pattern: '\\b(stack|position|advance|already (have|got|took))\\b', templateId: nameToId.get('Obj — already stacked'),    priority: 30 },
      { name: 'Not interested / no thanks',         pattern: '\\b(not interested|no thanks|no thank|pass|nope|not now)\\b', templateId: nameToId.get('Obj — not interested'), priority: 40 },
      { name: 'Who is this',                        pattern: '\\b(who (is|are) (this|you)|why (are you|is this)|what company)\\b', templateId: nameToId.get('Obj — who is this?'), priority: 50 },
      { name: 'Send info / more info',              pattern: '\\b(send (me )?(info|more|details)|more info|details)\\b', templateId: nameToId.get('Obj — send info'),         priority: 60 },
      { name: 'Bad credit / credit score',          pattern: '\\b(credit (score|is bad|bad)|fico|bad credit)\\b',      templateId: nameToId.get('Obj — bad credit'),         priority: 70 },
    ];
    for (const r of rules) {
      if (!r.templateId) continue;
      const id = uid();
      const rule = { id, active: true, createdAt: Date.now(), ...r };
      this.autoreply.set(id, rule);
      await stores.autoreply.setItem(id, omitId(rule));
    }
  }

  // ---------- Settings ----------
  async updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    await stores.meta.setItem('settings', this.settings);
    this.notify();
  }

  // ---------- Contacts ----------
  contactsList() { return Array.from(this.contacts.values()); }

  async markConversationRead(contactId) {
    const c = this.contacts.get(contactId);
    if (!c) return;
    const next = { ...c, lastReadAt: Date.now() };
    this.contacts.set(contactId, next);
    await stores.contacts.setItem(contactId, omitId(next));
    this.notify();
  }

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
      // Lead-tracking additions
      status: 'new',           // new | contacted | replied | interested | question | objection | not-interested | opted-out | funded | dead
      notes: '',               // freeform per-contact notes
      lastInboundAt: null,     // ms; used for Conversations sort
      lastInboundBody: '',
      lastOutboundAt: null,
      lastAutoReplyAt: null,   // cooldown tracker
      autoReplyMuted: false,   // set true after the first successful auto-reply — "one and done"
      autoReplyMutedAt: null,  // when muting happened
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

  async setContactStatus(contactId, status, extras = {}) {
    const c = this.contacts.get(contactId);
    if (!c) return null;
    const next = { ...c, status, ...extras };
    this.contacts.set(contactId, next);
    await stores.contacts.setItem(contactId, omitId(next));
    this.notify();
    return next;
  }

  async setContactNotes(contactId, notes) {
    const c = this.contacts.get(contactId);
    if (!c) return null;
    const next = { ...c, notes };
    this.contacts.set(contactId, next);
    await stores.contacts.setItem(contactId, omitId(next));
    this.notify();
    return next;
  }

  async markOutbound(phone) {
    const c = this.findContactByPhone(phone);
    if (!c) return;
    const patch = {
      lastOutboundAt: Date.now(),
      status: c.status === 'new' ? 'contacted' : c.status,
    };
    const next = { ...c, ...patch };
    this.contacts.set(c.id, next);
    await stores.contacts.setItem(c.id, omitId(next));
    this.notify();
  }

  async markInbound(phone, body) {
    const c = this.findContactByPhone(phone);
    if (!c) return null;
    const patch = {
      lastInboundAt: Date.now(),
      lastInboundBody: body,
      status: c.status === 'contacted' || c.status === 'new' ? 'replied' : c.status,
    };
    const next = { ...c, ...patch };
    this.contacts.set(c.id, next);
    await stores.contacts.setItem(c.id, omitId(next));
    this.notify();
    return next;
  }

  async recordAutoReplyAt(phone) {
    const c = this.findContactByPhone(phone);
    if (!c) return;
    // One and done: also flip the mute flag so the engine never auto-replies
    // to this contact again. User takes over manually from here.
    const next = {
      ...c,
      lastAutoReplyAt: Date.now(),
      autoReplyMuted: true,
      autoReplyMutedAt: c.autoReplyMutedAt || Date.now(),
    };
    this.contacts.set(c.id, next);
    await stores.contacts.setItem(c.id, omitId(next));
    this.notify();
  }

  async setAutoReplyMuted(contactId, muted) {
    const c = this.contacts.get(contactId);
    if (!c) return null;
    const next = {
      ...c,
      autoReplyMuted: !!muted,
      autoReplyMutedAt: muted ? Date.now() : null,
      muteNoticeLogged: muted ? c.muteNoticeLogged : false, // reset when unmuting
    };
    this.contacts.set(contactId, next);
    await stores.contacts.setItem(contactId, omitId(next));
    this.notify();
    return next;
  }

  async setMuteNoticeLogged(contactId) {
    const c = this.contacts.get(contactId);
    if (!c || c.muteNoticeLogged) return;
    const next = { ...c, muteNoticeLogged: true };
    this.contacts.set(contactId, next);
    await stores.contacts.setItem(contactId, omitId(next));
    this.notify();
  }

  // ---------- Templates ----------
  templatesList() {
    return Array.from(this.templates?.values() || []).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async addTemplate({ name, body, tags = [] }) {
    if (!this.templates) this.templates = new Map();
    const id = uid();
    const t = { id, name: name?.trim() || '', body: body || '', tags, useCount: 0, createdAt: Date.now() };
    this.templates.set(id, t);
    await stores.templates.setItem(id, omitId(t));
    this.notify();
    return t;
  }

  async updateTemplate(id, patch) {
    const cur = this.templates?.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.templates.set(id, next);
    await stores.templates.setItem(id, omitId(next));
    this.notify();
    return next;
  }

  async deleteTemplate(id) {
    this.templates?.delete(id);
    await stores.templates.removeItem(id);
    this.notify();
  }

  async incrementTemplateUse(id) {
    const cur = this.templates?.get(id);
    if (!cur) return;
    cur.useCount = (cur.useCount || 0) + 1;
    await stores.templates.setItem(id, omitId(cur));
    this.notify();
  }

  // ---------- Auto-reply rules ----------
  autoReplyList() {
    return Array.from(this.autoreply?.values() || []).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
  }

  async addAutoReply({ name, pattern, templateId, active = true, priority = 100 }) {
    if (!this.autoreply) this.autoreply = new Map();
    const id = uid();
    const r = { id, name: name?.trim() || '', pattern, templateId, active, priority, createdAt: Date.now() };
    this.autoreply.set(id, r);
    await stores.autoreply.setItem(id, omitId(r));
    this.notify();
    return r;
  }

  async updateAutoReply(id, patch) {
    const cur = this.autoreply?.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    this.autoreply.set(id, next);
    await stores.autoreply.setItem(id, omitId(next));
    this.notify();
    return next;
  }

  async deleteAutoReply(id) {
    this.autoreply?.delete(id);
    await stores.autoreply.removeItem(id);
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

  async deleteUnnamedContacts() {
    let removed = 0;
    for (const [id, c] of Array.from(this.contacts.entries())) {
      if (!c.name || !c.name.trim()) {
        this.contacts.delete(id);
        await stores.contacts.removeItem(id);
        removed++;
      }
    }
    if (removed) this.notify();
    return removed;
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
    // Also filter against the opt-out list — never re-add someone who said STOP,
    // even if you delete their contact and re-import the CSV weeks later.
    const optedOutPhones = new Set(Array.from(this.optouts.keys()));

    const afterDupeCheck = cleaned.filter(r => !existing.has(r.phone));
    const dupesInDb = cleaned.length - afterDupeCheck.length;

    const toWrite = afterDupeCheck.filter(r => !optedOutPhones.has(r.phone));
    const optedOutBlocked = afterDupeCheck.length - toWrite.length;

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
    return {
      added,
      skipped: invalid + dupesInFile + dupesInDb + optedOutBlocked,
      invalid, dupesInFile, dupesInDb, optedOutBlocked,
      total: rows.length,
    };
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

  async clearSystemMessages() {
    let removed = 0;
    for (const [id, m] of Array.from(this.messages.entries())) {
      if (m.direction === 'system') {
        this.messages.delete(id);
        await stores.messages.removeItem(id);
        removed++;
      }
    }
    if (removed) this.notify();
    return removed;
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
