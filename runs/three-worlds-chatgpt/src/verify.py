"""Validate declared release assets, geometry, checksums and full video decoding."""
import argparse
import hashlib
import json
import subprocess
import tomllib
import numpy as np
from PIL import Image
from paths import RUN_ROOT, OUTPUT


def verify(write_checksums=False):
    m = tomllib.loads((RUN_ROOT / 'run.toml').read_text())
    names = [a['file'] for a in m['assets']]
    hashes = {}
    for name in names:
        p = OUTPUT / name
        if not p.is_file() or not p.stat().st_size:
            raise ValueError(f'Missing or empty asset: {name}')
        hashes[name] = hashlib.sha256(p.read_bytes()).hexdigest()
    for name in ('Matter.png', 'Trace.png', 'Energy.png', 'One-Equation-Three-Worlds.png'):
        with Image.open(OUTPUT / name) as image:
            image.load()
            expected = (4200, 2120) if name.startswith('One-') else (3200, 1800)
            if image.size != expected:
                raise ValueError(f'Wrong image size: {name}: {image.size}')
    with np.load(OUTPUT / 'trajectory.npz', allow_pickle=False) as a:
        t, xyz = a['t'], a['xyz']
    if t.shape != (3501,) or xyz.shape != (3501, 3) or not np.isfinite(xyz).all():
        raise ValueError('Invalid canonical trajectory arrays')
    if not np.allclose(np.diff(t), .002) or not np.allclose(t[[0, -1]], [40, 47]):
        raise ValueError('Invalid time interval or sampling')
    if np.linalg.norm(xyz[-1] - xyz[0]) <= 1:
        raise ValueError('Unexpectedly closed trajectory')
    csv = np.loadtxt(OUTPUT / 'trajectory.csv', delimiter=',', skiprows=1)
    if not np.allclose(csv, np.column_stack((t, xyz)), rtol=0, atol=1e-9):
        raise ValueError('CSV and NPZ disagree')
    projection = np.loadtxt(OUTPUT / 'data/camera-projection.csv', delimiter=',', skiprows=1)
    if projection.shape != (3501, 3) or not np.all((projection[:, :2] > 0) & (projection[:, :2] < 1)):
        raise ValueError('Projected curve is clipped or malformed')
    if not (OUTPUT / 'One-Equation-Three-Worlds.blend').read_bytes().startswith(b'BLENDER'):
        raise ValueError('Not an uncompressed Blender scene')
    movie = OUTPUT / 'One-Equation-Three-Worlds.mp4'
    probe = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration',
        '-of', 'json', str(movie)]))['streams'][0]
    if (probe['width'], probe['height'], probe['codec_name'], probe['r_frame_rate'], int(probe['nb_read_frames'])) != (1920, 1080, 'h264', '24/1', 672):
        raise ValueError(f'Unexpected film encoding: {probe}')
    if abs(float(probe['duration']) - 28) > .001:
        raise ValueError('Film duration differs from 28 seconds')
    subprocess.run(['ffmpeg', '-v', 'error', '-xerror', '-i', str(movie), '-f', 'null', '-'], check=True)
    sums = OUTPUT / 'SHA256SUMS'
    content = ''.join(f'{hashes[name]}  {name}\n' for name in names)
    if write_checksums:
        sums.write_text(content)
    elif not sums.exists() or sums.read_text() != content:
        raise ValueError('SHA256SUMS missing or inconsistent with declared assets')
    print(f'Verified {len(names)} assets; open trajectory; 672 decoded frames; checksums match.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write-checksums', action='store_true')
    verify(parser.parse_args().write_checksums)
