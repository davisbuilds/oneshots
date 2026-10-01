"""Keep all generated files inside this run's ignored output directory."""
from pathlib import Path
import shutil

RUN_ROOT = Path(__file__).resolve().parents[1]
OUTPUT = RUN_ROOT / 'output'
for directory in ('data', 'checkpoints', 'studies'):
    (OUTPUT / directory).mkdir(parents=True, exist_ok=True)
# Exact original geometry is the default. Re-simulation touches output/data only.
for source in (RUN_ROOT / 'data').iterdir():
    destination = OUTPUT / 'data' / source.name
    if source.is_file() and not destination.exists():
        shutil.copy2(source, destination)
