import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
const root = path.resolve(import.meta.dirname, '../..');
const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
describe('public build entrypoint', () => {
	it('delegates package commands to Just and declares cold metadata dependencies', () => {
		expect(JSON.parse(read('package.json')).scripts.build).toBe('just build');
		expect(read('Justfile')).toContain('test: sync-content');
		expect(read('BUILD.bazel')).toContain(':sveltekit_types');
		expect(read('BUILD.bazel')).toContain('name = "unit_tests"');
	});
	it('runs the same local gate and browser acceptance in CI', () => {
		expect(read('.github/workflows/ci.yml')).toContain('nix develop .#playwright --command just gate');
		expect(read('.github/workflows/ci.yml')).toContain('pnpm exec playwright test');
	});
});
