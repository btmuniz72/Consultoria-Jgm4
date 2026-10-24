import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { alignmentDocument } from '../frontend/src/alignment-document';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const path = resolve(root, 'docs/alinhamento-plano-c-preenchivel.html');
const logoDataUrl = `data:image/png;base64,${readFileSync(resolve(root, 'frontend/public/assets/brand/logo-jgm4.png')).toString('base64')}`;
writeFileSync(path, alignmentDocument('Ollem do Brasil', 'Estruturação do Almoxarifado', { date: '', participants: '', answers: {} }, logoDataUrl), 'utf8');
console.log('Documento independente criado em docs/alinhamento-plano-c-preenchivel.html.');
