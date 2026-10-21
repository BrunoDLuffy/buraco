// Service worker: guarda os arquivos do jogo no aparelho para abrir rápido e jogar contra bots sem internet.
// Ao publicar uma versão nova, aumente o número abaixo.
const VERSION = 'buraco-v3';

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/main.js',
  'js/settings.js',
  'js/engine/cards.js',
  'js/engine/rules.js',
  'js/engine/melds.js',
  'js/engine/game.js',
  'js/ai/bot.js',
  'js/ai/botChat.js',
  'js/net/chat.js',
  'js/controllers/local.js',
  'js/net/room.js',
  'js/net/firebaseDb.js',
  'js/net/firebase-config.js',
  'js/net/memoryDb.js',
  'js/ui/cardArt.js',
  'js/ui/cardImages.js',
  'js/ui/dom.js',
  'js/ui/gameView.js',
  'js/ui/menus.js',
  'js/ui/rulesText.js',
  'js/ui/sound.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Arquivos do próprio site: tenta a rede primeiro (para pegar atualizações) e usa o cache sem internet.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
