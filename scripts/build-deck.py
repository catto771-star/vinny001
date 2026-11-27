#!/usr/bin/env python3
"""Gera a apresentação de slides (PPTX, 16:9) com prints, mockups e notas de fala em inglês irlandês.
Uso: python3 scripts/build-deck.py -> docs/presentation/DS-Lodge-Boss-Presentation.pptx"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
SH = os.path.join(ROOT, "docs/presentation/shots"); PR = os.path.join(ROOT, "public/products")
C = lambda h: RGBColor.from_string(h)
BG, SURF, INK, MUTED, ACC, AMB, BLU, GRN, RED, ORG, YEL = "0B0D12", "161A23", "F0F2F8", "9AA3BA", "4F7DFF", "F5B560", "6CB0FF", "35D07F", "D9534F", "F0A24A", "F6DF7A"
FONT = "Inter"
prs = Presentation(); prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
BLANK = prs.slide_layouts[6]

def slide(notes=""):
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid(); s.background.fill.fore_color.rgb = C(BG)
    if notes: s.notes_slide.notes_text_frame.text = notes
    return s
def box(s, x, y, w, h, fill=SURF, line=None, shape=MSO_SHAPE.ROUNDED_RECTANGLE, radius=0.08):
    r = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    r.fill.solid(); r.fill.fore_color.rgb = C(fill)
    if line: r.line.color.rgb = C(line); r.line.width = Pt(1.5)
    else: r.line.fill.background()
    if shape == MSO_SHAPE.ROUNDED_RECTANGLE: r.adjustments[0] = radius
    r.shadow.inherit = False
    return r
def text(s, x, y, w, h, t, size=18, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame; tf.word_wrap = True; tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05); tf.margin_top = tf.margin_bottom = Inches(0.02)
    lines = t if isinstance(t, list) else [t]
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); p.alignment = align
        r = p.add_run(); r.text = ln; r.font.size = Pt(size); r.font.color.rgb = C(color); r.font.bold = bold; r.font.name = FONT
    return tb
def bullets(s, x, y, w, items, size=18, gap=0.62, color=INK, dot=ACC):
    for i, it in enumerate(items):
        yy = y + i * gap
        d = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(yy + 0.12), Inches(0.14), Inches(0.14)); d.fill.solid(); d.fill.fore_color.rgb = C(dot); d.line.fill.background()
        text(s, x + 0.3, yy, w - 0.3, gap, it, size, color)
def header(s, kicker, title):
    text(s, 0.6, 0.35, 10, 0.4, kicker.upper(), 13, ACC, True)
    text(s, 0.6, 0.72, 12, 0.9, title, 34, INK, True)
def picture(s, name, x, y, w, border=MUTED, crop_h=None, max_h=5.25):
    p = os.path.join(SH, name + ".png")
    w = min(w, max_h * 2049 / 1470)  # nunca passa da borda inferior do slide
    pic = s.shapes.add_picture(p, Inches(x), Inches(y), width=Inches(w))
    if crop_h:  # corta a parte de baixo para focar o topo da tela
        full = pic.height; keep = Inches(crop_h)
        if keep < full: pic.crop_bottom = 1 - keep / full; pic.height = keep
    pic.line.color.rgb = C(border); pic.line.width = Pt(1)
    return pic
def product(s, fname, x, y, w):
    s.shapes.add_picture(os.path.join(PR, fname), Inches(x), Inches(y), width=Inches(w))
def chip(s, x, y, w, label, fill, ink="FFFFFF", size=14, h=0.42):
    b = box(s, x, y, w, h, fill, radius=0.5); text(s, x, y, w, h, label, size, ink, True, PP_ALIGN.CENTER, MSO_ANCHOR.MIDDLE)
def arrow(s, x, y, w):
    a = s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, Inches(x), Inches(y), Inches(w), Inches(0.4)); a.fill.solid(); a.fill.fore_color.rgb = C(MUTED); a.line.fill.background()

# ---------------- 0. título ----------------
s = slide("Thanks for making the time. I'll keep this tight: what's wrong today, what the system does about it, what it costs, and what I need from you. Feel free to jump in at any point.")
lg = os.path.join(ROOT, "public/logo.png")
if os.path.exists(lg): s.shapes.add_picture(lg, Inches(0.8), Inches(1.2), height=Inches(1.3))
text(s, 0.8, 2.8, 11, 1.2, "One system for both lodges", 54, INK, True)
text(s, 0.8, 3.9, 11, 0.8, "47/48 Amiens & Connolly Lodge", 28, ACC, True)
text(s, 0.8, 4.8, 11, 0.8, "Presentation for management  ·  Beta walkthrough", 18, MUTED)
box(s, 0.8, 6.3, 2.2, 0.08, ACC, radius=0.5); box(s, 3.1, 6.3, 0.9, 0.08, AMB, radius=0.5); box(s, 4.1, 6.3, 0.9, 0.08, BLU, radius=0.5)

# ---------------- 1. problema ----------------
s = slide("Let's start with where we are. Right now, everything is split across different sheets and docs. Checking an old record is slow, and there's no way to look at both houses at once without ringing around. So that's the problem this system solves.")
header(s, "1 · The problem today", "Everything is split across sheets and docs")
cards = [("Scattered", "Different sheets and docs for each house and each job.", "Excel · Word · paper"), ("Slow", "Hard to check old records. Hours lost looking.", "“When did that happen?”"), ("One house at a time", "No way to see both lodges at once.", "Two logins, two lists")]
for i, (t1, t2, t3) in enumerate(cards):
    x = 0.6 + i * 4.1; box(s, x, 2.1, 3.8, 3.6, SURF); text(s, x + 0.3, 2.4, 3.3, 0.6, t1, 22, AMB, True); text(s, x + 0.3, 3.2, 3.2, 1.4, t2, 18, INK); text(s, x + 0.3, 4.8, 3.2, 0.6, t3, 15, MUTED)
text(s, 0.6, 6.1, 12, 0.7, "This system replaces all of that, and it is built around how we actually run the two lodges.", 22, INK, True)

# ---------------- 2. solução ----------------
s = slide("So this is the idea in one picture. The houses record what happens, once, on the shift. Everything lands in one place, live. And management sees both lodges together, with the history one click away.")
header(s, "1 · The problem today", "One system, built around how we actually work")
picture(s, "01-home", 0.6, 1.9, 7.6)
bullets(s, 8.6, 2.1, 4.4, ["Replaces the separate sheets and docs", "Both houses on one screen", "Old records found in seconds", "Built around how we run the two lodges"], 19, 0.95)
text(s, 0.6, 6.6, 7.6, 0.4, "Admin Home: occupancy, who is on duty, what is pending", 13, MUTED)

# ---------------- 3. segurança: níveis ----------------
s = slide("Security and GDPR were our top priority. There are two access levels: Admin and Staff. You and Guilherme are the Admins. Staff only ever get the house login, and they can't see any of the management tabs.")
header(s, "2 · Security, access and GDPR", "Two access levels: Admin and Staff")
box(s, 0.6, 2.0, 5.9, 4.6, SURF); box(s, 6.8, 2.0, 5.9, 4.6, SURF)
text(s, 0.9, 2.2, 5.3, 0.6, "Admin", 28, ACC, True); text(s, 0.9, 2.85, 5.3, 0.4, "You and Guilherme", 16, MUTED)
bullets(s, 0.9, 3.5, 5.4, ["Both houses, plus every management tab", "Reports, Roster, Holidays, Purchases, Audit", "Logs in from anywhere"], 17, 0.8)
text(s, 7.1, 2.2, 5.3, 0.6, "Staff (house login)", 28, GRN, True); text(s, 7.1, 2.85, 5.3, 0.4, "Used on the office PC", 16, MUTED)
bullets(s, 7.1, 3.5, 5.4, ["Their own house only", "Day-to-day screens only", "No management tabs at all"], 17, 0.8, dot=GRN)

# ---------------- 4. login ----------------
s = slide("Here's how you get in. You log in from anywhere, with your password and a one-time code we send to your email. Staff don't do any of that: they use the house login on the office PC. And just so it's clear, there's zero link to the Pass System.")
header(s, "2 · Security, access and GDPR", "How people log in")
steps = [("1", "Email + password"), ("2", "One-time email code"), ("3", "In, from anywhere")]
for i, (n, t1) in enumerate(steps):
    x = 0.8 + i * 4.1; box(s, x, 2.1, 3.3, 1.6, SURF, ACC); text(s, x + 0.2, 2.2, 0.8, 0.8, n, 38, ACC, True); text(s, x + 0.2, 3.0, 2.9, 0.6, t1, 19, INK, True)
    if i < 2: arrow(s, x + 3.4, 2.7, 0.6)
text(s, 0.8, 1.75, 6, 0.3, "ADMIN", 12, ACC, True)
box(s, 0.8, 4.4, 11.7, 1.4, SURF, GRN); text(s, 1.1, 4.5, 3, 0.4, "STAFF", 12, GRN, True)
text(s, 1.1, 4.9, 10.9, 0.8, "House login on the office PC. No email code needed, and no management tabs.", 20, INK)
chip(s, 0.8, 6.15, 6.6, "No connection to the Pass System. Nothing flows there.", RED, size=16, h=0.55)

# ---------------- 5. GDPR ----------------
s = slide("On GDPR: personal data stays inside our own database, behind the logins I just showed you. There's no connection to the Pass System, so nothing goes out that way. Every change is recorded in the Audit, so we always know who did what, and when. I'd call the risk minimal, and I'm happy to go through it with whoever handles data protection for us.")
header(s, "2 · Security, access and GDPR", "GDPR by design")
items = [("Own database", "Data stays in our Supabase project, with automatic daily backups."), ("Role-based access", "Admins and Staff see only what their role needs."), ("Every change logged", "Audit shows who did what, when, and the before and after."), ("No Pass System link", "The PASS ID is just a reference typed in. Nothing is sent to it.")]
for i, (t1, t2) in enumerate(items):
    x = 0.6 + (i % 2) * 6.2; y = 2.0 + (i // 2) * 2.3; box(s, x, y, 5.9, 2.0, SURF); text(s, x + 0.3, y + 0.2, 5.3, 0.5, t1, 22, AMB, True); text(s, x + 0.3, y + 0.85, 5.3, 1.0, t2, 16, INK)
picture(s, "24-audit", 0.6, 6.7, 0.01) if False else None

# ---------------- 6. cores ----------------
s = slide("Now the colours, which was Guilherme's idea. The whole system is in English. Each house has its own colour: a dark yellow, or amber, for Amiens, and blue for Connolly. That stops anyone from logging something in the wrong house. And the Float can switch houses in one click, without logging out.")
header(s, "3 · Visual and colours", "Zero confusion: each house has its own colour")
picture(s, "10-bed-map", 0.6, 1.95, 5.6, AMB); picture(s, "27-switch-house", 6.75, 1.95, 5.6, BLU)
chip(s, 0.6, 6.15, 5.6, "Amiens: amber (dark yellow)", "A34A08", size=16, h=0.5); chip(s, 6.75, 6.15, 5.6, "Connolly: blue", "1D5FD1", size=16, h=0.5)
text(s, 0.6, 6.8, 12.2, 0.5, "100% in English  ·  The Float switches house in one click, without logging out", 16, MUTED, False, PP_ALIGN.CENTER)

# ---------------- 7. operação: handover ----------------
s = slide("Here's what the lads use on shift. First, the Handover. Every note is searchable by date, and tagged, so anything urgent gets seen quickly.")
header(s, "4 · Daily operation", "Handover: searchable by date")
picture(s, "11-handover", 0.6, 1.95, 8.2)
bullets(s, 9.2, 2.1, 3.8, ["Searchable by date, person or tag", "Tags: Incident, Health, Delivery…", "Mention a resident or a colleague", "Corrections kept, nothing deleted"], 17, 0.95)

# ---------------- 8. room check ----------------
s = slide("Room checks log the exact time they were done, so there's no guessing later. One tap per resident, then launch.")
header(s, "4 · Daily operation", "Room Check logs the exact time")
picture(s, "05-room-check", 0.6, 1.95, 8.2)
bullets(s, 9.2, 2.1, 3.8, ["Seen, Not seen or Absence", "Exact time stored with the check", "Launch closes the round", "Feeds Seen and No Shows"], 17, 0.95)

# ---------------- 9. bed map ----------------
s = slide("When someone checks out, the bed map updates itself. Free beds, absences, cancelled beds, all there without anyone retyping a thing.")
header(s, "4 · Daily operation", "Bed map updates itself")
picture(s, "10-bed-map", 0.6, 1.95, 8.2)
bullets(s, 9.2, 2.1, 3.8, ["Check-out frees the bed by itself", "Admit with a PASS ID", "Cancelled beds count as free", "Same numbers on Home and Reports"], 17, 0.95)

# ---------------- 10. laundry / dinner ----------------
s = slide("Laundry and Dinner link straight to the active residents, so you only ever pick from who is actually in the house.")
header(s, "4 · Daily operation", "Laundry and Dinner use the live resident list")
picture(s, "16-laundry", 0.6, 1.95, 5.6); picture(s, "15-dinner", 6.75, 1.95, 5.6)
text(s, 0.6, 6.15, 5.6, 0.4, "Laundry", 16, AMB, True); text(s, 6.75, 6.15, 5.6, 0.4, "Dinner", 16, AMB, True)
text(s, 0.6, 6.5, 12.2, 0.6, "Both pick from the active residents. No retyping names.", 17, MUTED)

# ---------------- 11. fridge + deliveries ----------------
s = slide("Fridge temperatures are tracked here: four fridges in Connolly and one in Amiens. If a reading is out of range, the manager gets an alert. Food deliveries, no-shows and warnings all live in the same place.")
header(s, "4 · Daily operation", "Fridge temps, deliveries, no-shows and warnings")
picture(s, "13-fridge", 0.6, 1.95, 5.6); picture(s, "14-deliveries", 6.75, 1.95, 5.6)
chip(s, 0.6, 6.2, 2.7, "Connolly: 4 fridges", "1D5FD1", size=14); chip(s, 3.5, 6.2, 2.7, "Amiens: 1 fridge", "A34A08", size=14)
text(s, 6.75, 6.15, 5.6, 0.9, "Food deliveries, no-shows and warnings are all in one place.", 17, INK)

s = slide("No-shows and warnings sit alongside, so a manager can see the full picture of a resident in one go.")
header(s, "4 · Daily operation", "No-shows and Warnings")
picture(s, "08-no-shows", 0.6, 1.95, 5.6); picture(s, "09-warnings", 6.75, 1.95, 5.6)
text(s, 0.6, 6.15, 5.6, 0.8, "No Shows come from the Seen check", 16, MUTED); text(s, 6.75, 6.15, 5.6, 0.8, "Warning and Final Warning, with history", 16, MUTED)

# ---------------- 12. daily tasks ----------------
s = slide("One thing to confirm with you. Guilherme asked for daily tasks to stay on signed paper. The system can sign them by name instead, but if you'd rather keep paper for the Beta, we can simply hide that screen. Your call.")
header(s, "4 · Daily operation", "Daily tasks: your call")
box(s, 0.6, 2.0, 5.9, 4.4, SURF); box(s, 6.8, 2.0, 5.9, 4.4, SURF)
text(s, 0.9, 2.2, 5.3, 0.6, "Option A: signed paper", 24, AMB, True); text(s, 0.9, 3.0, 5.3, 2.5, ["As Guilherme asked.", "Screen hidden for the Beta."], 18)
text(s, 7.1, 2.2, 5.3, 0.6, "Option B: signed in the system", 24, GRN, True); text(s, 7.1, 3.0, 5.3, 2.5, ["Each task signed by name.", "Admin sees what was done."], 18)
text(s, 0.6, 6.7, 12, 0.5, "We can take it out for the Beta if you prefer.", 16, MUTED)

# ---------------- 13. compras ----------------
s = slide("Now Purchases. This tab replaces the Tesco Excel sheet. All 27 regular items are already in there, each with a photo, the average quantity and a direct Tesco link.")
header(s, "5 · Purchases (Tesco)", "This tab replaces the Tesco Excel sheet")
picture(s, "19-purchases", 0.6, 1.95, 7.8)
bullets(s, 8.8, 2.1, 4.2, ["All 27 regular items already in", "Photo, average quantity, Tesco link", "Quick notes on the order", "Prices to track total spend"], 18, 0.95)

s = slide("Here's how one item looks. Guilherme just picks Buy standard, Buy more, Buy less or Don't buy. Click the link and it opens the exact product on Tesco. And you can pop in the price to track the total spend.")
header(s, "5 · Purchases (Tesco)", "One item: pick, click, done")
box(s, 0.9, 2.0, 7.0, 4.4, SURF)
product(s, "bin-bag-90l.jpg", 1.2, 2.3, 2.2)
text(s, 3.7, 2.3, 4.0, 0.5, "Bin bags 90L", 24, INK, True); text(s, 3.7, 2.9, 4.0, 0.4, "Average quantity: 2 per week", 15, MUTED)
chip(s, 3.7, 3.45, 3.9, "Open on Tesco ↗", ACC, size=15)
for i, (lab, fl) in enumerate([("Buy standard", GRN), ("Buy more", "2A9D8F"), ("Buy less", ORG), ("Don't buy", RED)]):
    chip(s, 1.2 + i * 1.65, 4.9, 1.55, lab, fl, size=12, h=0.5)
text(s, 1.2, 5.6, 6.4, 0.5, "Price (optional): € ____    Note: ______________", 15, MUTED)
bullets(s, 8.5, 2.2, 4.5, ["Four choices, one click", "Link opens the exact product", "Add a quick note to the order", "Add prices to see total spend"], 17, 0.95)

# ---------------- 14. roster ----------------
s = slide("This is the Roster. You can edit half-shifts in two clicks, and it totals everyone's weekly hours to keep the payroll straight.")
header(s, "6 · Roster and Holidays", "Roster: half-shifts in two clicks")
picture(s, "18-roster", 0.6, 1.95, 7.8)
bullets(s, 8.8, 2.1, 4.2, ["Edit half-shifts in two clicks", "Weekly hours totalled for each person", "Helps keep the payroll straight", "Coverage gaps flagged"], 18, 0.95)

s = slide("And this is the annual Holiday calendar. Yellow is under review, orange is confirmed, red is locked dates. Staff can only see which dates are free, not names. Only Admins see who's off.")
header(s, "6 · Roster and Holidays", "Annual Holiday calendar")
picture(s, "21-holidays", 0.6, 1.95, 7.8)
chip(s, 8.8, 2.1, 1.9, "Under review", YEL, "3D3000", 14); chip(s, 10.8, 2.1, 1.9, "Confirmed", ORG, "3A1D00", 14); chip(s, 8.8, 2.7, 1.9, "Locked dates", RED, "FFFFFF", 14)
bullets(s, 8.8, 3.5, 4.2, ["Staff see free dates only, no names", "Only Admins see who is off", "Lock dates like Christmas"], 18, 0.95)

# ---------------- 15. reports ----------------
s = slide("Everything feeds into Reports automatically. Filter by day, week, month or any date range, one house or both together. You get occupancy, maintenance, warnings, no-shows and worked hours.")
header(s, "7 · Reports", "Everything feeds into Reports automatically")
picture(s, "22-reports", 0.6, 1.95, 7.8)
bullets(s, 8.8, 2.1, 4.2, ["Day, week, month or any range", "One house or both together", "Occupancy, maintenance, warnings", "No-shows and worked hours"], 18, 0.95)

# ---------------- 16. custos ----------------
s = slide("For running costs, I've kept it as lean as I can. It's about forty-one to forty-three euro a month, ex-VAT. That covers commercial hosting on Vercel and the Pro database on Supabase. The Pro plan gives us automatic daily backups, so nothing gets lost. Prices are as of today, and I'll confirm them before we sign anything off.")
header(s, "8 · Costs and next steps", "Running costs: lean")
box(s, 0.9, 2.0, 5.6, 3.2, SURF); box(s, 6.8, 2.0, 5.6, 3.2, SURF)
text(s, 1.2, 2.2, 5.0, 0.5, "Vercel (commercial hosting)", 20, AMB, True); text(s, 1.2, 2.9, 5.0, 1.8, ["Fast, secure hosting.", "The app people open in the browser."], 17)
text(s, 7.1, 2.2, 5.0, 0.5, "Supabase Pro (database)", 20, AMB, True); text(s, 7.1, 2.9, 5.0, 1.8, ["Automatic daily backups.", "Nothing gets lost."], 17)
text(s, 0.9, 5.5, 11.5, 1.0, "About €41–43 per month, ex-VAT", 38, INK, True, PP_ALIGN.CENTER)
text(s, 0.9, 6.5, 11.5, 0.5, "Prices as of today; to be confirmed before sign-off.", 14, MUTED, False, PP_ALIGN.CENTER)

# ---------------- 17. próximos passos ----------------
s = slide("So that's it. Give us your feedback today and I'll tweak whatever you need. Then we launch the Beta and record short how-to videos for the team. Thanks very much.")
header(s, "8 · Costs and next steps", "Next steps")
steps = [("Today", "Your feedback", "I tweak whatever you need", ACC), ("Then", "Launch the Beta", "Both houses go live", GRN), ("After", "How-to videos", "Short ones, for the team", AMB)]
for i, (a, b, c_, col) in enumerate(steps):
    x = 0.8 + i * 4.1; box(s, x, 2.3, 3.7, 3.2, SURF, col); text(s, x + 0.3, 2.5, 3.1, 0.4, a.upper(), 13, col, True); text(s, x + 0.3, 3.1, 3.1, 0.9, b, 26, INK, True); text(s, x + 0.3, 4.2, 3.1, 1.0, c_, 17, MUTED)
    if i < 2: arrow(s, x + 3.75, 3.7, 0.45)
text(s, 0.8, 6.2, 11.7, 0.7, "Thank you. Questions?", 28, INK, True, PP_ALIGN.CENTER)

out = os.path.join(ROOT, "docs/presentation/DS-Lodge-Boss-Presentation.pptx"); prs.save(out); print("ok", out, len(prs.slides._sldIdLst), "slides")
