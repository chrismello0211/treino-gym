/* Treino Gym — Service Worker
   - documento e exercicios.json: REDE primeiro, cache reserva (updates chegam na hora; offline funciona)
   - estáticos (ícones/manifesto): cache primeiro
   - GIFs dos exercícios (g/*.webp): cache primeiro com preenchimento sob demanda (academia sem sinal feliz)
   - Firebase/externos: não intercepta */
const CACHE='tg-v3.3', GCACHE='tg-gifs-v1';
const SHELL=['./','./index.html','./exercicios.json','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-maskable-512.png','./apple-touch-icon.png'];

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
    e.respondWith(fetch(req).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); return res; })
      .catch(()=>caches.match(req).then(r=>r||caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(req).then(hit=>{
    const net=fetch(req).then(res=>{ const cp=res.clone(); caches.open(CACHE).then(c=>c.put(req,cp)).catch(()=>{}); return res; }).catch(()=>hit);
    return hit||net;
  }));
});
