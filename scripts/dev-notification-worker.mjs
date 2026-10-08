import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const entry = resolve(projectRoot, 'packages/server/scripts/worker.ts');
const env = { ...process.env, WORKER_POLL_INTERVAL_SECONDS: process.env.WORKER_POLL_INTERVAL_SECONDS ?? '1' };
const child = spawn(process.execPath, ['--env-file-if-exists=.env', '--import', 'tsx', entry], {
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
