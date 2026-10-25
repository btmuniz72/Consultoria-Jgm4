import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const publicBasePath = normalizePath(process.env.PUBLIC_BASE_PATH ?? '/projetos', 'PUBLIC_BASE_PATH');
const apiBasePath = normalizePath(process.env.API_BASE_PATH ?? '/api', 'API_BASE_PATH');
if (apiBasePath === '/') throw new Error('API_BASE_PATH não pode ser /.');

const ng = resolve(root, 'node_modules/@angular/cli/bin/ng.js');
const result = spawnSync(process.execPath, [ng, 'build', '--base-href', publicBasePath === '/' ? '/' : `${publicBasePath}/`], {
  cwd: resolve(root, 'frontend'), env: process.env, stdio: 'inherit', windowsHide: true,
});
if (result.status !== 0) process.exit(result.status ?? 1);

const indexPath = resolve(root, 'frontend/dist/frontend/browser/index.html');
const html = readFileSync(indexPath, 'utf8');
const placeholder = '<meta name="jgm4-api-base-path" content="__JGM4_API_BASE_PATH__">';
if (!html.includes(placeholder)) throw new Error('Placeholder de API base não encontrado em frontend/src/index.html.');
writeFileSync(indexPath, html.replace(placeholder, `<meta name="jgm4-api-base-path" content="${apiBasePath}">`));
console.log(`Frontend pronto: base ${publicBasePath}, API ${apiBasePath}.`);

function normalizePath(value, name) {
  const path = value.trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || path.includes('?') || path.includes('#') || path.includes('\\')) {
    throw new Error(`${name} deve ser um caminho absoluto simples, como /projetos ou /api.`);
  }
  return path === '/' ? '/' : `/${path.split('/').filter(Boolean).join('/')}`;
}
