#!/usr/bin/env node
// Troca a versao do ForgeX nos tres lugares de uma vez (app, cache do service worker e validador).
//   node scripts/versao.mjs 11.39.0
// Confere tudo ANTES de gravar: se algum arquivo nao tiver a versao exatamente uma vez, nada e' alterado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nova = process.argv[2];
const forcar = process.argv.includes('--forcar');
if (!/^\d+\.\d+\.\d+$/.test(nova || '')) {
  console.error('Uso: node scripts/versao.mjs X.Y.Z   (ex.: node scripts/versao.mjs 11.39.0)');
  process.exit(1);
}
const alvos = [
  ['index.html', /const APP_VER='(\d+\.\d+\.\d+)';/, v => `const APP_VER='${v}';`],
  ['sw.js', /const CACHE='tg-v(\d+\.\d+\.\d+)'/, v => `const CACHE='tg-v${v}'`],
  ['verify.mjs', /const EXPECTED_VERSION = '(\d+\.\d+\.\d+)';/, v => `const EXPECTED_VERSION = '${v}';`],
];
const compara = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] - y[i]; } return 0; };

const gravar = [];
let atual = null;
for (const [arq, re, fmt] of alvos) {
  const p = path.join(raiz, arq);
  const txt = fs.readFileSync(p, 'utf8');
  const todas = txt.match(new RegExp(re.source, 'g')) || [];
  if (todas.length !== 1) { console.error(`${arq}: esperava a versao 1 vez, achei ${todas.length}. Nada foi alterado.`); process.exit(1); }
  const v = txt.match(re)[1];
  if (atual && v !== atual) console.warn(`Aviso: ${arq} estava em ${v} (os outros em ${atual}). Todos ficam em ${nova}.`);
  atual = atual || v;
  gravar.push([p, txt.replace(re, fmt(nova))]);
}
if (compara(nova, atual) <= 0 && !forcar) {
  console.error(`A versao nova (${nova}) nao e maior que a atual (${atual}). Use --forcar se for de proposito. Nada foi alterado.`);
  process.exit(1);
}
for (const [p, txt] of gravar) fs.writeFileSync(p, txt);
console.log(`Versao ${atual} -> ${nova} em index.html, sw.js e verify.mjs.`);
