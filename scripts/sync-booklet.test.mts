import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	BOOKLET_ASSET_NAME,
	MAX_BOOKLET_BYTES,
	bookletLocalUrl,
	parseBookletMetadata,
	resolveBookletRelease,
	serializeBookletMetadata,
	syncBookletRelease,
	verifyBookletArtifacts,
	verifyBookletBytes,
} from './sync-booklet.mjs';

const SOURCE_REPO = 'DSA-Woodshed/dsa-study-packet';

function pdfBytes(body = 'test booklet') {
	return Buffer.from(`%PDF-1.7\n${body}\n%%EOF\n`, 'utf8');
}

function digest(bytes: Uint8Array) {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function releasePayload(bytes = pdfBytes()) {
	return {
		tag_name: 'v2026.7.1',
		published_at: '2026-07-23T03:52:52Z',
		html_url: `https://github.com/${SOURCE_REPO}/releases/tag/v2026.7.1`,
		draft: false,
		prerelease: false,
		assets: [
			{
				name: '01-python-stdlib.pdf',
				size: 123,
				digest: `sha256:${'0'.repeat(64)}`,
				browser_download_url: `https://github.com/${SOURCE_REPO}/releases/download/v2026.7.1/01-python-stdlib.pdf`,
			},
			{
				name: BOOKLET_ASSET_NAME,
				size: bytes.byteLength,
				digest: digest(bytes),
				browser_download_url: `https://github.com/${SOURCE_REPO}/releases/download/v2026.7.1/${BOOKLET_ASSET_NAME}`,
			},
		],
	};
}

function paths(root: string) {
	return {
		metadataPath: join(root, 'src', 'content', '.booklet.json'),
		pdfPath: join(root, 'static', 'generated', BOOKLET_ASSET_NAME),
	};
}

let tempRoots: string[] = [];

afterEach(() => {
	for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
	tempRoots = [];
});

describe('resolveBookletRelease', () => {
	it('selects the one exact booklet asset and emits the stable route contract', () => {
		const bytes = pdfBytes();

		expect(resolveBookletRelease(releasePayload(bytes))).toEqual({
			sourceRepo: SOURCE_REPO,
			tagName: 'v2026.7.1',
			publishedAt: '2026-07-23T03:52:52Z',
			releaseUrl: `https://github.com/${SOURCE_REPO}/releases/tag/v2026.7.1`,
			asset: {
				name: BOOKLET_ASSET_NAME,
				size: bytes.byteLength,
				digest: digest(bytes),
				downloadUrl: `https://github.com/${SOURCE_REPO}/releases/download/v2026.7.1/${BOOKLET_ASSET_NAME}`,
				localUrl: bookletLocalUrl(digest(bytes)),
			},
		});
	});

	it('fails closed for a draft, missing asset, duplicate asset, malformed digest, or oversized booklet', () => {
		const draft = { ...releasePayload(), draft: true };
		expect(() => resolveBookletRelease(draft)).toThrow('not a public stable release');

		const missing = { ...releasePayload(), assets: [] };
		expect(() => resolveBookletRelease(missing)).toThrow('found 0');

		const valid = releasePayload();
		const duplicate = { ...valid, assets: [...valid.assets, valid.assets[1]] };
		expect(() => resolveBookletRelease(duplicate)).toThrow('found 2');

		const malformed = releasePayload();
		malformed.assets[1].digest = 'sha256:not-a-digest';
		expect(() => resolveBookletRelease(malformed)).toThrow('invalid SHA-256 digest');

		const oversized = releasePayload();
		oversized.assets[1].size = MAX_BOOKLET_BYTES + 1;
		expect(() => resolveBookletRelease(oversized)).toThrow('exceeds');
	});

	it('rejects non-GitHub release and asset URLs', () => {
		const release = releasePayload();
		release.html_url = 'https://example.com/releases/tag/v1';
		expect(() => resolveBookletRelease(release)).toThrow('must use https://github.com');

		const asset = releasePayload();
		asset.assets[1].browser_download_url = 'https://example.com/booklet.pdf';
		expect(() => resolveBookletRelease(asset)).toThrow('must use https://github.com');
	});
});

describe('booklet byte verification', () => {
	it('accepts matching PDF bytes and returns the canonical digest', () => {
		const bytes = pdfBytes();
		const metadata = resolveBookletRelease(releasePayload(bytes));

		expect(verifyBookletBytes(bytes, metadata.asset)).toBe(digest(bytes));
	});

	it('rejects a missing PDF header, size mismatch, and digest mismatch', () => {
		const bytes = pdfBytes();
		const asset = resolveBookletRelease(releasePayload(bytes)).asset;

		expect(() => verifyBookletBytes(Buffer.from('not a PDF'), asset)).toThrow('does not begin with %PDF-');
		expect(() => verifyBookletBytes(bytes, { ...asset, size: bytes.byteLength + 1 })).toThrow('size mismatch');
		expect(() => verifyBookletBytes(bytes, { ...asset, digest: `sha256:${'0'.repeat(64)}` })).toThrow(
			'digest mismatch',
		);
	});
});

describe('generated metadata', () => {
	it('serializes deterministically and parses the TS-friendly contract', () => {
		const metadata = resolveBookletRelease(releasePayload());
		const serialized = serializeBookletMetadata(metadata);

		expect(serialized.endsWith('\n')).toBe(true);
		expect(parseBookletMetadata(serialized)).toEqual(metadata);
		expect(serializeBookletMetadata(parseBookletMetadata(serialized))).toBe(serialized);
	});

	it('accepts a transferred-owner release when every URL belongs to that repository', () => {
		const sourceRepo = 'DSA-Woodshed/dsa-study-packet';
		const payload = releasePayload();
		payload.html_url = payload.html_url.replace(SOURCE_REPO, sourceRepo);
		payload.assets[1].browser_download_url = payload.assets[1].browser_download_url.replace(SOURCE_REPO, sourceRepo);
		const metadata = resolveBookletRelease(payload, sourceRepo);

		expect(parseBookletMetadata(serializeBookletMetadata(metadata))).toEqual(metadata);
	});

	it('rejects invalid JSON and metadata that does not point at the same-origin asset', () => {
		expect(() => parseBookletMetadata('{')).toThrow('not valid JSON');

		const metadata = resolveBookletRelease(releasePayload());
		const wrongUrl = JSON.stringify({
			...metadata,
			asset: { ...metadata.asset, localUrl: 'https://github.com/example.pdf' },
		});
		expect(() => parseBookletMetadata(wrongUrl)).toThrow('same-origin booklet asset');
	});
});

describe('syncBookletRelease', () => {
	it('reproduces pinned metadata without consulting the mutable latest-release endpoint', async () => {
		const root = mkdtempSync(join(tmpdir(), 'woodshed-booklet-locked-'));
		tempRoots.push(root);
		const output = paths(root);
		const bytes = pdfBytes('pinned release');
		const metadata = resolveBookletRelease(releasePayload(bytes));
		const calls: string[] = [];
		const fetchImpl = async (input: string | URL | Request) => {
			const url = String(input);
			calls.push(url);
			return new Response(bytes, { status: 200 });
		};

		const observed = await syncBookletRelease({ ...output, fetchImpl, lockedMetadata: metadata });

		expect(observed).toEqual(metadata);
		expect(calls).toEqual([metadata.asset.downloadUrl]);
		expect(parseBookletMetadata(readFileSync(output.metadataPath, 'utf8'))).toEqual(metadata);
	});

	it('publishes verified PDF and metadata artifacts', async () => {
		const root = mkdtempSync(join(tmpdir(), 'woodshed-booklet-sync-'));
		tempRoots.push(root);
		const output = paths(root);
		const assetRoot = join(root, 'static');
		const generatedDir = join(assetRoot, 'generated');
		mkdirSync(generatedDir, { recursive: true });
		writeFileSync(join(generatedDir, 'booklet.pdf'), 'legacy PDF');
		writeFileSync(join(generatedDir, `booklet-${'0'.repeat(64)}.pdf`), 'stale PDF');
		const bytes = pdfBytes('verified release');
		const release = releasePayload(bytes);
		const calls: string[] = [];
		const fetchImpl = async (input: string | URL | Request) => {
			const url = String(input);
			calls.push(url);
			if (url.endsWith('/releases/latest')) {
				return new Response(JSON.stringify(release), { status: 200 });
			}
			return new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/pdf' } });
		};

		const metadata = await syncBookletRelease({
			metadataPath: output.metadataPath,
			assetRoot,
			fetchImpl,
		});
		const generatedPdfPath = join(assetRoot, metadata.asset.localUrl.slice(1));

		expect(calls).toHaveLength(2);
		expect(readFileSync(generatedPdfPath)).toEqual(bytes);
		expect(() => readFileSync(join(generatedDir, 'booklet.pdf'))).toThrow();
		expect(() => readFileSync(join(generatedDir, `booklet-${'0'.repeat(64)}.pdf`))).toThrow();
		expect(parseBookletMetadata(readFileSync(output.metadataPath, 'utf8'))).toEqual(metadata);
		expect(verifyBookletArtifacts({ metadataPath: output.metadataPath, assetRoot })).toEqual(metadata);
	});

	it('removes stale and temporary artifacts when verification fails', async () => {
		const root = mkdtempSync(join(tmpdir(), 'woodshed-booklet-sync-'));
		tempRoots.push(root);
		const output = paths(root);
		mkdirSync(dirname(output.metadataPath), { recursive: true });
		mkdirSync(dirname(output.pdfPath), { recursive: true });
		writeFileSync(output.metadataPath, 'stale metadata');
		writeFileSync(output.pdfPath, 'stale PDF');

		const expected = pdfBytes('expected');
		const corrupt = pdfBytes('corrupt');
		const release = releasePayload(expected);
		const fetchImpl = async (input: string | URL | Request) =>
			String(input).endsWith('/releases/latest')
				? new Response(JSON.stringify(release), { status: 200 })
				: new Response(corrupt, { status: 200 });

		await expect(syncBookletRelease({ ...output, fetchImpl })).rejects.toThrow(/size mismatch|digest mismatch/);
		expect(() => readFileSync(output.metadataPath)).toThrow();
		expect(() => readFileSync(output.pdfPath)).toThrow();
		expect(() => readFileSync(`${output.metadataPath}.tmp-${process.pid}`)).toThrow();
		expect(() => readFileSync(`${output.pdfPath}.tmp-${process.pid}`)).toThrow();
	});

	it('fails closed when a request exceeds its bounded timeout', async () => {
		const root = mkdtempSync(join(tmpdir(), 'woodshed-booklet-sync-'));
		tempRoots.push(root);
		const output = paths(root);
		const fetchImpl = async (_input: string | URL | Request, init?: RequestInit) =>
			await new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
			});

		await expect(syncBookletRelease({ ...output, fetchImpl, fetchTimeoutMs: 5 })).rejects.toThrow(
			'timed out after 5ms',
		);
		expect(() => readFileSync(output.metadataPath)).toThrow();
		expect(() => readFileSync(output.pdfPath)).toThrow();
	});

	it('rejects a declared Content-Length mismatch before buffering the asset', async () => {
		const root = mkdtempSync(join(tmpdir(), 'woodshed-booklet-sync-'));
		tempRoots.push(root);
		const output = paths(root);
		const bytes = pdfBytes('verified release');
		const release = releasePayload(bytes);
		const fetchImpl = async (input: string | URL | Request) =>
			String(input).endsWith('/releases/latest')
				? new Response(JSON.stringify(release), { status: 200 })
				: new Response(bytes, {
						status: 200,
						headers: { 'Content-Length': String(bytes.byteLength + 1) },
					});

		await expect(syncBookletRelease({ ...output, fetchImpl })).rejects.toThrow('Content-Length mismatch');
		expect(() => readFileSync(output.metadataPath)).toThrow();
		expect(() => readFileSync(output.pdfPath)).toThrow();
	});
});
