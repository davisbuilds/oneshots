"""Run the preserved Blender production in an isolated, ignored output tree."""
from pathlib import Path
import argparse
import hashlib
import os
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def run(args, cwd):
    print(' '.join(map(str, args)), flush=True)
    subprocess.run(list(map(str, args)), cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--smoke', action='store_true', help='Build all geometry, six tiny renders, score and native edit in output/smoke')
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    if args.threads < 1:
        parser.error('--threads must be positive')
    if os.environ.get('GITHUB_ACTIONS') == 'true' and not args.smoke:
        parser.error('This hours-long run uses manual release uploads; see README.md.')
    blender = shutil.which(os.environ.get('BLENDER_BIN', 'blender'))
    if not blender:
        parser.error('Install official Blender 4.3.2 and set BLENDER_BIN or PATH.')
    for binary in ['ffmpeg', 'ffprobe']:
        if not shutil.which(binary):
            parser.error(f'{binary} is required')
    work = ROOT / 'output' / ('smoke' if args.smoke else 'production')
    inputs = sorted((ROOT / 'src/renderers').rglob('*'))
    inputs = [p for p in inputs if p.is_file() and '__pycache__' not in p.parts]
    digest = hashlib.sha256()
    for p in inputs:
        digest.update(str(p.relative_to(ROOT)).encode()); digest.update(p.read_bytes())
    signature = digest.hexdigest()
    stamp = work / 'source.sha256'
    if stamp.exists() and stamp.read_text().strip() != signature:
        parser.error(f'Source changed. Preserve or rename {work} before a fresh build; cached images must not be mixed.')
    for name in ['source', 'projects', 'checkpoints', 'frames', 'studies/revision_02/01_The_Atlantic', 'stills', 'audio', 'logs', 'delivery']:
        (work / name).mkdir(parents=True, exist_ok=True)
    for p in inputs:
        target = work / 'source' / p.relative_to(ROOT / 'src/renderers')
        target.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, target)
    for name in ['ART_AND_SCIENCE.txt', 'LICENSES.txt']:
        shutil.copy2(ROOT / name, work / name)
    stamp.write_text(signature + '\n')
    project = work / 'projects/A_World_in_a_Drop.blend'

    def blend(script, options=(), load=True):
        cmd = [blender, '-b']
        if load: cmd.append(project)
        cmd += ['-t', args.threads, '--python-exit-code', '1', '--python', work / 'source' / script]
        if options: cmd += ['--', *options]
        run(cmd, work)

    if not project.exists(): blend('build_world.py', load=False)
    quality = ['--scale', '25', '--samples', '8'] if args.smoke else ['--samples', '12']
    blend('render.py', ['--scene', '01', '--frames', '1', *quality])
    blend('finish_eye.py')
    if args.smoke:
        blend('render.py', ['--frames', '120', '--outdir', 'studies/import-smoke', *quality])
    else:
        blend('render.py', ['--step', '2', '--samples', '12'])
        blend('stills.py')
    run([sys.executable, work / 'source/score.py'], work)
    blend('editable_timeline.py')
    run([blender, '-b', work / 'projects/A_World_in_a_Drop_EDIT.blend', '-t', args.threads,
         '--python-exit-code', '1', '--python', work / 'source/audit_project.py'], work)
    if args.smoke:
        print('SMOKE COMPLETE: geometry, six scene renders, score and editable timeline; no full-film rebuild claimed.')
        return
    run([sys.executable, work / 'source/assemble.py', '--fps', '12'], work)
    run([sys.executable, work / 'source/review_master.py'], work)
    run([sys.executable, work / 'source/make_still_gallery.py'], work)
    output = ROOT / 'output'
    for relative in ['delivery/A_World_in_a_Drop.mp4', 'delivery/A_World_in_a_Drop_Stills.zip',
                     'projects/A_World_in_a_Drop.blend', 'projects/A_World_in_a_Drop_EDIT.blend', 'audio/original_score.wav']:
        shutil.copy2(work / relative, output / Path(relative).name)
    (work / 'REBUILD_PROVENANCE.txt').write_text('Rebuilt from repository source. The original animatic and eight historical checkpoints cannot be recreated by a new build. This archive contains the new output and current source.\n')
    archive = output / 'A_World_in_a_Drop_Complete.zip'
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for folder in ['source', 'projects', 'stills', 'audio', 'checkpoints']:
            for p in sorted((work / folder).rglob('*')):
                if p.is_file() and p.suffix not in ['.blend1', '.pyc']:
                    z.write(p, Path('A_World_in_a_Drop') / p.relative_to(work))
        for p in [*work.glob('*.txt'), work / 'delivery/A_World_in_a_Drop.mp4']:
            z.write(p, Path('A_World_in_a_Drop') / p.relative_to(work))
        repository_files = [ROOT / n for n in ['README.md', 'run.toml', 'requirements.txt', 'ART_AND_SCIENCE.txt', 'LICENSES.txt']]
        repository_files += [p for p in (ROOT / 'src').rglob('*') if p.is_file() and '__pycache__' not in p.parts]
        for p in repository_files:
            z.write(p, Path('repository') / p.relative_to(ROOT))
    import tomllib
    manifest = tomllib.loads((ROOT / 'run.toml').read_text())
    lines = [hashlib.sha256((output / a['file']).read_bytes()).hexdigest() + '  ' + a['file'] + '\n' for a in manifest['assets']]
    (output / 'SHA256SUMS').write_text(''.join(lines))
    run([sys.executable, ROOT / 'src/verify.py'], ROOT)


if __name__ == '__main__':
    main()
