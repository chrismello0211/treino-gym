// GERADO por scripts/extrai-duelo.mjs a partir do index.html. NAO EDITAR A MAO.
// impressao do calculo: 24f728c163ca09a5
'use strict';
module.exports = function criaDuelo(BIB, agora) {
  // o modulo do duelo tambem tem partes de tela e de rede, que o calculo nao usa: aqui elas viram "nada"
  const nada = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : nada), apply: () => nada, construct: () => nada });
  const S = nada, UI = nada, NET = nada, h = nada, LS = nada, CORE = nada, FEED = nada, ATIVO = nada, PRSPUB = nada, APP_VER = 'servidor';
  const salva = () => {}, errAnota = () => {}, $ = () => nada;
const DUELO = {
  MODOS:{
    superacao:{n:'Superação', ic:'📈', d:'Cada um contra o próprio normal. Justo entre níveis diferentes.'},
    mano:{n:'Mano a mano', ic:'🤜', d:'Carga e repetições de igual pra igual. Ideal entre pessoas do mesmo nível.'}
  },
  CONVITE_MIN:30, LIMITE_H:4, MAX:3,
  REPS_MAX:15, REPS_MAX_MANO:30, TETO:125, PISO:70, BASE_N:5, BASE_MIN:3, EMPATE:1,
  cur:null, es:null, _poll:null, _pend:false, _convites:[], _convT:0,
  // terceiro participante so com a chave /config/duelo3 ligada (regras do servidor prontas)
  tres:false,

  /* ---------------- nota (funcoes puras) ---------------- */
  e1rm(kg, reps, cap){ kg=Number(kg)||0; reps=Number(reps)||0; if(kg<=0||reps<=0) return 0; return kg*(1+Math.min(reps, cap||DUELO.REPS_MAX)/30); },
  // carga -> 1RM estimado; peso corporal, repeticoes e tempo -> o numero. Aquecimento conta.
  valor(s, exId, modo){
    const x=BIB.ex(exId)||{}, tp=x.t||'peso_reps';
    if(tp==='peso_reps' && x.e!=='peso-corporal') return Number(s.kg)>0? DUELO.e1rm(s.kg, s.reps, modo==='mano'? DUELO.REPS_MAX_MANO : DUELO.REPS_MAX) : 0;
    return Number(s.reps)>0? Number(s.reps) : 0;
  },
  volumeSerie(s, exId){
    const x=BIB.ex(exId)||{};
    if((x.t||'peso_reps')==='peso_reps' && x.e!=='peso-corporal') return (Number(s.kg)||0)*(Number(s.reps)||0);
    return Number(s.reps)||0;
  },
  // descarta o que passar de 160% do normal (erro de digitacao)
  valores(series, exId, ref, modo){
    const v=[];
    // TODA serie conta. (Havia um filtro que descartava series acima de 1,6x o "normal" da pessoa, supondo
    // erro de digitacao: o app nao tem como saber isso, e ele jogava fora series de verdade, como as da Mari.)
    (series||[]).forEach(s=>{ if(!s) return; const val=DUELO.valor(s, exId, modo); if(val>0) v.push(val); });
    return v.slice(0,15);
  },
  media(v){ return v.length? v.reduce((a,b)=>a+b,0)/v.length : 0; },
  // o "normal" da pessoa: ultimas 5 sessoes antes de 'ate' (recentes pesam mais); null com menos de 3
  normal(exId, ate){
    const ss=[];
    Object.values(S.treinos||{}).filter(t=>t && !t.apagado && t.inicio && (!ate || t.inicio<ate))
      .sort((a,b)=>a.inicio-b.inicio).forEach(t=>(t.ex||[]).forEach(e=>{
        if(e.exId!==exId) return;
        const v=DUELO.valores((e.series||[]).filter(s=>s && s.ok), exId);
        if(v.length) ss.push(DUELO.media(v));
      }));
    if(ss.length<DUELO.BASE_MIN) return null;
    const u=ss.slice(-DUELO.BASE_N); let sp=0, sw=0;
    u.forEach((p,i)=>{ sp+=p*(i+1); sw+=i+1; });
    return Math.round(sp/sw*100)/100;
  },
  indice(perf, base){ if(!base || !perf) return null; return Math.max(DUELO.PISO, Math.min(DUELO.TETO, 100*perf/base)); },
  chaves(d){ const ex=(d&&d.ex)||{}; return Object.keys(ex).sort((a,b)=>((ex[a].o||0)-(ex[b].o||0)) || (a<b?-1:1)); },
  planejadas(d, k){ return Math.max(1, Number(((d.ex||{})[k]||{}).n)||3); },
  exDe(d, uid, k){ return ((((d.j||{})[uid]||{}).x)||{})[k] || ((d.ex||{})[k]||{}).exId; },
  setsDeBruto(d, uid, k){
    const o=((((d.j||{})[uid]||{}).s)||{})[k]||{};
    return Object.keys(o).sort((a,b)=>Number(a)-Number(b)).map(i=>o[i]).filter(Boolean);
  },
  // O mesmo exercicio pode ir parar em duas chaves: alguem adiciona de novo enquanto a tela atrasava, remove e
  // adiciona, ou duas pessoas adicionam juntas. A canonica e' a menor chave; a outra e' "duplicata" quando
  // ninguem fez series nas duas (fazer o mesmo exercicio 2x de proposito continua valendo como 2 exercicios).
  canonica(d, k){ const q=(d.ex||{})[k]; if(!q || q.troca) return k; return DUELO.chaves(d).filter(x=>!d.ex[x].troca && d.ex[x].exId===q.exId).sort()[0] || k; },
  ehDuplicata(d, k){ const c=DUELO.canonica(d,k); if(c===k) return false; return !DUELO.jog(d).some(u=>DUELO.setsDeBruto(d,u,c).length && DUELO.setsDeBruto(d,u,k).length); },
  // onde estao de fato as series da pessoa nesse exercicio: na chave, ou na duplicata quando a chave esta vazia
  chaveDe(d, uid, k){
    if(DUELO.setsDeBruto(d,uid,k).length) return k;
    const q=(d.ex||{})[k]; if(!q || q.troca || DUELO.canonica(d,k)!==k) return k;
    return DUELO.chaves(d).find(x=>x!==k && !d.ex[x].troca && d.ex[x].exId===q.exId && DUELO.ehDuplicata(d,x) && DUELO.setsDeBruto(d,uid,x).length) || k;
  },
  setsDe(d, uid, k){ return DUELO.setsDeBruto(d, uid, DUELO.chaveDe(d, uid, k)); },
  mapaDe(d, uid, k){ return ((((d.j||{})[uid]||{}).s)||{})[DUELO.chaveDe(d,uid,k)]||{}; },
  // O "normal" (a regua do modo Superacao) tem que ser do exercicio que a pessoa FEZ nessa posicao.
  // Duelo Chris x Mari: o leg press entrou por troca e o normal continuou o do exercicio anterior (37,59):
  // as 3 series da Mari (ate 312) foram descartadas como suspeitas e o Chris levou o exercicio por WO.
  baseDe(d, uid, k){
    const j=((d.j||{})[uid])||{}, bb=j.b||{}, bx=j.bx||{};
    const kk = bb[k]!=null? k : DUELO.chaveDe(d,uid,k);
    const b=bb[kk]; if(!(Number(b)>0)) return null;
    const ex=DUELO.exDe(d,uid,kk);
    if(bx[kk]!==undefined) return bx[kk]===ex? Number(b) : null;
    if(((d.ex||{})[kk]||{}).trPor || (j.x||{})[kk]) return null;     // posicao trocada e normal sem dono: nao filtra
    return Number(b);
  },
  // a serie foi desconsiderada pelo filtro (muito acima do normal da pessoa nesse exercicio)?
  // explica o criterio do modo (botao "?" na barra e "Como funciona?" no placar e no resumo)
  ajuda(modo){
    const p=tx=>h('div',{class:'f13',style:'line-height:1.55;margin-bottom:10px'},tx);
    const corpo = modo==='mano' ? [
      p('🤜 Mano a mano: cada exercício vale 1 ponto, e vence quem fizer mais pontos.'),
      p('Em cada exercício, ganha quem fizer a melhor série. A série é medida pelo 1RM estimado: carga × (1 + repetições ÷ 30). Assim, mais carga ou mais repetições contam.'),
      p('Exemplo: 260 kg × 6 ≈ 312 e 220 kg × 6 ≈ 264. Quem fez 260×6 leva o exercício.'),
      p('Empatou na melhor série? Compara a 2ª melhor, depois a 3ª. Se empatar em tudo, ganha o maior volume (soma de carga × repetições).'),
      p('Aquecimento conta. Exercício sem carga (peso do corpo ou tempo): vale o número de repetições ou o tempo.'),
      p('Se as pessoas fizerem exercícios diferentes na mesma posição, ninguém pontua nele.')
    ] : [
      p('📈 Superação: cada um compete contra o próprio normal.'),
      p('Em cada exercício, suas séries são comparadas com o seu normal (as suas últimas sessões dele). 100% é o seu padrão; 110% é 10% acima.'),
      p('Vence quem ficar mais acima do próprio normal, na média dos exercícios. Completar as séries planejadas também conta.'),
      p('Cada exercício conta no máximo 125% e no mínimo 70% do seu normal, pra um exercício só não decidir tudo.')
    ];
    UI.folha('Como funciona o duelo', corpo);
  },
  // um exercicio no resultado: nome + quem levou; uma linha por pessoa (nota em destaque, series embaixo)
  blocoRes(nome, badge, linhas){
    return h('div',{class:'dx-bloco'},
      h('div',{class:'dx-cab'}, h('div',{class:'dx-ex'}, nome), badge? h('span',{class:'dx-badge'+(badge.on?' on':'')}, badge.txt) : null),
      ...linhas.map(l=>h('div',{class:'dx-linha'+(l.venceu?' on':'')},
        h('div',{class:'dx-top'}, h('span',{class:'dx-nome'}, (l.venceu?'🏆 ':'')+l.quem), h('span',{class:'dx-nota'}, l.nota||'')),
        h('div',{class:'dx-sets'}, l.sets||'—'))));
  },
  badgeRes(w, nome, fim){
    if(w==='≠') return {txt:'exercícios diferentes'};
    if(w==='=') return {txt:'empate'};
    if(w) return {txt:'🏆 '+nome(w), on:true};
    return {txt: fim? 'sem comparação' : 'em andamento'};
  },
  // resumo do resultado que vai na publicacao do feed: quem segue tambem consegue ver o duelo
  resumoPub(d, r){
    const quem=DUELO.noPlacar(d).filter(u=>DUELO.entrou(d,u)), ex=[];
    DUELO.chaves(d).filter(k=>(!d.ex[k].troca || DUELO.quemFez(d,k).length) && !DUELO.ehDuplicata(d,k) && !d.ex[k].rm).forEach(k=>{
      const p={}; let carga=false;
      quem.forEach(u=>{
        const ss=DUELO.setsDe(d,u,k), exu=DUELO.exDe(d,u,k); if(DUELO.valorEhCarga(exu)) carga=true;
        if(DUELO.foraDe(d,u,k)){ p[u]={s:'removeu'}; return; }
        if(!ss.length){ p[u]={s:'—'}; return; }
        const pm=d.modo==='mano'? DUELO.perfMano(d,u,k) : null;
        p[u]={s: ss.map(s=>DUELO.fmtSerie(s, exu)+(DUELO.descartada(d,u,k,s)? '*' : '')).join(' · ').slice(0,180)};
        if(pm && pm.lista.length) p[u].m=Math.round(pm.lista[0]*10)/10;
      });
      ex.push({n:String((BIB.porId[d.ex[k].exId]||{}).n || d.ex[k].nm || 'Exercício').slice(0,50), w:(r.por||{})[k]||null, c:carga?1:0, p});
    });
    return {modo:d.modo, t:String(d.titulo||'').slice(0,50), q:quem, nomes:Object.fromEntries(quem.map(u=>[u, DUELO.nome(d,u)])), pts:r.pts||{}, venc:r.venc||'', wo:!!r.wo, ex:ex.slice(0,15)};
  },
  abreResumo(pub){
    const quem=pub.q||Object.keys(pub.nomes||{}), eu=S.auth && S.auth.uid;
    const nome=u=>u===eu? 'Você' : ((pub.nomes||{})[u]||'alguém');
    const fmtN=v=>pub.modo==='mano'? String(v||0) : Math.round(v||0)+'%';
    const setsEl=str=>{ const sp=h('span',{}); String(str||'—').split(' · ').forEach((x,i)=>{ if(i) sp.append('  ·  '); sp.append(x.replace(/\*$/,'')); }); return sp; };   // (resumos antigos marcavam com *; hoje toda serie conta)
    const cab=h('div',{class:'card duelo-cab'},
      h('div',{class:'f12 mut2'}, (pub.modo==='mano'? '🤜 Mano a mano' : '📈 Superação')+(pub.t? ' · '+pub.t : '')),
      h('div',{class:'duelo-placar-g'}, ...quem.map(u=>h('div',{class:'duelo-pessoa'+(pub.venc===u?' on':'')},
        h('div',{class:'f12 mut',style:'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%'}, nome(u)),
        h('div',{class:'duelo-placar'}, fmtN((pub.pts||{})[u]))))),
      h('div',{class:'b800',style:'margin-top:10px;font-size:16px'}, !pub.venc? 'Empate' : (pub.venc===eu? 'Você venceu 🏆' : nome(pub.venc)+' venceu')+(pub.wo? ' (por desistência)' : '')),
      h('button',{class:'btn btn-mini',style:'margin-top:10px;width:auto;padding:7px 14px',onclick:()=>DUELO.ajuda(pub.modo)},'Como funciona?'));
    const lista=h('div',{class:'card'}, ...(pub.ex||[]).map(x=>DUELO.blocoRes(x.n, DUELO.badgeRes(x.w, nome, true),
      quem.map(u=>{ const p=(x.p||{})[u]||{}; return {quem:nome(u), venceu:x.w===u, nota:p.m!=null? CORE.fmtKg(p.m)+(x.c?' kg':'') : '', sets:setsEl(p.s)}; }))));
    UI.folha('Resultado do duelo',[cab, h('div',{class:'secao'},'Exercício por exercício'), lista]);
  },
  valorEhCarga(exId){ const x=BIB.ex(exId)||{}; return (x.t||'peso_reps')==='peso_reps' && x.e!=='peso-corporal'; },
  descartada(d, uid, k, s){ return false; },        // nenhuma serie e' descartada (ver valores)
  // leva as MINHAS series de uma chave pra outra (cada um so escreve as proprias)
  moveSeries(d, de, para){
    const eu=DUELO.meu(), s=((((d.j||{})[eu]||{}).s)||{})[de]||{};
    Object.entries(s).forEach(([i,v])=>{ if(!v) return; NET.agenda(DUELO.caminho('/s/'+para+'/'+i), v); NET.agenda(DUELO.caminho('/s/'+de+'/'+i), null); });
    if(d.j && d.j[eu]){ d.j[eu].s=d.j[eu].s||{}; d.j[eu].s[para]=Object.assign({}, d.j[eu].s[para]||{}, s); delete d.j[eu].s[de]; }
  },
  foraDe(d, uid, k){ return !!((((d.j||{})[uid]||{}).fora)||{})[k]; },
  // troca no meio do exercicio: vira exercicio do placar quando 2+ pessoas fazem (alguem "trocou tambem")
  quemFez(d, k){ return DUELO.noPlacar(d).filter(u=>DUELO.setsDe(d,u,k).length); },
  contaChave(d, k){ const q=(d.ex||{})[k]||{}; return !q.troca || DUELO.quemFez(d,k).length>=2; },
  // entra na ordem compartilhada: exercicio da sala, ou troca que deixou de ser so de uma pessoa
  ordenavel(d, k){ const q=(d.ex||{})[k]; if(!q) return false; if(!q.troca) return true; const eu=DUELO.meu(); return q.por!==eu || DUELO.quemFez(d,k).some(u=>u!==eu); },
  // nome de um exercicio, mesmo criado por outra pessoa
  nomeEx(d, uid, k){
    const id=DUELO.exDe(d,uid,k), x=BIB.porId[id];
    if(x) return x.n;
    return ((((d.j||{})[uid]||{}).xn)||{})[k] || ((d.ex||{})[k]||{}).nm || 'Exercício';
  },
  /* ---------------- participantes ---------------- */
  jog(d){ return [d.a, d.b, d.c].filter((u,i,a)=>u && a.indexOf(u)===i); },
  estadoDe(d, uid){ return (((d.j||{})[uid]||{}).estado)||null; },
  entrou(d, uid){ return ['treinando','concluiu','desistiu'].includes(DUELO.estadoDe(d,uid)); },
  // quem entra no placar: quem entrou no treino (ou todos, enquanto ninguem entrou)
  noPlacar(d){ const e=DUELO.jog(d).filter(u=>DUELO.entrou(d,u)); return e.length? e : DUELO.jog(d); },
  superacao(d, uid, final){
    const idx={}; let soma=0, n=0, feitas=0, plan=0;
    DUELO.chaves(d).forEach(k=>{
      if(!DUELO.contaChave(d,k) || DUELO.ehDuplicata(d,k) || (d.ex[k].troca && !DUELO.setsDe(d,uid,k).length)) return;   // troca: so com 2+, e so pra quem fez
      const p=DUELO.planejadas(d,k), ss=DUELO.setsDe(d,uid,k), base=DUELO.baseDe(d,uid,k);
      plan+=p; feitas+=Math.min(ss.length, p);
      const i=DUELO.indice(DUELO.media(DUELO.valores(ss, DUELO.exDe(d,uid,k), base)), base);
      idx[k]=i; if(i!=null){ soma+=i; n++; }
    });
    const conclusao=plan? feitas/plan : 0, media=n? soma/n : 100;
    const nota=final? media*Math.min(1, conclusao) : media;
    return {nota:Math.round(nota*10)/10, idx, conclusao, calibrando:n===0, n};
  },
  // mano a mano: melhor serie, depois a 2a melhor... e por fim o volume
  perfMano(d, uid, k){
    const ex=DUELO.exDe(d,uid,k), ss=DUELO.setsDe(d,uid,k), base=DUELO.baseDe(d,uid,k);
    const lista=DUELO.valores(ss, ex, base, 'mano').sort((a,b)=>b-a);
    const vol=ss.reduce((s,x)=>s+DUELO.volumeSerie(x, ex), 0);
    let melhor=null; ss.forEach(s=>{ const v=DUELO.valor(s, ex, 'mano'); if(v>0 && (!melhor || v>melhor.v)) melhor={v, s}; });
    return {lista, vol, melhor};
  },
  cmpMano(a, b){
    const n=Math.max(a.lista.length, b.lista.length);
    for(let i=0;i<n;i++){ const x=a.lista[i]||0, y=b.lista[i]||0; if(Math.abs(x-y)>0.01) return x>y? 1 : -1; }
    if(Math.abs(a.vol-b.vol)>0.01) return a.vol>b.vol? 1 : -1;
    return 0;
  },
  mano(d){
    const P=DUELO.noPlacar(d), por={}, pts={}, perf={};
    P.forEach(u=>pts[u]=0);
    DUELO.chaves(d).forEach(k=>{
      if(!DUELO.contaChave(d,k) || DUELO.ehDuplicata(d,k)) return;
      const ehTroca=!!d.ex[k].troca;
      // so compara quem fez o MESMO exercicio (numa troca compartilhada, so quem fez)
      const grupos={}; P.forEach(u=>{ if(DUELO.foraDe(d,u,k) || (ehTroca && !DUELO.setsDe(d,u,k).length)) return; const e=DUELO.exDe(d,u,k); (grupos[e]=grupos[e]||[]).push(u); });
      const sala=((d.ex||{})[k]||{}).exId;
      const alvo=(grupos[sala] && grupos[sala].length>1)? sala : Object.keys(grupos).sort((a,b)=>grupos[b].length-grupos[a].length)[0];
      const G=grupos[alvo]||[];
      perf[k]={}; G.forEach(u=>perf[k][u]=DUELO.perfMano(d,u,k));
      if(G.length<2){ por[k]='≠'; return; }
      if(G.every(u=>!perf[k][u].lista.length)){ por[k]=null; return; }
      const ord=G.slice().sort((x,y)=>DUELO.cmpMano(perf[k][y], perf[k][x]));
      if(DUELO.cmpMano(perf[k][ord[0]], perf[k][ord[1]])===0){ por[k]='='; return; }
      por[k]=ord[0]; pts[ord[0]]++;
    });
    return {por, pts, perf};
  },
  vencido(d){ return d.status==='ativo' && d.inicio && agora()>d.inicio+DUELO.LIMITE_H*3600e3; },
  terminou(d){
    if(!d) return false;
    if(d.status==='fim') return true;
    if(d.status!=='ativo') return false;
    if(DUELO.vencido(d)) return true;
    const P=DUELO.jog(d).filter(u=>DUELO.entrou(d,u));
    return P.length>=2 && P.every(u=>['concluiu','desistiu'].includes(DUELO.estadoDe(d,u)));
  },
  calcula(d){
    const P=DUELO.noPlacar(d), desist=P.filter(u=>DUELO.estadoDe(d,u)==='desistiu'), vivos=P.filter(u=>DUELO.estadoDe(d,u)!=='desistiu');
    let pts={}, por={}, extra={};
    if(d.modo==='mano'){ const m=DUELO.mano(d); pts=m.pts; por=m.por; extra=m.perf; }
    else {
      const sp={}; P.forEach(u=>{ sp[u]=DUELO.superacao(d,u,true); pts[u]=sp[u].nota; });
      DUELO.chaves(d).forEach(k=>{
        if(!DUELO.contaChave(d,k) || DUELO.ehDuplicata(d,k)) return;
        const c=P.filter(u=>sp[u].idx[k]!=null).sort((x,y)=>sp[y].idx[k]-sp[x].idx[k]);
        if(c.length<2){ por[k]=null; return; }
        por[k]=(sp[c[0]].idx[k]-sp[c[1]].idx[k]<DUELO.EMPATE)? '=' : c[0];
      });
      extra=sp;
    }
    const ordem=vivos.slice().sort((x,y)=>(pts[y]||0)-(pts[x]||0)).concat(desist);
    let venc='';
    if(vivos.length===1 && P.length>1) venc=vivos[0];
    else if(ordem.length>1){ const a=pts[ordem[0]]||0, b=pts[ordem[1]]||0; venc=(d.modo==='mano'? a===b : Math.abs(a-b)<DUELO.EMPATE)? '' : ordem[0]; }
    return {v:4, modo:d.modo, pts, por, ordem, venc, wo:(vivos.length===1 && desist.length>0), extra};
  },
  resultado(d){ return DUELO.calcula(d); },
  // ao vivo: so QUEM esta na frente (sem numeros: evita jogar contra a formula)
  lider(d){
    const P=DUELO.noPlacar(d); if(P.length<2) return '';
    let pts={};
    if(d.modo==='mano') pts=DUELO.mano(d).pts;
    else { const vs={}; P.forEach(u=>{ const s=DUELO.superacao(d,u,false); if(s.n) vs[u]=s.nota; }); if(Object.keys(vs).length<2) return ''; pts=vs; }
    const ord=Object.keys(pts).sort((x,y)=>pts[y]-pts[x]);
    const a=pts[ord[0]], b=pts[ord[1]];
    return (d.modo==='mano'? a===b : Math.abs(a-b)<DUELO.EMPATE)? '' : ord[0];
  },
  /* ---------------- ciclo ---------------- */
  meu(){ return (S.auth && S.auth.uid) || null; },
  outros(d){ return DUELO.jog(d).filter(u=>u!==DUELO.meu()); },
  outro(d){ return DUELO.outros(d)[0]; },
  nome(d, uid){ const n=((d.nomes||{})[uid])||{}; return n.user? '@'+n.user : (n.nome||'Amigo'); },
  emDuelo(){ return !!(S.ativo && S.ativo.duelo); },
  dados(){ return (DUELO.cur && DUELO.cur.dados) || null; },
  // tp: o tipo de cada serie (W aquecimento, N normal...): o treino de cada um nasce igual
  exSala(x, id, i, series, desc){
    const tp=(series||[]).map(s=>(s && s.tipo)||'N');
    const q={exId:id, o:i, n:tp.length||3, d:desc, por:S.auth.uid, nm:x.n||''};
    if(tp.length) q.tp=tp;
    if(x.custom) q.cx={n:x.n||'', g:x.g||'corpo-inteiro', t:x.t||'peso_reps', e:x.e||'outro'};
    return q;
  },
  async desafiar(amigos, modo, rotinaId){
    if(!S.auth){ UI.toast('Entre na sua conta pra desafiar'); return; }
    if(S.ativo){ UI.toast('Conclua ou descarte o treino atual antes de começar um duelo'); return; }
    if(!navigator.onLine){ UI.toast('Conecte-se à internet pra desafiar'); return; }
    amigos=(amigos||[]).filter(a=>a && a.uid && a.uid!==S.auth.uid).slice(0, DUELO.tres? DUELO.MAX-1 : 1);
    if(!amigos.length) return;
    const r=rotinaId? S.rotinas[rotinaId] : null, t0=agora(), id='d'+uid(), ex={};
    const notasK={};
    (r? r.ex : []).forEach((e,i)=>{ const x=BIB.ex(e.exId)||{}, k='k'+uid(); ex[k]=DUELO.exSala(x, e.exId, i, e.series, (e.descanso!=null? e.descanso : S.cfg.descanso)); if(e.notas) notasK[k]=e.notas; });
    DUELO.guardaNotas(id, notasK);
    const nomes={[S.auth.uid]:{user:S.perfil?.user||'', nome:(S.perfil?.nome||'').slice(0,40)}};
    amigos.forEach(a=>nomes[a.uid]={user:a.user||'', nome:(a.nome||'').slice(0,40)});
    const d={id, a:S.auth.uid, b:amigos[0].uid, por:S.auth.uid, modo:(modo==='mano'?'mano':'superacao'),
      titulo:(r? r.titulo : 'Treino livre').slice(0,60), status:'convite', criado:t0, expira:t0+DUELO.CONVITE_MIN*60000, nomes};
    if(amigos[1]) d.c=amigos[1].uid;
    if(Object.keys(ex).length) d.ex=ex;
    try{ await NET.putD('/duelos/'+id, d); }catch(e){ UI.toast('Não consegui enviar o desafio. Tente de novo.'); return; }
    // convites anteriores meus ainda pendentes saem (senao os amigos recebem varios duelos iguais)
    DUELO.meus().then(l=>(l||[]).forEach(x=>{ if(x && x.id!==id && x.a===S.auth.uid && x.status==='convite') NET.agenda('/duelos/'+x.id+'/status', 'cancelado'); })).catch(()=>{});
    UI.fechaFolha(); VIB.v(20);
    UI.toast(amigos.length>1? 'Desafios enviados ⚔️' : 'Desafio enviado ⚔️', true);
    DUELO.conecta(id, d);
    UI.vai('duelo', {id});
  },
  podeEntrar(d){
    if(!d || DUELO.estadoDe(d, DUELO.meu())) return false;
    if(d.status==='convite') return agora()<=(d.expira||0);
    return d.status==='ativo' && !DUELO.terminou(d);
  },
  async aceitar(d){
    if(S.ativo && S.ativo.duelo!==d.id){ UI.toast('Conclua ou descarte o treino atual antes de entrar no duelo'); return; }
    // confere a situacao ATUAL no servidor (o cartao do convite pode ser velho: duelo ja cancelado ou encerrado)
    try{ const f=await NET.get('/duelos/'+d.id); if(f && f.id) d=f; else if(f===null && navigator.onLine){ UI.toast('Esse desafio não existe mais'); DUELO.verConvites(true); return; } }catch(e){ errAnota(e,'L5454') }
    if(!DUELO.podeEntrar(d)){ UI.toast(d.status==='cancelado'? 'Esse desafio foi cancelado' : (d.status==='fim'? 'Esse desafio já terminou' : 'Esse desafio não está mais disponível')); DUELO.verConvites(true); return; }
    if(d.status==='convite'){ NET.agenda('/duelos/'+d.id+'/status', 'ativo'); NET.agenda('/duelos/'+d.id+'/inicio', agora()); d.status='ativo'; d.inicio=agora(); }
    DUELO.conecta(d.id, d);
    DUELO.comeca(d);
  },
  recusar(d){
    const eu=DUELO.meu();
    NET.agenda('/duelos/'+d.id+'/j/'+eu+'/estado', 'recusou');
    d.j=d.j||{}; (d.j[eu]=d.j[eu]||{}).estado='recusou';
    const convidados=DUELO.jog(d).filter(u=>u!==d.a);
    if(d.status==='convite' && convidados.every(u=>DUELO.estadoDe(d,u)==='recusou')) NET.agenda('/duelos/'+d.id+'/status', 'recusado');
    DUELO._convites=DUELO._convites.filter(x=>x.id!==d.id); UI.refaz();
  },
  cancelar(d){ NET.agenda('/duelos/'+d.id+'/status', 'cancelado'); if(DUELO.cur && DUELO.cur.dados) DUELO.cur.dados.status='cancelado'; UI.refaz(); },
  // exercicio criado por outra pessoa: copia escondida, so pra ter nome e tipo
  garanteEx(id, cx, dono){
    if(!id) return;
    if(!BIB.porId[id] && cx){
      const c={id, n:String(cx.n||'Exercício').slice(0,60), g:cx.g||'corpo-inteiro', t:cx.t||'peso_reps', e:cx.e||'outro', custom:true, oc:1, deDuelo:1, atualizado:agora()};
      S.custom[id]=c; salva('custom'); NET.agenda('custom/'+id, c);
      BIB.lista.push(c); BIB.indexa();
    }
    // a sala so leva nome e tipo (fica leve): a foto vem do espaco publico de quem criou
    const c=S.custom[id];
    if(c && c.deDuelo && !c.foto && dono && dono!==DUELO.meu()){
      EXFOTO.busca(dono, id).then(f=>{
        const cc=S.custom[id]; if(!f || !cc || cc.foto) return;
        cc.foto=f; salva('custom');
        try{ if(UI.telaAtual==='ativo' && !temFocoDeTexto()) UI.refaz(); }catch(_){ errAnota(_,'L5483') }
      });
    }
  },
  comeca(d){
    if(S.ativo && S.ativo.duelo===d.id){ UI.pilha=[]; UI.vai('ativo',null,false); return true; }
    if(S.ativo){ UI.toast('Conclua ou descarte o treino atual antes do duelo'); return false; }
    const ks=DUELO.chaves(d).filter(k=>!((d.ex[k]||{}).troca) && !DUELO.ehDuplicata(d,k));
    ks.forEach(k=>DUELO.garanteEx(d.ex[k].exId, d.ex[k].cx, d.ex[k].por || d.por));
    S.ativo={ id:uid(), rid:null, titulo:'⚔️ '+(d.titulo||'Duelo'), inicio:agora(), duelo:d.id, _dkVistos:{}, _dkFora:{},
      ex: ks.map(k=>DUELO.novoEx(d.ex[k], k)) };
    S.ativo.ex.forEach(e=>S.ativo._dkVistos[e._dk]=1);
    // as notas da ficha voltam so pra quem e dona dela (a sala nunca leva as notas)
    try{
      const nt=DUELO.notasDoDono(d);
      if(nt.porChave) S.ativo.ex.forEach(e=>{ if(nt.porChave[e._dk]) e.notas=nt.porChave[e._dk]; });
      else if(nt.porEx){ const usados=new Set(); S.ativo.ex.forEach(e=>{ const i=nt.porEx.findIndex((q,ix)=>!usados.has(ix) && q && q.exId===e.exId && q.notas); if(i>=0){ usados.add(i); e.notas=nt.porEx[i].notas; } }); }
    }catch(_){ errAnota(_,'L5500') }
    CORE.marcaEstreias(S.ativo); salva('ativo'); try{ SYNCATIVO.sobeJa(); }catch(e){ errAnota(e,'L5501') }
    DUELO.publica(); DUELO.estado('treinando');
    VIB.v(30); setTimeout(()=>{ try{ TELA.pega(); }catch(e){ errAnota(e,'L5503') } }, 50);
    UI.pilha=[]; UI.vai('ativo',null,false);
    return true;
  },
  // notas da ficha: ficam SO no aparelho de quem criou o duelo (a dona da ficha)
  guardaNotas(id, m){
    try{
      const tb=LS.get('dueloNotas', {}) || {};
      if(Object.keys(m||{}).length) tb[id]={m, ts:agora()};
      Object.keys(tb).sort((a,b)=>(tb[b].ts||0)-(tb[a].ts||0)).slice(20).forEach(x=>delete tb[x]);
      LS.set('dueloNotas', tb);
    }catch(e){ errAnota(e,'L5514') }
  },
  notasDoDono(d){
    if(!d || d.por!==DUELO.meu()) return {};
    const tb=LS.get('dueloNotas', {}) || {};
    if(tb[d.id] && tb[d.id].m) return {porChave:tb[d.id].m};
    // duelo criado antes desta versao (ou em outro aparelho): acha a ficha pelo titulo e casa pelo exercicio
    const r=Object.values(S.rotinas||{}).find(x=>x && !x.apagada && x.titulo===d.titulo);
    return r? {porEx:r.ex||[]} : {};
  },
  novoEx(q, k){
    const x=BIB.ex(q.exId)||{};
    return {exId:q.exId, _dk:k, descanso:(q.d!=null? q.d : (x.g==='cardio'?0:S.cfg.descanso)), notas:'',
      series:(function(){ const tp=Array.isArray(q.tp)? q.tp : (q.tp? Object.values(q.tp) : null);
        return (tp && tp.length? tp : Array.from({length:Math.max(1, Number(q.n)||3)}, ()=>'N')).map(x=>({tipo:x||'N', kg:'', reps:'', ok:false})); })()};
  },
  caminho(rest){ return '/duelos/'+S.ativo.duelo+'/j/'+DUELO.meu()+rest; },
  estado(st){
    if(!DUELO.emDuelo() || !DUELO.meu()) return;
    NET.agenda(DUELO.caminho('/estado'), st); NET.agenda(DUELO.caminho('/at'), agora());
  },
  // publica o "normal" de cada exercicio e, se eu troquei, o que fiz no lugar (com nome)
  marcaVolta(d, k){ const v={por:DUELO.meu(), t:agora()}; if(d.ex[k]) d.ex[k].volta=v; NET.agenda('/duelos/'+d.id+'/ex/'+k+'/volta', v); },
  versaoMenor(a, b){ const x=String(a).split('.').map(Number), y=String(b).split('.').map(Number); for(let i=0;i<3;i++){ if((x[i]||0)!==(y[i]||0)) return (x[i]||0)<(y[i]||0); } return false; },
  publica(){
    if(!DUELO.emDuelo()) return;
    const d=DUELO.dados(), eu=DUELO.meu(), j=((d && d.j)||{})[eu]||{};
    if(d && j.v!==APP_VER){ NET.agenda(DUELO.caminho('/v'), APP_VER); d.j=d.j||{}; (d.j[eu]=d.j[eu]||{}).v=APP_VER; }   // os outros sabem se estou atualizado
    S.ativo.ex.forEach(e=>{
      if(!e._dk) return;
      const sala=(d && d.ex && d.ex[e._dk]) ? d.ex[e._dk].exId : null;
      const jaX=(j.x||{})[e._dk], jaB=(j.b||{})[e._dk], jaBx=(j.bx||{})[e._dk];
      const trocado = sala && e.exId!==sala;
      if(jaB===undefined || jaBx!==e.exId || (trocado && jaX!==e.exId) || (!trocado && jaX)){
        // o normal e' sempre do exercicio que estou fazendo nessa posicao (refeito quando ele muda)
        NET.agenda(DUELO.caminho('/b/'+e._dk), DUELO.normal(e.exId, S.ativo.inicio) || 0);
        NET.agenda(DUELO.caminho('/bx/'+e._dk), e.exId);
        if(d){ d.j=d.j||{}; const mm=d.j[eu]=d.j[eu]||{}; (mm.bx=mm.bx||{})[e._dk]=e.exId; }
        if(trocado){
          const x=BIB.ex(e.exId)||{};
          NET.agenda(DUELO.caminho('/x/'+e._dk), e.exId);
          NET.agenda(DUELO.caminho('/xn/'+e._dk), x.n||'');
          if(x.custom) NET.agenda(DUELO.caminho('/xc/'+e._dk), {n:x.n||'', g:x.g||'corpo-inteiro', t:x.t||'peso_reps', e:x.e||'outro'});
        } else if(jaX){ NET.agenda(DUELO.caminho('/x/'+e._dk), null); NET.agenda(DUELO.caminho('/xn/'+e._dk), null); }
        if(d){ d.j=d.j||{}; const m=d.j[eu]=d.j[eu]||{}; m.x=m.x||{}; if(trocado) m.x[e._dk]=e.exId; else delete m.x[e._dk]; m.b=m.b||{}; if(m.b[e._dk]===undefined) m.b[e._dk]=0; }
      }
    });
  },
  // marcou/desmarcou uma serie: manda pro duelo (ou apaga)
  serieMudou(e, s){
    if(!DUELO.emDuelo() || !e || !e._dk) return;
    const si=e.series.indexOf(s); if(si<0) return;
    // pr: a serie foi recorde de quem fez (quem esta junto ve a medalha na tabela)
    const v=s.ok? Object.assign({kg:(s.kg===''||s.kg==null? '' : Number(s.kg)||0), reps:Number(s.reps)||0, tipo:s.tipo||'N', t:agora()},
                                (Array.isArray(s.pr) && s.pr.length)? {pr:1} : {}) : null;
    NET.agenda(DUELO.caminho('/s/'+e._dk+'/'+si), v);
    if(agora()-(DUELO._atT||0)>15000){ DUELO._atT=agora(); NET.agenda(DUELO.caminho('/at'), agora()); }   // 'at' ninguem le: menos envio, serie chega antes
    const d=DUELO.dados();
    if(d){ d.j=d.j||{}; const j=d.j[DUELO.meu()]=d.j[DUELO.meu()]||{}; j.s=j.s||{}; j.s[e._dk]=j.s[e._dk]||{}; if(v) j.s[e._dk][si]=v; else delete j.s[e._dk][si]; }
    DUELO.desenha();
  },
  // a ficha e a sala do duelo, sem duplicar nem ressuscitar o que eu removi
  reconcilia(){
    if(!DUELO.emDuelo()) return false;
    const d=DUELO.dados(); if(!d || d.id!==S.ativo.duelo) return false;
    const A=S.ativo, eu=DUELO.meu(); A._dkVistos=A._dkVistos||{}; A._dkFora=A._dkFora||{};
    let mudou=false;
    const locais=new Set(A.ex.map(e=>e._dk).filter(Boolean));
    // A FICHA E' UMA SO pra todo mundo do duelo: trocar, remover, adicionar e reordenar valem pra todos.
    A._exSala=A._exSala||{}; A._dkRm=A._dkRm||{}; DUELO._avisos=DUELO._avisos||[];
    const nomeDe=u=>'@'+((((d.nomes||{})[u])||{}).user||'alguém');
    const ninguemFez=k=>!DUELO.jog(d).some(u=>DUELO.setsDeBruto(d,u,k).length);
    const ordemLocal0=A.ex.map(e=>e._dk).filter(k=>k && d.ex[k]);
    const euReordenei=!!A._ordemKs && (()=>{ const a=A._ordemKs.filter(k=>ordemLocal0.includes(k)), b=ordemLocal0.filter(k=>A._ordemKs.includes(k)); return JSON.stringify(a)!==JSON.stringify(b); })();
    let criei=false;
    // T) troca: quem troca um exercicio que ninguem fez troca na sala (pra todos); quem recebe e ainda nao
    //    fez series nele troca junto
    A.ex.slice().forEach(e=>{
      const k=e._dk, q=k && d.ex[k]; if(!q || q.rm) return;
      const visto=A._exSala[k], fiz=(e.series||[]).some(s=>s.ok);
      if(visto===undefined){ A._exSala[k]=q.exId; return; }
      if(q.exId!==visto && e.exId===visto){
        if(!fiz){
          DUELO.garanteEx(q.exId, q.cx, q.trPor||q.por||d.por); e.exId=q.exId; mudou=true;
          DUELO._avisos.push((q.trPor && q.trPor!==eu? nomeDe(q.trPor)+' trocou um exercício por ' : 'Exercício trocado por ')+((BIB.porId[q.exId]||{}).n||q.nm||'outro'));
        }
        A._exSala[k]=q.exId; return;
      }
      if(e.exId!==q.exId && e.exId!==visto && q.exId===visto && !q.troca && !fiz && !ninguemFez(k)){
        // troquei, mas outra pessoa ja fez series nele: o original fica (pra todos) e o novo entra logo
        // depois, tambem pra todos (antes virava uma troca so minha, e as fichas ficavam diferentes)
        const orig={exId:q.exId, _dk:k, descanso:e.descanso, notas:'', series:(e.series||[]).map(s=>({tipo:(s&&s.tipo)||'N', kg:'', reps:'', ok:false}))};
        A.ex.splice(A.ex.indexOf(e), 0, orig);
        delete e._dk; e._dkDe=k; locais.add(k); mudou=true;
        return;
      }
      if(e.exId!==q.exId && e.exId!==visto && q.exId===visto && !q.troca && !fiz && ninguemFez(k)){
        const x=BIB.ex(e.exId)||{};
        q.exId=e.exId; q.trPor=eu; q.nm=x.n||q.nm||null;
        if(x.custom) q.cx={n:x.n||'', g:x.g||'corpo-inteiro', t:x.t||'peso_reps', e:x.e||'outro'}; else delete q.cx;
        ['exId','trPor','nm','cx'].forEach(c=>NET.agenda('/duelos/'+d.id+'/ex/'+k+'/'+c, q[c]==null? null : q[c]));
        A._exSala[k]=q.exId; mudou=true;
      }
    });
    // R) alguem removeu um exercicio da ficha: sai da minha tambem (menos se eu ja fiz series nele)
    A.ex.slice().forEach(e=>{
      const k=e._dk, q=k && d.ex[k]; if(!q || !q.rm) return;
      // "removido por mim", mas esta na minha ficha: eu adicionei de novo (se cura sozinho, mesmo se um
      // envio se perdeu ou chegou fora de ordem)
      if(q.rm.por===eu){ delete q.rm; NET.agenda('/duelos/'+d.id+'/ex/'+k+'/rm', null); delete A._dkFora[k]; NET.agenda(DUELO.caminho('/fora/'+k), null); DUELO.marcaVolta(d, k); mudou=true; return; }
      if((e.series||[]).some(s=>s.ok)) return;
      A.ex.splice(A.ex.indexOf(e),1); A._dkRm[k]=1; locais.delete(k); mudou=true;
      DUELO._avisos.push(nomeDe(q.rm.por)+' removeu '+((BIB.porId[e.exId]||{}).n||'um exercício'));
    });
    // 1) chave que eu ja tive e sumiu da ficha: eu removi. Nao volta, e os outros ficam sabendo.
    Object.keys(A._dkVistos).forEach(k=>{
      if(!locais.has(k) && !A._dkFora[k] && !(A._dkJunta||{})[k] && !A._dkRm[k]){
        A._dkFora[k]=1; NET.agenda(DUELO.caminho('/fora/'+k), 1); mudou=true;
        if(d.ex[k] && !d.ex[k].rm){ d.ex[k].rm={por:eu, t:agora()}; NET.agenda('/duelos/'+d.id+'/ex/'+k+'/rm', d.ex[k].rm); }   // sai pra todos
        (A._rmT=A._rmT||{})[k]=agora();                                  // quando EU removi
      }
    });
    // 2) exercicio novo na minha ficha
    const juntar=[];
    A.ex.forEach((e,i)=>{
      if(e._dk) return;
      const ks=DUELO.chaves(d);
      // troca no meio do exercicio: se alguem ja trocou o mesmo pelo mesmo, compartilha a chave.
      // Adicionado a mao: usa o mesmo exercicio da sala, inclusive a TROCA de outra pessoa (bug da Lais:
      // ela adicionou a mao o exercicio que o Chris trocou no meio, e um nao via as series do outro).
      const livre = e._dkDe
        ? ks.find(k=>!locais.has(k) && d.ex[k].troca===e._dkDe && d.ex[k].exId===e.exId)
        : (ks.find(k=>!locais.has(k) && !A._dkFora[k] && !d.ex[k].troca && d.ex[k].exId===e.exId)
           || ks.find(k=>!locais.has(k) && !A._dkFora[k] && d.ex[k].troca && d.ex[k].por!==eu && d.ex[k].exId===e.exId)
           || ks.find(k=>!locais.has(k) && A._dkFora[k] && !d.ex[k].troca && d.ex[k].exId===e.exId));   // removi e adicionei de novo
      if(livre){
        if(A._dkFora[livre]){
          delete A._dkFora[livre]; NET.agenda(DUELO.caminho('/fora/'+livre), null);
          // desfaz a remocao na sala SEMPRE (a copia local pode ter sido trocada por uma de antes da remocao)
          if(d.ex[livre]) delete d.ex[livre].rm; NET.agenda('/duelos/'+d.id+'/ex/'+livre+'/rm', null);
          DUELO.marcaVolta(d, livre);
        } else if(d.ex[livre] && d.ex[livre].rm){ delete d.ex[livre].rm; NET.agenda('/duelos/'+d.id+'/ex/'+livre+'/rm', null); DUELO.marcaVolta(d, livre); }   // voltou pra todos
        e._dk=livre; locais.add(livre); mudou=true; return;
      }
      if(!e._dkDe){
        // adicionei a mao um exercicio que ja tinha chegado do duelo (a tela ainda nao mostrava): e' o mesmo
        const igual=A.ex.find(q=>q!==e && q._dk && q.exId===e.exId && d.ex[q._dk] && !d.ex[q._dk].troca && d.ex[q._dk].por!==eu && !juntar.includes(q) && !(q.series||[]).some(s=>s.ok));
        if(igual){ e._dk=igual._dk; juntar.push(igual); mudou=true; return; }
      }
      if(e._dkDe){
        // troquei no meio por um exercicio que ja esta na minha ficha (veio de outra pessoa) e eu ainda
        // nao fiz: junta os dois, em vez de ficar com ele duplicado
        const gemeo=A.ex.find(q=>q!==e && q._dk && q.exId===e.exId && d.ex[q._dk] && !d.ex[q._dk].troca && !juntar.includes(q) && !(q.series||[]).some(s=>s.ok));
        if(gemeo){ e._dk=gemeo._dk; delete e._dkDe; juntar.push(gemeo); mudou=true; return; }
      }
      const k='k'+uid(); e._dk=k; locais.add(k);
      const x=BIB.ex(e.exId)||{};
      const q=DUELO.exSala(x, e.exId, agora()+i, e.series, e.descanso);
      if(e._dkDe) q.de=e._dkDe;                  // troca no meio: exercicio compartilhado, logo depois do original
      d.ex=d.ex||{}; d.ex[k]=q; NET.agenda('/duelos/'+d.id+'/ex/'+k, q); mudou=true; criei=true;
    });
    juntar.forEach(g=>{ const ix=A.ex.indexOf(g); if(ix>=0) A.ex.splice(ix,1); });
    // 2b) o mesmo exercicio ja esta em duas chaves: a minha ficha converge pra canonica, com as minhas series
    A._dkJunta=A._dkJunta||{};
    A.ex.slice().forEach(e=>{
      const k=e._dk, q=k && d.ex[k]; if(!q || q.troca || !DUELO.ehDuplicata(d,k)) return;
      const c=DUELO.canonica(d,k), noC=A.ex.find(x=>x!==e && x._dk===c);
      const fiz=(e.series||[]).some(s=>s.ok), fizC=!!(noC && (noC.series||[]).some(s=>s.ok));
      if(noC && fiz && fizC) return;                                  // fiz nas duas: sao dois exercicios mesmo
      if(noC && !fiz){ A.ex.splice(A.ex.indexOf(e),1); }              // a duplicata esta vazia: sai
      else {
        if(noC) A.ex.splice(A.ex.indexOf(noC),1);                     // a canonica esta vazia: sai, e esta vira ela
        if(fiz) DUELO.moveSeries(d, k, c);
        e._dk=c;
      }
      A._dkJunta[k]=c; locais.delete(k); locais.add(c); mudou=true;
    });
    // 3) exercicio da sala que eu nao tenho: entra (menos o que eu removi e a troca dos outros)
    DUELO.chaves(d).forEach(k=>{
      if(locais.has(k) || A._dkJunta[k] || DUELO.ehDuplicata(d,k)) return;
      const q=d.ex[k]; if(q.rm) return; if(q.troca && q.por!==eu) return;   // (troca privada: so as antigas)
      if(A._dkFora[k]){
        // eu tinha removido: so volta se alguem readicionou DEPOIS da minha remocao (uma atualizacao
        // atrasada, de antes da remocao chegar na sala, nao pode desfazer o que eu fiz)
        const v=q.volta; if(!(v && v.t>((A._rmT||{})[k]||Infinity))) return;
        delete A._dkFora[k]; NET.agenda(DUELO.caminho('/fora/'+k), null);
      }
      delete A._dkRm[k]; A._exSala[k]=q.exId;
      DUELO.garanteEx(q.exId, q.cx, q.por || d.por);
      A.ex.push(DUELO.novoEx(q, k)); locais.add(k); mudou=true;
    });
    A.ex.forEach(e=>{ if(e._dk && !A._dkVistos[e._dk]){ A._dkVistos[e._dk]=1; mudou=true; } });
    // 4) series: quem acrescenta serie num exercicio, acrescenta pros outros tambem (remover nao se
    //    propaga: senao a serie que alguem apagou voltaria sozinha)
    A._nSala=A._nSala||{};
    A.ex.forEach(e=>{
      const k=e._dk, q=k && d.ex[k]; if(!q) return;
      const nSala=Number(q.n)||0, visto=A._nSala[k];
      if(visto!==undefined && nSala>visto){
        const tp=Array.isArray(q.tp)? q.tp : (q.tp? Object.values(q.tp) : []);
        for(let i=visto;i<nSala;i++){ e.series.push({tipo:tp[i]||'N', kg:'', reps:'', ok:false}); mudou=true; }
      }
      if((e.series||[]).length>nSala){
        q.n=e.series.length; q.tp=e.series.map(s=>(s&&s.tipo)||'N');
        NET.agenda('/duelos/'+d.id+'/ex/'+k+'/n', q.n); NET.agenda('/duelos/'+d.id+'/ex/'+k+'/tp', q.tp);
      }
      A._nSala[k]=Math.max(Number(q.n)||0, visto||0);
    });
    // 5) ordem: se eu mudei (reordenei ou adicionei), a sala segue a minha; senao a minha segue a da sala,
    //    SEMPRE (nao so quando muda: quem perdeu uma atualizacao se corrige sozinho)
    if(euReordenei || criei){
      const base=agora();
      A.ex.map(e=>e._dk).filter(k=>k && d.ex[k]).forEach((k,i)=>{ d.ex[k].o=base+i; NET.agenda('/duelos/'+d.id+'/ex/'+k+'/o', base+i); });
      mudou=true;
    } else {
      const pos=new Map(DUELO.chaves(d).map((k,i)=>[k,i])), idx=[];
      A.ex.forEach((e,i)=>{ if(e._dk && pos.has(e._dk)) idx.push(i); });
      const antes=idx.map(i=>A.ex[i]._dk).join(',');
      const ord=idx.map(i=>A.ex[i]).sort((x,y)=>pos.get(x._dk)-pos.get(y._dk));
      idx.forEach((i,jj)=>{ A.ex[i]=ord[jj]; });
      if(antes!==idx.map(i=>A.ex[i]._dk).join(',')){ mudou=true; if(A._ordemKs) DUELO._reordenado=true; }
    }
    A._ordemKs=A.ex.map(e=>e._dk).filter(k=>k && d.ex[k]);
    // versao: quem esta com o app antigo faz a ficha ficar diferente
    A._avisoVer=A._avisoVer||{};
    DUELO.jog(d).forEach(u=>{
      if(u===eu || A._avisoVer[u] || !((d.j||{})[u])) return;
      const v=((d.j||{})[u]||{}).v;
      if(!v || DUELO.versaoMenor(v, '11.37.0')){ A._avisoVer[u]=1; DUELO._avisos.push('⚠️ '+nomeDe(u)+' está com o app desatualizado: peça pra atualizar, senão a ficha fica diferente'); }
    });
    if(DUELO._avisos.length){ const av=DUELO._avisos.splice(0); setTimeout(()=>{ try{ UI.toast(av.slice(0,2).join(' · ')); }catch(_){ errAnota(_,'L5744') } }, 0); }
    if(mudou){ salva('ativo'); DUELO.publica(); }
    return mudou;
  },
  // "Trocar tambem": passo a fazer o que o outro fez neste exercicio
  trocaIgual(e, u){
    const d=DUELO.dados(); if(!d || !e) return;
    const k=e._dk; let alvo=null, cx=null;
    const tr=DUELO.chaves(d).find(q=>d.ex[q].troca===k && d.ex[q].por===u);
    if(tr){ alvo=d.ex[tr].exId; cx=d.ex[tr].cx; }
    else { alvo=DUELO.exDe(d,u,k); cx=((((d.j||{})[u]||{}).xc)||{})[k] || ((d.ex||{})[k]||{}).cx; }
    if(!alvo || alvo===e.exId) return;
    DUELO.garanteEx(alvo, cx, u);
    const deEx=e.exId, modo=substituiExAtivo(e, alvo); if(!modo) return;
    try{ PICKER.registraTroca(deEx, alvo); }catch(_){ errAnota(_,'L5758') }
    salva('ativo'); DUELO.reconcilia(); DUELO.publica(); UI.refaz();
    UI.toast('Trocado ✓', true);
  },
  // fim do treino de quem esta no duelo
  fimDoTreino(como, salvo){
    if(!DUELO.emDuelo()) return;
    const id=S.ativo.duelo, d=DUELO.dados();
    DUELO.estado(como);
    if(salvo){
      salvo.duelo=id;
      if(d && d.id===id) salvo.dueloInfo={id, modo:d.modo, com:DUELO.outros(d).filter(u=>DUELO.entrou(d,u) || DUELO.estadoDe(d,u)===null).map(u=>DUELO.nome(d,u))};
      try{ salva('treinos'); NET.agenda('treinos/'+salvo.id, salvo); }catch(e){ errAnota(e,'L5770') }
    }
    if(d && d.id===id){
      d.j=d.j||{}; (d.j[DUELO.meu()]=d.j[DUELO.meu()]||{}).estado=como;
      // quem convidou abandonou antes de alguem entrar: o duelo e' cancelado (some dos convites), e nao
      // "encerrado com desistencia" (Mari descartou pra convidar de novo e o Chris entrou num duelo morto)
      if(como==='desistiu' && d.a===DUELO.meu() && DUELO.outros(d).every(u=>!DUELO.entrou(d,u))){
        d.status='cancelado'; NET.agenda('/duelos/'+d.id+'/status', 'cancelado'); return;
      }
      setTimeout(()=>DUELO.fecha(d), 600);
    }
  },
  // linha do duelo no feed/treino: "Venceu 4 x 2", "2o lugar"...
  // posicao com empate: quem empata divide o lugar; quem desistiu fica por ultimo
  posicao(d, r, u){
    const P=r.ordem||[]; if(DUELO.estadoDe(d,u)==='desistiu' && P.length>1) return P.length;
    const meu=Number(r.pts[u])||0, vivos=P.filter(x=>DUELO.estadoDe(d,x)!=='desistiu');
    return 1+vivos.filter(x=>(Number(r.pts[x])||0)>meu).length;
  },
  textoRes(d, r, uid){
    if(!r || !r.ordem) return '';
    const P=r.ordem, eu=uid||DUELO.meu(), pos=DUELO.posicao(d, r, eu);
    const empata=P.some(u=>u!==eu && DUELO.estadoDe(d,u)!=='desistiu' && (Number(r.pts[u])||0)===(Number(r.pts[eu])||0));
    const fmt=v=> d.modo==='mano'? String(v||0) : Math.round(v||0)+'%';
    const placar=P.map(u=>fmt(r.pts[u])).join(' × ');
    if(r.wo) return (r.venc===eu? 'Venceu por desistência' : 'Desistiu');
    if(!r.venc) return 'Empate · '+placar;
    if(P.length>2) return pos+'º lugar'+(empata? ' (empate)' : '')+' · '+placar;
    return (r.venc===eu? 'Venceu ' : 'Perdeu ')+placar;
  },
  // os dois (ou tres) terminaram: grava o resultado e atualiza o meu treino/feed
  // resultado OFICIAL: calculado no servidor (funcao placarDuelo), com exatamente este mesmo codigo.
  // Todo mundo ve o mesmo placar, mesmo com versoes diferentes do app. Sem o oficial, calcula aqui.
  resOficial(d){ return (d && d.resultado && (d.resultado.srv || d.resultado.v===4))? d.resultado : DUELO.calcula(d); },
  _pedidos:{},
  fecha(d){
    if(!d || !DUELO.terminou(d)) return;
    const oficial = (d.resultado && d.resultado.srv)? d.resultado : null;
    const r = oficial || DUELO.calcula(d);
    const guarda = oficial || {v:4, modo:r.modo, pts:r.pts, ordem:r.ordem, venc:r.venc||'', wo:!!r.wo};
    if(d.status!=='fim'){
      // o app grava so que terminou; o servidor calcula e grava o resultado oficial (aqui fica o local, pra mostrar ja)
      d.status='fim'; d.fim=d.fim||agora(); if(!oficial) d.resultado=guarda;
      NET.agenda('/duelos/'+d.id+'/fim', d.fim);
      NET.agenda('/duelos/'+d.id+'/status', 'fim');
    } else if(!oficial && !DUELO._pedidos[d.id]){
      // duelo terminado sem resultado oficial (antigo, ou o servidor ainda nao respondeu): pede o calculo, uma vez
      DUELO._pedidos[d.id]=1; if(!d.resultado) d.resultado=guarda;
      NET.agenda('/duelos/'+d.id+'/pedido', agora());
    }
    DUELO.anotaNoTreino(d, guarda);
    if(UI.telaAtual==='duelo') UI.refaz();
  },
  anotaNoTreino(d, r){
    const t=Object.values(S.treinos||{}).find(t=>t && t.duelo===d.id && !t.apagado); if(!t) return;
    const info={id:d.id, modo:d.modo, com:DUELO.outros(d).filter(u=>DUELO.entrou(d,u)).map(u=>DUELO.nome(d,u)), res:DUELO.textoRes(d, Object.assign({}, r), DUELO.meu())};
    try{ info.pub=DUELO.resumoPub(d, DUELO.calcula(d)); }catch(_){ errAnota(_,'L5817') }    // quem segue tambem ve o duelo pelo feed
    if(JSON.stringify(t.dueloInfo||{})===JSON.stringify(info)) return;
    t.dueloInfo=info; t.atualizado=agora(); salva('treinos'); NET.agenda('treinos/'+t.id, t);
    try{ if(S.perfil?.user && S.auth && treinoPublicado(t)) NET.agenda('/feed/'+S.auth.uid+'/'+t.id, resumoTreino(t)); }catch(e){ errAnota(e,'L5820') }
  },

  /* ---------------- tempo real ---------------- */
  conecta(id, inicial){
    if(DUELO.cur && DUELO.cur.id===id && (DUELO.es || DUELO._poll)) { if(inicial && !DUELO.cur.dados) DUELO.cur.dados=inicial; return; }
    DUELO.desconecta();
    DUELO.cur={id, dados: inicial||null};
    DUELO.puxa();
    DUELO.abreStream(id);
    DUELO._poll=setInterval(()=>{ if(!document.hidden) DUELO.puxa(); }, 2500);   // reserva, se o streaming cair (no iPhone ele "dorme")
  },
  async abreStream(id){
    try{
      if(typeof EventSource==='undefined') return;
      const tk=await NET.token(); if(!tk || !DUELO.cur || DUELO.cur.id!==id) return;
      const es=new EventSource(FB.db+'/duelos/'+id+'.json?auth='+encodeURIComponent(tk));
      es.addEventListener('put', ev=>DUELO.evento(ev,'put'));
      es.addEventListener('patch', ev=>DUELO.evento(ev,'patch'));
      const refaz=()=>{ try{ es.close(); }catch(e){ errAnota(e,'L5839') } if(DUELO.es===es){ DUELO.es=null; setTimeout(()=>{ if(DUELO.cur && DUELO.cur.id===id && !DUELO.es) DUELO.abreStream(id); }, 1500); } };
      es.addEventListener('auth_revoked', refaz);
      es.addEventListener('cancel', refaz);
      DUELO.es=es;
    }catch(e){ errAnota(e,'L5843') }
  },
  desconecta(){ try{ DUELO.es && DUELO.es.close(); }catch(e){ errAnota(e,'L5845') } DUELO.es=null; clearInterval(DUELO._poll); DUELO._poll=null; },
  async puxa(){
    const id=DUELO.cur && DUELO.cur.id; if(!id) return;
    const v=await NET.get('/duelos/'+id);
    if(v && DUELO.cur && DUELO.cur.id===id){ DUELO.cur.dados=v; DUELO.mudou(); }
  },
  evento(ev, tipo){
    let msg; try{ msg=JSON.parse(ev.data); }catch(e){ return; }
    if(!msg || !DUELO.cur) return;
    DUELO.cur.dados=DUELO.aplica(DUELO.cur.dados, msg.path||'/', msg.data, tipo);
    DUELO.mudou();
  },
  aplica(raiz, path, data, tipo){
    const partes=String(path||'/').split('/').filter(Boolean);
    const copia=raiz? JSON.parse(JSON.stringify(raiz)) : {};
    const poe=(base, ps, val)=>{
      if(!ps.length) return val;
      let n=base; for(let i=0;i<ps.length-1;i++){ if(n[ps[i]]==null || typeof n[ps[i]]!=='object') n[ps[i]]={}; n=n[ps[i]]; }
      if(val===null) delete n[ps[ps.length-1]]; else n[ps[ps.length-1]]=val;
      return base;
    };
    if(tipo==='put'){ if(!partes.length) return data; return poe(copia, partes, data); }
    let alvo=copia; Object.entries(data||{}).forEach(([k,v])=>{ alvo=poe(alvo, partes.concat(String(k).split('/').filter(Boolean)), v); });
    return alvo;
  },
  // algo mudou no duelo (nunca deixa um erro daqui quebrar a tela do treino)
  mudou(){
    try{
      const d=DUELO.dados(); if(!d) return;
      const eu=DUELO.meu();
      if(d.status==='ativo' && d.a===eu && !DUELO.estadoDe(d,eu) && !DUELO.terminou(d) && UI.telaAtual==='duelo' && !S.ativo){ DUELO.comeca(d); return; }
      if(DUELO.emDuelo() && S.ativo.duelo===d.id){
        const mexeu=DUELO.reconcilia();
        if(DUELO._reordenado){ DUELO._reordenado=false; try{ UI.toast('A ordem dos exercícios do duelo foi atualizada'); }catch(_){ errAnota(_,'L5878') } }
        if(mexeu && UI.telaAtual==='ativo'){
          // so espera quem esta digitando DE VERDADE (tecla nos ultimos 2,5 s). No iPhone o campo continua com
          // foco depois de tocar num botao, e a tela so atualizava abrindo e fechando outra tela.
          if(DUELO.digitando()) DUELO.agendaRefaz(); else DUELO.refazTela();
        }
        DUELO.publica();
      }
      if(DUELO.terminou(d)) DUELO.fecha(d);
      DUELO.desenha();
      if(UI.telaAtual==='duelo') UI.refaz();
    }catch(e){ try{ console.error('duelo', e); }catch(_){ errAnota(_,'L5889') } }
  },
  digitando(){ const f=document.activeElement; return !!(f && /^(INPUT|TEXTAREA)$/.test(f.tagName) && Date.now()-(DUELO._tecla||0)<2500); },
  refazTela(){ DUELO._pend=false; clearTimeout(DUELO._pendT); if(UI.telaAtual==='ativo') UI.refaz(); },
  agendaRefaz(){
    DUELO._pend=true; clearTimeout(DUELO._pendT);
    const ve=()=>{ if(!DUELO._pend) return; if(DUELO.digitando()) DUELO._pendT=setTimeout(ve, 700); else DUELO.refazTela(); };
    DUELO._pendT=setTimeout(ve, 700);
  },
  aoSairDoCampo(){ if(DUELO._pend && UI.telaAtual==='ativo') setTimeout(()=>{ if(DUELO._pend && !DUELO.digitando()) DUELO.refazTela(); }, 120); },

  /* ---------------- convites e historico ---------------- */
  async consulta(campo){
    const tk=await NET.token(); if(!tk || !DUELO.meu()) return {};
    const url=FB.db+'/duelos.json?orderBy='+encodeURIComponent('"'+campo+'"')+'&equalTo='+encodeURIComponent('"'+DUELO.meu()+'"')+'&limitToLast=40&auth='+tk;
    try{ const r=await NET.fetchT(url, {}, 12000); if(!r.ok) return {}; return (await r.json())||{}; }catch(e){ return {}; }
  },
  async meus(){
    const [a,b,c]=await Promise.all([DUELO.consulta('a'), DUELO.consulta('b'), DUELO.consulta('c')]);
    return Object.values(Object.assign({}, a, b, c)).filter(Boolean);
  },
  async verConvites(forca){
    if(!S.auth || !navigator.onLine) return;
    if(!forca && agora()-DUELO._convT<20000) return;
    DUELO._convT=agora();
    const todos=await DUELO.meus(), eu=DUELO.meu(), lista=[];
    todos.forEach(d=>{
      if(d.a===eu){ if(d.status==='ativo' && !DUELO.estadoDe(d,eu) && !DUELO.terminou(d)) lista.push(Object.assign({_tipo:'aceito'}, d)); }
      else if(DUELO.podeEntrar(d)) lista.push(Object.assign({_tipo: d.status==='ativo'? 'andamento' : 'recebido'}, d));
    });
    const antes=JSON.stringify(DUELO._convites.map(x=>x.id+x._tipo)), depois=JSON.stringify(lista.map(x=>x.id+x._tipo));
    DUELO._convites=lista;
    if(antes!==depois && UI.telaAtual==='inicio') UI.refaz();
    DUELO.pendentes(todos);
  },
  // treino ja salvo cujo duelo terminou depois: anota o resultado (e o feed)
  pendentes(todos){
    try{ (todos||[]).forEach(d=>{ if(d && d.status==='fim' && d.resultado){ const r=DUELO.resOficial(d); DUELO.anotaNoTreino(d, r); } }); }catch(e){ errAnota(e,'L5926') }
  },
  async retrospecto(outro){
    const todos=await DUELO.meus(), eu=DUELO.meu(); let v=0, p=0, e=0;
    todos.forEach(d=>{
      if(!d || d.status!=='fim' || !d.resultado || (outro && !DUELO.jog(d).includes(outro))) return;
      const r=DUELO.resOficial(d);
      if(!r.venc) e++; else if(r.venc===eu) v++; else p++;
    });
    return {v, p, e, n:v+p+e};
  },

  /* ---------------- telas ---------------- */
  // barra no topo do treino ativo
  barra(){
    const d=DUELO.dados(); const el=h('div',{class:'card duelo-barra', id:'duelo-barra'});
    if(!d || !DUELO.emDuelo() || d.id!==S.ativo.duelo){ el.append(h('div',{class:'f13 mut'},'⚔️ Conectando ao duelo…')); return el; }
    const eu=DUELO.meu(), modo=DUELO.MODOS[d.modo]||DUELO.MODOS.superacao, lid=DUELO.lider(d);
    const os=DUELO.outros(d), ks=DUELO.chaves(d).filter(k=>!d.ex[k].troca && !DUELO.ehDuplicata(d,k));
    const txt = lid===eu? 'Você está na frente' : (lid? DUELO.nome(d,lid)+' está na frente' : 'Empatados até aqui');
    el.append(
      h('div',{class:'linha',style:'gap:8px'},
        h('div',{style:'font-size:20px;flex-shrink:0'},'⚔️'),
        h('div',{class:'esp b800',style:'min-width:0;font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'}, modo.ic+' '+modo.n),
        h('button',{class:'btn btn-mini duelo-bt','aria-label':'Como funciona o duelo',onclick:()=>DUELO.ajuda(d.modo)},'?'),
        h('button',{class:'btn btn-mini duelo-bt',onclick:()=>UI.vai('duelo',{id:d.id})},'Placar')),
      // as pessoas numa linha propria, com a largura toda (nome comprido nao cobre os botoes)
      h('div',{class:'duelo-chips'}, ...os.map(u=>{
            const est=DUELO.estadoDe(d,u), feitos=ks.filter(k=>DUELO.setsDe(d,u,k).length).length;
            const sub= est==='desistiu'? 'desistiu' : (est==='concluiu'? 'terminou' : (est==='recusou'? 'recusou' : (!DUELO.entrou(d,u)? 'convidado' : feitos+'/'+ks.length)));
            return h('span',{class:'duelo-chip'+(lid===u?' on':''),title:DUELO.nome(d,u)+' · '+sub}, DUELO.nome(d,u)+' · '+sub); })),
      h('div',{class:'duelo-lider'+(lid===eu?' on':'')}, txt));
    return el;
  },
  fmtSerie(s, exId){
    if(!s) return '';
    const x=BIB.ex(exId)||{}, w=s.tipo==='W'? 'W ' : '';
    if(x.t==='tempo') return w+fmtTempoCampo(s.reps);
    if((x.t||'peso_reps')==='peso_reps' && Number(s.kg)>0) return w+CORE.fmtKg(s.kg)+'×'+s.reps;
    return w+s.reps+' reps';
  },
  // comparacao serie a serie, embaixo de cada exercicio
  blocoOponente(e){
    const d=DUELO.dados(); const el=h('div',{class:'duelo-op','data-dk':e._dk||''});
    if(!d || !e._dk || !d.ex || !d.ex[e._dk]) return el;
    const eu=DUELO.meu(), k=e._dk, os=DUELO.outros(d).filter(u=>DUELO.entrou(d,u));
    if(!os.length){ el.append(h('div',{class:'f12 mut2'},'Aguardando os outros entrarem…')); return el; }
    // avisos: troca e remocao
    os.forEach(u=>{
      const tr=DUELO.chaves(d).find(q=>d.ex[q].troca===k && d.ex[q].por===u);
      const outroEx=DUELO.exDe(d,u,k);
      if(DUELO.foraDe(d,u,k)) el.append(h('div',{class:'duelo-aviso'}, DUELO.nome(d,u)+' removeu este exercício'));
      else if(tr || outroEx!==e.exId){
        const nomeNovo= tr? (BIB.porId[d.ex[tr].exId]||{}).n || d.ex[tr].nm : DUELO.nomeEx(d,u,k);
        const jaIgual= tr? S.ativo.ex.some(q=>q._dk===tr) : outroEx===e.exId;
        el.append(h('div',{class:'duelo-aviso'},
          h('span',{}, DUELO.nome(d,u)+' trocou por '+nomeNovo+(tr? ' (no meio do exercício)' : '')),
          jaIgual? null : h('button',{class:'btn btn-mini btn-p',onclick:()=>DUELO.trocaIgual(e,u)},'Trocar também')));
      }
    });
    // tabela: linha da ficha x pessoa (W com W, serie 1 com serie 1)
    const quem=[eu].concat(os), lin=[];
    const colunas=quem.map(u=>({u, ex: u===eu? e.exId : DUELO.exDe(d,u,k),
      m: u===eu? Object.fromEntries((e.series||[]).map((s,i)=>[i,s]).filter(([i,s])=>s && s.ok)) : DUELO.mapaDe(d,u,k)}));
    const idx=[...new Set(colunas.flatMap(c=>Object.keys(c.m).map(Number)))].sort((a,b)=>a-b);
    const res= d.modo==='mano'? DUELO.mano(d) : null, w= res? res.por[k] : null;
    const igual=(a,b)=>a && b && String(a.kg)===String(b.kg) && Number(a.reps)===Number(b.reps) && (a.tipo||'N')===(b.tipo||'N');
    const melhorDe=c=>{ if(!res) return null; const p=(res.perf[k]||{})[c.u]; return p && p.melhor? p.melhor.s : null; };
    const rotulo=i=>{ const minha=(e.series||[])[i]; const tipo= minha? minha.tipo : (colunas.map(c=>c.m[i]).find(Boolean)||{}).tipo;
      if(tipo==='W') return 'W';
      let n=0; for(let q=0;q<=i;q++){ const t=(e.series||[])[q]? e.series[q].tipo : ((colunas.map(c=>c.m[q]).find(Boolean)||{}).tipo); if(t!=='W') n++; }
      return String(n); };
    lin.push(h('div',{class:'duelo-tr cab'}, h('span',{class:'duelo-td n'},''), ...quem.map(u=>h('span',{class:'duelo-td'+(w===u?' ganha':'')}, u===eu? 'Você' : DUELO.nome(d,u)))));
    if(!idx.length) lin.push(h('div',{class:'duelo-tr'}, h('span',{class:'duelo-td n'},''), ...quem.map(()=>h('span',{class:'duelo-td',style:'color:var(--tx3)'},'·'))));
    idx.forEach(i=>{
      lin.push(h('div',{class:'duelo-tr'}, h('span',{class:'duelo-td n'}, rotulo(i)),
        ...colunas.map(c=>{ const s=c.m[i], best=melhorDe(c);
          const pr = s && (s.pr===1 || s.pr===true || (Array.isArray(s.pr) && s.pr.length));
          return h('span',{class:'duelo-td'+(s && igual(s,best)?' top':''), style:s? '' : 'color:var(--tx3)'},
            s? DUELO.fmtSerie(Object.assign({}, s, {tipo:'N'}), c.ex) : '·',
            pr? h('span',{class:'duelo-pr',title:'Recorde','aria-label':'recorde'},'🥇') : null); })));
    });
    el.append(h('div',{class:'duelo-tab'}, ...lin));
    if(d.modo==='mano' && w){
      const motivo=()=>{
        const P=res.perf[k]||{}, pw=P[w]; if(!pw || !pw.lista || !pw.lista.length) return '';
        const exw=DUELO.exDe(d,w,k)||e.exId, carga=DUELO.valorEhCarga(exw), fv=v=>CORE.fmtKg(Math.round(v*10)/10);
        const best=(pw.melhor && !DUELO.descartada(d,w,k,pw.melhor.s))? DUELO.fmtSerie(pw.melhor.s, exw)+' ≈ ' : '';
        const outros=Object.keys(P).filter(u=>u!==w && P[u] && P[u].lista && P[u].lista.length).map(u=>P[u].lista[0]);
        const seg=outros.length? Math.max(...outros) : null;
        const empMelhor = seg!=null && Math.abs(pw.lista[0]-seg)<0.01;
        return ': melhor série '+best+fv(pw.lista[0])+(seg!=null? ' contra '+fv(seg) : '')+(carga? ' (1RM estimado)' : '')+(empMelhor? ' · empatou na melhor, decidiu a seguinte' : '');
      };
      el.append(h('div',{class:'duelo-veredito'+(w===eu?' on':'')},
        w==='='? 'Empatados neste exercício' : (w==='≠'? 'Exercícios diferentes: não conta' : (w===eu? 'Você leva este exercício' : DUELO.nome(d,w)+' leva este exercício')+motivo())));
    }
    return el;
  },
  // atualiza so os blocos do duelo, sem redesenhar a tela (nao tira o foco de quem digita)
  desenha(){
    try{
      if(UI.telaAtual!=='ativo' || !DUELO.emDuelo()) return;
      const b=$('#duelo-barra'); if(b) b.replaceWith(DUELO.barra());
      document.querySelectorAll('.duelo-op').forEach(el=>{
        const e=S.ativo.ex.find(q=>q._dk===el.dataset.dk); if(e) el.replaceWith(DUELO.blocoOponente(e));
      });
    }catch(e){ try{ console.error('duelo', e); }catch(_){ errAnota(_,'L6032') } }
  },
  // convites no Inicio
  cartoesInicio(){
    if(!DUELO._convites.length) return null;
    const box=h('div',{});
    DUELO._convites.forEach(d=>{
      const modo=DUELO.MODOS[d.modo]||DUELO.MODOS.superacao;
      const quem=d._tipo==='aceito'? DUELO.outros(d).map(u=>DUELO.nome(d,u)).join(' e ') : DUELO.nome(d,d.a);
      const tit= d._tipo==='recebido'? quem+' te desafiou' : (d._tipo==='andamento'? 'Duelo de '+quem+' em andamento' : quem+' aceitou seu desafio');
      const card=h('div',{class:'card duelo-barra'},
        h('div',{class:'linha',style:'gap:10px'},
          h('div',{style:'font-size:24px'},'⚔️'),
          h('div',{class:'esp',style:'min-width:0'},
            h('div',{class:'b800'}, tit),
            h('div',{class:'f12 mut'}, d.titulo+' · '+modo.n+(DUELO.jog(d).length>2? ' · 3 pessoas' : '')))));
      if(d._tipo==='aceito') card.append(h('button',{class:'btn btn-p',style:'margin-top:12px',onclick:()=>{ DUELO.conecta(d.id, d); DUELO.comeca(d); }},'Entrar no duelo'));
      else card.append(h('div',{class:'linha',style:'gap:8px;margin-top:12px'},
        h('button',{class:'btn',style:'flex:1',onclick:()=>DUELO.recusar(d)},'Recusar'),
        h('button',{class:'btn btn-p',style:'flex:1',onclick:()=>DUELO.aceitar(d)}, d._tipo==='andamento'? 'Entrar' : 'Aceitar')));
      box.append(card);
    });
    return box;
  },
  // folha de desafiar. Montada UMA vez: escolher so troca o destaque.
  folhaDesafiar(amigo){
    if(S.ativo){ UI.toast('Conclua ou descarte o treino atual antes de começar um duelo'); return; }
    let modo='superacao', rot=null, terceiro=null;
    const cartoesModo={};
    const modos=h('div',{style:'display:grid;gap:8px',role:'radiogroup','aria-label':'Modo do duelo'}, ...['superacao','mano'].map(k=>{
      const M=DUELO.MODOS[k];
      cartoesModo[k]=h('button',{class:'duelo-modo'+(modo===k?' on':''),role:'radio','aria-checked':String(modo===k),onclick:()=>{
        modo=k; Object.entries(cartoesModo).forEach(([kk,b])=>{ b.classList.toggle('on',kk===k); b.setAttribute('aria-checked',String(kk===k)); }); }},
        h('div',{class:'b800'}, M.ic+' '+M.n), h('div',{class:'f12 mut',style:'margin-top:2px;line-height:1.4'}, M.d));
      return cartoesModo[k];
    }));
    const itens=[];
    const item=(id, titulo, sub)=>{
      const b=h('button',{class:'duelo-rot'+(rot===id?' on':''),onclick:()=>{ rot=id; itens.forEach(x=>x.el.classList.toggle('on', x.id===id)); }},
        h('div',{class:'b800',style:'font-size:14px'}, titulo), sub? h('div',{class:'f12 mut2',style:'margin-top:2px'}, sub) : null);
      itens.push({id, el:b}); return b;
    };
    const pastas=Object.values(S.pastas||{}).filter(p=>p && !p.apagada && !p.apagado).sort((a,b)=>(a.ordem||0)-(b.ordem||0));
    const rots=Object.values(S.rotinas||{}).filter(r=>r && !r.apagada && !r.apagado && (r.ex||[]).length);
    const lista=[item(null,'Treino livre','Vocês montam juntos: o que um adicionar aparece pros outros')];
    pastas.map(p=>p.id).concat([undefined]).forEach(pid=>{
      rots.filter(r=>(r.pasta||undefined)===pid || (pid===undefined && r.pasta && !S.pastas[r.pasta]))
        .sort((a,b)=>(a.ordem||0)-(b.ordem||0))
        .forEach(r=>lista.push(item(r.id, r.titulo, (pid && S.pastas[pid]? S.pastas[pid].nome+' · ' : '')+r.ex.length+' exercícios')));
    });
    // terceiro participante (opcional), entre quem eu sigo
    const seg=Object.entries((DUELO.tres && S.social && S.social.seguindo)||{}).filter(([u])=>u!==amigo.uid && u!==S.auth?.uid)
      .map(([u,v])=>({uid:u, user:(v&&v.user)||'', nome:(v&&v.nome)||''})).filter(p=>p.user||p.nome)
      .sort((a,b)=>(a.user||a.nome).localeCompare(b.user||b.nome));
    const cartT={};
    const terc= seg.length? h('div',{class:'duelo-terc'}, ...seg.map(p=>{
      cartT[p.uid]=h('button',{class:'chip',onclick:()=>{ terceiro= terceiro && terceiro.uid===p.uid? null : p;
        Object.entries(cartT).forEach(([u,b])=>b.classList.toggle('on', !!terceiro && terceiro.uid===u)); }}, p.user? '@'+p.user : p.nome);
      return cartT[p.uid]; })) : null;
    UI.folha('Duelo com '+(amigo.user? '@'+amigo.user : (amigo.nome||'amigo')),[
      h('div',{class:'f13 mut',style:'margin:0 2px 8px'},'Modo'), modos,
      h('div',{class:'f13 mut',style:'margin:16px 2px 8px'},'Treino'),
      h('div',{style:'display:grid;gap:6px'}, ...lista),
      terc? h('div',{class:'f13 mut',style:'margin:16px 2px 8px'},'Chamar mais alguém (opcional)') : null, terc,
      h('div',{class:'duelo-rodape'},
        h('button',{class:'btn btn-p',onclick:()=>DUELO.desafiar([amigo].concat(terceiro? [terceiro] : []), modo, rot)},'Enviar desafio ⚔️'),
        h('div',{class:'f12 mut2',style:'text-align:center;margin-top:6px'},'O convite vale por '+DUELO.CONVITE_MIN+' minutos.'))]);
  },
  // placar: convite, andamento e resultado
  tela(id){
    UI.topo(h('div',{class:'topo-tit'},'Duelo'));
    const m=$('#main'); m.innerHTML='';
    if(!DUELO.cur || DUELO.cur.id!==id) DUELO.conecta(id);
    const d=DUELO.dados();
    if(!d){ m.append(h('div',{class:'vazio'},'Carregando o duelo…')); return; }
    if(d.status==='fim' && !(d.resultado && d.resultado.srv)) DUELO.fecha(d);     // sem resultado oficial: pede ao servidor
    const eu=DUELO.meu(), modo=DUELO.MODOS[d.modo]||DUELO.MODOS.superacao, souA=d.a===eu, P=DUELO.jog(d);
    const cab=h('div',{class:'card duelo-barra',style:'text-align:center'}, h('div',{class:'f12 mut'}, modo.ic+' '+modo.n+' · '+d.titulo));
    m.append(cab);
    if(d.status==='convite'){
      const exp=agora()>(d.expira||0);
      cab.append(h('div',{class:'b800',style:'font-size:18px;margin-top:8px'}, exp? 'O convite expirou' : (souA? 'Aguardando resposta…' : DUELO.nome(d,d.a)+' te desafiou')));
      cab.append(h('div',{class:'duelo-chips',style:'justify-content:center;margin-top:8px'}, ...DUELO.outros(d).map(u=>{
        const st=DUELO.estadoDe(d,u); return h('span',{class:'duelo-chip'}, DUELO.nome(d,u)+' · '+(st==='recusou'? 'recusou' : (st? 'aceitou' : 'aguardando'))); })));
      if(!exp && souA) m.append(h('button',{class:'btn',onclick:()=>DUELO.cancelar(d)},'Cancelar desafio'));
      if(!exp && !souA && !DUELO.estadoDe(d,eu)) m.append(h('div',{class:'linha',style:'gap:8px'},
        h('button',{class:'btn',style:'flex:1',onclick:()=>{ DUELO.recusar(d); UI.volta(); }},'Recusar'),
        h('button',{class:'btn btn-p',style:'flex:1',onclick:()=>DUELO.aceitar(d)},'Aceitar')));
      return;
    }
    if(d.status==='recusado' || d.status==='cancelado'){
      cab.append(h('div',{class:'b800',style:'font-size:18px;margin-top:8px'}, d.status==='recusado'? 'O desafio foi recusado' : 'Desafio cancelado'));
      return;
    }
    const fim=DUELO.terminou(d), r=DUELO.calcula(d), quem=(fim? r.ordem : DUELO.noPlacar(d));
    const fmtN=v=> d.modo==='mano'? String(v||0) : Math.round(v||0)+'%';
    const placar=h('div',{class:'duelo-placar-g'}, ...quem.map((u,i)=>h('div',{class:'duelo-pessoa'+(fim && r.venc===u?' on':'')},
      h('div',{class:'f12 mut',style:'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%'}, (fim && quem.length>2? DUELO.posicao(d, r, u)+'º · ' : '')+(u===eu? 'Você' : DUELO.nome(d,u))),
      h('div',{class:'duelo-placar'}, fim || d.modo==='mano'? fmtN(r.pts[u]) : '—'),
      h('div',{class:'f12 mut2'}, (function(){ const st=DUELO.estadoDe(d,u); return st==='desistiu'? 'desistiu' : (st==='concluiu'? 'terminou' : (DUELO.entrou(d,u)? 'treinando' : 'convidado')); })()))));
    cab.append(...[placar,
      h('div',{class:'b800',style:'margin-top:10px;font-size:16px'},
        !fim? (DUELO.estadoDe(d,eu)==='concluiu'? 'Aguardando os outros terminarem…' : 'Duelo em andamento') :
        (r.wo? (r.venc===eu? 'Vitória por desistência 🏆' : DUELO.nome(d,r.venc)+' venceu por desistência') : (!r.venc? 'Empate' : (r.venc===eu? 'Você venceu 🏆' : DUELO.nome(d,r.venc)+' venceu')))),
      d.modo==='mano'? h('div',{class:'f12 mut',style:'margin-top:4px'},'Cada exercício vale 1 ponto. Ganha quem fizer a melhor série, medida pelo 1RM estimado (carga × (1 + repetições ÷ 30)): mais carga ou mais repetições contam. Empatou? Compara a 2ª melhor série e depois o volume. Aquecimento conta.')
                     : (fim? h('div',{class:'f12 mut',style:'margin-top:4px'},'% do próprio normal: 100% é o seu padrão') : null)].filter(Boolean));
    if(!fim && DUELO.emDuelo() && S.ativo.duelo===d.id) m.append(h('button',{class:'btn btn-p',onclick:()=>UI.vai('ativo',null,false)},'Voltar ao treino'));
    // exercicio a exercicio: quem levou, a nota de cada um e as series
    const lista=h('div',{class:'card'});
    const nomeU=u=>u===eu? 'Você' : DUELO.nome(d,u);
    DUELO.chaves(d).filter(k=>(!d.ex[k].troca || DUELO.quemFez(d,k).length) && !DUELO.ehDuplicata(d,k)).forEach(k=>{
      const w=r.por[k], nomeSala=((BIB.porId[d.ex[k].exId]||{}).n || d.ex[k].nm || 'Exercício')+(d.ex[k].troca? ' · troca' : '');
      const linhas=quem.map(u=>{
        const ss=DUELO.setsDe(d,u,k), ex=DUELO.exDe(d,u,k), fora=DUELO.foraDe(d,u,k);
        const sp=h('span',{});
        if(fora) sp.append('removeu'); else if(!ss.length) sp.append('—');
        else ss.forEach((s,i)=>{ if(i) sp.append('  ·  '); const txt=DUELO.fmtSerie(s, ex)+(s.pr? ' 🥇' : '');
          sp.append(DUELO.descartada(d,u,k,s)? h('s',{title:'Não contou: muito acima do seu normal'},txt) : txt); });
        if(!fora && ex!==d.ex[k].exId) sp.append('  ('+DUELO.nomeEx(d,u,k)+')');
        let nota='';
        if(d.modo==='mano' && ss.length && !fora){ const pm=DUELO.perfMano(d,u,k); nota= pm.lista.length? CORE.fmtKg(Math.round(pm.lista[0]*10)/10)+(DUELO.valorEhCarga(ex)? ' kg' : '') : 'sem série válida'; }
        return {quem:nomeU(u), venceu:w===u, nota, sets:sp};
      });
      lista.append(DUELO.blocoRes(nomeSala, DUELO.badgeRes(w, nomeU, fim), linhas));
    });
    if(DUELO.chaves(d).length) m.append(h('div',{class:'linha',style:'margin:18px 2px 8px'}, h('div',{class:'secao esp',style:'margin:0'},'Exercício por exercício'),
      h('button',{class:'btn btn-mini',style:'width:auto;padding:6px 12px',onclick:()=>DUELO.ajuda(d.modo)},'Como funciona?')));
    if(d.modo==='mano' && DUELO.chaves(d).length) m.append(h('div',{class:'f12 mut',style:'margin:-2px 2px 8px'},'A nota é o 1RM estimado da melhor série de cada um.'));
    if(DUELO.chaves(d).length) m.append(lista);
    if(fim){
      const hist=h('div',{class:'f13 mut',style:'text-align:center;margin:6px 0 12px'},'Carregando o retrospecto…');
      m.append(hist);
      const ou=DUELO.outros(d);
      DUELO.retrospecto(ou.length===1? ou[0] : null).then(c=>{ if(hist.isConnected) hist.textContent=(ou.length===1? 'Retrospecto contra '+DUELO.nome(d,ou[0]) : 'Seus duelos')+': '+c.v+' vitória'+(c.v===1?'':'s')+' · '+c.p+' derrota'+(c.p===1?'':'s')+(c.e? ' · '+c.e+' empate'+(c.e===1?'':'s') : ''); });
      m.append(h('button',{class:'btn btn-p',onclick:()=>DUELO.revanche(d)},'Revanche ⚔️'));
    }
  },
  // lista dos meus duelos (perfil)
  async telaLista(){
    UI.topo(h('div',{class:'topo-tit'},'Duelos'));
    const m=$('#main'); m.innerHTML=''; m.append(h('div',{class:'vazio'},'Carregando…'));
    const todos=(await DUELO.meus()).filter(d=>d.status==='fim' || d.status==='ativo').sort((a,b)=>(b.inicio||b.criado||0)-(a.inicio||a.criado||0));
    if(UI.telaAtual!=='duelos') return;
    m.innerHTML='';
    const c=await DUELO.retrospecto(null);
    m.append(h('div',{class:'card duelo-barra',style:'text-align:center'},
      h('div',{class:'duelo-placar'}, c.v+' · '+c.p+(c.e? ' · '+c.e : '')),
      h('div',{class:'f12 mut'}, 'vitórias · derrotas'+(c.e? ' · empates' : ''))));
    if(!todos.length){ m.append(h('div',{class:'vazio'},'Nenhum duelo ainda. Desafie alguém pelo perfil.')); return; }
    const lista=h('div',{class:'card'});
    todos.slice(0,40).forEach(d=>{
      const r=d.status==='fim' && d.resultado? (DUELO.resOficial(d)) : null;
      lista.append(h('button',{class:'duelo-item',onclick:()=>UI.vai('duelo',{id:d.id})},
        h('div',{class:'esp',style:'min-width:0;text-align:left'},
          h('div',{class:'b800',style:'font-size:14px'}, 'vs '+DUELO.outros(d).map(u=>DUELO.nome(d,u)).join(' e ')),
          h('div',{class:'f12 mut2'}, (DUELO.MODOS[d.modo]||DUELO.MODOS.superacao).n+' · '+d.titulo+' · '+dataRelativa(d.inicio||d.criado))),
        h('span',{class:'f12 b800'+(r && r.venc===DUELO.meu()?' duelo-ok':'')}, r? DUELO.textoRes(d, r) : 'em andamento')));
    });
    m.append(lista);
  },
  async revanche(d){
    if(S.ativo){ UI.toast('Conclua ou descarte o treino atual antes de começar um duelo'); return; }
    const eu=DUELO.meu(), os=DUELO.outros(d), t0=agora(), id='d'+uid(), ex={};
    DUELO.chaves(d).filter(k=>!d.ex[k].troca).forEach((k,i)=>{ const q=d.ex[k]; ex['k'+uid()]=Object.assign({}, q, {o:i, por:eu}); });
    const nd={id, a:eu, b:os[0], por:eu, modo:d.modo, titulo:d.titulo, status:'convite', criado:t0, expira:t0+DUELO.CONVITE_MIN*60000, nomes:Object.assign({}, d.nomes||{})};
    if(os[1]) nd.c=os[1];
    if(Object.keys(ex).length) nd.ex=ex;
    try{ await NET.putD('/duelos/'+id, nd); }catch(e){ UI.toast('Não consegui enviar a revanche. Tente de novo.'); return; }
    UI.toast('Revanche enviada ⚔️', true); DUELO.conecta(id, nd); UI.vai('duelo',{id});
  },
  async lerChave(){ try{ DUELO.tres = (await NET.get('/config/duelo3'))===true; }catch(e){ errAnota(e,'L6202') } },
  boot(){
    try{ if(S.ativo && S.ativo.duelo) DUELO.conecta(S.ativo.duelo); }catch(e){ errAnota(e,'L6204') }
    DUELO.lerChave();
    DUELO.verConvites(true);
  }
};
  return DUELO;
};
