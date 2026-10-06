#!/usr/bin/env python3
"""Verify public product boundaries and the scaffold build authority."""
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
manifest = json.loads((ROOT / 'tinyland.repo.json').read_text())
package = json.loads((ROOT / 'package.json').read_text())
errors = []
if manifest['content']['authority_repo'] != 'DSA-Woodshed/dsa-study-packet':
    errors.append('content authority must be the org packet')
if manifest['tooling']['canonical_build'] != 'bazel':
    errors.append('Bazel must own the build')
if package['scripts']['build'] != 'just build':
    errors.append('package scripts must delegate to Just')
tracked = set(subprocess.check_output(['git', '-C', str(ROOT), 'ls-files'], text=True).splitlines())
for relative in ('AGENTS.md', 'CLAUDE.md', '.agents', '.claude-plugin', 'plugins', 'static/llms.txt', 'static/agent-map.md'):
    if any(file == relative or file.startswith(relative + '/') for file in tracked):
        errors.append(f'personal agent surface must remain outside org source: {relative}')
for workflow in (ROOT / '.github/workflows').glob('*.yml'):
    text = workflow.read_text()
    if 'secrets: inherit' in text or 'xoxd-ai/ci-templates' in text:
        errors.append(f'private CI coupling in {workflow.name}')
    if workflow.name == 'deploy-pages.yml' and "github.repository == 'DSA-Woodshed/dsa-woodshed.space'" not in text:
        errors.append('publication must be org-only')
if errors:
    raise SystemExit('\n'.join(errors))
print('public scaffold consumer boundaries verified')
