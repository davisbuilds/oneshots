"""Package the six reviewed stills and make a compact contact sheet."""
from pathlib import Path
import zipfile
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[1]
files=sorted((ROOT/'stills').glob('*.png'))
assert len(files)==6, 'The six independent still renders must be complete.'
for p in files:
    with Image.open(p) as im: im.verify()
font=ImageFont.truetype(str(ROOT/'source'/'fonts'/'DejaVuSerif.ttf'),24)
small=ImageFont.truetype(str(ROOT/'source'/'fonts'/'DejaVuSans.ttf'),12)
canvas=Image.new('RGB',(1280,960),'#0a1013');draw=ImageDraw.Draw(canvas)
draw.text((30,23),'A World in a Drop',font=font,fill='#cad9dc')
draw.text((30,63),'SIX WORLDS / SELECTED FRAMES',font=small,fill='#738e97')
for i,p in enumerate(files):
    with Image.open(p) as image:
        image=image.convert('RGB');image.thumbnail((620,264))
        x=10+(i%2)*640;y=105+(i//2)*282
        canvas.paste(image,(x,y));draw.text((x+4,y+266),p.stem.replace('_',' '),font=small,fill='#a8bbc1')
canvas.save(ROOT/'delivery'/'Selected_Frames.jpg',quality=95)
with zipfile.ZipFile(ROOT/'delivery'/'A_World_in_a_Drop_Stills.zip','w',zipfile.ZIP_DEFLATED) as archive:
    for p in files:archive.write(p,'A_World_in_a_Drop_Stills/'+p.name)
    archive.write(ROOT/'ART_AND_SCIENCE.txt','A_World_in_a_Drop_Stills/ART_AND_SCIENCE.txt')
print('Six stills verified and packaged.')
