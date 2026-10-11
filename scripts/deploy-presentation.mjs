import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'docs/presentation');
const screenshotSource = resolve(root, 'docs/screenshots/redesign/after');
const target = resolve(root, 'dist/client/presentation');
const html = await readFile(join(source, 'index.html'), 'utf8');
const screenshotNames = [...new Set([...html.matchAll(/\.\.\/screenshots\/redesign\/after\/([^"']+\.png)/g)].map((match) => match[1]))];

if (screenshotNames.length === 0) throw new Error('В HTML презентации не найдены скриншоты.');

await mkdir(join(target, 'screenshots'), { recursive: true });
for (const filename of ['styles.css', 'presentation.js', 'speech.txt']) {
  await copyFile(join(source, filename), join(target, filename));
}

for (const filename of screenshotNames) {
  await copyFile(join(screenshotSource, filename), join(target, 'screenshots', filename));
}

const deployedHtml = html.replaceAll('../screenshots/redesign/after/', './screenshots/');
await writeFile(join(target, 'index.html'), deployedHtml, 'utf8');

process.stdout.write(`Презентация подготовлена: ${target}\nСкопировано скриншотов: ${screenshotNames.length}\n`);
