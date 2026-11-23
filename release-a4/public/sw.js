/* A3: one static cache; auth, AI, API responses and private records are never cached. */
const CACHE='lexicon-a4-pro-20261124-1';
const SCOPE=new URL('./',self.location.href).pathname;
const FILES=[
  './assets/pro/studio.js','./assets/pro/studio.css','./assets/pro/logo.jpg','./assets/pro/icon-192.png',
  './index.html',
  './assets/css/app.css?release=A3',
  './assets/js/app.js?release=A4',
  './assets/js/auth.js?release=A3',
  './assets/js/account.js?release=A3',
  './assets/js/account-deletion.js?release=A3',
  './assets/js/community.js?release=A3',
  './assets/js/rooms.js?release=A3',
  './assets/js/cloud-sync.js?release=A3',
  './assets/js/cloud-outbox.js?release=A3',
  './assets/js/store.js?release=A3',
  './assets/js/catalog.js?release=A3',
  './assets/js/dictionary.js?release=A3',
  './assets/js/learning.js?release=A3',
  './assets/js/learning-policy.js?release=A3',
  './assets/js/tools.js?release=A3',
  './assets/js/tool-data.js?release=A3',
  './assets/js/reading.js?release=A3',
  './assets/js/ui.js?release=A3',
  './assets/js/hegel.js?release=A3',
  './assets/js/assistant.js?release=A3',
  './assets/js/integrations.js?release=A3',
  './assets/data/study-seed.json',
  './assets/data/study-content.json',
  './assets/data/tools-content.json',
  './assets/data/roots85.json',
  './assets/data/hegel-systems.json',
  './assets/art/mark.svg',
  './manifest.webmanifest',
  './assets/js/billing.js?release=A3',
  './assets/vendor/supabase-2.119.2.js',
  './assets/fonts/instrument-sans.woff2',
  './assets/fonts/instrument-sans-ext.woff2',
  './assets/fonts/source-serif.woff2',
  './assets/fonts/source-serif-ext.woff2',
  './assets/illustrations/study-index.webp',
  './assets/illustrations/study-room.webp',
  './assets/art/icon-192.png',
  './assets/art/icon-512.png',
  './apple-touch-icon.png',
];
async function cacheResponse(cache,key,response,path){
  try{
    await cache.put(key,response);
    if(/^assets\/data\/lexicon\/\d+\.json$/.test(path)){
      const shards=(await cache.keys()).filter(request=>/\/assets\/data\/lexicon\/\d+\.json$/.test(new URL(request.url).pathname));
      // The offline dictionary keeps only the most recently cached eight parts.
      for(const request of shards.slice(0,Math.max(0,shards.length-8)))await cache.delete(request);
    }
  }catch{/* Cache quota never turns a successful network response into a failure. */}
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Do not replace the previous working release if the new core cannot be cached.
  await cache.addAll(FILES.map(file=>new Request(file,{cache:'reload'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE&&(/^lc\d+-/.test(key)||/^lexicon-a[1234]-/.test(key))).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(SCOPE))return;
  // Only the static app entry point and its packaged assets are eligible.
  const path=url.pathname.slice(SCOPE.length);
  if(!['','index.html','manifest.webmanifest','apple-touch-icon.png'].includes(path)&&!path.startsWith('assets/'))return;
  if(request.mode!=='navigate'&&!/\.(?:js|css|json|webp|png|svg|ico|woff2|webmanifest)$/.test(path))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),key=request.mode==='navigate'?new URL('./index.html',self.location.href).href:path.startsWith('assets/data/')?url.origin+url.pathname:request;
    try{
      const response=await fetch(request);
      if(response.ok&&response.type!=='opaque')event.waitUntil(cacheResponse(cache,key,response.clone(),path));
      return response;
    }catch{return await cache.match(key)||Response.error();}
  })());
});
