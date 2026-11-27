#!/usr/bin/env python3
"""Monta o vídeo de apresentação (1080p, legendas em inglês) a partir do roteiro e dos prints.
Uso: python3 scripts/build-video.py   -> docs/presentation/DS-Lodge-Presentation.mp4, .srt e narration-script.txt
Sem voz sintética: o roteiro e o SRT acompanham o vídeo para a narração humana."""
import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
P = os.path.join(ROOT, "docs/presentation"); SH = os.path.join(P, "shots")
W, H, FPS = 1920, 1080, 25
STRETCH = 1.25                       # ritmo natural da fala irlandesa (palavras/segundo ~2,3)
INK, MUTED, ACCENT, BG = (240, 242, 248), (150, 158, 178), (79, 125, 255), (11, 13, 18)
FONT = "/usr/share/fonts/opentype/inter/Inter-Regular.otf"
FONT_B = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
f = lambda s, b=False: ImageFont.truetype(FONT_B if b else FONT, s)
script = json.load(open(os.path.join(P, "video/script.json")))

def ease(x): x = max(0, min(1, x)); return x * x * (3 - 2 * x)
def bg():
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    for y in range(H):
        k = y / H; d.line([(0, y), (W, y)], fill=(int(11 + 10 * k), int(13 + 12 * k), int(18 + 26 * k)))
    return im
BASE = bg()
def shot(name):
    p = os.path.join(SH, name + ".png")
    return Image.open(p).convert("RGB") if os.path.exists(p) else Image.new("RGB", (1366, 980), (30, 32, 40))
def rounded(im, r=22):
    m = Image.new("L", im.size, 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], r, fill=255)
    out = Image.new("RGBA", im.size); out.paste(im, (0, 0)); out.putalpha(m); return out
def shadow(canvas, box, r=22, blur=40, alpha=110):
    s = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); ImageDraw.Draw(s).rounded_rectangle(box, r, fill=(0, 0, 0, alpha))
    canvas.alpha_composite(s.filter(ImageFilter.GaussianBlur(blur)))
def window(canvas, im, cx, cy, tw, zoom=1.0, pan=(0, 0), th=None):
    """Janela (print) com leve zoom/panorâmica (Ken Burns), centrada em (cx,cy)."""
    th = th or int(tw * 0.62)
    sw = im.width; sh_ = int(sw * th / tw)
    vw, vh = sw / zoom, sh_ / zoom
    x0 = (sw - vw) * (0.5 + pan[0]); y0 = min(max(0, (im.height - vh) * pan[1]), max(0, im.height - vh))
    crop = im.crop((int(x0), int(y0), int(x0 + vw), int(y0 + vh))).resize((tw, th), Image.LANCZOS)
    box = (cx - tw // 2, cy - th // 2, cx + tw // 2, cy + th // 2)
    shadow(canvas, box); canvas.alpha_composite(rounded(crop), box[:2])
    d = ImageDraw.Draw(canvas); d.rounded_rectangle(box, 22, outline=(255, 255, 255, 40), width=2)
def text_c(d, xy, s, font, fill, anchor="mm"): d.text(xy, s, font=font, fill=fill, anchor=anchor)
def wrap(d, s, font, maxw):
    words, lines, cur = s.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if d.textlength(t, font=font) <= maxw: cur = t
        else: lines.append(cur); cur = w
    return lines + [cur]
def caption(canvas, s, a):
    if not s: return
    d = ImageDraw.Draw(canvas); font = f(40, True); lines = wrap(d, s, font, 1500)
    h = 62 * len(lines) + 34; w = int(max(d.textlength(l, font=font) for l in lines)) + 90
    y1 = H - 70; y0 = y1 - h; x0 = (W - w) // 2
    ov = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
    od.rounded_rectangle([x0, y0, x0 + w, y1], 26, fill=(8, 10, 14, int(215 * a)))
    for i, l in enumerate(lines): od.text((W // 2, y0 + 17 + 31 + i * 62), l, font=font, fill=(255, 255, 255, int(255 * a)), anchor="mm")
    canvas.alpha_composite(ov)
def tag(canvas, s, a=1.0):
    d = ImageDraw.Draw(canvas); font = f(26, True); w = int(d.textlength(s, font=font)) + 56
    ov = Image.new("RGBA", canvas.size, (0, 0, 0, 0)); od = ImageDraw.Draw(ov)
    od.rounded_rectangle([70, 56, 70 + w, 112], 28, fill=(79, 125, 255, int(255 * a)))
    od.text((70 + w // 2, 84), s, font=font, fill=(255, 255, 255, int(255 * a)), anchor="mm"); canvas.alpha_composite(ov)
def logo(canvas, cx, cy, h):
    p = os.path.join(ROOT, "public/logo.png")
    if os.path.exists(p):
        lg = Image.open(p).convert("RGBA"); lg = lg.resize((int(lg.width * h / lg.height), h), Image.LANCZOS)
        canvas.alpha_composite(lg, (cx - lg.width // 2, cy - lg.height // 2))
def pill(d, box, label, fill, ink=(255, 255, 255), size=30):
    d.rounded_rectangle(box, (box[3] - box[1]) // 2, fill=fill); text_c(d, ((box[0] + box[2]) // 2, (box[1] + box[3]) // 2), label, f(size, True), ink)

# ---------------- cenas ----------------
def sc_title(c, t, dur):
    d = ImageDraw.Draw(c); a = ease(t / 1.2)
    logo(c, W // 2, 330, int(150 * (0.9 + 0.1 * a)))
    text_c(d, (W // 2, 520), "Two houses.", f(110, True), INK + (int(255 * a),) if False else INK)
    text_c(d, (W // 2, 640), "One clear picture.", f(110, True), ACCENT)
    text_c(d, (W // 2, 780), "47/48 Amiens & Connolly Lodge", f(40), MUTED)
def sc_problem(c, t, dur):
    d = ImageDraw.Draw(c); a = ease(t / 1.0)
    notes = [("Night notebook", -520, -120, -5), ("Phone calls", 40, -230, 4), ("Sticky notes", 520, -90, -3), ("“Who's in tonight?”", -300, 140, 3), ("Spreadsheet v7", 330, 170, -4)]
    for i, (s, dx, dy, rot) in enumerate(notes):
        k = ease((t - 0.3 * i) / 0.8)
        if k <= 0: continue
        card = Image.new("RGBA", (440, 170), (0, 0, 0, 0)); cd = ImageDraw.Draw(card)
        cd.rounded_rectangle([0, 0, 439, 169], 18, fill=(250, 228, 150) if i % 2 == 0 else (235, 238, 245)); cd.text((220, 85), s, font=f(34, True), fill=(40, 40, 40), anchor="mm")
        card = card.rotate(rot, expand=True, resample=Image.BICUBIC)
        c.alpha_composite(card, (W // 2 + dx - card.width // 2, int(H / 2 - 40 + dy * k - card.height // 2)))
    if t > dur * 0.62:
        k = ease((t - dur * 0.62) / 0.8); text_c(d, (W // 2, 160), "Old news by the time it arrives", f(56, True), (255, 150, 150))
def sc_shot(c, t, dur, s):
    im = shot(s["shot"]); z = 1.0 + 0.10 * (t / dur); k = ease(t / 0.7)
    window(c, im, W // 2, H // 2 - 30 + int(30 * (1 - k)), 1500, zoom=z, pan=(0, 0.0))
    tag(c, s["tag"], k)
def sc_split(c, t, dur, s):
    k = ease(t / 0.7)
    for i, n in enumerate(s["shots"]):
        window(c, shot(n), 530 + i * 860, H // 2 - 30 + int(30 * (1 - k)), 800, zoom=1.0 + 0.08 * (t / dur), th=520)
    tag(c, s["tag"], k)
def sc_flow(c, t, dur):
    d = ImageDraw.Draw(c)
    cols = [("House team", ["Room Check", "Handover", "Maintenance", "Deliveries", "Fridge"], 330, (47, 168, 120)),
            ("One live picture", ["Occupancy", "Pending", "Alerts", "History"], 960, ACCENT),
            ("Admin decisions", ["Reports", "Audit", "Roster", "Purchases"], 1590, (232, 150, 70))]
    for ci, (title, items, cx, col) in enumerate(cols):
        k = ease((t - ci * 0.9) / 0.8)
        if k <= 0: continue
        text_c(d, (cx, 230), title, f(46, True), INK)
        for i, it in enumerate(items):
            y = 330 + i * 112; off = int((1 - k) * 40)
            d.rounded_rectangle([cx - 230, y + off, cx + 230, y + 80 + off], 40, fill=tuple(int(x * 0.28) for x in col) if k > .5 else BG, outline=col, width=3)
            text_c(d, (cx, y + 40 + off), it, f(32, True), INK)
    for ci in range(2):
        k = ease((t - 0.9 - ci * 0.9) / 0.6)
        if k > 0:
            x0 = cols[ci][2] + 250; x1 = cols[ci + 1][2] - 250; xm = x0 + (x1 - x0) * k
            d.line([(x0, 560), (xm, 560)], fill=(255, 255, 255), width=6)
            if k > .9: d.polygon([(x1, 560), (x1 - 26, 544), (x1 - 26, 576)], fill=(255, 255, 255))
def sc_mobile(c, t, dur, s):
    k = ease(t / 0.7)
    for i, n in enumerate(s["shots"]):
        im = shot(n); w = 380; h = 800
        ph = im.crop((0, 0, im.width, min(im.height, int(im.width * h / w)))).resize((w, h), Image.LANCZOS)
        x = W // 2 + (i - 1) * 470; y = H // 2 - 40 + int((1 - k) * 60) + (0 if i == 1 else 20)
        box = (x - w // 2 - 14, y - h // 2 - 14, x + w // 2 + 14, y + h // 2 + 14)
        shadow(c, box, 44); ImageDraw.Draw(c).rounded_rectangle(box, 44, fill=(28, 30, 36)); c.alpha_composite(rounded(ph, 32), (x - w // 2, y - h // 2))
    tag(c, s["tag"], k)
def sc_close(c, t, dur):
    d = ImageDraw.Draw(c); a = ease(t / 1.0)
    logo(c, W // 2, 300, 140); text_c(d, (W // 2, 500), "Know sooner.", f(120, True), INK); text_c(d, (W // 2, 630), "Decide better.", f(120, True), ACCENT)
    text_c(d, (W // 2, 780), "ds-lodge.vercel.app", f(38), MUTED)

def render_scene(s, t, dur):
    c = BASE.convert("RGBA")
    {"title": lambda: sc_title(c, t, dur), "problem": lambda: sc_problem(c, t, dur), "shot": lambda: sc_shot(c, t, dur, s), "split": lambda: sc_split(c, t, dur, s),
     "flow": lambda: sc_flow(c, t, dur), "mobile": lambda: sc_mobile(c, t, dur, s), "close": lambda: sc_close(c, t, dur)}[s["kind"]]()
    return c

def srt_time(x): h = int(x // 3600); m = int(x % 3600 // 60); sec = x % 60; return f"{h:02d}:{m:02d}:{int(sec):02d},{int(round((sec % 1) * 1000)):03d}"
def main():
    out_mp4 = os.path.join(P, "DS-Lodge-Presentation.mp4"); tmp = out_mp4 + ".silent.mp4"
    ff = subprocess.Popen(["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                           "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-pix_fmt", "yuv420p", tmp], stdin=subprocess.PIPE)
    clock, srt, narr, idx = 0.0, [], [], 1
    for s in script["scenes"]:
        lines = [(d * STRETCH, txt) for d, txt in s["lines"]]; dur = sum(d for d, _ in lines) + 0.5
        n = int(dur * FPS); starts, acc = [], 0.0
        for d, txt in lines: starts.append((acc, acc + d, txt)); acc += d
        for fr in range(n):
            t = fr / FPS; c = render_scene(s, t, dur)
            cur = next(((a, b, txt) for a, b, txt in starts if a + 0.15 <= t < b), None)
            if cur: caption(c, cur[2], ease((t - cur[0] - 0.15) / 0.25) * ease((cur[1] - t) / 0.2))
            if t < 0.4: ov = Image.new("RGBA", (W, H), (0, 0, 0, int(255 * (1 - t / 0.4)))); c.alpha_composite(ov)
            if t > dur - 0.35: ov = Image.new("RGBA", (W, H), (0, 0, 0, int(255 * (t - (dur - 0.35)) / 0.35))); c.alpha_composite(ov)
            ff.stdin.write(c.convert("RGB").tobytes())
        for a, b, txt in starts:
            srt.append(f"{idx}\n{srt_time(clock + a + 0.15)} --> {srt_time(clock + b)}\n{txt}\n"); narr.append(f"[{srt_time(clock + a + 0.15)[:8]}] {txt}"); idx += 1
        clock += dur
    ff.stdin.close(); ff.wait()
    open(os.path.join(P, "DS-Lodge-Presentation.srt"), "w").write("\n".join(srt))
    open(os.path.join(P, "narration-script.txt"), "w").write(script["title"] + f"\nTotal: {int(clock // 60)}:{int(clock % 60):02d}\n\nVoice direction: " + script["voice_note"] + "\n\n" + "\n".join(narr) + "\n")
    # trilha ambiente suave (acordes sintetizados) sob o vídeo
    music = f"aevalsrc='0.05*sin(2*PI*220*t)+0.04*sin(2*PI*277.18*t)+0.04*sin(2*PI*329.63*t)+0.03*sin(2*PI*440*t*(1+0.002*sin(2*PI*0.2*t)))':s=44100:d={clock}"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-f", "lavfi", "-i", music, "-af", f"afade=t=in:d=1.5,afade=t=out:st={clock - 2.5}:d=2.5,lowpass=f=1800,volume=0.6",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-shortest", out_mp4], check=True)
    os.remove(tmp); print("ok", out_mp4, f"{clock:.1f}s")
main()
