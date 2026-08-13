import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	advancePacketLock,
	parsePacketLock,
	readPacketLock,
	resolveReachablePacketCommit,
	verifyGeneratedLock,
	verifyPacketCheckout,
	verifyPublishedPacketCommit,
} from './packet-lock.mjs';
import { readPacketFileAtCommit } from './sync-content.mjs';

const temporaryRoots: string[] = [];
const SOURCE_REPO = 'Jesssullivan/dsa-study-packet';
const BOOKLET_DIGEST = `sha256:${'1'.repeat(64)}`;
const BOOKLET = {
	sourceRepo: SOURCE_REPO,
	tagName: 'v1.0.0',
	publishedAt: '2026-01-01T00:00:00Z',
	releaseUrl: `https://github.com/${SOURCE_REPO}/releases/tag/v1.0.0`,
	asset: {
		name: 'booklet.pdf',
		size: 6,
		digest: BOOKLET_DIGEST,
		downloadUrl: `https://github.com/${SOURCE_REPO}/releases/download/v1.0.0/booklet.pdf`,
		localUrl: `/generated/booklet-${'1'.repeat(64)}.pdf`,
	},
};

const git = (cwd: string, args: string[]) =>
	execFileSync('git', ['-C', cwd, '-c', 'commit.gpgsign=false', ...args], {
		encoding: 'utf8',
		env: {
			...process.env,
			GIT_CONFIG_GLOBAL: '/dev/null',
			GIT_CONFIG_SYSTEM: '/dev/null',
		},
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();

function write(root: string, relative: string, text: string) {
	const target = path.join(root, relative);
	mkdirSync(path.dirname(target), { recursive: true });
	writeFileSync(target, text);
}

function manifest(sourceCommit: string, sourceRepo = SOURCE_REPO) {
	return JSON.stringify({ sourceRepo, sourceCommit, booklet: BOOKLET, entries: [] }, null, 2) + '\n';
}

function makePacketFixture() {
	const root = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-packet-'));
	temporaryRoots.push(root);
	git(root, ['init', '--quiet']);
	git(root, ['config', 'user.name', 'Woodshed Test']);
	git(root, ['config', 'user.email', 'woodshed@example.invalid']);
	write(root, 'value.txt', 'locked A\n');
	git(root, ['add', '.']);
	git(root, ['commit', '--quiet', '-m', 'packet A']);
	return root;
}

afterEach(() => {
	for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('packet revision lock', () => {
	it('rejects malformed SHAs and unapproved repositories', () => {
		expect(() => parsePacketLock('{')).toThrow('not valid JSON');
		expect(() => parsePacketLock(JSON.stringify({ sourceRepo: SOURCE_REPO, sourceCommit: 'a'.repeat(40) }))).toThrow(
			'must pin booklet metadata',
		);
		expect(() => parsePacketLock(manifest('abc'))).toThrow('lowercase 40-character');
		expect(() => parsePacketLock(manifest('A'.repeat(40)))).toThrow('lowercase 40-character');
		expect(() => parsePacketLock(manifest('a'.repeat(40), 'example/other'))).toThrow(
			'not an approved packet repository',
		);
	});

	it('accepts the destination owner while retaining the immutable pre-transfer booklet URL', () => {
		expect(parsePacketLock(manifest('a'.repeat(40), 'DSA-Woodshed/dsa-study-packet'))).toMatchObject({
			sourceRepo: 'DSA-Woodshed/dsa-study-packet',
			sourceCommit: 'a'.repeat(40),
			booklet: { sourceRepo: SOURCE_REPO },
		});
	});

	it('rejects a well-formed commit that is unreachable in the packet checkout', () => {
		const packet = makePacketFixture();
		expect(() => resolveReachablePacketCommit(packet, 'f'.repeat(40))).toThrow('not reachable');
	});

	it('rejects a local commit that has not been published by the packet remote', () => {
		const packet = makePacketFixture();
		const publishedCommit = git(packet, ['rev-parse', 'HEAD']);
		const remote = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-remote-'));
		temporaryRoots.push(remote);
		git(remote, ['clone', '--quiet', '--bare', packet, '.']);

		write(packet, 'value.txt', 'local only B\n');
		git(packet, ['add', '.']);
		git(packet, ['commit', '--quiet', '-m', 'local only B']);
		const localOnlyCommit = git(packet, ['rev-parse', 'HEAD']);

		expect(verifyPublishedPacketCommit(SOURCE_REPO, publishedCommit, remote)).toBe(publishedCommit);
		expect(() => verifyPublishedPacketCommit(SOURCE_REPO, localOnlyCommit, remote)).toThrow('not published');
	});

	it('rejects a checkout whose HEAD does not match the committed lock', () => {
		const packet = makePacketFixture();
		const commitA = git(packet, ['rev-parse', 'HEAD']);
		write(packet, 'value.txt', 'main advanced to B\n');
		git(packet, ['add', '.']);
		git(packet, ['commit', '--quiet', '-m', 'packet B']);

		expect(() => verifyPacketCheckout(packet, { sourceRepo: SOURCE_REPO, sourceCommit: commitA })).toThrow(
			`expected ${commitA}`,
		);
	});

	it('keeps build input on the locked commit when packet HEAD advances', () => {
		const packet = makePacketFixture();
		const commitA = git(packet, ['rev-parse', 'HEAD']);
		const site = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-site-'));
		temporaryRoots.push(site);
		const manifestPath = path.join(site, 'src/content/.manifest.json');
		write(site, 'src/content/.manifest.json', manifest(commitA));

		write(packet, 'value.txt', 'main advanced to B\n');
		git(packet, ['add', '.']);
		git(packet, ['commit', '--quiet', '-m', 'packet B']);

		const lock = readPacketLock(manifestPath);
		expect(resolveReachablePacketCommit(packet, lock.sourceCommit)).toBe(commitA);
		expect(readPacketFileAtCommit(packet, lock.sourceCommit, 'value.txt')).toBe('locked A\n');
		expect(git(packet, ['show', 'HEAD:value.txt'])).toBe('main advanced to B');
	});

	it('restores content, manifest, map, and booklet outputs when advancement fails', () => {
		const packet = makePacketFixture();
		const commitA = git(packet, ['rev-parse', 'HEAD']);
		write(packet, 'value.txt', 'target B\n');
		git(packet, ['add', '.']);
		git(packet, ['commit', '--quiet', '-m', 'packet B']);
		const commitB = git(packet, ['rev-parse', 'HEAD']);

		const site = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-site-'));
		temporaryRoots.push(site);
		const manifestPath = path.join(site, 'src/content/.manifest.json');
		write(site, 'src/content/.manifest.json', manifest(commitA));
		write(site, 'src/content/guide/body.md', 'old body\n');
		write(site, 'static/agent-map.md', 'old map\n');
		write(site, 'static/generated/booklet-old.pdf', 'old booklet\n');

		expect(() =>
			advancePacketLock(commitB, {
				packetPath: packet,
				manifestPath,
				verifyPublished: () => commitB,
				runSync: () => {
					write(site, 'src/content/.manifest.json', manifest(commitB));
					write(site, 'src/content/guide/body.md', 'partial body\n');
					write(site, 'static/agent-map.md', 'partial map\n');
					write(site, 'static/generated/booklet-new.pdf', 'partial booklet\n');
					throw new Error('injected sync failure');
				},
			}),
		).toThrow('injected sync failure');

		expect(readFileSync(manifestPath, 'utf8')).toBe(manifest(commitA));
		expect(readFileSync(path.join(site, 'src/content/guide/body.md'), 'utf8')).toBe('old body\n');
		expect(readFileSync(path.join(site, 'static/agent-map.md'), 'utf8')).toBe('old map\n');
		expect(readFileSync(path.join(site, 'static/generated/booklet-old.pdf'), 'utf8')).toBe('old booklet\n');
		expect(() => readFileSync(path.join(site, 'static/generated/booklet-new.pdf'), 'utf8')).toThrow();
		expect(() => readFileSync(path.join(site, '.packet-lock.transaction'), 'utf8')).toThrow();
	});

	it('fails closed when another lock transaction is active', () => {
		const packet = makePacketFixture();
		const commit = git(packet, ['rev-parse', 'HEAD']);
		const site = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-concurrent-'));
		temporaryRoots.push(site);
		const manifestPath = path.join(site, 'src/content/.manifest.json');
		write(site, 'src/content/.manifest.json', manifest(commit));
		write(site, '.packet-lock.transaction', 'active\n');

		expect(() =>
			advancePacketLock(commit, {
				packetPath: packet,
				manifestPath,
				verifyPublished: () => commit,
				runSync: () => undefined,
			}),
		).toThrow('transaction already active');
	});

	it('rejects regenerated content attributed to a different revision', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-generated-'));
		temporaryRoots.push(root);
		const manifestPath = path.join(root, '.manifest.json');
		writeFileSync(manifestPath, manifest('b'.repeat(40)));
		expect(() => verifyGeneratedLock(SOURCE_REPO, 'a'.repeat(40), BOOKLET_DIGEST, manifestPath)).toThrow(
			'content sync changed the committed packet lock',
		);
	});

	it('rejects regenerated content that changes the booklet input', () => {
		const root = mkdtempSync(path.join(tmpdir(), 'woodshed-lock-booklet-'));
		temporaryRoots.push(root);
		const manifestPath = path.join(root, '.manifest.json');
		writeFileSync(manifestPath, manifest('a'.repeat(40)));
		expect(() => verifyGeneratedLock(SOURCE_REPO, 'a'.repeat(40), `sha256:${'2'.repeat(64)}`, manifestPath)).toThrow(
			'content sync changed the committed packet lock',
		);
	});
});
