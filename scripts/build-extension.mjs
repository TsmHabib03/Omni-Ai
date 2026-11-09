import { build } from 'esbuild';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('browser-extension');
await mkdir(directory, { recursive: true });
const css = await readFile('carbon-warning.css', 'utf8');
await build({
  entryPoints: ['browser-extension/content.jsx'], outfile: resolve(directory, 'content.js'),
  bundle: true, format: 'iife', target: 'chrome120', minify: true,
  loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"', '__FOOTPRINT_CSS__': JSON.stringify(css) },
});
console.log('Built installable Footprint extension in browser-extension/.');
