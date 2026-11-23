import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXPECTED_VERSION = '11.42.0';
const SITE_BASE = new URL('https://forgex.local/');
const failures = [];
const successes = [];

function ok(label) {
  successes.push(label);
}

function fail(label, detail) {
  failures.push(detail ? label + ': ' + detail : label);
}

function check(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function read(relativePath) {
  try {
    return readFileSync(resolve(ROOT, relativePath), 'utf8').replace(/^\uFEFF/, '');
  } catch (error) {
    fail('leitura de ' + relativePath, error.message);
    return '';
  }
}

function parseJson(relativePath, source) {
  try {
    const value = JSON.parse(source);
    ok('JSON valido: ' + relativePath);
    return value;
  } catch (error) {
    fail('JSON valido: ' + relativePath, error.message);
    return null;
  }
}

const indexHtmlBruto = read('index.html');
// Desde a 11.40 os tratamentos de erro vazios registram o erro (errAnota). Para as travas antigas, que citam
// trechos com o tratamento vazio, o registro equivale ao vazio (o comportamento e' o mesmo: o erro e' tratado).
const indexHtml = indexHtmlBruto.replace(/catch\((\w+)\)\{ errAnota\(\1,'L\d+'\) \}/g, 'catch($1){}');
const swSource = read('sw.js');
const manifest = parseJson('manifest.webmanifest', read('manifest.webmanifest'));
const exercises = parseJson('exercicios.json', read('exercicios.json'));

let inlineCount = 0;
let inlineSyntaxOk = true;
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
for (const match of indexHtml.matchAll(scriptPattern)) {
  const attributes = match[1];
  const source = match[2];
  if (/\bsrc\s*=/i.test(attributes)) continue;
  const typeMatch = attributes.match(/\btype\s*=\s*(["'])(.*?)\1/i);
  if (typeMatch && !/^(?:text|application)\/javascript$/i.test(typeMatch[2]) && typeMatch[2].toLowerCase() !== 'module') continue;
  inlineCount += 1;
  try {
    new vm.Script(source, { filename: 'index.html:inline-' + inlineCount + '.js', displayErrors: true });
  } catch (error) {
    inlineSyntaxOk = false;
    fail('sintaxe do JavaScript inline #' + inlineCount, error.message);
  }
}
check(inlineCount > 0, 'scripts inline encontrados', 'nenhum script inline foi encontrado em index.html');
if (inlineCount > 0 && inlineSyntaxOk) ok('sintaxe dos ' + inlineCount + ' script(s) inline');

try {
  new vm.Script(swSource, { filename: 'sw.js', displayErrors: true });
  ok('sintaxe de sw.js');
} catch (error) {
  fail('sintaxe de sw.js', error.message);
}

async function verifyServiceWorkerBehavior() {
  const listeners = {};
  let putCalls = 0;
  let openedUrl = null;
  const cache = {
    add: async () => undefined,
    put: async () => { putCalls += 1; },
    match: async () => undefined
  };
  const clientsMock = {
    claim: async () => undefined,
    matchAll: async () => [],
    openWindow: async url => { openedUrl = url; return null; }
  };
  const context = {
    URL,
    Request,
    Response,
    Promise,
    setTimeout,
    clearTimeout,
    console,
    fetch: async () => { throw new Error('offline'); },
    caches: {
      open: async () => cache,
      keys: async () => [],
      delete: async () => true,
      match: async key => typeof key === 'string' && key.includes('index.html')
        ? new Response('<!doctype html><title>ForgeX offline</title>', { status: 200, headers: { 'Content-Type': 'text/html' } })
        : undefined
    },
    clients: clientsMock,
    self: {
      location: new URL('https://forgex.local/'),
      registration: {
        scope: 'https://forgex.local/',
        showNotification: async () => undefined,
        getNotifications: async () => []
      },
      clients: clientsMock,
      skipWaiting: () => undefined,
      addEventListener: (type, handler) => { listeners[type] = handler; }
    }
  };

  try {
    vm.runInNewContext(swSource, context, { filename: 'sw.js' });
  } catch (error) {
    fail('execucao isolada de sw.js', error.message);
    return;
  }

  for (const type of ['install', 'activate', 'fetch', 'push', 'notificationclick']) {
    check(typeof listeners[type] === 'function', 'listener de service worker: ' + type, 'listener ausente');
  }
  if (typeof listeners.fetch !== 'function') return;

  const dispatchFetch = async request => {
    let responsePromise;
    listeners.fetch({ request, respondWith(value) { responsePromise = Promise.resolve(value); } });
    return responsePromise ? responsePromise : null;
  };

  try {
    const catalogResponse = await dispatchFetch(new Request('https://forgex.local/exercicios.json'));
    check(catalogResponse && catalogResponse.status === 503, 'catalogo offline nao recebe HTML', 'status ' + String(catalogResponse && catalogResponse.status));
    check(catalogResponse && !(catalogResponse.headers.get('content-type') || '').includes('text/html'), 'catalogo offline preserva tipo seguro');

    const navigationResponse = await dispatchFetch(new Request('https://forgex.local/sem-rede/'));
    check(navigationResponse && navigationResponse.status === 200 && (navigationResponse.headers.get('content-type') || '').includes('text/html'), 'navegacao offline usa o app em cache');

    putCalls = 0;
    context.fetch = async () => new Response('nao encontrado', { status: 404 });
    const notFoundResponse = await dispatchFetch(new Request('https://forgex.local/exercicios.json'));
    check(notFoundResponse && notFoundResponse.status === 404 && putCalls === 0, 'service worker nao armazena respostas com erro', 'status ' + String(notFoundResponse && notFoundResponse.status) + ', puts ' + putCalls);
  } catch (error) {
    fail('rotas offline do service worker', error.message);
  }

  if (typeof listeners.notificationclick === 'function') {
    try {
      let task;
      listeners.notificationclick({
        notification: { data: { url: 'https://exemplo-malicioso.invalid/coleta' }, close() {} },
        waitUntil(value) { task = Promise.resolve(value); }
      });
      await task;
      check(openedUrl === 'https://forgex.local/', 'notificacao bloqueia destino externo', 'abriu ' + String(openedUrl));
    } catch (error) {
      fail('destino seguro de notificacao', error.message);
    }
  }
}

await verifyServiceWorkerBehavior();

const appVersionMatch = indexHtml.match(/\bconst\s+APP_VER\s*=\s*(["'])([^"']+)\1/);
const cacheVersionMatch = swSource.match(/\bconst\s+CACHE\s*=\s*(["'])tg-v([^"']+)\1/);
const termsVersionMatch = indexHtml.match(/\bconst\s+TERMOS_V\s*=\s*(\d+)/);
const appVersion = appVersionMatch && appVersionMatch[2];
const cacheVersion = cacheVersionMatch && cacheVersionMatch[2];
check(appVersion === EXPECTED_VERSION, 'APP_VER ' + EXPECTED_VERSION, 'encontrado ' + String(appVersion));
check(cacheVersion === EXPECTED_VERSION, 'cache tg-v' + EXPECTED_VERSION, 'encontrado ' + String(cacheVersion));
check(appVersion === cacheVersion, 'APP_VER alinhado ao cache', String(appVersion) + ' versus ' + String(cacheVersion));
check(termsVersionMatch && Number(termsVersionMatch[1]) >= 2, 'versao dos termos atualizada', 'TERMOS_V ' + String(termsVersionMatch && termsVersionMatch[1]));
check(indexHtml.includes('{obrigatoria:true}'), 'aceite atualizado nao pode ser ignorado');
check(indexHtml.includes('feedPub:!!pubAgora') && indexHtml.includes('function treinoPublicado('), 'visibilidade persistida por treino');
check(indexHtml.includes('async function migraVisibilidadeFeed(') && indexHtml.includes('await migraVisibilidadeFeed();'), 'migracao segura da visibilidade do feed');

check(!/user-scalable\s*=\s*["']?\s*no\b/i.test(indexHtml), 'viewport permite zoom', 'user-scalable=no ainda esta presente');
check(!/maximum-scale\s*=\s*1(?![\d.])/i.test(indexHtml), 'viewport nao trava o zoom', 'maximum-scale=1 bloqueia a pinca no Android');
check(indexHtml.includes('@supports (-webkit-touch-callout:none)') && /input:not\(\[type=number\]\)[^{]*\{font-size:16px!important\}/.test(indexHtml), 'campos sem zoom automatico no iPhone', 'fonte < 16px faz o iOS dar zoom ao tocar no campo');

// guardas da revisao 11.24.1 (bugs reais encontrados na 11.24.0)
check(!/html\s*\{[^}]*scroll-behavior\s*:\s*smooth/i.test(indexHtml), 'rolagem instantanea ao navegar', 'scroll-behavior:smooth faz a tela descer sozinha ao voltar');
check(indexHtml.includes("mm.classList.remove('fx-tela','fx-ir','fx-voltar'); }catch(e){} }, 420)") && indexHtml.includes('UI._fxT'), 'animacao de entrada so ao navegar', 'sem remover fx-tela, cada redesenho reanima os cartoes');
check(!/\.navigate\s*\(/.test(swSource), 'notificacao nao recarrega o app', 'clients.navigate recarrega a pagina e perde o que esta na memoria');
{
  const atomico = (indexHtml.match(/\[([^\]]*)\]\s*\n?\s*\.forEach\(raiz=>\{ limpa\[raiz\+'\/'\+u\]=null; \}\)/) || [])[1] || '';
  const recusados = ['fotos','curtidas','comentarios','seguidores'].filter(r => new RegExp("'" + r + "'").test(atomico));
  check(atomico && recusados.length === 0, 'exclusao de conta so com caminhos que as regras permitem',
    'as regras recusam ao dono o no inteiro de: ' + recusados.join(', ') + ' (a operacao atomica falharia)');
  check(indexHtml.includes("limpa['fotos/'+u+'/'+tid]=null") && indexHtml.includes("limpa['fotos/'+u+'/prog_'+id]=null"), 'fotos apagadas uma por uma na exclusao');
}
check(indexHtml.includes('CORE.zeraRecordes = function') && /onclick:\(\)=>\{[^}]*CORE\.zeraRecordes\(id\)/.test(indexHtml) && indexHtml.includes("passo('migraZerarNoTreino', ()=>migraZerarNoTreino());"),
  'zerar no meio do treino vira estreia (sem medalha automatica)', 'o treino em que se zerou precisa ser a 1a sessao depois do zerar');
check(!indexHtml.includes("(!s.kg||!s.reps)){ UI.toast('Preencha kg e reps") && indexHtml.includes('semCargaExterna'),
  'serie sem carga pode ser marcada e nao gera recorde', 'como no Hevy: carga opcional, mas sem medalha de repeticao em exercicio de carga');
check(indexHtml.includes('const DUELO =') && indexHtml.includes("DUELO.serieMudou(e, s)") && indexHtml.includes("DUELO.fimDoTreino('concluiu', salvo)") && indexHtml.includes("DUELO.fimDoTreino('desistiu')"),
  'duelo ligado a marcacao, conclusao e descarte do treino', 'sem os ganchos, o adversario nao ve as series ou o duelo nao termina');
check(indexHtml.includes("window.addEventListener('popstate'") && indexHtml.includes('const VOLTAR'), 'voltar do Android tratado', 'sem isso o botao/gesto de voltar fecha o app com folha aberta');
check(indexHtml.includes('try{ TELAS[tela](args||{}); }catch(e){ telaComErro(tela, e); }') && indexHtml.includes('function telaComErro('), 'telas protegidas contra erro', 'sem isso uma tela que falha fica em branco');
check(indexHtml.includes('A._dkFora') && indexHtml.includes('n._dkDe=e._dk'), 'duelo nao ressuscita exercicio removido nem duplica troca', 'exercicio removido voltava e a troca virava exercicio novo pros outros');
check(indexHtml.includes('P.append=function(...n){ return ap.apply(this, n.filter(x=>x!=null && x!==false)); }'), 'append ignora vazio (sem "null" na tela)', 'o append nativo escreve "null" quando recebe vazio');
check(indexHtml.includes('decorridoMs(t){') && indexHtml.includes(': agoraReal-pausas;') && !indexHtml.includes("CORE.fmtRelogioCurto((agora()-S.ativo.inicio)/1000)"), 'pausa do treino ligada ao cronometro e ao salvar', 'sem isso o tempo pausado entra na duracao');
check(indexHtml.includes('function soltaTeclado(') && (indexHtml.match(/soltaTeclado\(\);/g)||[]).length >= 2, 'folhas soltam o teclado de fora ao abrir', 'sem isso a folha pode abrir levantada alem do topo da tela');
check(indexHtml.includes('UI.guardaLugarAtivo()') && indexHtml.includes("localStorage.getItem('tg_ativoY')"), 'treino em andamento volta pro mesmo exercicio', 'sem isso voltar ao treino abre no topo');
check(indexHtml.includes('contaChave(d, k)') && indexHtml.includes("d.ex[k].troca && d.ex[k].por!==eu && d.ex[k].exId===e.exId") && indexHtml.includes('if(euReordenei || criei){'), 'duelo: troca compartilhada, ordem e series sincronizadas', 'exercicio adicionado a mao nao se ligava a troca do outro; ordem nao se propagava');
check(indexHtml.includes('if(DUELO.digitando()) DUELO.agendaRefaz(); else DUELO.refazTela();') && !indexHtml.includes("if(digitando) DUELO._pend=true; else UI.refaz();"), 'duelo: tela atualiza sozinha (so espera quem digita de verdade)', 'a tela so atualizava depois de abrir e fechar outra tela');
check(indexHtml.includes('ehDuplicata(d, k)') && indexHtml.includes('DUELO.mapaDe(d,u,k)') && indexHtml.includes('A._dkJunta[k]=c'), 'duelo: mesmo exercicio em duas chaves converge e soma as series', 'series de quem adicionou de novo nao apareciam pros outros');
check(indexHtml.includes('semHistorico: IOS_APP') && indexHtml.includes('if(VOLTAR.semHistorico || VOLTAR.guarda') && indexHtml.includes('VOLTAR.fazVoltar();') && !indexHtml.includes('ok = t.clientX<28 && !window.__tgDrag'), 'iPhone instalado: voltar sem historico do navegador (sem tela branca)', 'o gesto do Safari com historico deixava a tela branca');
check(indexHtml.includes('function mascaraTempo(') && !indexHtml.includes("parseTempoCampo(ev.target.value, ehCardio)") && !indexHtml.includes("parseTempoCampo(rp.value, eC)"), 'campo de tempo sempre com 00:00 (numeros entram pela direita)', 'o tempo aparecia sem as casas');
check((indexHtml.match(/campoNotas\(e\.notas/g)||[]).length >= 2 && indexHtml.includes('const METAPESO'), 'notas que crescem e objetivo de peso', 'nota longa ficava escondida numa linha');
check(indexHtml.includes("(Array.isArray(s.pr) && s.pr.length)? {pr:1} : {}") && indexHtml.includes("class:'duelo-pr'"), 'duelo: medalha de recorde de quem esta junto', 'quem treinava junto nao via o recorde do outro');
check(indexHtml.includes('DUELO.guardaNotas(id, notasK)') && indexHtml.includes('const nt=DUELO.notasDoDono(d)') && !/exSala\([^)]*notas/.test(indexHtml), 'duelo: notas da ficha so pra dona (e nunca na sala)', 'a dona da ficha perdia as notas no duelo');
check(indexHtml.includes('FEED.atualizaSeNovo=function') && indexHtml.includes("FEED.atualizaSeNovo(30000)") && indexHtml.includes('cartao-naopub'), 'feed se atualiza ao voltar pro app e treino nao publicado avisa', 'o post do amigo so aparecia trocando de tela; treino fora do feed passava batido');
check(indexHtml.includes("if(t.retro) return Math.max(0, Number(t.durFixa)||0);") && indexHtml.includes("fim= t.retro? t.inicio+(Number(t.durFixa)||0) : agoraReal-pausas") && indexHtml.includes("type:'date','aria-label':'Dia do treino'"), 'treino retroativo: dia, duracao fixa e conclusao no dia certo', 'treino esquecido nao podia ser registrado em outro dia');
check(indexHtml.includes('ATIVO.pintaRecorde(e.exId, row);') && indexHtml.includes("'data-pr-ex':e.exId") && indexHtml.includes('mostraRecorde(el, row){'), 'recorde do cartao atualiza na hora em que a serie e marcada', 'o recorde novo so aparecia saindo e voltando da tela');
check(indexHtml.includes('const ARRASTAFOLHA') && indexHtml.includes('const PUXA') && indexHtml.includes("if(f.id==='folha' && UI._folhaObrigatoria) return;"), 'folha fecha arrastando e o Inicio atualiza puxando', 'gestos de app nativo');
check(indexHtml.includes("UI._dirFx='fx-voltar'") && indexHtml.includes('#main.fx-tela.fx-ir') && indexHtml.includes('PUXA.atualiza();'), 'telas deslizam e tocar na aba atual sobe pro topo', 'navegacao com cara de app nativo');
check(indexHtml.includes('function fotoIrma(xf)') && indexHtml.includes('const fi=fotoIrma(xf); if(fi) return h(') && indexHtml.includes('const fi=fotoIrma(xf); if(fi) return fi;'), 'exercicio criado sem foto usa a foto de um igual (mesmo nome)', 'a elevacao lateral do Rafael aparecia sem foto na ficha de braco');
check(indexHtml.includes('const EXFOTO') && indexHtml.includes("EXFOTO.thumb(e.id, i.meu? null : i.dono, e.n)") && indexHtml.includes('EXFOTO.thumb(e.id, dono, e.n)') && indexHtml.includes('garanteEx(id, cx, dono)'), 'foto do exercicio criado aparece pra todo mundo (feed, treino de amigo, ficha publica, duelo)', 'o Rafael via o treino do Chris sem a foto do abdominal declinado');
check(indexHtml.includes('const f=c.foto || fotoIrma(c);') && indexHtml.includes('S.cfg.exsIrma1'), 'exercicio sem foto e publicado com a foto do irmao (mesmo nome)', 'o abdominal declinado do Hevy ia pro publico sem foto');
check(indexHtml.includes('Modo simples: sempre a ficha SEGUINTE') && !indexHtml.includes('const pendente = ciclo.find'), 'proximo treino: a ficha seguinte a ultima feita (sem insistir na pulada)', 'o app insistia na ficha que a pessoa tinha pulado');
check(indexHtml.includes('function fichaDoTreino(t, pastaPref)') && indexHtml.includes('const ts=vivos.map(t=>({t, r:fichaDoTreino(t, pastaPref)}))'), 'proximo treino reconhece treino sem ficha (duelo de outra pessoa) pelo nome ou pelos exercicios', 'a Mari fez Braco completo no duelo e o app continuava sugerindo Braco completo');
check(indexHtml.includes('const PRSPUB') && indexHtml.includes("NET.get('/rotinasPub/'+alvo+'/_prs/'") && indexHtml.includes("if(k.charAt(0)!=='_' && !ativas[k]) ROTPUB.remove(k);"), 'comparacao com amigo usa o resumo dos recordes dele (mesmos numeros do celular dele)', 'a comparacao usava so o feed e nao batia com o Rafael');
check(indexHtml.includes("if(bx[kk]!==undefined) return bx[kk]===ex? Number(b) : null;") && indexHtml.includes("NET.agenda(DUELO.caminho('/bx/'+e._dk), e.exId);") && indexHtml.includes("!(d.resultado && d.resultado.srv)) DUELO.fecha(d)") && indexHtml.includes('Cada exercício vale 1 ponto'), 'duelo: normal do exercicio certo (regua do Superacao), criterio claro e duelos antigos refeitos', 'leg press do duelo Chris x Mari: series da Mari descartadas por um normal do exercicio anterior');
check(indexHtml.includes('ajuda(modo){') && indexHtml.includes('resumoPub(d, r){') && indexHtml.includes('DUELO.abreResumo(du.pub)') && indexHtml.includes("r0.duelo.pub=t.dueloInfo.pub") && indexHtml.includes('blocoRes(nome, badge, linhas){'), 'duelo: criterio explicado, resultado visivel pra quem segue (pelo feed) e visual novo', 'nao dava pra ver o duelo pela publicacao dos outros nem entender o criterio');
check(!indexHtml.includes('SUSPEITO') && indexHtml.includes("if(val>0) v.push(val); });") && !indexHtml.includes('provável erro de digitação') && indexHtml.includes("!(d.resultado && d.resultado.srv)) DUELO.fecha(d)"), 'duelo: nenhuma serie e descartada (o app nao supoe erro de digitacao); duelos refeitos', 'o filtro de 1,6x o normal jogava fora series de verdade');
check(indexHtml.includes("const f=await NET.get('/duelos/'+d.id); if(f && f.id) d=f;") && indexHtml.includes("if(como==='desistiu' && d.a===DUELO.meu() && DUELO.outros(d).every(u=>!DUELO.entrou(d,u)))") && indexHtml.includes("x.a===S.auth.uid && x.status==='convite'") && indexHtml.includes('#duelo-barra .duelo-chip{max-width:100%'), 'duelo: aceitar confere o servidor, abandonar sozinho cancela, convite novo cancela os antigos, barra sem sobreposicao', 'o Chris entrou num duelo morto onde a Mari aparecia como desistiu');
check(indexHtml.includes("(tp==='kg' && v===melhor[tp].v && reps>(Number(melhor[tp].s.reps)||0))") && indexHtml.includes('prs[e.exId].kg={v:info.v, tid:t.id, data:t.inicio, r:Number(info.s.reps)||0};') && indexHtml.includes('repsDoKg(exId, pk){') && indexHtml.includes("passo('migraRecordeCarga', ()=>migraRecordeCarga());"), 'recorde de maior carga: empatou na carga, vale a serie com mais repeticoes (igual ao 1RM)', 'Rafael: maior carga mostrava 101x4 e o 1RM 101x6');
check(indexHtml.includes('ARRASTAFOLHA.solta();') && indexHtml.includes('_limpaFolha(){') && indexHtml.includes('UI._confereFolha(0);') && indexHtml.includes('clearTimeout(UI._confT); UI._limpaFolha();'), 'menu nunca fica preso fora da tela (arrasto interrompido desfeito; abrir/fechar limpa; confere se ficou visivel)', 'iPhone: menu do exercicio sumia, tela escura e travada ate reabrir o app');
check(indexHtml.includes('negado=/permission denied/i.test(tx') && indexHtml.includes('(r.status!==401 || negado)') && indexHtml.includes('const FOTOFIT = {') && indexHtml.includes("passo('FOTOFIT.reparaFila', ()=>FOTOFIT.reparaFila());") && indexHtml.includes('const BASEFIX = {') && indexHtml.includes('#timerbar,#tabbar{translate:0 var(--lift,0px)}'), 'fila: recusa de regra nao fica pra sempre (foto e recomprimida); cronometro nao fica levantado no meio da tela', 'iPhone do Chris: foto recusada 809 vezes; cronometro no meio da tela');
check(indexHtml.includes("if(sobre){ $('#folha').inert=false; FOLHA2.el.inert=true; }") && indexHtml.includes("FOLHA2.el.inert=false; $('#folha').inert=true;"), 'editar treino finalizado: a escolha de exercicio por cima da edicao recebe os toques (busca e itens)', 'Rafael e Chris: a busca fechava a lista e tocar num exercicio nao adicionava');
check(indexHtml.includes("const iphoneApp = navigator.standalone===true && /iPhone|iPad|iPod/.test(navigator.userAgent||'');") && indexHtml.includes('(iphoneApp && !temFocoDeTexto() && lift>150 && lift<700)'), 'compensacao da base so no iPhone instalado e so no tamanho de teclado (Android perdia a barra de abas)', 'Android: barra de abas sumiu na 11.38.5');
check(indexHtml.includes('#topo .btn-mini{min-height:44px;min-width:44px}') && indexHtml.includes('.srow input{min-height:44px}') && indexHtml.includes('.feed-mais{min-width:44px;min-height:44px') && indexHtml.includes(".stipo::after,.scheck::after{content:'';position:absolute;inset:-4px}"), 'alvos de toque de 44 pontos no treino em andamento e no feed', 'auditoria: 86 elementos abaixo do minimo no treino em andamento');
check(indexHtml.includes('const IMGFALHA = {') && indexHtml.includes('el.replaceWith(ini);') && indexHtml.includes("class:'ex-hero-falha'"), 'imagem que nao carrega mostra substituto na hora (nunca o icone de imagem quebrada)', 'auditoria: icone de imagem quebrada sem internet');
check(indexHtml.includes('salva(t, ex, confirmado){') && indexHtml.includes("'Voltar e preencher'"), 'editar treino: aviso antes de salvar com exercicio sem serie', 'auditoria: exercicio vazio sumia ao salvar sem aviso');
check(indexHtmlBruto.includes('function errAnota(e, onde){') && !/catch\(\w+\)\{\s*\}/.test(indexHtmlBruto.replace(/catch\(_x\)\{\}/g,'')) && indexHtmlBruto.includes("Erros tratados (o app seguiu funcionando):"), 'nenhum erro e engolido em silencio: todo tratamento registra no diagnostico', 'auditoria: 175 tratamentos vazios');
check(indexHtml.includes("passo('DUELO.boot', ()=>DUELO.boot());") && indexHtml.includes("passo('FOTOFIT.reparaFila', ()=>FOTOFIT.reparaFila());"), 'abertura com etapas isoladas (uma falha nao derruba as seguintes)', 'auditoria: uma rotina quebrando pulava todas as seguintes');
check(indexHtml.includes("FEED._lotes={total:its.length") && indexHtml.includes('UI._rolagemAlvo = rolagem||0;'), 'Inicio: feed em lotes, respeitando a posicao do voltar', 'auditoria: 82 cartoes e 5.700 elementos de uma vez');
check(indexHtml.includes('const _cs=cardSemana(destaque);') && indexHtml.includes('function cardSemana(semConvite){'), 'Inicio: um destaque por vez no topo (proximo treino sempre)', 'auditoria: tres chamados disputando o topo');
check(indexHtml.includes('.fstat-k,.cab-ta .k,.pr-base,.anterior,.gtab.cab,.tab{font-size:12px!important}'), 'rotulos dos numeros com 12 px ou mais', 'auditoria: rotulos de 10 a 11,5 px');
check(indexHtml.includes('const SUGCARGA = {') && indexHtml.includes('SUGCARGA.dica(e),'), 'carga sugerida (dupla progressao) no treino em andamento', 'auditoria: faltava sugerir a carga');
check(indexHtml.includes('_ancora(){') && indexHtml.includes("UI.vai(ant[0], ant[1], false, ant[2]||0, ant[3]||null)") && !indexHtml.includes("class:'sug-x',style:'position:static"), 'voltar devolve ao mesmo cartao do feed; o x solto nao cobre o cartao inteiro', 'tocar em Usar/Ver relatorio caia no x de dispensar');
check(indexHtml.includes('.feed-ex .thumb-ini{width:44px;height:44px') && indexHtml.includes('.reo-row .thumb-ini{width:38px;height:38px'), 'iniciais do mesmo tamanho da miniatura (o feed nao pula sem internet)', 'iniciais de 52 no lugar de miniatura de 44');
check(indexHtml.includes('const LEMB = {') && indexHtml.includes("onclick:()=>LEMB.folha()") && indexHtml.includes("passo('LEMB.agenda', ()=>LEMB.agenda());") && (() => { try { return read('functions/lembretes.js').includes("schedule: 'every 15 minutes'") && read('functions/index.js').includes("require('./lembretes')"); } catch (e) { return false; } })(), 'lembrete de treino e resumo semanal (app + funcao agendada)', 'item Futuro do plano');
{
  // o placar oficial (servidor) usa o MESMO codigo do app: functions/duelo-core.js tem a impressao do bloco DUELO atual
  const ls = indexHtmlBruto.split('\n'); const ini = ls.findIndex(l => l.startsWith('const DUELO = {')); let fim = ini; while (fim >= 0 && fim < ls.length && !ls[fim].startsWith('};')) fim++;
  const imp = ini >= 0 ? createHash('sha256').update(ls.slice(ini, fim + 1).join('\n')).digest('hex').slice(0, 16) : '?';
  let core = ''; try { core = read('functions/duelo-core.js'); } catch (e) {}
  check(core.includes('impressao do calculo: ' + imp) && indexHtml.includes('resOficial(d){') && indexHtml.includes("NET.agenda('/duelos/'+d.id+'/pedido', agora());"), 'placar oficial calculado no servidor com o mesmo codigo do app', 'functions/duelo-core.js desatualizado: rode node scripts/extrai-duelo.mjs');
}
{
  let regras = null; try { regras = JSON.parse(read('regras-firebase.json')).rules; } catch (e) {}
  const ok = !!regras && /<= 200/.test(JSON.stringify(regras.feed||{})) && /< 300000/.test(JSON.stringify(regras.exsPub||{})) && /<= 200/.test(JSON.stringify(regras.rotinasPub||{}));
  check(ok, 'regras: limite de tamanho nos textos do feed, das fichas e dos exercicios publicos', 'auditoria: gravacoes sem limite');
}
{
  // o arquivo de regras tem que estar igual ao banco: sem as regras dos duelos, publica-lo quebraria os duelos
  let regras = null; try { regras = JSON.parse(read('regras-firebase.json')).rules; } catch (e) {}
  check(!!regras && ['duelos', 'descansos', 'config', 'usuarios', 'feed', 'fotos'].every(k => regras[k]) && !!(regras.duelos && regras.duelos['$did'] && regras.duelos['.indexOn']), 'arquivo de regras completo (duelos, descansos, config...)', 'o arquivo de regras antigo nao tinha as regras dos duelos');
}
{
  // o script de versao existe e os tres lugares estao na mesma versao
  const ap = (indexHtml.match(/const APP_VER='([^']+)'/) || [])[1], ca = (swSource.match(/const CACHE='tg-v([^']+)'/) || [])[1];
  check(existsSync(resolve(ROOT, 'scripts/versao.mjs')) && ap === EXPECTED_VERSION && ca === EXPECTED_VERSION, 'versao igual nos tres lugares (use: node scripts/versao.mjs X.Y.Z)', 'app ' + ap + ', cache ' + ca + ', validador ' + EXPECTED_VERSION);
}
check(indexHtml.includes("A FICHA E' UMA SO pra todo mundo do duelo") && indexHtml.includes("d.ex[k].rm={por:eu, t:agora()}") && indexHtml.includes("q.trPor=eu") && indexHtml.includes("if(e._dkDe) q.de=e._dkDe;") && indexHtml.includes("DUELO.caminho('/v'), APP_VER") && indexHtml.includes('marcaVolta(d, k){'), 'duelo: ficha igual pra todos (trocar, remover, adicionar e ordem valem pra todos; aviso de versao antiga)', 'com 3 pessoas cada um ficava com uma ficha diferente');
check(indexHtml.includes("$('#folha').style.zIndex= sobre? '80' : ''") && indexHtml.includes("ev.data.tipo==='notifClick'") && swSource.includes("tipo:'notifClick'"), 'escolher exercicio por cima da edicao de treino; convite aparece na hora pela notificacao', 'a escolha de exercicio ficava atras da folha; convite demorava');
check(!/\(\?<[=!]/.test(indexHtml), 'sem regex lookbehind', 'Safari < 16.4 nao abre o app inteiro');
check(!indexHtml.includes('.at(') || indexHtml.includes("if(!C.prototype.at)"), 'complemento do .at() presente', '.at() quebra no Safari < 15.4 e Chrome < 92');

const dialogTags = Array.from(indexHtml.matchAll(/<[a-z][^>]*\brole\s*=\s*(["'])dialog\1[^>]*>/gi), match => match[0]);
const semanticDialog = dialogTags.some(tag =>
  /\baria-modal\s*=\s*(["'])true\1/i.test(tag) &&
  (/\baria-label\s*=\s*(["'])[^"']+\1/i.test(tag) || /\baria-labelledby\s*=\s*(["'])[^"']+\1/i.test(tag))
);
check(semanticDialog, 'dialog semantico', 'esperado role="dialog", aria-modal="true" e nome acessivel');
check(/\baria-live\s*=\s*(["'])(?:polite|assertive)\1/i.test(indexHtml), 'regiao aria-live', 'nenhuma regiao aria-live valida foi encontrada');

if (exercises !== null) {
  check(Array.isArray(exercises) && exercises.length > 0, 'catalogo nao vazio', 'exercicios.json deve conter um array nao vazio');
  if (Array.isArray(exercises)) {
    const requiredFields = ['id', 'n', 'g', 'e', 't'];
    const invalidEntries = [];
    const seenIds = new Map();
    for (let index = 0; index < exercises.length; index += 1) {
      const entry = exercises[index];
      const missing = requiredFields.filter(field => !entry || typeof entry[field] !== 'string' || entry[field].trim() === '');
      if (missing.length) invalidEntries.push('#' + (index + 1) + ' (' + missing.join(', ') + ')');
      if (entry && typeof entry.id === 'string') {
        if (!seenIds.has(entry.id)) seenIds.set(entry.id, []);
        seenIds.get(entry.id).push(index + 1);
      }
    }
    const duplicateIds = Array.from(seenIds, ([id, rows]) => ({ id, rows })).filter(item => item.rows.length > 1);
    check(invalidEntries.length === 0, 'campos obrigatorios do catalogo', invalidEntries.slice(0, 8).join('; '));
    check(duplicateIds.length === 0, 'IDs unicos do catalogo', duplicateIds.slice(0, 8).map(item => item.id + ' nas linhas ' + item.rows.join(',')).join('; '));
    if (!invalidEntries.length && !duplicateIds.length) ok(exercises.length + ' exercicios validados');

    // o assistente de fichas sorteia direto das listas fixas: todo id citado precisa existir e estar visivel
    const poolsMatch = indexHtml.match(/const ASSIST_POOLS = (\{.*\});/);
    const cardioMatch = indexHtml.match(/const ASSIST_CARDIO = (\{.*\});/);
    if (poolsMatch && cardioMatch) {
      const porId = new Map(exercises.map(e => [e.id, e]));
      // desde a v11.26 os duplicados apontam para o canonico (EX_ALIAS): nenhum escondido e' permitido
      const PERMITIDOS = new Set();
      const citados = new Set();
      try {
        Object.values(JSON.parse(poolsMatch[1])).forEach(loc => Object.values(loc).forEach(l => l.forEach(id => citados.add(id))));
        Object.values(JSON.parse(cardioMatch[1])).forEach(l => l.forEach(id => citados.add(id)));
      } catch (erro) { check(false, 'listas do assistente legiveis', erro.message); }
      const inexistentes = [...citados].filter(id => !porId.has(id));
      const escondidos = [...citados].filter(id => porId.has(id) && porId.get(id).oc && !PERMITIDOS.has(id));
      check(inexistentes.length === 0, 'assistente so cita exercicios que existem', inexistentes.slice(0, 6).join(', '));
      check(escondidos.length === 0, 'assistente nao cita exercicios escondidos', escondidos.slice(0, 6).join(', ') + ' (esconder tira do seletor mas o assistente ainda sorteia)');
    }
    // CORRECOES_TREINO: cada correcao pontual de historico precisa apontar para exercicios que existem e aparecem
    const corrMatch = indexHtml.match(/const CORRECOES_TREINO = (\[[\s\S]*?\]);/);
    check(!!corrMatch, 'correcoes pontuais de historico presentes', 'CORRECOES_TREINO nao encontrado no index.html');
    if (corrMatch) {
      const porIdC = new Map(exercises.map(e => [e.id, e]));
      let lista = []; try { lista = Function('"use strict"; return (' + corrMatch[1] + ')')(); } catch (erro) { check(false, 'CORRECOES_TREINO legivel', erro.message); }
      const ruinsC = [];
      for (const c of lista) {
        if (!porIdC.has(c.para)) ruinsC.push(c.para + ' (destino) nao existe no catalogo');
        else if (porIdC.get(c.para).oc) ruinsC.push(c.para + ' (destino) esta escondido');
        if (!c.treino || typeof c.ex !== 'number' || !c.de) ruinsC.push('correcao incompleta: ' + JSON.stringify(c));
      }
      check(ruinsC.length === 0, 'correcoes de historico apontam para exercicio visivel', ruinsC.slice(0, 4).join('; '));
    }
    // gif: campo opcional da entrada = id cujo arquivo de GIF ela usa (corrige GIF no exercicio errado sem trocar arquivos)
    const idsGif = new Set(exercises.map(e => e.id));
    const ruinsGif = exercises.filter(e => e.gif !== undefined && (typeof e.gif !== 'string' || e.gif === e.id || !idsGif.has(e.gif))).map(e => e.id + ' -> ' + e.gif);
    check(ruinsGif.length === 0, 'ponteiros de GIF apontam para exercicio do catalogo', ruinsGif.slice(0, 4).join('; '));
    // EX_ALIAS: codigo antigo (escondido, continua no catalogo) -> canonico (visivel); o app nao cita o antigo
    const aliasMatch = indexHtml.match(/const EX_ALIAS = (\{.*?\});/);
    check(!!aliasMatch, 'mapa de exercicios duplicados presente', 'EX_ALIAS nao encontrado no index.html');
    if (aliasMatch) {
      const porId = new Map(exercises.map(e => [e.id, e]));
      let alias = {}; try { alias = JSON.parse(aliasMatch[1]); } catch (erro) { check(false, 'EX_ALIAS legivel', erro.message); }
      const ruins = [];
      for (const [de, para] of Object.entries(alias)) {
        if (!porId.has(de)) ruins.push(de + ' sumiu do catalogo (precisa ficar, escondido)');
        else if (!porId.get(de).oc) ruins.push(de + ' deveria estar escondido');
        if (!porId.has(para)) ruins.push(para + ' (canonico) nao existe');
        else if (porId.get(para).oc) ruins.push(para + ' (canonico) esta escondido');
        if (alias[para]) ruins.push(para + ' e canonico e alias ao mesmo tempo');
      }
      check(ruins.length === 0, 'duplicados apontam para exercicio visivel', ruins.slice(0, 4).join('; '));
      const semMapa = indexHtml.replace(aliasMatch[0], '');
      const citados = Object.keys(alias).filter(de => semMapa.includes('"' + de + '"') || semMapa.includes("'" + de + "'"));
      check(citados.length === 0, 'app nao cita codigo antigo de exercicio', citados.slice(0, 4).join(', '));
    }
  }
}

const references = new Map();
let skippedGReferences = 0;

function addReference(raw, sourceFile) {
  if (typeof raw !== 'string') return;
  const value = raw.trim();
  if (!value || value.startsWith('#') || value.startsWith('/^') || value.includes('$' + '{') || value.includes('{{') || value.includes('+')) return;
  if (/^(?:data|blob|mailto|tel|javascript):/i.test(value) || value.startsWith('//')) return;

  let url;
  try {
    url = new URL(value, new URL(sourceFile.replace(/\\/g, '/'), SITE_BASE));
  } catch (error) {
    fail('referencia local valida em ' + sourceFile, value + ' (' + error.message + ')');
    return;
  }
  if (url.origin !== SITE_BASE.origin) return;

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  } catch (error) {
    fail('referencia local codificada em ' + sourceFile, value + ' (' + error.message + ')');
    return;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] && segments[0].toLowerCase() === 'g') {
    skippedGReferences += 1;
    return;
  }

  const target = resolve(ROOT, pathname || '.');
  const fromRoot = relative(ROOT, target);
  if (fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    fail('referencia permanece no projeto', sourceFile + ' -> ' + value);
    return;
  }

  const key = target.toLowerCase();
  if (!references.has(key)) references.set(key, { target, value, sources: [] });
  references.get(key).sources.push(sourceFile);
}

function collectHtmlReferences(sourceFile, html) {
  const attributePattern = /\b(?:src|href|poster|action)\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(attributePattern)) addReference(match[2], sourceFile);

  const srcsetPattern = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;
  for (const match of html.matchAll(srcsetPattern)) {
    for (const candidate of match[2].split(',')) addReference(candidate.trim().split(/\s+/)[0], sourceFile);
  }

  const cssUrlPattern = /\burl\(\s*(["']?)(.*?)\1\s*\)/gi;
  for (const match of html.matchAll(cssUrlPattern)) addReference(match[2], sourceFile);

  const jsReferencePattern = /\b(?:fetch|importScripts)\s*\(\s*(["'])([^"']+)\1/gi;
  for (const match of html.matchAll(jsReferencePattern)) addReference(match[2], sourceFile);

  const swRegisterPattern = /navigator\.serviceWorker\.register\s*\(\s*(["'])([^"']+)\1/gi;
  for (const match of html.matchAll(swRegisterPattern)) addReference(match[2], sourceFile);
}

const htmlFiles = [
  ['index.html', indexHtml],
  ['privacidade.html', read('privacidade.html')],
  ['termos.html', read('termos.html')],
  ['excluir-conta.html', read('excluir-conta.html')]
];
for (const [sourceFile, html] of htmlFiles) collectHtmlReferences(sourceFile, html);

if (manifest) {
  addReference(manifest.start_url, 'manifest.webmanifest');
  addReference(manifest.scope, 'manifest.webmanifest');
  for (const icon of manifest.icons || []) addReference(icon && icon.src, 'manifest.webmanifest');
  for (const screenshot of manifest.screenshots || []) addReference(screenshot && screenshot.src, 'manifest.webmanifest');
  for (const shortcut of manifest.shortcuts || []) {
    addReference(shortcut && shortcut.url, 'manifest.webmanifest');
    for (const icon of (shortcut && shortcut.icons) || []) addReference(icon && icon.src, 'manifest.webmanifest');
  }
}

const shellMatch = swSource.match(/\bconst\s+SHELL\s*=\s*\[([\s\S]*?)\]\s*;/);
if (shellMatch) {
  const literalPattern = /(["'])(.*?)\1/g;
  for (const match of shellMatch[1].matchAll(literalPattern)) addReference(match[2], 'sw.js');
} else {
  fail('lista SHELL de sw.js', 'declaracao literal nao encontrada');
}

const missingReferences = Array.from(references.values()).filter(reference => !existsSync(reference.target));
check(references.size > 0, 'referencias locais encontradas', 'nenhuma referencia local explicita foi encontrada');
check(
  missingReferences.length === 0,
  'referencias locais existentes (sem percorrer g/)',
  missingReferences.slice(0, 12).map(reference => reference.sources.join(', ') + ' -> ' + reference.value).join('; ')
);

if (failures.length) {
  console.error('VERIFICACAO FALHOU (' + failures.length + ' problema(s))');
  for (const problem of failures) console.error('- ' + problem);
  process.exitCode = 1;
} else {
  console.log('VERIFICACAO OK');
  for (const success of successes) console.log('- ' + success);
  console.log('- ' + references.size + ' referencias locais verificadas; ' + skippedGReferences + ' referencia(s) g/ ignorada(s) sem acesso ao diretorio');
}
