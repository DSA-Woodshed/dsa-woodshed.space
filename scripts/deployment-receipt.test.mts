import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { expectedReceipt, verifyReceiptUrl, writeReceipt } from './deployment-receipt.mjs';

const roots: string[] = [];
const SITE_SHA = 'a'.repeat(40);
const PACKET_SHA = 'b'.repeat(40);
const DIGEST = `sha256:${'c'.repeat(64)}`;

function fixture() {
	const root = mkdtempSync(join(tmpdir(), 'woodshed-deployment-receipt-'));
	roots.push(root);
	const manifestPath = join(root, 'manifest.json');
	writeFileSync(
		manifestPath,
		JSON.stringify({
			sourceRepo: 'Jesssullivan/dsa-study-packet',
			sourceCommit: PACKET_SHA,
			booklet: {
				sourceRepo: 'Jesssullivan/dsa-study-packet',
				tagName: 'v1.0.0',
				publishedAt: '2026-01-01T00:00:00Z',
				releaseUrl: 'https://github.com/Jesssullivan/dsa-study-packet/releases/tag/v1.0.0',
				asset: {
					name: 'booklet.pdf',
					size: 6,
					digest: DIGEST,
					downloadUrl: 'https://github.com/Jesssullivan/dsa-study-packet/releases/download/v1.0.0/booklet.pdf',
					localUrl: `/generated/booklet-${'c'.repeat(64)}.pdf`,
				},
			},
		}),
	);
	return { root, manifestPath };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('deployment receipt', () => {
	it('writes one deterministic site, packet, and booklet binding', () => {
		const { root, manifestPath } = fixture();
		const output = join(root, 'build/deployment-receipt.json');
		const expected = expectedReceipt(SITE_SHA, manifestPath);
		writeReceipt(output, SITE_SHA, manifestPath);
		expect(expected).toEqual({
			schemaVersion: 1,
			siteCommit: SITE_SHA,
			packetRepo: 'Jesssullivan/dsa-study-packet',
			packetCommit: PACKET_SHA,
			bookletDigest: DIGEST,
		});
		expect(readFileSync(output, 'utf8')).toContain(`"siteCommit": "${SITE_SHA}"`);
		expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(expected);
	});

	it('retries stale public bytes and accepts only the exact receipt', async () => {
		const { manifestPath } = fixture();
		const expected = expectedReceipt(SITE_SHA, manifestPath);
		let calls = 0;
		const fetchImpl = async () => {
			calls += 1;
			return new Response(JSON.stringify(calls === 1 ? { ...expected, siteCommit: 'd'.repeat(40) } : expected));
		};

		await expect(
			verifyReceiptUrl('https://example.invalid/receipt', SITE_SHA, {
				manifestPath,
				fetchImpl,
				attempts: 2,
				delayMs: 0,
			}),
		).resolves.toEqual(expected);
		expect(calls).toBe(2);
	});
});
