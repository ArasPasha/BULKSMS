# SMS Sender

Mobile-first web app for sending SMS from your computer through your own
Android phone. Like MightyText / Bulk Texter Pro, but self-hosted, free, and
private — no Twilio, no carrier registration, no per-message fees.

Your Android phone runs the open-source [SMS Gateway for Android][gw] in local
mode; this web app talks to it directly over your LAN. The phone is the actual
sender, so messages come from your real number.

[gw]: https://github.com/capcom6/android-sms-gateway

## Features

- **Compose** — single-recipient send or broadcast to many with `{{name}}` personalization
- **Contacts** — manual add, edit, delete, CSV import, tag-based segments
- **History** — every sent / failed / received message logged in Firestore, with filters
- **Opt-outs** — auto-detected from STOP/UNSUBSCRIBE/etc. keywords, tracked per-contact
- **Throttling** — configurable delay between bulk sends to keep carrier filters happy
- **Quiet hours** — block sends 9 pm – 8 am by default (toggleable)
- **Live updates** — Firestore subscriptions everywhere, no manual refresh

## Architecture

```
Browser (this app) ──HTTP──▶ Android phone (SMS Gateway)
        │                               │
        ▼                               ▼
   Firestore                      Cellular network
   (contacts,                          │
    messages,                          ▼
    opt-outs)                    Recipient phone
```

No backend, no serverless functions. The browser POSTs directly to the phone's
local IP. Firebase handles auth and persistence.

## Setup

### 1. Install SMS Gateway on your Android phone

1. Get the app from [GitHub Releases][rel] or F-Droid
2. Open the app, grant SMS permissions
3. Switch to **Local Server** mode
4. Note the URL (e.g. `http://192.168.1.42:8080`), username, and password

[rel]: https://github.com/capcom6/android-sms-gateway/releases

### 2. Set up Firebase

1. Create a project at https://console.firebase.google.com
2. Enable **Authentication** (Email/Password + Google)
3. Enable **Firestore Database**
4. Copy your web app config into `.env` (see `.env.example`)

### 3. Run the app

```bash
npm install
npm run dev
```

Open http://localhost:5173, sign up, then go to **Settings** and paste your
phone gateway URL + credentials. Use **Test connection** to verify.

> **Important:** keep your computer and phone on the same WiFi network. Local
> mode is LAN-only. The web app is intended to be run locally
> (`npm run dev`) — deploying to HTTPS will break the HTTP call to the phone
> due to mixed-content rules.

## Deliverability tips

Personal phone numbers can still get throttled or suspended for spammy
behavior. Rules of thumb:

- Stay under **30 messages per hour** per number
- Throttle: **1500 ms between sends** is the default — don't go lower
- Always honor **STOP / opt-out** requests (the app does this automatically)
- Avoid links, ALL CAPS, and aggressive promotional language
- For thousands of recipients, switch to a registered A2P provider (Twilio etc.)

## Scale & big lists (e.g. 20k contacts)

The app handles imports of any size — Firestore writes auto-chunk into 400-row
batches. Page views paginate at 500 with "Load more" so the browser doesn't
melt. Broadcasts can scope by tag, by loaded subset, or by the full eligible
list (uses a single Firestore query, not the paginated cache).

**But: do not actually broadcast to 20k from one personal phone.** Math:

| Recipients | Time @ 1500 ms throttle | Carrier verdict |
| ---------- | ----------------------- | --------------- |
| 50         | ~75 s                   | Safe            |
| 200        | ~5 min                  | Watched         |
| 1 000      | ~25 min                 | Likely flagged  |
| 20 000     | ~8.3 hours              | Number suspended within minutes — carriers will SMS-block you long before the loop finishes |

If you genuinely need to reach 20k people by SMS, you must use a registered
A2P 10DLC provider (Twilio, Telnyx, Bandwidth). Personal-phone gateways are for
1-to-few outreach and small segmented broadcasts.

For huge lists in this app: **split by tag, send 50–100 per day, spread across
several days, monitor your phone for any "Message Blocking" notice from your
carrier.** The Compose page shows escalating warnings + ETAs at 50 / 200 / 1000
recipients to keep you honest.

**Firestore free tier limits to be aware of**: 20 000 writes/day, 50 000
reads/day, 1 GiB storage. A 20k-contact import maxes the daily write quota in
one go — enable Blaze billing or split the import across two days.

## CSV import format

Drop a CSV with a phone column and any of these recognized headers
(case-insensitive — pick whatever your export gave you):

| Field | Accepted column names                                        |
| ----- | ------------------------------------------------------------ |
| Name  | `name`, `full name`, `first name`, `contact`, `firstname`, `last name` (combined) |
| Phone | `phone`, `phone number`, `mobile`, `cell`, `number`, `tel`   |
| Tags  | `tags`, `tag`, `segment`, `group`, `list` (comma/semicolon-separated) |

Example:

```csv
name,phone,tags
Jane Doe,(555) 123-4567,vip;customer
John Smith,5551234568,prospect
+44 7700 900123,uk
```

- Phone numbers are normalized to **E.164** (`+15551234567`)
- Rows missing a phone are dropped silently
- Duplicates inside the file and against your existing contacts are skipped — you'll see a summary breakdown after import
- Imports of any size — Firestore writes are auto-chunked into 400-row batches with live progress

## Tech stack

- React 19 + Vite 8
- Tailwind CSS 3
- React Router 7
- Firebase (Auth + Firestore)
- PapaParse (CSV)
