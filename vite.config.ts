import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { accessibilityPlugin } from '@tummycrypt/vite-plugin-a11y';
import { skeletonColorUtilities } from '@tummycrypt/vite-plugin-skeleton-colors';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin, type PluginOption } from 'vite';
import pkg from './package.json' with { type: 'json' };

// Build-info constants (house build-info `define` pattern). Resolved
// once at config load. Env wins (CI), then a local git checkout, else unknown.
function resolveCommitHash(): string {
	const fromEnv = process.env.BUILD_COMMIT_SHA || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA || '';
	if (fromEnv) return fromEnv;
	try {
		// Declared build actions receive the stamped revision through the environment.
		return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return 'unknown';
	}
}

const inventory = JSON.parse(readFileSync(new URL('./static/capabilities.json', import.meta.url), 'utf8'));
const commitHash = resolveCommitHash();
const buildInfo = {
	version: pkg.version,
	commitHash,
	commitShort: commitHash === 'unknown' ? 'unknown' : commitHash.slice(0, 7),
};

// Bundle profiling: `ANALYZE=1 just build` (or `just analyze`) emits an
// interactive treemap at .bundle-stats/stats.html. Loaded lazily at module
// scope so ordinary builds never touch the plugin (it is a devDependency
// only). BUILD_ANALYZE is honored for backwards compatibility with the old
// Justfile recipe. Mirrors the house vite.config pattern.
const analyzePlugins: PluginOption[] = [];
const analyzeRequested =
	process.env.ANALYZE === '1' ||
	process.env.ANALYZE === 'true' ||
	process.env.BUILD_ANALYZE === '1' ||
	process.env.BUILD_ANALYZE === 'true';
if (analyzeRequested) {
	const { visualizer } = await import('rollup-plugin-visualizer');
	analyzePlugins.push(
		visualizer({
			filename: process.env.ANALYZE_OUTPUT_PATH || '.bundle-stats/stats.html',
			template: 'treemap',
			gzipSize: true,
			brotliSize: true,
		}) as Plugin,
	);
}

export default defineConfig({
	// Shared runes are TypeScript source; let the normal Vite/Svelte transforms
	// handle them rather than passing raw TypeScript to the dependency optimizer.
	optimizeDeps: { exclude: ['@xoxd/public-chrome'] },
	// Bazel's workspace links contain dependency fixtures and generated outputs.
	server: { watch: { ignored: ['**/bazel-*', '**/bazel-*/**'] } },
	plugins: [
		skeletonColorUtilities(),
		tailwindcss(),
		accessibilityPlugin({
			wcagLevel: 'AA',
			failOnError: false,
		}),
		sveltekit(),
		...analyzePlugins,
	],

	// Build-time constants. Source that reads __VERSION__ / __COMMIT_HASH__
	// should declare them as ambient globals (see src/app.d.ts when needed).
	define: {
		__CAPABILITY_INVENTORY__: JSON.stringify(inventory),
		__VERSION__: JSON.stringify(buildInfo.version),
		__COMMIT_HASH__: JSON.stringify(buildInfo.commitHash),
		__COMMIT_SHORT__: JSON.stringify(buildInfo.commitShort),
	},

	build: {
		reportCompressedSize: true,
		chunkSizeWarningLimit: 250,

		// CSS code splitting + Lightning CSS minification (house pattern).
		cssCodeSplit: true,
		cssMinify: 'lightningcss',

		// Vendor chunk splitter. vite 8 in this house is rolldown-backed, so
		// the splitter lives under `rolldownOptions` (the rollupOptions analog).
		// Only node_modules is split — SvelteKit owns app-code chunking.
		rolldownOptions: {
			output: {
				manualChunks(id: string) {
					if (!id.includes('node_modules')) return undefined;
					// Shiki ships big grammar/theme JSON. Isolate the WHOLE stack —
					// `shiki` itself plus the scoped `@shikijs/*` subpackages (core,
					// engines, grammars, themes, textmate) and the oniguruma regex
					// packages — into one lazy chunk. Matching only `/shiki/` misses
					// `@shikijs/*` + `oniguruma*`, which then merge into the shared
					// runtime chunk and load eagerly on every page.
					if (
						id.includes('/shiki/') ||
						id.includes('/@shikijs/') ||
						id.includes('/oniguruma-') ||
						id.includes('/vscode-textmate/')
					) {
						return 'vendor-shiki';
					}
					return undefined;
				},
			},
		},
	},
});
