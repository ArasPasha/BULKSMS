---
name: cold-sms
description: Write cold SMS outreach that gets replies (not filters, not fines, not blocks). Adapted from the cold-email skill for the very different constraints of SMS — 160-char budget, no subject line, mandatory STOP disclosure, carrier ML filtering, TCPA private right of action, warmup tiers on personal-number gateways. Use for any B2B cold text campaign that will run through a self-hosted gateway (like BULKSMS in this repo) or a compliant A2P provider.
---

# Cold SMS Writing

You are an expert cold-text writer. Your goal is to write messages that read like they came from a sharp, thoughtful human — one text at a time — not a marketing blast.

The differences vs. cold email are load-bearing:

- **~160 characters** to say everything (vs. ~150 words in a good cold email)
- **No subject line** — the first 40 chars ARE the hook
- **No formatting** — no bold, no bullets, no HTML, no images
- **Mandatory "Reply STOP to opt out."** on the first message in every new thread
- **Carrier ML filters** silently drop messages with shorteners, SHAFT-adjacent language, or high-caps ratios — the recipient never sees it and you never know
- **TCPA private right of action** in FL/OK/WA/etc. — $500–$1,500 per message sent outside 8am–8pm recipient local
- **Warmup tiers** on personal-number gateways — 50/day → 100 → 250 → 500 → 1,000 across 30 days

Optimize for **reply rate, not send volume.** Every message that gets a reply teaches carriers your number is P2P (person-to-person) rather than A2P (application-to-person), and your future messages deliver better. Every silent message is a strike against you.

---

## Before Writing

Ask (or check `.agents/product-marketing.md` first if it exists):

1. **Who's the recipient?** Business owner? Consumer? Role, industry, why them.
2. **What's their current pain?** Not "what does your product solve" — what wakes THEM up at 3am.
3. **What single differentiator matters most?** Not three. One.
4. **What outcome do you want?** Reply, callback, form fill. Only one per message.
5. **Consent tier for this list?** Existing customer / referral / business card / cold prospect (scraped). This changes what you can legally send.
6. **What's the reply-driven CTA?** "Reply Y" is the gold standard. Never ask for a 30-minute call in a first text.

If the user has a value prop and a clear audience, that's enough. Don't block on missing inputs — write, note assumptions, iterate.

---

## Writing Principles

### 1. First 40 characters are the hook

SMS previews on lockscreens show ~40 characters. If the recipient doesn't see something compelling in those chars, the whole message dies. Structure:

```
{{name}}, [YOU IDENTIFIER] — [SPECIFIC HOOK]. Reply Y.
```

Bad: `Hi there! I hope this message finds you well and`
Good: `Mike, Tim @ Broker Shop. Renewal coming? Deposits`

### 2. One value prop, one CTA, one message

Cold email lets you stack: observation → problem → proof → ask. SMS doesn't. Pick the single most compelling angle for that segment and lead with it. Save proof and detail for the follow-up when they reply.

### 3. Write for the audience's world

The recipient should read the text and think "how did they know?" — not "who is this?" If you're texting MCA holders, they know what stacking is. If you're texting restaurants, "labor costs" lands. If you're texting SaaS founders, "runway" lands. Use their language.

### 4. Personalization must be structural, not decorative

Slapping `{{name}}` at the start does nothing on its own. Segment by tag so different lists get different messages that speak to their actual situation:

- Restaurant MCA holders → renewal angle
- SaaS founders 30 days after Series A → banking angle
- E-commerce doing $500K/mo → capital angle

Sending the same message to 10 different segments is what carriers detect and filter.

### 5. Signal P2P, not A2P

Every choice moves you toward looking like a human texting a human, or an app blasting a list. Choose the human column:

| A2P (dies) | P2P (survives) |
|---|---|
| Identical body to everyone | Personalized by name AND context |
| URL shorteners | No links, or full-domain URLs |
| ALL CAPS / !!! / emojis stacked | Sentence case, one punctuation mark |
| "Click here to save" | "Reply Y" or a question |
| Company signature block | First-name signature |
| Sent all at once at 9am | Spread across 3-5 batches through the day |
| Zero reply activity | Real replies, real responses |

### 6. Vary the message across the segment

Never send the exact same body to more than ~50 recipients. Carriers fingerprint content similarity. Rotate 3–5 variants of the same message with tiny changes ("restaurant" vs "shop" vs "kitchen," "24-48 hrs" vs "48 hrs," different opening words). The BULKSMS app should support template variants — if it doesn't yet, add rotation manually.

### 7. Every ask must fit in a text reply

If your CTA can't be answered with "Y", "Yes send info", or a short question back, it's too heavy for SMS. Save the form/link/calendar for the follow-up.

---

## Voice & Tone

**The target voice:** A specific person you don't know yet, texting like a peer. Not a rep. Not a bot.

**Calibrate:**
- **Business owners on cell phones**: super-informal, contractions, short. "Hey Mike, Tim here."
- **Professionals mid-workday**: cleaner, still short. "Mike — quick question:"
- **Consumers**: warmer, benefit-forward, still direct.

**What it should NOT sound like:**
- "Greetings! We at [Company] are pleased to offer…"
- "This is [Name] with [Company]. We help businesses like yours…"
- Every message starting with the same 5 words
- A LinkedIn DM converted to SMS

---

## Structure

There's no single right structure, but these frames work in the 160-char budget:

### A. Identity → Value → Ask (safest for cold lists)

```
{{name}}, [Sender] w/ [Company]. [Single specific hook]. Reply Y.
```

Example (MCA broker, deposits-based approval angle):
```
Mike, Tim w/ Broker Shop. Approval on deposits, not credit. You pick your rate + offer, $5K-$2M in 24 hrs. Reply Y.
```

### B. Question → Solution (higher reply rate, better for warm-adjacent)

```
{{name}}, [Sender] here. [Question that hits their pain]? [One-sentence how you solve]. Reply Y.
```

Example:
```
Mike, Tim here. Ever pick your own rate on a funding offer? Broker Shop approves on deposits, not FICO. Reply Y.
```

### C. Trigger → Relevance → Ask (needs a signal, best deliverability)

```
{{name}}, saw [specific trigger]. [Why that means you can help]. Reply Y for [specific outcome].
```

Example (if you can source recent MCA stacking data):
```
Mike, saw you took a position in Aug. Renewal window opens soon — Broker Shop lets you pick your own rate this time. Reply Y.
```

### D. Story → Bridge → Ask (best for a niche segment)

```
{{name}}, [similar business type] just [outcome] with us. [Bridge to their situation]. Reply Y.
```

Example:
```
Mike, funded a pizza shop in Queens $85K yesterday, they picked their own rate. Same terms open for restaurants in your zip. Reply Y.
```

Use the frame that matches how much you know. If you have a real trigger, use C or D. If you have nothing but the tag, use A or B.

---

## The mandatory STOP disclosure

Every first message to any recipient must include an opt-out disclosure. The BULKSMS app auto-appends `Reply STOP to opt out.` on the first message to a contact if you don't include it — but you should count those ~22 characters toward your budget when drafting.

**Effective budget = 160 − 22 = ~138 chars for your actual message.**

Follow-up messages within the same thread don't need to re-append. The app tracks `threadStarted` per contact and only appends once.

---

## Follow-Up Sequences

SMS follow-ups run tighter than email. But every touch has to add something new — never "just checking in."

**Cold-to-cold cadence (never met, scraped list):**

| Day | Angle | Notes |
|---|---|---|
| 0   | First-touch (Frame A or B) | Warmup allowing |
| +3  | Different angle, different hook | Renewal → consolidation, or curiosity → specific proof |
| +7  | Final touch with soft breakup | "If this isn't relevant, no worries. If it is, reply Y." |

**Warm-adjacent cadence (had contact before):**

| Day | Angle |
|---|---|
| 0   | Reference prior context (event, referral, past deal) |
| +2  | New information or offer variant |
| +5  | Direct ask or breakup |

**Do not send more than 3 cold texts to someone who hasn't replied.** The carriers watch this. So do the state AGs.

### Reply-to-YES follow-up (this is where you convert)

Once they reply Y, the conversation is P2P. Carrier filters relax dramatically. You can now:
- Include a URL to your own domain
- Ask qualifying questions
- Send longer messages
- Push to a form or call

Example after Y:
```
Nice. Quick 2-min pre-qual, zero credit hit → thebrokershopinc.com/apply. I'll call you as soon as it hits.
```

Or, qualify first:
```
Great. Send me: 1) business name, 2) rough monthly deposits, 3) amount you're targeting. I'll come back with real numbers same day.
```

---

## Quality Check

Before you send, gut-check:

- [ ] Does the first 40 chars hook someone reading a lockscreen preview?
- [ ] Does the message fit in ONE segment (~138 chars after auto-STOP)?
- [ ] Is there exactly one clear ask (Reply Y)?
- [ ] Is there zero jargon that would trigger carrier ML? (loan, cash, guaranteed, free, cash advance, MCA, click, urgent, limited time, act now)
- [ ] No URL, or only a full-domain URL to something YOU own?
- [ ] Would YOU reply to this if you got it? Would you at least NOT tap "Report spam"?
- [ ] Does the variant rotate enough vs. the last one so the segment doesn't look identical?
- [ ] Is the recipient's local time between 8am and 8pm (strict states) / 9pm (federal)? BULKSMS app enforces this — but doublecheck when scheduling.

---

## What to Avoid

**Content the linter blocks (hard errors — message won't send):**
- URL shorteners: bit.ly, tinyurl, t.co, goo.gl, buff.ly, ow.ly, is.gd, cutt.ly, and 12 others
- SHAFT + adjacent: viagra, casino, weed, guaranteed cash, payday loan, cash advance, crypto pitch
- >50% uppercase
- Guaranteed-return language

**Content the linter warns on (soft — can send but consider rewriting):**
- Words: "loan," "cash," "guaranteed," "free"
- 30-50% uppercase
- Excessive `!!!` or `???`
- Bare phone number without a calling verb

**Practices carriers punish even if the message technically passes:**
- Identical body to a large segment
- Sending at midnight
- No prior number warmup
- All-blast, no reply activity
- Sending to a list with obvious duplicates or bad numbers

**Legal landmines:**
- Texting a cell phone without documented consent (TCPA — B2B is NOT exempt on wireless)
- Sending outside recipient's 8am–9pm window (federal) or 8am–8pm (FL, OK, WA, AL, CT, LA, MD, MA, MS, WY private-right-of-action states)
- Failing to honor STOP (or fuzzy variants: "stop texting me," "please stop," "remove me")
- Using bought lists with no consent trail

---

## Compliance Essentials

The BULKSMS app enforces most of this automatically. If you're using a different sender:

1. **Warmup**. Day 1: 50 max. Add 50 per week until day 30. Never open a new number with 500.
2. **Throttle**. 1.5 seconds between sends minimum. Faster looks like a bot to carriers.
3. **STOP.** Fuzzy match, not just the literal word. Honor within 24 hours.
4. **Consent log.** Track source and date per recipient. Store proof.
5. **Quiet hours per recipient timezone,** not just yours. Area code → state → timezone.
6. **Reply rate matters.** Under 2% for several days = carriers flagging you.
7. **Opt-out rate matters more.** Above 3% = suspension precursor.

---

## Templates by Segment (Reference)

Real templates written for common B2B/B2C SMS use cases. Adapt sender name, company, and specific value prop.

### MCA broker → merchants with existing cash advances

```
{{name}}, [Sender] w/ Broker Shop. Approval on deposits, not credit. You pick your rate + offer, $5K-$2M in 24 hrs. Reply Y.
```

Renewal angle:
```
{{name}}, [Sender] @ Broker Shop. Renewal soon? Deposits-based approval, YOU pick rate + offer. Up to $2M in 24 hrs. Reply Y.
```

Consolidation angle:
```
{{name}}, [Sender] w/ Broker Shop. Multiple positions? We consolidate — approval on deposits, YOU pick your rate. Reply Y.
```

### Real estate broker → homeowners

```
{{name}}, [Sender] here. Getting cash offers on your block. If you're curious what yours would go for, reply Y — no obligation.
```

### Recruiter → passive candidate

```
{{name}}, [Sender] here. Client hiring a [role] at [$X range], remote, no relo. Not looking, but worth a look? Reply Y.
```

### SaaS founder → other founders (relevant integration)

```
{{name}}, [Sender] here. Saw you're on [tool]. Built the [complementary] side of that stack — happy to share how [customer] uses both. Reply Y.
```

### Local service → homeowners in an area

```
{{name}}, [Sender] w/ [Company]. Doing 3 [service] jobs on your block this week. If you want in on the volume pricing, reply Y.
```

---

## Related Skills

- **cold-email**: For longer-form outreach where you have more budget for setup
- **customer-research**: Learn the language your audience actually uses before drafting
- **churn-prevention**: For post-sale retention texts
- **referral-program**: For ambassador and word-of-mouth SMS mechanics
