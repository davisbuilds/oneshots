"""Shared Chrome launcher for Python renderers; no bundled-browser fallback."""
import json
import os
import re
from pathlib import Path

POLICY = json.loads(Path(__file__).with_name("browser-policy.json").read_text())


def assert_safe_browser_version(version):
    minimum = tuple(map(int, POLICY["minimumVersion"].split(".")))
    if not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", version) or tuple(map(int, version.split("."))) < minimum:
        raise RuntimeError(
            f"Unsafe or unknown Chrome/Chromium version {version}; require >= "
            f"{POLICY['minimumVersion']} ({POLICY['advisory']}). Update Chrome or "
            "CHROMIUM_PATH; bundled Chromium is never a fallback."
        )


def launch_browser(playwright, **options):
    options.pop("channel", None)
    options.pop("executable_path", None)
    if os.environ.get("CHROMIUM_PATH"):
        options["executable_path"] = os.environ["CHROMIUM_PATH"]
    else:
        options["channel"] = "chrome"
    browser = playwright.chromium.launch(**options)
    try:
        assert_safe_browser_version(browser.version)
        print(f"Browser: Chrome/Chromium {browser.version}", flush=True)
        return browser
    except Exception:
        browser.close()
        raise
