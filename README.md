# SMS Sender

Send SMS from your computer through your own Android phone. Like MightyText /
Bulk Texter Pro, but self-hosted, free, and private — no Twilio, no carrier
registration, no per-message fees, **no signup, no cloud database**.

All your contacts, messages, and settings live only in your browser's
IndexedDB on this machine. The phone is the actual sender, so messages come
from your real number.

## Quickstart (3 steps)

### 1. Run the web app

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. That's it — no Firebase, no env file, no signup.

### 2. Install SMS Gateway on your Android phone

Download [SMS Gateway for Android][gw] from GitHub Releases or F-Droid:

[gw]: https://github.com/capcom6/android-sms-gateway

1. Install the APK and grant SMS permissions
2. Switch to **Local Server** mode and tap **Start**
3. Note the URL (e.g. `http://192.168.1.42:8080`), username, password

### 3. Connect

In the web app, go to **Settings** → paste the gateway URL/user/pass → **Test
connection**. Phone and computer must be on the same WiFi.

## Features

- **Compose** — single-recipient or broadcast with `{{name}}` personalization
- **Contacts** — manual add, edit, delete, CSV import (any size), tag-based segments
- **History** — every sent / failed / received message logged, filtered, grouped by day
- **Opt-outs** — auto-detected from STOP/UNSUBSCRIBE/etc. keywords, tracked
- **Throttling** — configurable delay between bulk sends
- **Quiet hours** — block sends 9pm–8am by default (toggleable)
- **Tiered warnings** at 50 / 200 / 1000+ recipients
- **Wipe-all-data** button in Settings

## How storage works

Everything is in **IndexedDB** under the origin `localhost:5173`:

- `sms-sender/contacts` — every contact
- `sms-sender/messages` — every sent + received message
- `sms-sender/optouts` — opted-out phone numbers
- `sms-sender/meta` — gateway URL, throttle, keywords, etc.

**Implications:**

- Switching browsers = empty app (data stays in the browser you used)
- Clearing site data = everything gone
- One person per browser profile (no multi-user)
- No backups by default — to back up, export from devtools (Application →
  IndexedDB) or just copy the whole browser profile folder

If you want cloud sync between devices later, swap the `Store` class in
`src/lib/store.js` for a Firestore-backed one — every page only talks through
the store, so the rest of the app doesn't change.

## Architecture

```
Browser (this app, localhost:5173)
  ├── IndexedDB           (contacts, messages, opt-outs, settings)
  └── HTTP fetch ──▶ Android phone (SMS Gateway, http://192.168.x.x)
                              │
                              ▼
                        Cellular network ──▶ Recipient
```

No backend, no serverless functions, no cloud database. The browser POSTs
directly to your phone's local IP.

## Deliverability rules of thumb

Personal phone numbers can still get throttled or suspended for spammy
behavior:

- Stay under **30 messages per hour** per number
- Throttle: **1500 ms between sends** is the default — don't go lower
- Always honor **STOP / opt-out** requests (the app does this automatically)
- Avoid links, ALL CAPS, and aggressive promotional language
- For thousands of recipients, switch to a registered A2P provider (Twilio etc.)

## Scale & big lists (e.g. 20k contacts)

Imports of any size are supported (writes happen 100 contacts at a time so the
UI stays responsive). Pages paginate at 500 with "Load more".

**But: do not actually broadcast to 20k from one personal phone.** Math:

| Recipients | Time @ 1500 ms throttle | Carrier verdict |
| ---------- | ----------------------- | --------------- |
| 50         | ~75 s                   | Safe            |
| 200        | ~5 min                  | Watched         |
| 1 000      | ~25 min                 | Likely flagged  |
| 20 000     | ~8.3 hours              | Number suspended within minutes |

The Compose page shows escalating warnings + ETAs at 50 / 200 / 1000
recipients.

## CSV import format

Drop a CSV with at least a phone column. Recognized headers (case-insensitive):

| Field | Accepted column names                                        |
| ----- | ------------------------------------------------------------ |
| Name  | `name`, `full name`, `first name`, `contact`, `firstname`, `last name` (combined) |
| Phone | `phone`, `phone number`, `mobile`, `cell`, `number`, `tel`   |
| Tags  | `tags`, `tag`, `segment`, `group`, `list` (comma/semicolon-separated) |

Numbers are normalized to **E.164** (`+15551234567`). Duplicates inside the
file and against your existing contacts are skipped — the post-import card
shows the breakdown.

## Tech stack

- React 19 + Vite 8
- Tailwind CSS 3
- React Router 7
- localforage (IndexedDB wrapper)
- PapaParse (CSV)
