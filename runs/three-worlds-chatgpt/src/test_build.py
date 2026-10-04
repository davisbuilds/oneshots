"""Fast CLI safety checks without rendering dependencies or artwork changes."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class BuildOptionTests(unittest.TestCase):
    def test_resimulation_cannot_reuse_geometry(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / 'src').mkdir()
            (root / 'data').mkdir()
            for name in ('build.py', 'paths.py'):
                shutil.copy2(Path(__file__).with_name(name), root / 'src' / name)
            # Empty PATH makes the individual valid modes stop safely at their
            # dependency check; the incompatible pair must stop before it.
            for flags in (['--resimulate'], ['--skip-matter'],
                          ['--resimulate', '--skip-matter'],
                          ['--skip-matter', '--resimulate']):
                with self.subTest(flags=flags):
                    result = subprocess.run(
                        [sys.executable, str(root / 'src/build.py'), *flags],
                        env={**os.environ, 'PATH': ''}, capture_output=True, text=True)
                    if len(flags) == 2:
                        self.assertEqual(result.returncode, 2)
                        self.assertIn('--resimulate cannot be combined with --skip-matter', result.stderr)
                    else:
                        self.assertEqual(result.returncode, 1)
                        self.assertIn('must be installed and on PATH', result.stderr)
                    self.assertFalse(any((root / 'output').rglob('*.*')))


if __name__ == '__main__':
    unittest.main()
