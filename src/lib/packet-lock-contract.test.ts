import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const ci = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
const pages = readFileSync(path.join(repoRoot, '.github/workflows/deploy-pages.yml'), 'utf8');
const justfile = readFileSync(path.join(repoRoot, 'Justfile'), 'utf8');
const syncContent = readFileSync(path.join(repoRoot, 'scripts/sync-content.mjs'), 'utf8');

function expectPinnedPacketCheckout(workflow: string) {
	const readLock = workflow.indexOf('id: packet-lock');
	const packetCheckout = workflow.indexOf('name: Check out the study packet');
	const verifyCheckout = workflow.indexOf('name: Verify the locked packet checkout');
	const sync = workflow.indexOf('run: pnpm run sync-content');
	const verifyGenerated = workflow.indexOf('name: Verify the packet lock reproduced exactly');

	expect(readLock).toBeGreaterThan(-1);
	expect(packetCheckout).toBeGreaterThan(readLock);
	expect(verifyCheckout).toBeGreaterThan(packetCheckout);
	expect(sync).toBeGreaterThan(verifyCheckout);
	expect(verifyGenerated).toBeGreaterThan(sync);
	expect(workflow).toContain('repository: ${{ steps.packet-lock.outputs.repository }}');
	expect(workflow).toContain('ref: ${{ steps.packet-lock.outputs.commit }}');
	expect(workflow).toContain('${{ steps.packet-lock.outputs.booklet_digest }}');
	expect(workflow).toContain('git diff --exit-code -- src/content/.manifest.json static/agent-map.md');
	expect(workflow).not.toContain('repository: Jesssullivan/dsa-study-packet');
}

describe('packet lock workflow contract', () => {
	it('pins both CI and Pages to the committed packet revision', () => {
		expectPinnedPacketCheckout(ci);
		expectPinnedPacketCheckout(pages);
	});

	it('keeps the full CI matrix on the bounded GitHub-hosted bridge', () => {
		expect(ci).not.toContain('runs-on: tinyland-docker');
		expect(pages).not.toContain('runs-on: tinyland-docker');
		expect(ci.match(/runs-on: ubuntu-latest/g)).toHaveLength(2);
		expect(pages.match(/runs-on: ubuntu-latest/g)).toHaveLength(2);
		for (const command of ['just test', 'pnpm run check', 'pnpm run lint', 'pnpm run build', 'pnpm run test:e2e']) {
			expect(ci).toContain(command);
		}
		expect(ci).toContain('playwright install --with-deps chromium');
		expect(pages).toContain('playwright install --with-deps chromium');
	});

	it('orders Pages deployment and verifies the exact public receipt', () => {
		expect(pages).toContain('group: github-pages-production');
		expect(pages).toContain('cancel-in-progress: true');
		expect(pages).toContain('Refuse an out-of-date main deployment');
		expect(pages).toContain('deployment-receipt.mjs --write');
		expect(pages).toContain('Verify production serves this exact site and packet pair');
		expect(pages).toContain('deployment-receipt.mjs --verify-url');
	});

	it('exposes one explicit maintainer lock-advancement recipe', () => {
		expect(justfile).toMatch(/^packet-lock sha:\n\tnode scripts\/packet-lock\.mjs "{{sha}}"$/m);
		expect(syncContent).not.toContain('WOODSHED_PACKET_COMMIT');
		expect(syncContent).toContain('const sourceRepo = lock.sourceRepo;');
		expect(syncContent).toContain('/blob/${sourceCommit}/');
		expect(syncContent).toContain('lockedMetadata: lock.booklet');
	});
});
