import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const viteCli = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
const workspace = process.env.BUILD_WORKSPACE_DIRECTORY;
if (!workspace) {
	throw new Error('BUILD_WORKSPACE_DIRECTORY is required; run this target with bazel run');
}

const child = spawn(process.execPath, [viteCli, 'dev', ...process.argv.slice(2)], {
	stdio: 'inherit',
	env: process.env,
	cwd: workspace,
});

child.on('error', (error) => {
	console.error(error);
	process.exit(1);
});

child.on('exit', (code, signal) => {
	process.exit(signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : (code ?? 1));
});

for (const signal of ['SIGINT', 'SIGTERM']) {
	process.once(signal, () => child.kill(signal));
}
