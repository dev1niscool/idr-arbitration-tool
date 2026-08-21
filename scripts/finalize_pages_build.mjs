import { readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const nestedIndex = path.join(root, 'docs', 'pages', 'index.html');
const rootIndex = path.join(root, 'docs', 'index.html');

const html = await readFile(nestedIndex, 'utf8');
await writeFile(rootIndex, html.replaceAll('../assets/', './assets/'));
await rm(path.join(root, 'docs', 'pages'), { recursive: true, force: true });
