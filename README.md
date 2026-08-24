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

## Sharing between computers

The data lives only in this browser on this machine, so to move it you have to
export/import:

1. On the source computer: **Settings → Backup & sync → Export all data**.
   Downloads a `sms-sender-backup-YYYY-MM-DD.json` file with every contact,
   message, opt-out, and your gateway settings.
2. Copy the JSON file to the other computer (email it to yourself, USB,
   Dropbox — anything).
3. On the destination: clone the repo if you haven't (`git clone
   https://github.com/ArasPasha/BULKSMS.git && cd BULKSMS && npm install &&
   npm run dev`), open <http://localhost:5173>, **Settings → Import from backup
   file**, pick the JSON.

You'll be asked **Merge** vs **Replace**:

- **Merge** — adds contacts/messages from the backup that aren't already
  there; keeps your current data. Settings are always overwritten (the backup
  wins).
- **Replace** — wipes everything first, then loads the backup. Use this when
  the second computer should be an exact copy.

Run the export periodically and you've got a backup. There's no cloud sync —
if you want updates flowing both ways automatically, that needs a backend
(swap `src/lib/store.js` for a Firestore/Supabase-backed one).

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

## Compliance guardrails (built in)

The app automatically enforces the rules that keep your number alive and keep
you out of TCPA-suit territory. All can be toggled off in **Settings →
Compliance guardrails** — but the defaults are the safe ones.

### 1. Warmup-tier daily cap

Auto-tracks the day of your first successful send. Blocks further sends once
you hit that tier's daily ceiling:

| Days of use | Daily cap | Why |
| ----------- | --------- | --- |
| 1–3         | 50        | Warmup — carriers score new patterns |
| 4–7         | 100       | Ramp — still building reputation |
| 8–14        | 250       | Content filtering starts here without warmup |
| 15–30       | 500       | Warning zone — account-level flags possible |
| 30+         | 1,000     | Hard ceiling — above this = suspension within days |

Dashboard shows a live progress bar with your current tier and time to the
next tier. You can override the cap in Settings if you know your number's
reputation is established.

### 2. Auto-appended STOP disclosure

Every first message to a new contact automatically gets `Reply STOP to opt
out.` appended if you didn't include it. This is legally mandatory. Once
you've messaged that contact once, subsequent messages don't get the
disclosure again (marked per-contact).

### 3. Fuzzy opt-out detection

Inbound reply parser recognizes the literal keywords (STOP, UNSUBSCRIBE,
CANCEL, END, QUIT, REMOVE) *plus* fuzzy phrases per the April 2025 FCC
revocation rule: `stop texting me`, `remove me`, `please stop`, `don't text
me`, `take me off`, etc. Auto-adds them to the opt-out list.

### 4. Per-recipient timezone-aware quiet hours

Federal TCPA: 8am–9pm recipient local time. **10 states have $500–$1,500/msg
private-right-of-action laws with an 8pm cutoff:** FL, OK, WA, AL, CT, LA,
MD, MA, MS, WY. The app maps every recipient's US area code → state → IANA
timezone and blocks (with an explicit confirm dialog listing violators) any
send outside their local window.

### 5. Message content linter

Live warnings under the compose textarea. **Hard blocks:**
- Public URL shorteners (bit.ly, tinyurl, t.co, goo.gl, ow.ly, is.gd,
  buff.ly, cutt.ly, rebrand.ly, and 12 others) — #1 carrier filter trigger
- SHAFT-adjacent content: cash advance, payday loan, guaranteed cash,
  restricted pharma, cannabis promotions, gambling, crypto pitches
- Guaranteed-return claims
- >50% uppercase

**Soft warnings:**
- Soft trigger words: "loan", "cash", "guaranteed", "free"
- 30–50% uppercase
- Multiple `!!!` or `???`
- Bare phone number with no calling verb (callback-scam pattern)

### 6. Per-contact consent tracking

Every contact has a `consentSource` field. On CSV import you're required to
attest which source applies to the whole batch. Contact cards show a colored
consent badge; broadcasts show a running consent-risk audit so you know
exactly how much TCPA exposure a batch carries.

Sources ranked by risk:
- **Low risk**: web form, verbal consent (logged), business card / event,
  existing customer, they-texted-me-first
- **Medium risk**: referral
- **High risk**: cold prospect, unknown / legacy

### 7. What we don't do (but might later)

- **Canary delivery tests** — auto-sending a test message to numbers you own
  on T-Mobile, Verizon, AT&T at the start of each batch, so you can detect
  silent filtering. Manual for now.
- **Reply-rate / opt-out-rate monitoring** — auto-halt if opt-out rate goes
  above 3% in any 24-hour window. Manual for now.
- **Inbound webhook** — the phone gateway can push received messages to a
  URL, but this app runs pure client-side so there's no server to receive
  them. Manual replies get logged via `recordInboundReply(...)` in the JS
  console for now.

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
