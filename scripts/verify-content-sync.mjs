// Fail a build when generated packet bodies, the served capability inventory, and the
// committed manifest no longer describe the same sync result. This catches an
// interrupted or manually edited sync before Vite can publish misattributed
// content.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = resolve(dirname(THIS_FILE), '..');

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

function containedPath(root, relativePath, label) {
	const target = resolve(root, relativePath);
	const rel = relative(root, target);
	if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
		throw new Error(`verify-content-sync: ${label} escapes its root: ${JSON.stringify(relativePath)}`);
	}
	return target;
}

export function verifyContentSync(repoRoot = DEFAULT_REPO_ROOT) {
	const contentRoot = resolve(repoRoot, 'src/content');
	const manifestPath = resolve(contentRoot, '.manifest.json');
	const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

	if (!/^[0-9a-f]{40}$/.test(manifest.sourceCommit ?? '')) {
		throw new Error('verify-content-sync: manifest sourceCommit is not a full Git commit SHA');
	}
	if (manifest.schemaVersion !== 2) throw new Error('verify-content-sync: schemaVersion must be 2');
	if (!manifest.capabilities || !Array.isArray(manifest.entries)) {
		throw new Error('verify-content-sync: manifest is missing capabilities or entries');
	}

	const capabilitiesPath = containedPath(repoRoot, manifest.capabilities.out, 'capability inventory output');
	const capabilities = readFileSync(capabilitiesPath, 'utf8');
	if (sha256(capabilities) !== manifest.capabilities.sha256) {
		throw new Error(`verify-content-sync: digest mismatch for ${manifest.capabilities.out}`);
	}

	for (const entry of manifest.entries) {
		const output = containedPath(contentRoot, entry.out, 'content output');
		const body = readFileSync(output, 'utf8');
		if (sha256(body) !== entry.sha256) {
			throw new Error(`verify-content-sync: digest mismatch for src/content/${entry.out}`);
		}
	}

	return {
		sourceCommit: manifest.sourceCommit,
		entries: manifest.entries.length,
		capabilities: manifest.capabilities.out,
	};
}

if (resolve(process.argv[1] ?? '') === THIS_FILE) {
	const result = verifyContentSync();
	console.log(
		`verify-content-sync: OK: ${result.entries} entries and ${result.capabilities} match packet ${result.sourceCommit.slice(0, 12)}`,
	);
}
