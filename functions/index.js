/* ForgeX — Notificações push
   Gatilhos no Realtime Database:
   - /curtidas/{dono}/{tid}/{quem}    -> push pro dono do treino
   - /comentarios/{dono}/{tid}/{cid}  -> push pro dono do treino
   - /seguidores/{uid}/{quem}         -> push pra quem ganhou seguidor
   - /descansos/{uid}                 -> push quando o descanso acaba (v11.22)
   Mensagens data-only: o service worker do app decide como exibir.
*/
const { onValueCreated, onValueWritten } = require('firebase-functions/v2/database');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
const INST = 'iron-gym-aa932-default-rtdb';
const URL_APP = 'https://chrismello0211.github.io/treino-gym/';

async function tokensDe(uid) {
  const s = await getDatabase().ref(`usuarios/${uid}/fcm`).get();
  return s.exists() ? Object.keys(s.val()) : [];
}
async function arrobaDe(uid) {
  const s = await getDatabase().ref(`perfis/${uid}/user`).get();
  return s.exists() ? '@' + s.val() : 'Alguém';
}
async function tituloDe(dono, tid) {
  const s = await getDatabase().ref(`feed/${dono}/${tid}/titulo`).get();
  return s.exists() ? s.val() : 'seu treino';
}

// opts (novo, opcional): tokens = so esses aparelhos; ttl = validade do push.
// Sem opts o comportamento e' exatamente o de antes.
async function manda(uid, data, opts = {}) {
  const tokens = opts.tokens || await tokensDe(uid);
  if (!tokens.length) return null;
  const res = await getMessaging().sendEachForMulticast({
    tokens,
    data,                              // data-only: o SW monta a notificação
    webpush: { headers: { Urgency: 'high', TTL: opts.ttl || '86400' } }
  });
  // remove tokens mortos (app desinstalado, token expirado)
  const mortos = [];
  res.responses.forEach((r, i) => {
    if (r.error && /registration-token-not-registered|invalid-argument/i.test(r.error.code || '')) {
      mortos.push(tokens[i]);
    }
  });
  await Promise.all(mortos.map(t => getDatabase().ref(`usuarios/${uid}/fcm/${t}`).remove()));
  return null;
}

exports.pushCurtida = onValueCreated(
  { ref: '/curtidas/{dono}/{tid}/{quem}', instance: INST },
  async (event) => {
    const { dono, tid, quem } = event.params;
    if (dono === quem) return null;
    const [arroba, titulo] = await Promise.all([arrobaDe(quem), tituloDe(dono, tid)]);
    return manda(dono, {
      tipo: 'curtida', tid,
      title: `${arroba} curtiu ${titulo}`,
      body: 'Toque para ver o treino',
      url: URL_APP
    });
  }
);

exports.pushComentario = onValueCreated(
  { ref: '/comentarios/{dono}/{tid}/{cid}', instance: INST },
  async (event) => {
    const c = event.data.val() || {};
    const { dono, tid } = event.params;
    if (!c.uid || c.uid === dono) return null;
    const titulo = await tituloDe(dono, tid);
    const arroba = c.user ? '@' + c.user : await arrobaDe(c.uid);
    return manda(dono, {
      tipo: 'comentario', tid,
      title: `${arroba} comentou em ${titulo}`,
      body: String(c.txt || '').slice(0, 120),
      url: URL_APP
    });
  }
);

/* Broadcast manual: escreva em /broadcast/{qualquerId} = {title, body, url?}
   pelo Console. Dispara pra TODOS os tokens e apaga o nó ao terminar. */
exports.pushBroadcast = onValueCreated(
  { ref: '/broadcast/{id}', instance: INST },
  async (event) => {
    const msg = event.data.val() || {};
    // só o dono dispara; qualquer outra coisa é descartada
    if (msg.de !== 'chris_mello') { await event.data.ref.remove(); return null; }
    const title = msg.title || 'ForgeX';
    const body = msg.body || 'Tem novidade no app!';
    const url = msg.url || URL_APP;

    // coleta todos os tokens de todos os usuários
    const usersSnap = await getDatabase().ref('usuarios').get();
    const tokens = [];
    if (usersSnap.exists()) {
      const all = usersSnap.val();
      Object.keys(all).forEach(uid => {
        const fcm = all[uid] && all[uid].fcm;
        if (fcm) Object.keys(fcm).forEach(t => tokens.push({ uid, t }));
      });
    }
    if (!tokens.length) { await event.data.ref.remove(); return null; }

    // FCM aceita até 500 por chamada; fatiar
    const dead = [];
    for (let i = 0; i < tokens.length; i += 500) {
      const lote = tokens.slice(i, i + 500);
      const res = await getMessaging().sendEachForMulticast({
        tokens: lote.map(x => x.t),
        data: { tipo: 'broadcast', title, body, url },
        webpush: { headers: { Urgency: 'high', TTL: '86400' } }
      });
      res.responses.forEach((r, j) => {
        if (r.error && /registration-token-not-registered|invalid-argument/i.test(r.error.code || '')) {
          dead.push(lote[j]);
        }
      });
    }
    // limpa tokens mortos e o próprio comando
    await Promise.all(dead.map(x => getDatabase().ref(`usuarios/${x.uid}/fcm/${x.t}`).remove()));
    await event.data.ref.remove();
    return null;
  }
);

exports.pushSeguidor = onValueCreated(
  { ref: '/seguidores/{uid}/{quem}', instance: INST },
  async (event) => {
    const { uid, quem } = event.params;
    if (uid === quem) return null;
    const arroba = await arrobaDe(quem);
    // conta privada (v11.43): seguir vira pedido, entao o aviso e' "quer te seguir"
    const priv = (await getDatabase().ref(`perfis/${uid}/privado`).get()).val() === true;
    return manda(uid, {
      tipo: 'seguidor', quem,
      title: priv ? `${arroba} quer te seguir` : `${arroba} começou a te seguir`,
      body: priv ? 'Toque para aprovar ou recusar em Amigos' : 'Toque para ver o perfil',
      url: URL_APP
    });
  }
);

/* Duelo (v11.25): avisa quem foi desafiado. So no nascimento do convite, e
   nunca de convite vencido. */
exports.pushDuelo = onValueCreated(
  { ref: '/duelos/{did}', instance: INST },
  async (event) => {
    const d = event.data.val() || {};
    if (d.status !== 'convite' || !d.a || !d.b || d.a === d.b) return null;
    if (d.expira && d.expira < Date.now()) return null;
    const arroba = await arrobaDe(d.a);
    const modo = d.modo === 'mano' ? 'Mano a mano' : 'Superação';
    // v11.27: ate 2 convidados (b e c); cada um sabe quem mais foi chamado
    const alvos = [d.b, d.c].filter((u, i, a) => u && u !== d.a && a.indexOf(u) === i);
    const nomeDe = (u) => { const x = (d.nomes || {})[u] || {}; return x.user ? '@' + x.user : (x.nome || 'um amigo'); };
    await Promise.all(alvos.map((u) => {
      const outro = alvos.find((x) => x !== u);
      return manda(u, {
        tipo: 'duelo', did: String(event.params.did),
        title: `⚔️ ${arroba} te desafiou`,
        body: `${String(d.titulo || 'Treino').slice(0, 60)} · ${modo}${outro ? ' · com ' + nomeDe(outro) : ''}. Toque para aceitar.`,
        url: URL_APP
      });
    }));
    return null;
  }
);

/* Descanso (v11.22). O iPhone congela o app fora da tela e o cronômetro para
   junto, então quem avisa na hora certa é o servidor. O app grava
   /descansos/{uid} = {fim, t0, id, tok, ex} quando o descanso começa.
   Pular, +15/-15 ou outro descanso trocam o nó: quem acordar com dado velho
   não envia. Provisório até o app nativo (Capacitor) agendar no próprio iPhone. */
const MAX_ESPERA_MS = 8 * 60 * 1000;
const espera = (ms) => new Promise(r => setTimeout(r, ms));

exports.pushDescanso = onValueWritten(
  { ref: '/descansos/{uid}', instance: INST,
    timeoutSeconds: 540, memory: '256MiB', cpu: 'gcf_gen1', concurrency: 1, maxInstances: 50 },
  async (event) => {
    const d = event.data.after.val();
    if (!d || !d.id || typeof d.fim !== 'number' || d.enviado) return null;
    const { uid } = event.params;

    // o fim vem do relógio do celular; recalcula pelo horário do servidor
    const base = Date.parse(event.time) || Date.now();
    const dur = (typeof d.t0 === 'number') ? (d.fim - d.t0) : (d.fim - base);
    const fimServ = base + dur;
    const falta = fimServ - Date.now();
    if (dur <= 0 || falta < -20000 || falta > MAX_ESPERA_MS) return null;
    // aquece a conexão com o banco e já busca os tokens ANTES de esperar:
    // na hora H sobra só a transação e o envio, e o aviso sai no segundo certo
    const ref = event.data.after.ref;
    const [tokens] = await Promise.all([tokensDe(uid), ref.get()]);
    const resta = fimServ - Date.now();   // o aquecimento gastou tempo: recalcula
    if (resta > 0) await espera(resta);

    // reivindica o envio: se o evento chegar duas vezes, só um manda.
    // ATENÇÃO: a 1ª tentativa de uma transação recebe o cache local, que vem
    // vazio (null). Abortar ali faz o Firebase desistir sem consultar o servidor.
    // Devolvendo null, ele compara com o valor real e repete com ele.
    const tx = await ref.transaction(v => {
      if (v === null) return null;
      if (v.id !== d.id || v.fim !== d.fim || v.enviado) return;   // mudou, cancelou ou já foi
      v.enviado = true;
      return v;
    });
    const s = tx.snapshot && tx.snapshot.val();
    if (!tx.committed || !s || s.id !== d.id || !s.enviado) return null;

    // só o aparelho que está treinando, e só se o token for mesmo da conta
    const alvo = (d.tok && tokens.includes(d.tok)) ? [d.tok] : tokens;
    await manda(uid, {
      tipo: 'descanso', tid: String(d.id),
      title: 'Descanso concluído 💪',
      body: (d.ex ? String(d.ex).slice(0, 80) + ' — ' : '') + 'Bora pra próxima série!',
      url: URL_APP
    }, { tokens: alvo, ttl: '60' });    // aviso velho não serve: expira em 1 min

    await ref.transaction(v => (v && v.id === d.id) ? null : v);
    return null;
  }
);

// placar oficial do duelo (v11.41): calculado no servidor com o mesmo codigo do app
const placar = require('./placar');
exports.placarDuelo = placar.placarDuelo;
exports.placarDueloPedido = placar.placarDueloPedido;

// lembrete de treino e resumo semanal (v11.42): funcao agendada a cada 15 minutos
exports.lembretes = require('./lembretes').lembretes;
