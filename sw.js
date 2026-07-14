/* ForgeX — Service Worker
   - documento e exercicios.json: REDE primeiro, cache reserva (updates chegam na hora; offline funciona)
   - estáticos (ícones/manifesto): cache primeiro
   - GIFs dos exercícios (g/*.webp): cache primeiro com preenchimento sob demanda (academia sem sinal feliz)
   - Firebase/externos: não intercepta */
const CACHE='tg-v8.3', GCACHE='tg-gifs-v1';
const SHELL=['./','./index.html','./exercicios.json','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png','./logo-forgex.png','./logo-forgex-claro.png','./logo-word.png','./logo-word-claro.png'];

self.addEventListener('install',e=>{ self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).catch(()=>{})); });

self.addEventListener('activate',e=>{
  e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>![CACHE,GCACHE].includes(k)).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });

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
  const doc = req.mode==='navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('exercicios.json');
  if(doc){
    const fresco = new Request(req, {cache:'reload'});
    e.respondWith(fetch(fresco).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); return res; })
      .catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); return res; }).catch(()=>hit);
    return hit||net;
  }));
});

/* ---------- push (FCM data-only) ---------- */
self.addEventListener('push', e=>{
  let d={}; try{ d=e.data.json(); }catch(_){}
  const dd=(d&&d.data)||d||{};
  const title=dd.title||'ForgeX';
  e.waitUntil((async()=>{
    await self.registration.showNotification(title,{
      body: dd.body||'',
      icon:'icon-192.png',
      badge:'icon-192.png',
      tag: dd.tipo? (dd.tipo+':'+(dd.tid||dd.quem||'')) : undefined,
      data:{ url: dd.url||'./' }
    });
    // avisa janelas abertas (app em primeiro plano)
    const cs=await clients.matchAll({type:'window', includeUncontrolled:true});
    cs.forEach(c=>c.postMessage({tipo:'push-fg', title, body:dd.body||''}));
  })());
});
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'./';
  e.waitUntil(clients.matchAll({type:'window', includeUncontrolled:true}).then(list=>{
    for(const c of list){ if('focus' in c) return c.focus(); }
    return clients.openWindow(url);
  }));
});
