/* ForgeX — lembrete de treino e resumo semanal (v11.42)
   Roda a cada 15 minutos, le SO /lembretes (o que cada app guardou: dias, horario, fuso, proximo treino,
   dia do ultimo treino, numeros da semana) e manda os avisos do momento. Nao le os treinos de ninguem. */
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { decide } = require('./lembretes-logica');

async function envia(uid, m) {
  const db = getDatabase();
  // marca ANTES de mandar: se a rodada repetir, nao manda duas vezes
  await db.ref('lembretes/' + uid).update(m.marca);
  const s = await db.ref('usuarios/' + uid + '/fcm').get();
  const tokens = s.exists() ? Object.keys(s.val()) : [];
  if (!tokens.length) return;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: m.title, body: m.body, tipo: m.tipo, url: './' },     // data-only: o service worker monta a notificacao
    webpush: { headers: { Urgency: 'normal', TTL: '21600' } }
  });
  const mortos = [];
  res.responses.forEach((r, i) => { if (r.error && /registration-token-not-registered|invalid-argument/i.test(r.error.code || '')) mortos.push(tokens[i]); });
  await Promise.all(mortos.map(t => db.ref('usuarios/' + uid + '/fcm/' + t).remove()));
}

exports.lembretes = onSchedule({ schedule: 'every 15 minutes', timeZone: 'Etc/UTC', region: 'us-central1', memory: '256MiB', timeoutSeconds: 120 }, async () => {
  const snap = await getDatabase().ref('lembretes').get();
  if (!snap.exists()) return;
  const agora = Date.now(), tarefas = [];
  snap.forEach(ch => { for (const m of decide(agora, ch.val())) tarefas.push(envia(ch.key, m).catch(e => console.error('lembrete', ch.key, e.message))); });
  await Promise.all(tarefas);
});
