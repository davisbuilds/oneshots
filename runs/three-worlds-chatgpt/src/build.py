"""Rebuild the original artwork with repository-local inputs and ignored outputs."""
import argparse
import hashlib
import shutil
import subprocess
import sys
import tomllib
from paths import RUN_ROOT, OUTPUT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--resimulate', action='store_true')
    parser.add_argument('--skip-matter', action='store_true', help='Reuse an existing output/Matter.png')
    args = parser.parse_args()
    if args.resimulate and args.skip_matter:
        parser.error('--resimulate cannot be combined with --skip-matter; regenerate geometry for the new trajectory')
    for executable in (['ffmpeg'] if args.skip_matter else ['blender', 'ffmpeg']):
        if not shutil.which(executable):
            raise SystemExit(f'{executable} must be installed and on PATH; see README.md')
    if args.skip_matter and not (OUTPUT / 'Matter.png').is_file():
        raise SystemExit('--skip-matter requires output/Matter.png')

    def run(name):
        subprocess.run([sys.executable, str(RUN_ROOT / 'src' / name)], check=True)

    if args.resimulate:
        run('simulate.py')
        run('select_segment.py')
    if not args.skip_matter:
        subprocess.run(['blender', '-b', '-t', '8', '--python', str(RUN_ROOT / 'src/build_scene.py')], check=True)
    for name in ('paint.py', 'energy.py', 'compose.py', 'render_energy_frames.py', 'film.py'):
        run(name)
    for extension in ('csv', 'npz'):
        shutil.copy2(OUTPUT / f'data/lorenz-canonical.{extension}', OUTPUT / f'trajectory.{extension}')
    manifest = tomllib.loads((RUN_ROOT / 'run.toml').read_text())
    lines = []
    for asset in manifest['assets']:
        path = OUTPUT / asset['file']
        lines.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n')
    (OUTPUT / 'SHA256SUMS').write_text(''.join(lines))
    run('verify.py')


if __name__ == '__main__':
    main()
