// TEL.SCORE · service worker
// 1) tela de "sem internet" no lugar da página de erro do navegador
// 2) notificações no navegador e no site instalado (as mensagens chegam pelo Firebase Cloud Messaging)
const V = 'telscore-sw-1';
const OFFLINE = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#08080A"><title>TEL.SCORE · sem internet</title>
<style>html,body{margin:0;height:100%;background:#08080A;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}main{min-height:100%;display:grid;place-items:center;padding:24px;text-align:center;box-sizing:border-box}
img{width:96px;height:96px;border-radius:24px}h1{font-size:22px;margin:22px 0 8px}p{color:#a9a9b3;margin:0 0 22px;line-height:1.45;max-width:320px}
button{appearance:none;border:0;border-radius:999px;background:#E5283A;color:#fff;font:inherit;font-weight:700;font-size:16px;padding:14px 28px;cursor:pointer}</style></head>
<body><main><div><img src="/icons/icon-192.png" alt=""><h1>Sem internet agora</h1><p>Assim que a conexão voltar, os placares aparecem de novo. A bola não para.</p><button onclick="location.reload()">Tentar de novo</button></div></main>
<script>addEventListener('online',()=>location.reload())</script></body></html>`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(['/icons/icon-192.png'])).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// só as páginas passam por aqui (a API e as imagens seguem direto para a rede)
self.addEventListener('fetch', e => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});

// notificação chegando com o site fechado ou em segundo plano
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { notification: { title: 'TEL.SCORE', body: e.data ? e.data.text() : '' } }; }
  const n = d.notification || {}, data = d.data || {};
  const link = (d.fcmOptions && d.fcmOptions.link) || (n.click_action) || data.url || '/';
  e.waitUntil(self.registration.showNotification(n.title || data.title || 'TEL.SCORE', {
    body: n.body || data.body || '',
    icon: n.icon || '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: n.tag || data.tag || undefined,
    renotify: !!(n.tag || data.tag),
    data: { url: link }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const aberto = list.find(c => new URL(c.url).origin === self.location.origin);
    if (aberto) { aberto.postMessage({ tipo: 'abrir', url }); return aberto.focus(); }
    return self.clients.openWindow(url);
  }));
});
