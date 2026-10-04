from PIL import Image,ImageDraw
from compose import R,font
im=Image.new('RGB',(2400,2450),'#eae5dc');d=ImageDraw.Draw(im)
d.text((80,60),'Finding the three worlds',font=font(76,True),fill='#293330')
rows=[('01 / Light and setting','studies/02-matter-test.png','Matter.png'),('02 / Weight and pigment','studies/03-ink-1.png','Trace.png'),('03 / Exposure and edge','studies/05-energy-3.png','Energy.png')]
for i,(title,a,b) in enumerate(rows):
 y=210+i*720;d.text((80,y),title,font=font(28),fill='#55635d')
 for k,p in enumerate([a,b]):
  src=Image.open(R/p).convert('RGB').resize((1090,613),Image.Resampling.LANCZOS)
  im.paste(src,(80+k*1150,y+60))
  d.text((80+k*1150,y+685),'Study' if k==0 else 'Final',font=font(22),fill='#6d786e')
im.save(R/'studies/Studies.jpg',quality=95)
