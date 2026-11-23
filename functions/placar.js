/* ForgeX — placar oficial do duelo (v11.41)
   O resultado e' calculado AQUI, com exatamente o mesmo codigo do app (duelo-core.js, gerado por
   scripts/extrai-duelo.mjs a partir do index.html). Assim todo mundo ve o mesmo placar, mesmo com
   versoes diferentes do app instaladas (foi o que causou a confusao do leg press da Mari).
   Gatilhos:
   - /duelos/{did}/status virou 'fim'  -> calcula e grava /duelos/{did}/resultado (com srv:1)
   - /duelos/{did}/pedido              -> o app pede o calculo de um duelo antigo sem resultado oficial
*/
const { onValueWritten } = require('firebase-functions/v2/database');
const { getDatabase } = require('firebase-admin/database');
const { calculaOficial } = require('./placar-calculo');

const INST = 'iron-gym-aa932-default-rtdb';

async function gravaOficial(did) {
  const ref = getDatabase().ref('duelos/' + did);
  const d = (await ref.get()).val();
  if (!d || d.status !== 'fim') return null;
  d.id = did;
  const oficial = calculaOficial(d);
  oficial.t = Date.now();
  await ref.child('resultado').set(oficial);
  return null;
}

exports.placarDuelo = onValueWritten({ ref: '/duelos/{did}/status', instance: INST }, async (event) => {
  if (event.data.after.val() !== 'fim') return null;
  return gravaOficial(event.params.did);
});

exports.placarDueloPedido = onValueWritten({ ref: '/duelos/{did}/pedido', instance: INST }, async (event) => {
  if (!event.data.after.exists()) return null;
  return gravaOficial(event.params.did);
});
