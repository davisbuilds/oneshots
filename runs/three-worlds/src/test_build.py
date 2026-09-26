"""Fast recovery checks: python3 src/test_build.py (no rendering dependencies)."""
import pathlib
import tempfile
import unittest

import build


class ResumeTests(unittest.TestCase):
    def test_partial_outputs_are_recovered_and_complete_outputs_are_skipped(self):
        for existing in ((), (0,), (1,), (0, 1)):
            with self.subTest(existing=existing), tempfile.TemporaryDirectory() as tmp:
                root = pathlib.Path(tmp)
                outputs = (root / "still.png", root / "scene.blend")
                marker = root / "producer-ran"
                for i in existing:
                    outputs[i].write_bytes(b"existing")
                producer = (
                    "import pathlib,sys; "
                    "[pathlib.Path(p).write_bytes(b'produced') for p in sys.argv[1:]]"
                )
                build.step("paired output", ["-c", producer, *map(str, outputs), str(marker)],
                           done=outputs)
                self.assertEqual(marker.exists(), len(existing) != 2)
                self.assertTrue(all(p.stat().st_size > 0 for p in outputs))

    def test_empty_output_is_recovered(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = pathlib.Path(tmp) / "empty.png"
            output.touch()
            build.step("empty output", ["-c", "import pathlib,sys; pathlib.Path(sys.argv[1]).write_bytes(b'recovered')",
                                        str(output)], done=(output,))
            self.assertEqual(output.read_bytes(), b"recovered")


if __name__ == "__main__":
    unittest.main()
