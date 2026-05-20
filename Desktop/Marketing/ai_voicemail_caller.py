from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white

PAGE_W, PAGE_H = letter

NAVY = HexColor("#0B1F3A")
GOLD = HexColor("#C9A24B")
INK = HexColor("#1A2332")
MUTED = HexColor("#5A6478")
CREAM = HexColor("#FAF7F0")
LINE = HexColor("#E2D9C2")
SOFT = HexColor("#A8B4C8")
RED = HexColor("#9B2C2C")
GREEN = HexColor("#2F6B4A")

MARGIN = 0.6 * inch
CONTENT_W = PAGE_W - 2 * MARGIN

c = canvas.Canvas("ai_voicemail_caller.pdf", pagesize=letter)


def draw_header(c, title, subtitle, tag="AI VOICEMAIL CALLER"):
    band_h = 1.0 * inch
    band_top = PAGE_H - 0.4 * inch
    band_bottom = band_top - band_h

    c.setFillColor(NAVY)
    c.roundRect(MARGIN, band_bottom, CONTENT_W, band_h, 10, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.rect(MARGIN, band_bottom, CONTENT_W, 0.3 * inch, stroke=0, fill=1)

    c.setFillColor(GOLD)
    c.rect(MARGIN, band_bottom - 0.03 * inch, CONTENT_W, 0.03 * inch, stroke=0, fill=1)

    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(MARGIN + 0.35 * inch, band_top - 0.32 * inch, tag)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(MARGIN + 0.35 * inch, band_top - 0.65 * inch, title)

    c.setFillColor(SOFT)
    c.setFont("Helvetica-Oblique", 10)
    c.drawString(MARGIN + 0.35 * inch, band_top - 0.87 * inch, subtitle)

    return band_bottom - 0.05 * inch


def draw_section_label(c, x, y, label, color=GOLD):
    c.setFillColor(color)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(x, y, label)


def wrap_text(text, max_chars):
    words = text.split()
    lines = []
    cur = ""
    for w in words:
        if len(cur) + len(w) + 1 <= max_chars:
            cur = (cur + " " + w).strip()
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_card(c, x, y, w, h, fill=CREAM):
    c.setFillColor(fill)
    c.roundRect(x, y, w, h, 8, stroke=0, fill=1)


# ============================================================
# PAGE 1 — Header + Operating Rules + Decision Flow
# ============================================================
content_top = draw_header(
    c,
    "AI Voicemail Caller",
    "Voicemail-only outbound  •  B2B SaaS & Agencies",
)

# OPERATING RULES card
ops_top = content_top - 0.25 * inch
ops_h = 2.55 * inch
ops_bottom = ops_top - ops_h
draw_card(c, MARGIN, ops_bottom, CONTENT_W, ops_h)

draw_section_label(c, MARGIN + 0.3 * inch, ops_top - 0.3 * inch, "OPERATING RULES  —  SYSTEM PROMPT")

c.setFillColor(NAVY)
c.setFont("Helvetica-Bold", 13)
c.drawString(
    MARGIN + 0.3 * inch,
    ops_top - 0.55 * inch,
    "The agent's only job is to leave a voicemail. Never pitch live.",
)

rules = [
    ("1.", "Detect outcome at pickup.",
     "If you hear \"hello?\" + a pause → human. If you hear a greeting recording or beep → voicemail."),
    ("2.", "If a HUMAN answers — do not pitch.",
     "Say: \"Apologies, wrong number — have a good day.\" Hang up immediately. No exceptions."),
    ("3.", "If VOICEMAIL — wait for the beep, then deliver the script verbatim.",
     "Stay between 12 and 18 seconds. If you cross 20s, stop and hang up."),
    ("4.", "Speak naturally.",
     "Pace ~150–160 wpm. Light, casual tone. No robotic cadence. One soft \"uh\" is fine."),
    ("5.", "End with the callback number twice, slowly.",
     "Then hang up. Do not stay on the line. Do not record dead air."),
]

rule_y = ops_top - 0.85 * inch
for num, head, body in rules:
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(MARGIN + 0.35 * inch, rule_y, num)

    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10.5)
    c.drawString(MARGIN + 0.6 * inch, rule_y, head)

    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9.5)
    body_lines = wrap_text(body, 92)
    by = rule_y - 0.18 * inch
    for bl in body_lines:
        c.drawString(MARGIN + 0.6 * inch, by, bl)
        by -= 0.16 * inch
    rule_y = by - 0.05 * inch

# DECISION FLOW row (two pills side-by-side)
flow_top = ops_bottom - 0.25 * inch
flow_h = 1.1 * inch
flow_bottom = flow_top - flow_h

half_w = (CONTENT_W - 0.2 * inch) / 2

# HUMAN pill (red)
draw_card(c, MARGIN, flow_bottom, half_w, flow_h, fill=HexColor("#FBEAEA"))
c.setFillColor(RED)
c.setFont("Helvetica-Bold", 8)
c.drawString(MARGIN + 0.25 * inch, flow_top - 0.25 * inch, "IF HUMAN ANSWERS")
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 12)
c.drawString(MARGIN + 0.25 * inch, flow_top - 0.5 * inch, "“Apologies, wrong number")
c.drawString(MARGIN + 0.25 * inch, flow_top - 0.7 * inch, "— have a good day.”")
c.setFillColor(MUTED)
c.setFont("Helvetica-Oblique", 9)
c.drawString(MARGIN + 0.25 * inch, flow_top - 0.92 * inch, "→  Hang up. Do not pitch. Ever.")

# VOICEMAIL pill (green)
vm_x = MARGIN + half_w + 0.2 * inch
draw_card(c, vm_x, flow_bottom, half_w, flow_h, fill=HexColor("#E8F2EC"))
c.setFillColor(GREEN)
c.setFont("Helvetica-Bold", 8)
c.drawString(vm_x + 0.25 * inch, flow_top - 0.25 * inch, "IF VOICEMAIL DETECTED")
c.setFillColor(INK)
c.setFont("Helvetica-Bold", 12)
c.drawString(vm_x + 0.25 * inch, flow_top - 0.5 * inch, "Wait for beep → deliver script")
c.drawString(vm_x + 0.25 * inch, flow_top - 0.7 * inch, "→ number twice → hang up.")
c.setFillColor(MUTED)
c.setFont("Helvetica-Oblique", 9)
c.drawString(vm_x + 0.25 * inch, flow_top - 0.92 * inch, "→  Target runtime: 12–18 seconds.")

# Page 1 footer note
c.setFillColor(MUTED)
c.setFont("Helvetica-Oblique", 8.5)
c.drawString(MARGIN, 0.45 * inch, "Page 1 of 2  •  Operating rules → hand to the voice agent as the system prompt.")
c.setFillColor(GOLD)
c.setFont("Helvetica-Bold", 8.5)
c.drawRightString(PAGE_W - MARGIN, 0.45 * inch, "5 voicemail scripts →")

c.showPage()

# ============================================================
# PAGE 2 — 5 Voicemail Scripts
# ============================================================
content_top = draw_header(
    c,
    "5 Voicemail Scripts",
    "Rotate across a sequence • 12–18 sec each • always end with the number twice",
    tag="VOICEMAIL LIBRARY",
)

scripts = [
    (
        "01",
        "PATTERN INTERRUPT",
        "When you have no warm signal. Cold list, first touch.",
        "“Hey [Name], Alex calling. Was gonna email but figured a voicemail might actually land. Quick one — wanted to share how [Similar Company] is handling [pain] now. If you wanna hear it, call me back at [number]. That's [number]. Thanks.”",
        "~14 sec",
    ),
    (
        "02",
        "CURIOSITY GAP",
        "When you've reviewed their site / LinkedIn and have a real observation.",
        "“Hey [Name], Alex here. Was poking around [Company]'s site and noticed something I think is leaving real money on the table. Two-minute fix. Call me back when you've got a sec — [number]. Again, [number].”",
        "~12 sec",
    ),
    (
        "03",
        "SPECIFIC ROI",
        "When you have a strong case study from a close lookalike.",
        "“Hey [Name], it's Alex. Reason for the call — we helped [Similar Company] add $[X] in pipeline last quarter doing one specific thing, and I think it'd work for you too. Worth a quick chat. [number]. Again, [number].”",
        "~16 sec",
    ),
    (
        "04",
        "REFERRAL / WARM DROP",
        "When you have a name to drop — or attended the same event.",
        "“Hey [Name], Alex calling — [Referrer] suggested I reach out. I'll send an email too, but figured I'd leave this. [number] when you've got a minute. That's [number].”",
        "~12 sec",
    ),
    (
        "05",
        "SOFT TEASE",
        "Final touch in a sequence. Lower pressure, higher curiosity.",
        "“Hey [Name], Alex here. Not sure if this is for you — but if it is, it's a 2-minute call that probably saves your team 10 hours a week. Call me back — [number]. Have a good one.”",
        "~14 sec",
    ),
]

card_h = 1.45 * inch
gap = 0.15 * inch
y_cursor = content_top - 0.25 * inch

for num, name, when, body, runtime in scripts:
    card_top_y = y_cursor
    card_bot_y = y_cursor - card_h
    draw_card(c, MARGIN, card_bot_y, CONTENT_W, card_h)

    # Left rail with number
    c.setFillColor(NAVY)
    c.roundRect(MARGIN, card_bot_y, 0.55 * inch, card_h, 8, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.rect(MARGIN + 0.4 * inch, card_bot_y, 0.15 * inch, card_h, stroke=0, fill=1)
    c.setFillColor(GOLD)
    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(MARGIN + 0.275 * inch, card_top_y - card_h / 2 - 0.07 * inch, num)

    # Title row
    title_x = MARGIN + 0.75 * inch
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 12.5)
    c.drawString(title_x, card_top_y - 0.28 * inch, name)

    # Runtime pill
    rt_w = 0.7 * inch
    rt_x = PAGE_W - MARGIN - rt_w - 0.2 * inch
    rt_y = card_top_y - 0.35 * inch
    c.setFillColor(GOLD)
    c.roundRect(rt_x, rt_y, rt_w, 0.22 * inch, 4, stroke=0, fill=1)
    c.setFillColor(NAVY)
    c.setFont("Helvetica-Bold", 8.5)
    c.drawCentredString(rt_x + rt_w / 2, rt_y + 0.07 * inch, runtime)

    # When-to-use
    c.setFillColor(MUTED)
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(title_x, card_top_y - 0.48 * inch, when)

    # Body (script)
    c.setFillColor(INK)
    c.setFont("Helvetica", 10)
    body_lines = wrap_text(body, 92)
    by = card_top_y - 0.72 * inch
    for bl in body_lines:
        c.drawString(title_x, by, bl)
        by -= 0.16 * inch

    y_cursor = card_bot_y - gap

# Footer rules
foot_top = y_cursor + 0.05 * inch
c.setStrokeColor(LINE)
c.setLineWidth(0.6)
c.line(MARGIN, foot_top, PAGE_W - MARGIN, foot_top)

c.setFillColor(GOLD)
c.setFont("Helvetica-Bold", 8)
c.drawString(MARGIN, foot_top - 0.2 * inch, "ROTATION RULES")

c.setFillColor(MUTED)
c.setFont("Helvetica", 8.5)
notes = [
    "•  Touch 1: script 01 or 02.   •  Touch 2: 03.   •  Touch 3: 04 if you have a referent, else 05.",
    "•  Never leave the same script twice on the same contact. Stop after 3 voicemails per quarter per contact.",
]
ny = foot_top - 0.38 * inch
for n in notes:
    c.drawString(MARGIN, ny, n)
    ny -= 0.16 * inch

c.setFillColor(MUTED)
c.setFont("Helvetica-Oblique", 8.5)
c.drawString(MARGIN, 0.45 * inch, "Page 2 of 2  •  Voicemail library.")
c.setStrokeColor(GOLD)
c.setLineWidth(2)
c.line(MARGIN, 0.35 * inch, MARGIN + 0.4 * inch, 0.35 * inch)

c.save()
print("PDF created: ai_voicemail_caller.pdf")
