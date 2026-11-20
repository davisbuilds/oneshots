#!/usr/bin/env python3
"""Convert output/previews/*.png into the committed preview/*.webp images.

    python3 tools/previews_webp.py        (needs Pillow)

The hero is 1600 px wide; details 1200 px; the archetype sheet is a 3 x 2 grid.
"""
import os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'output', 'previews')
DST = os.path.join(HERE, '..', 'preview')
os.makedirs(DST, exist_ok=True)


def save(img, name, width, q=80):
    img = img.convert('RGB')
    img = img.resize((width, round(img.height * width / img.width)), Image.LANCZOS)
    path = os.path.join(DST, name + '.webp')
    img.save(path, 'WEBP', quality=q, method=6)
    print(path, os.path.getsize(path))


def load(name):
    return Image.open(os.path.join(SRC, name + '.png'))


save(load('hero'), 'hero', 1600, 82)
for name in ['turnaround', 'halfway', 'stoa', 'mirror', 'skylight', 'cell', 'hall', 'window', 'forest', 'vault']:
    save(load(name), 'detail-' + name, 1200, 78)
tiles = [load(n) for n in ['islands', 'ruins', 'cavern', 'monolith', 'abstract', 'forest']]
w, h = 800, 450
sheet = Image.new('RGB', (w * 3, h * 2))
for i, t in enumerate(tiles):
    sheet.paste(t.convert('RGB').resize((w, h), Image.LANCZOS), ((i % 3) * w, (i // 3) * h))
save(sheet, 'archetypes', 1800, 76)
