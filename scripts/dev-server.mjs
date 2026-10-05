import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const entry = resolve(projectRoot, 'packages/server/src/index.ts');
// Local browser mutations and generated public/manage URLs must share Vite's origin.
const env = { ...process.env, APP_BASE_URL: process.env.DEV_APP_BASE_URL ?? 'http://localhost:5173' };
const child = spawn(process.execPath, ['--import', 'tsx', '--watch', entry], {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
