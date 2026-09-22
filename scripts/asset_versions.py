#!/usr/bin/env python3
"""Refresh existing shared-asset hashes, then regenerate the Writing snapshot."""
import hashlib
import os
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'node_modules', '_site', 'test-results', 'assets', 'data', 'docs', 'tests'}
REFERENCE = re.compile(r'(/assets/(?:js/[^\s"<>?]+\.js|css/[^\s"<>?]+\.css))\?v=[a-f0-9]+')


def main():
    digests = {}

    def version(match):
        asset = match[1]
        if asset not in digests:
            digests[asset] = hashlib.sha256((ROOT / asset.lstrip('/')).read_bytes()).hexdigest()[:12]
        return f'{asset}?v={digests[asset]}'

    changes = []
    for directory, folders, files in os.walk(ROOT):
        folders[:] = [name for name in folders if not name.startswith('.') and name not in EXCLUDED]
        for name in sorted(files):
            path = Path(directory) / name
            if path.suffix != '.html' or path == ROOT / 'writing/index.html':
                continue  # The Writing generator owns its output.
            original = path.read_text()
            updated = REFERENCE.sub(version, original)
            if updated != original:
                changes.append((path, updated))
    # Resolve every asset before modifying any references.
    for path, updated in changes:
        path.write_text(updated)
    subprocess.run([sys.executable, str(ROOT / 'scripts/writing.py')], check=True)
    print(f'Updated shared-asset references in {len(changes)} pages/templates.')


if __name__ == '__main__':
    main()
