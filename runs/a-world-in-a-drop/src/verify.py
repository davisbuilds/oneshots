"""Verify declared outputs, checksums, complete movie decoding, and stills."""
from pathlib import Path
import hashlib
import io
import json
import subprocess
import tomllib
import wave
import zipfile
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
out = ROOT / 'output'
manifest = tomllib.loads((ROOT / 'run.toml').read_text())
import argparse
from checksums import verify_checksums

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--rebuilt', action='store_true', help='Verify fresh rebuild checksums instead of requiring the original delivery hashes')
args = parser.parse_args()
verify_checksums(out, [a['file'] for a in manifest['assets']],
                 None if args.rebuilt else ROOT / 'process/ORIGINAL-SHA256SUMS')
for asset in manifest['assets']:
    path = out / asset['file']
    if path.suffix == '.blend':
        with path.open('rb') as f: assert f.read(7) == b'BLENDER', path.name
    if path.suffix == '.zip':
        with zipfile.ZipFile(path) as z: assert z.testzip() is None, path.name
movie = out / 'A_World_in_a_Drop.mp4'
probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(movie)]))
v = next(s for s in probe['streams'] if s['codec_type'] == 'video')
a = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
assert (v['width'], v['height'], v['r_frame_rate'], int(v['nb_frames'])) == (1280, 544, '24/1', 1488)
assert (v['color_space'], v['color_primaries'], v['color_transfer'], v['color_range']) == ('bt709', 'bt709', 'bt709', 'tv')
assert abs(float(probe['format']['duration']) - 62) < .05
assert a['channels'] == 2 and a['sample_rate'] == '48000'
subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(movie), '-f', 'null', '-'], check=True)
with zipfile.ZipFile(out / 'A_World_in_a_Drop_Stills.zip') as z:
    names = [n for n in z.namelist() if n.endswith('.png')]
    assert len(names) == 6
    for n in names:
        with Image.open(io.BytesIO(z.read(n))) as im:
            assert im.size == (1920, 816); im.load()
with wave.open(str(out / 'original_score.wav'), 'rb') as w:
    assert (w.getnchannels(), w.getframerate(), w.getnframes()) == (2, 48000, 2976000)
print('All six declared assets verified; 1488 movie frames decoded; six 1920 x 816 stills decoded.')
