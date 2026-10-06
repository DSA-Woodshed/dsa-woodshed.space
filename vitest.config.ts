import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			$lib: path.resolve(__dirname, 'src/lib'),
			// Mirror svelte.config.js's $content alias so tests can import the
			// registry, which reads the committed src/content/.manifest.json.
			$content: path.resolve(__dirname, 'src/content'),
		},
	},
	test: {
		include: ['src/**/*.test.ts', 'src/**/*.test.svelte.ts', 'scripts/**/*.test.mts'],
		environment: 'node',
		globals: true,
		passWithNoTests: false,
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			thresholds: {
				lines: 50,
				functions: 50,
				branches: 50,
				statements: 50,
			},
			include: ['src/**/*.{ts,svelte.ts}', 'scripts/**/*.mts'],
			exclude: ['**/*.test.ts', '**/*.test.mts', '**/*.test.svelte.ts'],
		},
	},
});
