import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from browser import assert_safe_browser_version, launch_browser


class BrowserPolicyTests(unittest.TestCase):
    def test_version_floor(self):
        for version in ['155.0.9000.99', '156.0.8078.4', '156.0.8078.78', '', 'Chrome/157.0.8103.39', '157.0.1']:
            with self.subTest(version=version), self.assertRaisesRegex(RuntimeError, 'Unsafe or unknown'):
                assert_safe_browser_version(version)
        for version in ['156.0.8078.79', '156.0.8078.80', '157.0.8103.39']:
            assert_safe_browser_version(version)

    def test_override_rejected_and_closed(self):
        events = []
        browser = SimpleNamespace(version='156.0.8078.4', close=lambda: events.append('close'))
        def launch(**options):
            events.append(options)
            return browser
        playwright = SimpleNamespace(chromium=SimpleNamespace(launch=launch))
        with patch.dict(os.environ, {'CHROMIUM_PATH': '/explicit/chromium'}, clear=True):
            with self.assertRaisesRegex(RuntimeError, '156.0.8078.4'):
                launch_browser(playwright)
        self.assertEqual(events, [{'executable_path': '/explicit/chromium'}, 'close'])

    def test_default_and_missing_chrome_no_fallback(self):
        events = []
        def launch(**options):
            events.append(options)
            raise RuntimeError('Chrome missing')
        playwright = SimpleNamespace(chromium=SimpleNamespace(launch=launch))
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(RuntimeError, 'Chrome missing'):
                launch_browser(playwright, headless=True)
        self.assertEqual(events, [{'headless': True, 'channel': 'chrome'}])


if __name__ == '__main__':
    unittest.main()
