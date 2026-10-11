"""Checksum validation for original deliveries and explicitly selected rebuilds."""
import hashlib


def verify_checksums(output, files, originals=None):
    checks = dict(line.split('  ', 1)[::-1] for line in (output / 'SHA256SUMS').read_text().splitlines() if line)
    original_checks = dict(line.split('  ', 1)[::-1] for line in originals.read_text().splitlines() if line) if originals else None
    for name in files:
        path = output / name
        assert path.is_file(), path
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        assert digest == checks[name], f'Release checksum mismatch: {name}'
        if original_checks is not None:
            assert digest == original_checks[name], f'Original checksum mismatch: {name}'
