// Maintainer and CI front door for the exact packet revision consumed by this
// site. The committed content manifest is the single lock: normal sync/build
// commands reproduce it, while `just packet-lock <sha>` is the only supported
// way to advance it.

import { execFileSync } from 'node:child_process';
import {
	appendFileSync,
	closeSync,
	cpSync,
	existsSync,
	mkdtempSync,
	openSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBookletMetadata, serializeBookletMetadata } from './sync-booklet.mjs';

const THIS_FILE = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(THIS_FILE), '..');
export const MANIFEST_PATH = join(REPO_ROOT, 'src', 'content', '.manifest.json');
export const DEFAULT_PACKET_PATH = resolve(REPO_ROOT, process.env.WOODSHED_PACKET_PATH ?? '../dsa-study-packet');
export const PACKET_REPOSITORIES = new Set(['Jesssullivan/dsa-study-packet', 'DSA-Woodshed/dsa-study-packet']);
const FULL_SHA = /^[0-9a-f]{40}$/;

function bookletDigest(booklet) {
	return booklet.asset.digest;
}

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parsePacketLock(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error('packet lock manifest is not valid JSON');
	}
	if (!isRecord(value)) {
		throw new Error('packet lock manifest must be a JSON object');
	}
	if (typeof value.sourceRepo !== 'string' || !PACKET_REPOSITORIES.has(value.sourceRepo)) {
		throw new Error(`packet lock sourceRepo is not an approved packet repository: ${JSON.stringify(value.sourceRepo)}`);
	}
	if (typeof value.sourceCommit !== 'string' || !FULL_SHA.test(value.sourceCommit)) {
		throw new Error(
			`packet lock sourceCommit must be a lowercase 40-character commit SHA: ${JSON.stringify(value.sourceCommit)}`,
		);
	}
	if (!isRecord(value.booklet)) {
		throw new Error('packet lock manifest must pin booklet metadata');
	}
	const booklet = parseBookletMetadata(JSON.stringify(value.booklet));
	return { sourceRepo: value.sourceRepo, sourceCommit: value.sourceCommit, booklet };
}

export function readPacketLock(manifestPath = MANIFEST_PATH) {
	if (!existsSync(manifestPath)) {
		throw new Error(`packet lock manifest is missing: ${manifestPath}`);
	}
	return parsePacketLock(readFileSync(manifestPath, 'utf8'));
}

export function resolveReachablePacketCommit(packetPath, requestedCommit) {
	if (!FULL_SHA.test(requestedCommit)) {
		throw new Error(
			`packet lock target must be a lowercase 40-character commit SHA: ${JSON.stringify(requestedCommit)}`,
		);
	}
	if (!existsSync(packetPath)) {
		throw new Error(`packet checkout is missing: ${packetPath}`);
	}
	let resolved;
	try {
		resolved = execFileSync('git', ['-C', packetPath, 'rev-parse', '--verify', `${requestedCommit}^{commit}`], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
	} catch {
		throw new Error(
			`packet lock target is not reachable in ${packetPath}: ${requestedCommit}. Fetch the packet repository, then retry.`,
		);
	}
	if (resolved !== requestedCommit) {
		throw new Error(`packet lock target resolved unexpectedly: requested ${requestedCommit}, observed ${resolved}`);
	}
	return resolved;
}

export function verifyPublishedPacketCommit(sourceRepo, requestedCommit, remoteUrl) {
	if (!PACKET_REPOSITORIES.has(sourceRepo)) {
		throw new Error(`packet lock sourceRepo is not approved: ${JSON.stringify(sourceRepo)}`);
	}
	if (!FULL_SHA.test(requestedCommit)) {
		throw new Error(
			`published packet target must be a lowercase 40-character commit SHA: ${JSON.stringify(requestedCommit)}`,
		);
	}
	const probeRoot = mkdtempSync(join(tmpdir(), 'woodshed-packet-published-'));
	try {
		execFileSync('git', ['init', '--bare', '--quiet', probeRoot], { stdio: ['ignore', 'pipe', 'pipe'] });
		const repositoryUrl = remoteUrl ?? `https://github.com/${sourceRepo}.git`;
		try {
			execFileSync(
				'git',
				['-C', probeRoot, 'fetch', '--quiet', '--no-tags', '--depth=1', repositoryUrl, requestedCommit],
				{ stdio: ['ignore', 'pipe', 'pipe'] },
			);
		} catch {
			throw new Error(
				`packet lock target is not published by ${sourceRepo}: ${requestedCommit}. Push the packet commit, then retry.`,
			);
		}
		const observed = execFileSync('git', ['-C', probeRoot, 'rev-parse', '--verify', 'FETCH_HEAD^{commit}'], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		}).trim();
		if (observed !== requestedCommit) {
			throw new Error(
				`published packet target resolved unexpectedly: requested ${requestedCommit}, observed ${observed}`,
			);
		}
		return observed;
	} finally {
		rmSync(probeRoot, { recursive: true, force: true });
	}
}

export function verifyPacketCheckout(packetPath, lock = readPacketLock()) {
	const actual = execFileSync('git', ['-C', packetPath, 'rev-parse', '--verify', 'HEAD^{commit}'], {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
	if (actual !== lock.sourceCommit) {
		throw new Error(
			`packet checkout does not match the committed lock: expected ${lock.sourceCommit}, observed ${actual}`,
		);
	}
	return lock;
}

export function verifyGeneratedLock(expectedRepo, expectedCommit, expectedBookletDigest, manifestPath = MANIFEST_PATH) {
	const observed = readPacketLock(manifestPath);
	if (
		observed.sourceRepo !== expectedRepo ||
		observed.sourceCommit !== expectedCommit ||
		bookletDigest(observed.booklet) !== expectedBookletDigest
	) {
		throw new Error(
			'content sync changed the committed packet lock: ' +
				`expected ${expectedRepo}@${expectedCommit} booklet ${expectedBookletDigest}, ` +
				`observed ${observed.sourceRepo}@${observed.sourceCommit} booklet ${bookletDigest(observed.booklet)}`,
		);
	}
	return observed;
}

function snapshotPaths(paths) {
	const backupRoot = mkdtempSync(join(tmpdir(), 'woodshed-packet-lock-'));
	const states = paths.map((path, index) => {
		const present = existsSync(path);
		const backup = join(backupRoot, String(index));
		if (present) cpSync(path, backup, { recursive: true });
		return { path, backup, present };
	});
	return {
		restore() {
			for (const { path, backup, present } of states) {
				rmSync(path, { recursive: true, force: true });
				if (present) cpSync(backup, path, { recursive: true });
			}
		},
		remove() {
			rmSync(backupRoot, { recursive: true, force: true });
		},
	};
}

export function advancePacketLock(targetCommit, options = {}) {
	const packetPath = resolve(options.packetPath ?? DEFAULT_PACKET_PATH);
	const manifestPath = resolve(options.manifestPath ?? MANIFEST_PATH);
	const oldLock = readPacketLock(manifestPath);
	const targetBooklet = options.bookletMetadata
		? parseBookletMetadata(JSON.stringify(options.bookletMetadata))
		: oldLock.booklet;
	const resolvedCommit = resolveReachablePacketCommit(packetPath, targetCommit);
	(options.verifyPublished ?? verifyPublishedPacketCommit)(oldLock.sourceRepo, resolvedCommit, options.remoteUrl);
	const trackedRoot = resolve(dirname(manifestPath), '..', '..');
	const transactionPath = join(trackedRoot, '.packet-lock.transaction');
	let transaction;
	try {
		transaction = openSync(transactionPath, 'wx');
	} catch {
		throw new Error(`packet lock transaction already active: ${transactionPath}`);
	}
	const snapshot = snapshotPaths([
		join(trackedRoot, 'src', 'content'),
		join(trackedRoot, 'static', 'capabilities.json'),
		join(trackedRoot, 'static', 'generated'),
	]);

	try {
		const targetManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
		targetManifest.sourceCommit = resolvedCommit;
		targetManifest.booklet = targetBooklet;
		writeFileSync(manifestPath, JSON.stringify(targetManifest, null, '\t') + '\n');
		(options.runSync ?? execFileSync)(process.execPath, [join(trackedRoot, 'scripts', 'sync-content.mjs')], {
			cwd: trackedRoot,
			stdio: 'inherit',
			env: {
				...process.env,
				WOODSHED_PACKET_PATH: packetPath,
			},
		});
		const newLock = verifyGeneratedLock(oldLock.sourceRepo, resolvedCommit, bookletDigest(targetBooklet), manifestPath);
		if (serializeBookletMetadata(newLock.booklet) !== serializeBookletMetadata(targetBooklet)) {
			throw new Error('content sync changed the requested booklet metadata');
		}
		return { oldLock, newLock };
	} catch (error) {
		snapshot.restore();
		throw error;
	} finally {
		snapshot.remove();
		closeSync(transaction);
		rmSync(transactionPath, { force: true });
	}
}

function usage() {
	return [
		'usage:',
		'  node scripts/packet-lock.mjs <40-char-sha> [--booklet-metadata <path>]',
		'  node scripts/packet-lock.mjs --github-output [path]',
		'  node scripts/packet-lock.mjs --verify-checkout [packet-path]',
		'  node scripts/packet-lock.mjs --verify-generated <repo> <40-char-sha> <booklet-digest>',
	].join('\n');
}

function main(args) {
	const [command, ...rest] = args;
	if (command === '--github-output') {
		const outputPath = rest[0] ?? process.env.GITHUB_OUTPUT;
		if (!outputPath) throw new Error('--github-output requires a path or GITHUB_OUTPUT');
		const lock = readPacketLock();
		appendFileSync(
			outputPath,
			`repository=${lock.sourceRepo}\ncommit=${lock.sourceCommit}\nbooklet_digest=${bookletDigest(lock.booklet)}\n`,
		);
		console.log(`packet-lock: ${lock.sourceRepo}@${lock.sourceCommit}`);
		return;
	}
	if (command === '--verify-checkout') {
		const packetPath = resolve(rest[0] ?? DEFAULT_PACKET_PATH);
		const lock = verifyPacketCheckout(packetPath);
		console.log(`packet-lock: verified checkout ${lock.sourceRepo}@${lock.sourceCommit}`);
		return;
	}
	if (command === '--verify-generated') {
		if (rest.length !== 3) throw new Error(usage());
		const lock = verifyGeneratedLock(rest[0], rest[1], rest[2]);
		console.log(`packet-lock: reproduced ${lock.sourceRepo}@${lock.sourceCommit}`);
		return;
	}
	if (!command || (rest.length !== 0 && (rest.length !== 2 || rest[0] !== '--booklet-metadata'))) {
		throw new Error(usage());
	}
	const bookletMetadata = rest.length === 2 ? parseBookletMetadata(readFileSync(resolve(rest[1]), 'utf8')) : undefined;
	const { oldLock, newLock } = advancePacketLock(command, { bookletMetadata });
	console.log(`packet-lock: old ${oldLock.sourceRepo}@${oldLock.sourceCommit}`);
	console.log(`packet-lock: new ${newLock.sourceRepo}@${newLock.sourceCommit}`);
	console.log(
		`packet-lock: booklet ${newLock.booklet.sourceRepo}@${newLock.booklet.tagName} ${bookletDigest(newLock.booklet)}`,
	);
}

if (resolve(process.argv[1] ?? '') === THIS_FILE) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		console.error(error instanceof Error ? `packet-lock: ${error.message}` : error);
		process.exitCode = 1;
	}
}
