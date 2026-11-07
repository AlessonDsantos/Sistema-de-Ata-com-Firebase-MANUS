// Service worker da Ala Vila Matilde.
// - Arquivos do próprio site (HTML, CSS, JS): internet primeiro, cópia guardada se estiver offline.
//   Assim uma atualização publicada aparece na hora e as partes nunca ficam misturadas.
// - Bibliotecas e fontes externas: usa a cópia guardada e atualiza em segundo plano.
// - Dados e login (Firestore / Auth) não passam por aqui.

const CACHE = 'avm-v5';
const ESSENCIAIS = [
  './', './index.html', './agenda.html',
  './manifest.webmanifest', './agenda.webmanifest',
  './css/app.css',
  './js/main.js', './js/firebase.js', './js/util.js', './js/state.js', './js/auth.js', './js/nav.js',
  './js/atas.js', './js/discursantes.js', './js/leitor.js', './js/agenda-core.js', './js/agenda.js',
  './js/agenda-publica.js', './js/usuarios.js', './js/pwa.js',
  './js/hinos.js', './js/hinos-core.js', './js/hinos-dados.js',
  './js/ata-auto.js', './js/bispado-dados.js', './js/reunioes.js', './js/chamados.js', './js/entrevistas.js',
  './icons/icon-192.png', './icons/icon-512.png'
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
  const mesmoSite = url.origin === self.location.origin;

  // Telas de login do Firebase (/__/auth/...) nunca vêm do cache
  if (mesmoSite && url.pathname.startsWith('/__/')) return;

  if (mesmoSite) {
    event.respondWith(
      fetch(req)
        .then(res => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(req.mode === 'navigate' ? url.pathname.replace(/\/$/, '/index.html') : req, copia));
          }
          return res;
        })
        .catch(async () => {
          if (req.mode === 'navigate') {
            return (await caches.match(url.pathname.replace(/\/$/, '/index.html'))) || caches.match('./index.html');
          }
          return caches.match(req);
        })
    );
    return;
  }

  const cdn = CDNS.includes(url.hostname) && (url.hostname !== 'www.gstatic.com' || url.pathname.startsWith('/firebasejs/'));
  if (!cdn) return; // Firestore, login do Google e o resto vão direto para a internet

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
