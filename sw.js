/* ForgeX — Service Worker
   - documento e exercicios.json: REDE primeiro, cache reserva (updates chegam na hora; offline funciona)
   - estáticos (ícones/manifesto): cache primeiro
   - GIFs dos exercícios (g/*.webp): cache primeiro com preenchimento sob demanda (academia sem sinal feliz)
   - Firebase/externos: não intercepta */
const CACHE='tg-v11.24.0', GCACHE='tg-gifs-v1';
const CACHE_PREFIX='tg-';
const SHELL=['./','./index.html','./exercicios.json','./manifest.webmanifest','./privacidade.html','./termos.html','./excluir-conta.html','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png','./logo-forgex.png','./logo-forgex-claro.png','./logo-word.png','./logo-word-claro.png'];

self.addEventListener('install',e=>{ self.skipWaiting();
  // Um arquivo temporariamente indisponível não deve impedir os demais de
  // entrarem no cache nem bloquear a atualização inteira.
  e.waitUntil(caches.open(CACHE).then(c=>Promise.all(SHELL.map(url=>c.add(url).catch(()=>null))))); });

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks
    .filter(k=>k.startsWith(CACHE_PREFIX) && ![CACHE,GCACHE].includes(k))
    .map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

self.addEventListener('fetch',e=>{
  const req=e.request; if(req.method!=='GET') return;
  const url=new URL(req.url); if(url.origin!==self.location.origin) return;

  // gifs: cache primeiro, guarda pra sempre (limpa só trocando GCACHE)
  if(url.pathname.includes('/g/')){
    e.respondWith(caches.open(GCACHE).then(async c=>{
      const hit=await c.match(req); if(hit) return hit;
      try{ const res=await fetch(req); if(res.ok) c.put(req,res.clone()); return res; }
      catch(err){ return new Response('',{status:404}); }
    }));
    return;
  }
  const navegacao = req.mode==='navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html');
  const catalogo = url.pathname.endsWith('/exercicios.json');
  if(navegacao || catalogo){
    const fresco = new Request(req, {cache:'reload'});
    e.respondWith(fetch(fresco).then(res=>{
      if(res.ok){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); }
      return res;
    }).catch(()=>caches.match(req).then(async r=>{
      if(r) return r;
      if(navegacao){
        const app=await caches.match('./index.html');
        if(app) return app;
      }
      return new Response('Indisponível sem conexão',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(res=>{
      if(res.ok){ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); }
      return res;
    }).catch(()=>hit||new Response('Indisponível sem conexão',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}}));
    return hit||net;
  }));
});

/* ---------- push (FCM data-only) ---------- */
self.addEventListener('push', e=>{
  let d={}; try{ d=e.data.json(); }catch(_){}
  const dd=(d&&d.data)||d||{};
  const title=dd.title||'ForgeX';
  const ehDesc = dd.tipo==='descanso';
  e.waitUntil((async()=>{
    await self.registration.showNotification(title,{
      body: dd.body||'',
      icon:'icon-192.png',
      badge:'icon-192.png',
      // descanso usa sempre a mesma etiqueta: o novo substitui o velho
      tag: ehDesc ? 'forgex-descanso' : (dd.tipo? (dd.tipo+':'+(dd.tid||dd.quem||'')) : undefined),
      renotify: ehDesc || undefined,
      vibrate: ehDesc ? [160,90,160,90,300] : undefined,
      data:{ url: dd.url||'./' }
    });
    // avisa janelas abertas (app em primeiro plano)
    const cs=await clients.matchAll({type:'window', includeUncontrolled:true});
    cs.forEach(c=>c.postMessage({tipo:'push-fg', k: dd.tipo||'', title, body:dd.body||''}));
    // com o app aberto na tela, o aviso do descanso existe so pra vibrar: some em 4s
    if(ehDesc && cs.some(c=>c.visibilityState==='visible' || c.focused)){
      await new Promise(r=>setTimeout(r, 4000));
      (await self.registration.getNotifications({tag:'forgex-descanso'})).forEach(n=>n.close());
    }
  })());
});
function notificationUrl(data){
  const fallback=new URL('./',self.registration.scope);
  const raw=data&&data.url;
  if(typeof raw!=='string') return fallback.href;
  try{
    const target=new URL(raw,fallback);
    return target.origin===self.location.origin && !target.username && !target.password
      ? target.href
      : fallback.href;
  }catch(_){ return fallback.href; }
}

self.addEventListener('notificationclick', e=>{
  e.notification.close();
  e.waitUntil((async()=>{
    const target=notificationUrl(e.notification.data);
    const list=await clients.matchAll({type:'window', includeUncontrolled:true});
    for(const c of list){
      if(!('navigate' in c) || !('focus' in c)) continue;
      try{
        if(new URL(c.url).origin!==self.location.origin) continue;
        const navigated=await c.navigate(target);
        if(navigated && 'focus' in navigated) return navigated.focus();
      }catch(_){ /* a janela pode ter sido fechada; tenta a proxima */ }
    }
    return clients.openWindow(target);
  })());
});
