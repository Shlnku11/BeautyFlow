import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = process.cwd();
const tokenFile = join(root, 'packages/client/src/tokens.css');
const css = readFileSync(tokenFile, 'utf8');
const tokens = new Map<string, string>();
for (const match of css.matchAll(/(--[\w-]+):\s*(#[\da-fA-F]{6})\s*;/g)) {
  const name = match[1];
  const value = match[2];
  if (name && value && !tokens.has(name)) tokens.set(name, value);
}

function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const rgb = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [];
  return 0.2126 * linear(rgb[0] ?? 0) + 0.7152 * linear(rgb[1] ?? 0) + 0.0722 * linear(rgb[2] ?? 0);
}

function ratio(foreground: string, background: string): number {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

const textPairs: [string, string][] = [
  ['--color-neutral-500', '--color-neutral-0'],
  ['--color-neutral-600', '--color-neutral-0'],
  ['--color-neutral-600', '--color-neutral-50'],
  ['--color-neutral-600', '--color-neutral-100'],
  ['--color-neutral-900', '--color-neutral-0'],
  ['--color-neutral-900', '--color-neutral-50'],
  ['--color-neutral-900', '--color-primary-100'],
  ['--color-neutral-600', '--surface-clay'],
  ['--color-neutral-600', '--surface-clay-raised'],
  ['--color-neutral-600', '--surface-clay-inset'],
  ['--color-neutral-900', '--surface-clay'],
  ['--color-neutral-900', '--surface-clay-raised'],
  ['--color-neutral-900', '--surface-clay-inset'],
  ['--color-neutral-700', '--color-neutral-100'],
  ['--color-success-fg', '--color-success-bg'],
  ['--color-warning-fg', '--color-warning-bg'],
  ['--color-danger-fg', '--color-danger-bg'],
  ['--color-info-fg', '--color-info-bg'],
  ['--color-primary-800', '--color-primary-100'],
  ...[
    ['staff-violet-fg', 'staff-violet-bg'], ['staff-rose-fg', 'staff-rose-bg'],
    ['staff-teal-fg', 'staff-teal-bg'], ['staff-amber-fg', 'staff-amber-bg'],
    ['staff-blue-fg', 'staff-blue-bg'], ['staff-green-fg', 'staff-green-bg'],
    ['staff-orange-fg', 'staff-orange-bg'], ['staff-slate-fg', 'staff-slate-bg'],
  ].map(([foreground, background]) => [`--color-${foreground}`, `--color-${background}`] as [string, string]),
  ['--color-neutral-0', '--color-primary-600'],
  ['--color-neutral-0', '--color-primary-700'],
];

const boundaryPairs: [string, string][] = [
  ['--color-neutral-400', '--color-neutral-0'],
  ['--color-neutral-400', '--color-neutral-50'],
  ['--color-neutral-400', '--surface-clay'],
  ['--color-neutral-400', '--surface-clay-raised'],
  ['--color-neutral-400', '--surface-clay-inset'],
  ['--color-primary-600', '--color-neutral-0'],
  ['--color-primary-600', '--color-neutral-50'],
];

let failed = false;
function check(pairs: [string, string][], minimum: number, label: string): void {
  for (const [foregroundName, backgroundName] of pairs) {
    const foreground = tokens.get(foregroundName);
    const background = tokens.get(backgroundName);
    if (!foreground || !background) {
      console.error(`Missing token in ${label}: ${foregroundName} / ${backgroundName}`);
      failed = true;
      continue;
    }
    const value = ratio(foreground, background);
    process.stdout.write(`${label} ${foregroundName} on ${backgroundName}: ${value.toFixed(2)}:1\n`);
    if (value < minimum) {
      console.error(`FAIL: minimum ${minimum}:1 required`);
      failed = true;
    }
  }
}

check(textPairs, 4.5, 'text');
check(boundaryPairs, 3, 'boundary/focus');

function filesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

const glassWhitelist = /packages[\\/]client[\\/]src[\\/]routes[\\/](App|Dashboard|PublicBooking|Landing)\.tsx$/;
for (const file of filesUnder(resolve(root, 'packages/client/src'))) {
  const source = readFileSync(file, 'utf8');
  if (/\bglass-surface(?:-strong)?\b/.test(source) && !glassWhitelist.test(file)) {
    console.error(`Glass surface outside DESIGN_SYSTEM §5 whitelist: ${file}`);
    failed = true;
  }
}

if (failed) process.exitCode = 1;
else process.stdout.write('Contrast token pairs and glass surface whitelist passed.\n');
