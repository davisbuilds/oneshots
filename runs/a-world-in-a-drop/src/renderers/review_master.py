"""Decode the delivered master, verify its format, and make visual review sheets."""
from pathlib import Path
import subprocess, json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
movie = ROOT / 'delivery' / 'A_World_in_a_Drop.mp4'
out = ROOT / 'studies' / 'final_review'
out.mkdir(parents=True, exist_ok=True)

def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)

probe = json.loads(run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)]).stdout)
video = next(s for s in probe['streams'] if s['codec_type'] == 'video')
sound = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
assert (video['width'], video['height']) == (1280, 544)
assert video['r_frame_rate'] == '24/1'
assert video['color_space'] == 'bt709' and video['color_primaries'] == 'bt709'
assert video['color_transfer'] == 'bt709' and video['color_range'] == 'tv'
assert abs(float(probe['format']['duration']) - 62) < .05
assert sound['channels'] == 2 and sound['sample_rate'] == '48000'
assert int(video['nb_frames']) == 1488
run(['ffmpeg', '-v', 'error', '-i', str(movie), '-f', 'null', '-'])
measure = run(['ffmpeg', '-hide_banner', '-i', str(movie), '-af', 'loudnorm=I=-18:TP=-1:LRA=12:print_format=json', '-f', 'null', '-'])
(out / 'audio_measurement.txt').write_text(measure.stderr)
(out / 'format.json').write_text(json.dumps(probe, indent=2))

def sheet(times, filename, columns=3):
    w, h = 426, 181
    canvas = Image.new('RGB', (columns*w, ((len(times)+columns-1)//columns)*(h+26)), '#0b1013')
    draw = ImageDraw.Draw(canvas)
    for i, t in enumerate(times):
        p = out / f't_{t:06.2f}.png'
        run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', str(movie), '-frames:v', '1', str(p)])
        with Image.open(p) as im:
            im = im.convert('RGB'); im.thumbnail((w,h))
            x, y = i%columns*w, i//columns*(h+26)
            canvas.paste(im, (x,y)); draw.text((x+8,y+h+5), f'{t:05.2f} s', fill='#bbcbd1')
    canvas.save(out / filename, quality=94)

sheet([2,6,10,14,18,22,26,30,34,38,42,46,49,52,55,57,59.7,60.5], 'film_contact.jpg')
sheet([8.4,9.25,10.1,17.9,18.75,19.6,28.4,29.25,30.1,36.9,37.75,38.6,45.4,46.25,47.1], 'transition_contact.jpg')
print('Master decoded without errors; format verified. Review sheets:', out)
