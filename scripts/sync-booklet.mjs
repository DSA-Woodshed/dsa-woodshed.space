// Resolve and verify the packet's latest public booklet release.
//
// This is a build-input sync, not a runtime fetch. The verified PDF is copied
// under static/ so the deployed reader stays same-origin. Its release metadata
// is written beside the generated content and consumed by the printables route.
//
// PLAIN NODE. No dependencies or bundler. Runs under Node 22.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const THIS_FILE = fileURLToPath(import.meta.url);
const HERE = dirname(THIS_FILE);
const REPO_ROOT = resolve(HERE, '..');

export const SOURCE_REPO = 'Jesssullivan/dsa-study-packet';
export const BOOKLET_REPOSITORIES = new Set([SOURCE_REPO, 'DSA-Woodshed/dsa-study-packet']);
export const BOOKLET_ASSET_NAME = 'booklet.pdf';
export const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${SOURCE_REPO}/releases/latest`;
export const BOOKLET_METADATA_PATH = join(REPO_ROOT, 'src', 'content', '.booklet.json');
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000;
export const MAX_BOOKLET_BYTES = 50 * 1024 * 1024;
const STATIC_ASSET_ROOT = join(REPO_ROOT, 'static');
const BUILD_ASSET_ROOT = join(REPO_ROOT, 'build');
const GENERATED_BOOKLET_NAME = /^booklet-(?:[0-9a-f]{64})\.pdf(?:\.tmp-\d+)?$/;
const LEGACY_BOOKLET_NAME = /^booklet\.pdf(?:\.tmp-\d+)?$/;

/**
 * @typedef {object} BookletAssetMetadata
 * @property {string} name
 * @property {number} size
 * @property {string} digest canonical `sha256:<hex>` digest from GitHub
 * @property {string} downloadUrl immutable release-asset URL
 * @property {string} localUrl same-origin public URL
 *
 * @typedef {object} BookletMetadata
 * @property {string} sourceRepo
 * @property {string} tagName
 * @property {string} publishedAt
 * @property {string} releaseUrl
 * @property {BookletAssetMetadata} asset
 */

function isRecord(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireNonemptyString(value, label) {
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(`booklet release has no valid ${label}`);
	}
	return value;
}

function requireHttpsUrl(value, label, allowedHost) {
	const raw = requireNonemptyString(value, label);
	let parsed;
	try {
		parsed = new URL(raw);
	} catch {
		throw new Error(`booklet release has an invalid ${label}: ${JSON.stringify(raw)}`);
	}
	if (parsed.protocol !== 'https:' || parsed.hostname !== allowedHost) {
		throw new Error(`booklet release ${label} must use https://${allowedHost}: ${JSON.stringify(raw)}`);
	}
	return parsed.toString();
}

function requireReleaseUrl(value, label, sourceRepo) {
	const url = requireHttpsUrl(value, label, 'github.com');
	const path = new URL(url).pathname;
	if (!path.startsWith(`/${sourceRepo}/releases/`)) {
		throw new Error(`booklet release ${label} does not belong to ${sourceRepo}: ${JSON.stringify(url)}`);
	}
	return url;
}

function requireDigest(value) {
	const digest = requireNonemptyString(value, 'asset digest');
	if (!/^sha256:[0-9a-f]{64}$/.test(digest)) {
		throw new Error(`booklet release has an invalid SHA-256 digest: ${JSON.stringify(digest)}`);
	}
	return digest;
}

export function bookletLocalUrl(digest) {
	return `/generated/booklet-${requireDigest(digest).slice('sha256:'.length)}.pdf`;
}

function requireSize(value) {
	if (!Number.isSafeInteger(value) || value <= 5) {
		throw new Error(`booklet release has an invalid asset size: ${JSON.stringify(value)}`);
	}
	if (value > MAX_BOOKLET_BYTES) {
		throw new Error(`booklet release asset exceeds the ${MAX_BOOKLET_BYTES}-byte safety limit: ${value}`);
	}
	return value;
}

/**
 * Validate GitHub's latest-release response and select exactly booklet.pdf.
 *
 * @param {unknown} payload
 * @returns {BookletMetadata}
 */
export function resolveBookletRelease(payload, sourceRepo = SOURCE_REPO) {
	if (!isRecord(payload)) {
		throw new Error('GitHub latest-release response is not an object');
	}
	if (payload.draft !== false || payload.prerelease !== false) {
		throw new Error('GitHub latest-release response is not a public stable release');
	}

	const assets = Array.isArray(payload.assets) ? payload.assets : [];
	const matches = assets.filter((asset) => isRecord(asset) && asset.name === BOOKLET_ASSET_NAME);
	if (matches.length !== 1) {
		throw new Error(`latest packet release must contain exactly one ${BOOKLET_ASSET_NAME}; found ${matches.length}`);
	}

	const asset = matches[0];
	const publishedAt = requireNonemptyString(payload.published_at, 'published_at');
	if (Number.isNaN(Date.parse(publishedAt))) {
		throw new Error(`booklet release has an invalid published_at: ${JSON.stringify(publishedAt)}`);
	}
	const digest = requireDigest(asset.digest);

	if (!BOOKLET_REPOSITORIES.has(sourceRepo)) {
		throw new Error(`booklet release sourceRepo is not approved: ${sourceRepo}`);
	}
	return {
		sourceRepo,
		tagName: requireNonemptyString(payload.tag_name, 'tag_name'),
		publishedAt,
		releaseUrl: requireReleaseUrl(payload.html_url, 'html_url', sourceRepo),
		asset: {
			name: BOOKLET_ASSET_NAME,
			size: requireSize(asset.size),
			digest,
			downloadUrl: requireReleaseUrl(asset.browser_download_url, 'asset download URL', sourceRepo),
			localUrl: bookletLocalUrl(digest),
		},
	};
}

/**
 * Parse and validate the generated metadata contract.
 *
 * @param {string} text
 * @returns {BookletMetadata}
 */
export function parseBookletMetadata(text) {
	let value;
	try {
		value = JSON.parse(text);
	} catch {
		throw new Error('generated booklet metadata is not valid JSON');
	}
	if (!isRecord(value) || !isRecord(value.asset)) {
		throw new Error('generated booklet metadata has an invalid shape');
	}
	if (!BOOKLET_REPOSITORIES.has(value.sourceRepo)) {
		throw new Error(`generated booklet metadata has an invalid sourceRepo: ${value.sourceRepo}`);
	}
	const digest = requireDigest(value.asset.digest);
	if (value.asset.name !== BOOKLET_ASSET_NAME || value.asset.localUrl !== bookletLocalUrl(digest)) {
		throw new Error('generated booklet metadata does not describe the same-origin booklet asset');
	}

	const publishedAt = requireNonemptyString(value.publishedAt, 'publishedAt');
	if (Number.isNaN(Date.parse(publishedAt))) {
		throw new Error(`generated booklet metadata has an invalid publishedAt: ${publishedAt}`);
	}

	return {
		sourceRepo: value.sourceRepo,
		tagName: requireNonemptyString(value.tagName, 'tagName'),
		publishedAt,
		releaseUrl: requireReleaseUrl(value.releaseUrl, 'releaseUrl', value.sourceRepo),
		asset: {
			name: BOOKLET_ASSET_NAME,
			size: requireSize(value.asset.size),
			digest,
			downloadUrl: requireReleaseUrl(value.asset.downloadUrl, 'downloadUrl', value.sourceRepo),
			localUrl: bookletLocalUrl(digest),
		},
	};
}

/**
 * Require a nonempty PDF payload whose size and digest match the release.
 *
 * @param {Uint8Array} bytes
 * @param {BookletAssetMetadata} asset
 * @returns {string} the verified canonical SHA-256 digest
 */
export function verifyBookletBytes(bytes, asset) {
	if (!(bytes instanceof Uint8Array)) {
		throw new Error('downloaded booklet is not a byte array');
	}
	if (bytes.byteLength <= 5 || Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
		throw new Error('downloaded booklet is empty or does not begin with %PDF-');
	}
	if (bytes.byteLength !== asset.size) {
		throw new Error(`downloaded booklet size mismatch: expected ${asset.size} bytes, received ${bytes.byteLength}`);
	}

	const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
	if (actual !== asset.digest) {
		throw new Error(`downloaded booklet digest mismatch: expected ${asset.digest}, received ${actual}`);
	}
	return actual;
}

/**
 * Stable JSON used as a generated build input.
 *
 * @param {BookletMetadata} metadata
 * @returns {string}
 */
export function serializeBookletMetadata(metadata) {
	return JSON.stringify(metadata, null, '\t') + '\n';
}

function requestHeaders() {
	const headers = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'dsa-woodshed.space booklet sync',
		'X-GitHub-Api-Version': '2022-11-28',
	};
	const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

function bookletPath(assetRoot, localUrl) {
	if (!/^\/generated\/booklet-[0-9a-f]{64}\.pdf$/.test(localUrl)) {
		throw new Error(`generated booklet metadata has an unsafe localUrl: ${localUrl}`);
	}
	return join(assetRoot, localUrl.slice(1));
}

function removeGeneratedBooklets(assetRoot) {
	const generatedDir = join(assetRoot, 'generated');
	if (!existsSync(generatedDir)) return;
	for (const name of readdirSync(generatedDir)) {
		if (GENERATED_BOOKLET_NAME.test(name) || LEGACY_BOOKLET_NAME.test(name)) {
			rmSync(join(generatedDir, name), { force: true });
		}
	}
}

async function fetchWithTimeout(fetchImpl, url, label, timeoutMs) {
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
		throw new Error(`booklet fetch timeout must be a positive integer: ${timeoutMs}`);
	}
	const signal = AbortSignal.timeout(timeoutMs);
	try {
		return await fetchImpl(url, { headers: requestHeaders(), signal });
	} catch (error) {
		if (signal.aborted) {
			throw new Error(`${label} timed out after ${timeoutMs}ms`, { cause: error });
		}
		throw error;
	}
}

async function requireOk(response, label) {
	if (!response || typeof response.ok !== 'boolean') {
		throw new Error(`${label} did not return a Fetch API response`);
	}
	if (!response.ok) {
		throw new Error(`${label} failed with HTTP ${response.status}`);
	}
	return response;
}

function removeArtifacts(paths) {
	for (const path of paths) rmSync(path, { force: true });
}

/**
 * Fetch, verify, and atomically publish the latest release booklet.
 * Existing generated artifacts are removed before network I/O, so any failure
 * leaves the build closed rather than silently serving stale bytes.
 *
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   metadataPath?: string,
 *   pdfPath?: string,
 *   assetRoot?: string,
 *   apiUrl?: string,
 *   fetchTimeoutMs?: number,
 *   lockedMetadata?: BookletMetadata,
 * }} [options]
 * @returns {Promise<BookletMetadata>}
 */
export async function syncBookletRelease({
	fetchImpl = fetch,
	metadataPath = BOOKLET_METADATA_PATH,
	pdfPath,
	assetRoot = STATIC_ASSET_ROOT,
	apiUrl = LATEST_RELEASE_API_URL,
	fetchTimeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
	lockedMetadata,
} = {}) {
	const tempSuffix = `.tmp-${process.pid}`;
	const tempMetadataPath = `${metadataPath}${tempSuffix}`;
	let resolvedPdfPath = pdfPath;
	let tempPdfPath = pdfPath ? `${pdfPath}${tempSuffix}` : undefined;
	removeArtifacts([metadataPath, tempMetadataPath, resolvedPdfPath, tempPdfPath].filter(Boolean));
	if (!pdfPath) removeGeneratedBooklets(assetRoot);

	try {
		let metadata;
		if (lockedMetadata) {
			metadata = parseBookletMetadata(serializeBookletMetadata(lockedMetadata));
		} else {
			const releaseResponse = await requireOk(
				await fetchWithTimeout(fetchImpl, apiUrl, 'GitHub latest-release request', fetchTimeoutMs),
				'GitHub latest-release request',
			);
			metadata = resolveBookletRelease(await releaseResponse.json());
		}
		resolvedPdfPath ??= bookletPath(assetRoot, metadata.asset.localUrl);
		tempPdfPath ??= `${resolvedPdfPath}${tempSuffix}`;
		removeArtifacts([resolvedPdfPath, tempPdfPath]);

		const assetResponse = await requireOk(
			await fetchWithTimeout(fetchImpl, metadata.asset.downloadUrl, 'booklet asset request', fetchTimeoutMs),
			'booklet asset request',
		);
		const contentLength = assetResponse.headers.get('content-length');
		if (contentLength !== null && Number(contentLength) !== metadata.asset.size) {
			throw new Error(
				`booklet asset Content-Length mismatch: expected ${metadata.asset.size} bytes, received ${contentLength}`,
			);
		}
		const bytes = new Uint8Array(await assetResponse.arrayBuffer());
		verifyBookletBytes(bytes, metadata.asset);

		mkdirSync(dirname(metadataPath), { recursive: true });
		mkdirSync(dirname(resolvedPdfPath), { recursive: true });
		writeFileSync(tempMetadataPath, serializeBookletMetadata(metadata));
		writeFileSync(tempPdfPath, bytes);
		renameSync(tempPdfPath, resolvedPdfPath);
		renameSync(tempMetadataPath, metadataPath);
		return metadata;
	} catch (error) {
		removeArtifacts([metadataPath, tempMetadataPath, resolvedPdfPath, tempPdfPath].filter(Boolean));
		if (!pdfPath) removeGeneratedBooklets(assetRoot);
		throw error;
	}
}

/**
 * Verify an already-generated artifact against its metadata.
 *
 * @param {{metadataPath?: string, pdfPath?: string, assetRoot?: string}} [options]
 * @returns {BookletMetadata}
 */
export function verifyBookletArtifacts({
	metadataPath = BOOKLET_METADATA_PATH,
	pdfPath,
	assetRoot = STATIC_ASSET_ROOT,
} = {}) {
	if (!existsSync(metadataPath)) {
		throw new Error(`generated booklet metadata is missing: ${metadataPath}`);
	}
	const metadata = parseBookletMetadata(readFileSync(metadataPath, 'utf8'));
	const resolvedPdfPath = pdfPath ?? bookletPath(assetRoot, metadata.asset.localUrl);
	if (!existsSync(resolvedPdfPath)) {
		throw new Error(`generated booklet PDF is missing: ${resolvedPdfPath}`);
	}
	verifyBookletBytes(readFileSync(resolvedPdfPath), metadata.asset);
	return metadata;
}

async function main() {
	const command = process.argv[2] ?? 'sync';
	if (command === 'sync') {
		const metadata = await syncBookletRelease();
		console.log(`sync-booklet: wrote ${metadata.asset.size} verified bytes from ${SOURCE_REPO}@${metadata.tagName}`);
		return;
	}
	if (command === '--verify') {
		const metadata = verifyBookletArtifacts();
		console.log(`verify-booklet: OK: ${metadata.tagName} ${metadata.asset.digest}`);
		return;
	}
	if (command === '--verify-build') {
		const metadata = verifyBookletArtifacts({ assetRoot: BUILD_ASSET_ROOT });
		console.log(`verify-booklet: OK: build carries ${metadata.tagName} ${metadata.asset.digest}`);
		return;
	}
	throw new Error(`unknown sync-booklet command: ${command}`);
}

if (resolve(process.argv[1] ?? '') === THIS_FILE) {
	await main();
}
