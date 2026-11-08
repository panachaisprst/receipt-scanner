import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const assets = {};
for (const [route, name, type] of [
  ['/', 'index.html', 'text/html'],
  ['/style.css', 'style.css', 'text/css'],
  ['/app.js', 'app.js', 'text/javascript'],
]) {
  assets[route] = { type, body: await readFile(new URL('web/' + name, root), 'utf8') };
}
const worker = await readFile(new URL('worker/index.js', root), 'utf8');

await mkdir(new URL('dist/server/', root), { recursive: true });
await mkdir(new URL('dist/.openai/', root), { recursive: true });
await writeFile(new URL('dist/server/index.js', root), 'const assets = ' + JSON.stringify(assets) + ';\n' + worker);
// Local hosting metadata is optional and is not committed to the repository.
try {
  await copyFile(new URL('.openai/hosting.json', root), new URL('dist/.openai/hosting.json', root));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
