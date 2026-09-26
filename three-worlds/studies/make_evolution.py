"""Contact sheet: how each world evolved (left -> right = earlier -> later).
Ran on the full study set; only a curated selection of those studies is kept in this folder."""
from PIL import Image, ImageDraw, ImageFont
rows = [
    ("Matter", ["copper_s01.png", "copper_s02b.png", "copper_s05.png", "copper_s08.png"],
     ["first light", "angle study", "grey plinth (Mix-node bug)", "overhead key, darker stone"]),
    ("Trace", ["ink_s01.png", "ink_s03.png", "ink_s05.png", "ink_seed23.png"],
     ["stucco paper, pen-like", "tones + calligraphic width", "all-black spiral", "time-toned, seed 23"]),
    ("Energy", ["light_s01_24.00.png", "light_s02_24.00.png", "light_s04_24.00.png", "light_s06_21.50.png"],
     ["fog everywhere", "localised haze", "calibrated room", "head orb + halo"]),
]
tw, th = 480, 270
f = ImageFont.truetype("/usr/share/fonts/opentype/ebgaramond/EBGaramond12-Regular.otf", 18)
S = Image.new("RGB", (110 + 4 * (tw + 10), len(rows) * (th + 40) + 10), (18, 17, 16))
d = ImageDraw.Draw(S)
for r, (name, files, caps) in enumerate(rows):
    y = 10 + r * (th + 40)
    d.text((12, y + th // 2 - 10), name, font=f, fill=(220, 210, 195))
    for c, (fn, cap) in enumerate(zip(files, caps)):
        im = Image.open(f"studies/{fn}").convert("RGB")
        w, h = im.size
        if w / h < 16 / 9:
            nh = int(w * 9 / 16); im = im.crop((0, (h - nh) // 2, w, (h + nh) // 2))
        x = 110 + c * (tw + 10)
        S.paste(im.resize((tw, th), Image.LANCZOS), (x, y))
        d.text((x + 4, y + th + 6), cap, font=f, fill=(170, 160, 150))
S.save("studies/evolution.jpg", quality=90)
