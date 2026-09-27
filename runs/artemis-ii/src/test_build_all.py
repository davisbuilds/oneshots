"""Fast build selection checks: python3 src/test_build_all.py (no Blender needed)."""
import contextlib
import hashlib
import io
import pathlib
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import build_all as build


class AssetSelectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = pathlib.Path(self.tmp.name)
        self.enterContext(patch.object(build, "OUT", str(self.out)))
        self.enterContext(patch.object(build, "BLEND", str(self.out / "artemis_ii.blend")))
        manifest = tomllib.loads((pathlib.Path(build.RUN) / "run.toml").read_text())
        self.assets = {a["file"] for a in manifest["assets"]}
        # Completed inputs avoid the expensive renderers. The test exercises
        # real resume decisions, manifest selection, and checksum writing.
        inputs = [self.out / n for n in self.assets if n != build.ANIMATIC]
        inputs.append(self.out / "label_tracks.json")
        inputs.extend(map(pathlib.Path, build.frames("frames_studio", build.STUDIO_FRAMES)))
        inputs.extend(map(pathlib.Path, build.frames("frames_pad", build.PAD_FRAMES)))
        for p in inputs:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(b"ready")

    def run_build(self, *args):
        with patch("sys.argv", ["build_all.py", *args]), contextlib.redirect_stdout(io.StringIO()):
            build.main()
        return {
            name: digest
            for digest, name in (line.split(None, 1) for line in
                                 (self.out / "SHA256SUMS").read_text().splitlines())
        }

    def test_skip_animatic_completes_without_an_animatic(self):
        sums = self.run_build("--skip-animatic")
        self.assertEqual(set(sums), self.assets - {build.ANIMATIC})
        self.assertEqual(set(sums.values()), {hashlib.sha256(b"ready").hexdigest()})
        self.assertFalse((self.out / build.ANIMATIC).exists())

    def test_skip_animatic_excludes_a_stale_animatic(self):
        (self.out / build.ANIMATIC).write_bytes(b"stale review artifact")
        sums = self.run_build("--skip-animatic")
        self.assertEqual(set(sums), self.assets - {build.ANIMATIC})

    def test_default_build_checksums_all_declared_assets(self):
        (self.out / build.ANIMATIC).write_bytes(b"ready")
        self.assertEqual(set(self.run_build()), self.assets)


if __name__ == "__main__":
    unittest.main()
