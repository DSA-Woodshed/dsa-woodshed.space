import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The public scaffold and its executable pin contract move together.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8')) as {
	packageManager?: string;
	engines?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	optionalDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
};

const allDeclaredDeps: Record<string, string> = {
	...(packageJson.dependencies ?? {}),
	...(packageJson.devDependencies ?? {}),
	...(packageJson.optionalDependencies ?? {}),
	...(packageJson.peerDependencies ?? {}),
};

describe('selected frontend-stack exact-pin contract', () => {
	it('keeps Skeleton + skeleton-svelte EXACT at 5.0.1', () => {
		expect(packageJson.devDependencies?.['@skeletonlabs/skeleton']).toBe('5.0.1');
		expect(packageJson.devDependencies?.['@skeletonlabs/skeleton-svelte']).toBe('5.0.1');
	});

	it('keeps TypeScript exactly pinned to the selected scaffold version', () => {
		expect(packageJson.devDependencies?.typescript).toBe('6.0.3');
	});

	it('keeps pnpm 10.13.1 EXACT via packageManager (never pnpm 9)', () => {
		expect(packageJson.packageManager).toBe('pnpm@10.13.1');
	});

	it('keeps the icon identity on scoped @lucide/svelte 1.x; unscoped lucide-svelte is retired', () => {
		expect(packageJson.dependencies?.['@lucide/svelte']).toMatch(/^\^1\./);
		expect(allDeclaredDeps['lucide-svelte']).toBeUndefined();
	});

	it('never declares @zag-js as a direct dependency (transitive through Skeleton only)', () => {
		const directZag = Object.keys(allDeclaredDeps).filter((name) => name === '@zag-js' || name.startsWith('@zag-js/'));
		expect(directZag).toEqual([]);
	});

	it('keeps the Node 22 engines window', () => {
		expect(packageJson.engines?.node).toBe('>=22 <23');
	});

	it('keeps the Bazel toolchains on the same selected pins', () => {
		const module = readFileSync(path.join(repoRoot, 'MODULE.bazel'), 'utf8');
		expect(module).toContain('ts_version = "6.0.3"');
		expect(module).toContain('node_version = "22.13.1"');
		expect(module).toContain('pnpm_version = "10.13.1"');
	});
});
