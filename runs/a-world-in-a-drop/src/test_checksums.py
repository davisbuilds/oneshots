import hashlib
from pathlib import Path
import tempfile
import unittest
from checksums import verify_checksums


class ChecksumsTest(unittest.TestCase):
    def test_original_and_rebuilt_modes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original = b'original delivery'
            replacement = b'fresh rebuild'
            asset = root / 'film.mp4'
            sums = root / 'SHA256SUMS'
            originals = root / 'ORIGINAL-SHA256SUMS'
            def record(data):
                return hashlib.sha256(data).hexdigest() + '  film.mp4\n'
            originals.write_text(record(original))
            asset.write_bytes(original)
            sums.write_text(record(original))
            verify_checksums(root, ['film.mp4'], originals)
            asset.write_bytes(replacement)
            sums.write_text(record(replacement))
            with self.assertRaisesRegex(AssertionError, 'Original checksum mismatch'):
                verify_checksums(root, ['film.mp4'], originals)
            verify_checksums(root, ['film.mp4'])
            asset.write_bytes(b'corrupted')
            with self.assertRaisesRegex(AssertionError, 'Release checksum mismatch'):
                verify_checksums(root, ['film.mp4'])


if __name__ == '__main__':
    unittest.main()
