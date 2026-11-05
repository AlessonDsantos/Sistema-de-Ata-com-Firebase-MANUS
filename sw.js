// Service worker do Sistema de Atas.
// - A página (index.html) vem sempre da internet primeiro, então atualizações aparecem na hora.
//   Sem internet, abre a última versão guardada.
// - Bibliotecas e fontes ficam guardadas para abrir rápido.
// - Os dados (Firestore) NÃO passam por aqui: o próprio Firebase já guarda tudo offline.

const CACHE = 'atas-v1';
const ESSENCIAIS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
const CDNS = ['www.gstatic.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAIS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Página: internet primeiro, cópia guardada se estiver offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copia));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Arquivos do próprio site e bibliotecas: usa o guardado e atualiza em segundo plano
  const mesmoSite = url.origin === self.location.origin;
  const cdn = CDNS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'));
  if (!mesmoSite && !cdn) return; // Firestore e o resto vão direto para a internet

  event.respondWith(
    caches.open(CACHE).then(async cache => {
      const guardado = await cache.match(req);
      const daRede = fetch(req)
        .then(res => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => guardado);
      return guardado || daRede;
    })
  );
});
