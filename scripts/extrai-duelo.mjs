#!/usr/bin/env node
// Copia o calculo do placar do duelo do app (index.html) para a funcao do servidor (functions/duelo-core.js).
// A regra do placar fica UMA so: o servidor usa exatamente o mesmo codigo que o celular.
//   node scripts/extrai-duelo.mjs           -> gera functions/duelo-core.js e functions/tipos.json
//   node scripts/extrai-duelo.mjs --conferir -> so confere se o que esta em functions/ esta atualizado (sai 1 se nao)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
const linhas = html.split('\n');
const ini = linhas.findIndex(l => l.startsWith('const DUELO = {'));
if (ini < 0) { console.error('Nao achei "const DUELO = {" no index.html'); process.exit(1); }
let fim = ini;
while (fim < linhas.length && !linhas[fim].startsWith('};')) fim++;
const bloco = linhas.slice(ini, fim + 1).join('\n');
const impressao = crypto.createHash('sha256').update(bloco).digest('hex').slice(0, 16);

// catalogo minimo: so o que o calculo usa (tipo de medida e equipamento)
const cat = JSON.parse(fs.readFileSync(path.join(raiz, 'exercicios.json'), 'utf8'));
const tipos = {};
for (const x of cat) tipos[x.id] = [x.t || 'peso_reps', x.e || 'outro'];

const core = `// GERADO por scripts/extrai-duelo.mjs a partir do index.html. NAO EDITAR A MAO.
// impressao do calculo: ${impressao}
'use strict';
module.exports = function criaDuelo(BIB, agora) {
  // o modulo do duelo tambem tem partes de tela e de rede, que o calculo nao usa: aqui elas viram "nada"
  const nada = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : nada), apply: () => nada, construct: () => nada });
  const S = nada, UI = nada, NET = nada, h = nada, LS = nada, CORE = nada, FEED = nada, ATIVO = nada, PRSPUB = nada, APP_VER = 'servidor';
  const salva = () => {}, errAnota = () => {}, $ = () => nada;
${bloco}
  return DUELO;
};
`;
const alvoCore = path.join(raiz, 'functions', 'duelo-core.js');
const alvoTipos = path.join(raiz, 'functions', 'tipos.json');
const tiposTxt = JSON.stringify(tipos) + '\n';

if (process.argv.includes('--conferir')) {
  const atual = fs.existsSync(alvoCore) ? fs.readFileSync(alvoCore, 'utf8') : '';
  const atualTipos = fs.existsSync(alvoTipos) ? fs.readFileSync(alvoTipos, 'utf8') : '';
  if (atual !== core || atualTipos !== tiposTxt) {
    console.error('functions/ desatualizado: rode "node scripts/extrai-duelo.mjs" e envie de novo.');
    process.exit(1);
  }
  console.log('functions/duelo-core.js em dia com o app (impressao ' + impressao + ').');
  process.exit(0);
}
fs.mkdirSync(path.dirname(alvoCore), { recursive: true });
fs.writeFileSync(alvoCore, core);
fs.writeFileSync(alvoTipos, tiposTxt);
console.log('Gerado functions/duelo-core.js (' + (fim - ini + 1) + ' linhas do app, impressao ' + impressao + ') e functions/tipos.json (' + Object.keys(tipos).length + ' exercicios).');
