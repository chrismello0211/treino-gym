import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as vm from 'node:vm';

const ROOT = dirname(fileURLToPath(import.meta.url));
const EXPECTED_VERSION = '11.24.1';
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

const indexHtml = read('index.html');
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
check(indexHtml.includes("mm.classList.remove('fx-tela')") && indexHtml.includes('UI._fxT'), 'animacao de entrada so ao navegar', 'sem remover fx-tela, cada redesenho reanima os cartoes');
check(!/\.navigate\s*\(/.test(swSource), 'notificacao nao recarrega o app', 'clients.navigate recarrega a pagina e perde o que esta na memoria');
{
  const atomico = (indexHtml.match(/\[([^\]]*)\]\s*\n?\s*\.forEach\(raiz=>\{ limpa\[raiz\+'\/'\+u\]=null; \}\)/) || [])[1] || '';
  const recusados = ['fotos','curtidas','comentarios','seguidores'].filter(r => new RegExp("'" + r + "'").test(atomico));
  check(atomico && recusados.length === 0, 'exclusao de conta so com caminhos que as regras permitem',
    'as regras recusam ao dono o no inteiro de: ' + recusados.join(', ') + ' (a operacao atomica falharia)');
  check(indexHtml.includes("limpa['fotos/'+u+'/'+tid]=null") && indexHtml.includes("limpa['fotos/'+u+'/prog_'+id]=null"), 'fotos apagadas uma por uma na exclusao');
}

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
