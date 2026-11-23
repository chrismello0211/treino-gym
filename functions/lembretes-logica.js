/* Decide quais avisos mandar AGORA para uma pessoa (sem banco: testavel).
   c = /lembretes/<uid>: { treino:{on,dias:[0-6],hora:'HH:MM'}, resumo:{on}, tz (minutos, como getTimezoneOffset),
                           proxima, ultimoDia:'AAAA-MM-DD', semana/semanaAnt:{chave(segunda),n,vol,rec},
                           enviadoTreino, enviadoResumo } */
const JANELA = 15;                      // a funcao roda a cada 15 min: cada horario cai em exatamente uma rodada
const RESUMO_MIN = 8 * 60;              // segunda, 8h (horario da pessoa)

function local(ms, tz) {
  const d = new Date(ms - (Number(tz) || 0) * 60000);
  return { sem: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes(),
           dia: d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') };
}
const kg = v => Math.round(Number(v) || 0).toLocaleString('pt-BR');

function decide(agoraMs, c) {
  const out = [];
  if (!c || typeof c !== 'object') return out;
  const l = local(agoraMs, c.tz);
  const t = c.treino;
  if (t && t.on && Array.isArray(t.dias) && t.dias.includes(l.sem) && /^\d\d:\d\d$/.test(t.hora || '')) {
    const alvo = Number(t.hora.slice(0, 2)) * 60 + Number(t.hora.slice(3));
    if (l.min >= alvo && l.min < alvo + JANELA && c.enviadoTreino !== l.dia && c.ultimoDia !== l.dia) {
      out.push({ tipo: 'lembrete', marca: { enviadoTreino: l.dia }, title: 'Hora do treino 💪',
                 body: c.proxima ? 'Hoje é dia de ' + c.proxima + '.' : 'Bora treinar hoje?' });
    }
  }
  const r = c.resumo;
  if (r && r.on && l.sem === 1 && l.min >= RESUMO_MIN && l.min < RESUMO_MIN + JANELA && c.enviadoResumo !== l.dia) {
    const segPassada = local(agoraMs - 7 * 86400000, c.tz).dia;     // a segunda da semana anterior
    const s = [c.semana, c.semanaAnt].find(x => x && x.chave === segPassada);
    if (s && s.n > 0) {
      out.push({ tipo: 'resumo', marca: { enviadoResumo: l.dia }, title: 'Sua semana 📊',
                 body: s.n + (s.n === 1 ? ' treino' : ' treinos') + ', ' + kg(s.vol) + ' kg' + (s.rec ? ', ' + s.rec + (s.rec === 1 ? ' recorde' : ' recordes') : '') + '. Bora pra próxima!' });
    }
  }
  return out;
}

module.exports = { decide, local };
