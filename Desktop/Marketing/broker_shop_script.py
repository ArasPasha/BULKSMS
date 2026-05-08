from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.colors import HexColor, black

doc = SimpleDocTemplate(
    "broker_shop_script.pdf",
    pagesize=letter,
    rightMargin=0.9 * inch,
    leftMargin=0.9 * inch,
    topMargin=0.9 * inch,
    bottomMargin=0.9 * inch,
)

styles = getSampleStyleSheet()

title_style = ParagraphStyle(
    "Title",
    parent=styles["Title"],
    fontName="Helvetica-Bold",
    fontSize=24,
    leading=28,
    textColor=HexColor("#0B1F3A"),
    alignment=TA_CENTER,
    spaceAfter=6,
)

subtitle_style = ParagraphStyle(
    "Subtitle",
    parent=styles["Normal"],
    fontName="Helvetica-Oblique",
    fontSize=12,
    leading=16,
    textColor=HexColor("#4A5568"),
    alignment=TA_CENTER,
    spaceAfter=24,
)

label_style = ParagraphStyle(
    "Label",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=14,
    textColor=HexColor("#0B1F3A"),
    spaceBefore=18,
    spaceAfter=6,
)

script_style = ParagraphStyle(
    "Script",
    parent=styles["Normal"],
    fontName="Helvetica",
    fontSize=14,
    leading=22,
    textColor=black,
    alignment=TA_LEFT,
    spaceAfter=10,
    leftIndent=12,
    rightIndent=12,
)

question_style = ParagraphStyle(
    "Question",
    parent=styles["Normal"],
    fontName="Helvetica-Bold",
    fontSize=14,
    leading=22,
    textColor=HexColor("#0B1F3A"),
    alignment=TA_LEFT,
    spaceAfter=10,
    leftIndent=12,
    rightIndent=12,
)

story = []

story.append(Paragraph("THE BROKER SHOP", title_style))
story.append(Paragraph("Cold Call Opening Script", subtitle_style))

story.append(Paragraph("OPENING", label_style))
story.append(Paragraph(
    "&ldquo;Hey, how you doing? This is Russ with The Broker Shop. "
    "We spoke a couple of months ago &mdash; you were looking to get some capital for your business.&rdquo;",
    script_style
))

story.append(Paragraph("QUALIFYING QUESTIONS", label_style))
story.append(Paragraph("&ldquo;How much capital do you need?&rdquo;", question_style))

story.append(Paragraph("IF &ldquo;NO NEED&rdquo;", label_style))
story.append(Paragraph("&ldquo;Did you already get funded?&rdquo;", question_style))
story.append(Paragraph("&ldquo;How many MCAs do you have?&rdquo;", question_style))

doc.build(story)
print("PDF created: broker_shop_script.pdf")
