/* Calculo do placar oficial, sem depender do Firebase (usado pela funcao e pelos testes). */
const criaDuelo = require('./duelo-core');
const TIPOS = require('./tipos.json');

// o calculo precisa saber, de cada exercicio, o tipo de medida (carga, repeticoes, tempo) e o equipamento.
// Exercicio criado por alguem vem descrito na propria sala (q.cx).
function bibDa(d) {
  const proprios = {};
  Object.values(d.ex || {}).forEach(q => { if (q && q.exId && q.cx) proprios[q.exId] = Object.assign({ id: q.exId, custom: true }, q.cx); });
  const ex = id => proprios[id] || { id, t: (TIPOS[id] || ['peso_reps'])[0], e: (TIPOS[id] || [null, 'outro'])[1], n: '' };
  return { ex, porId: new Proxy({}, { get: (_, id) => (typeof id === 'string' ? ex(id) : undefined) }) };
}

function calculaOficial(d) {
  const DUELO = criaDuelo(bibDa(d), () => Date.now());
  const r = DUELO.calcula(d);
  return { v: r.v, modo: r.modo || d.modo, pts: r.pts || {}, por: r.por || {}, ordem: r.ordem || [], venc: r.venc || '', wo: !!r.wo, srv: 1 };
}

module.exports = { bibDa, calculaOficial };
