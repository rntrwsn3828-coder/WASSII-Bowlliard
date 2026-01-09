const CACHE_NAME = 'bowlliard-v1.2';

const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await self.skipWaiting(); // ★追加：新SWを即有効化へ
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim(); // ★追加：開いているページも新SWが制御
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // 同一オリジンだけ扱う（外部CDN等は素通し）
  if (url.origin !== self.location.origin) return;

  // index.html（ナビゲーション）は network-first（失敗時のみキャッシュ）
  const isNavigate = req.mode === 'navigate';
  if (isNavigate) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch (e) {
        const cached = await caches.match('./index.html');
        return cached || caches.match('./');
      }
    })());
    return;
  }

  // app.js は network-first（取得できたらキャッシュ更新、無理ならキャッシュ）
  if (url.pathname.endsWith('/app.js') || url.pathname.endsWith('app.js')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: 'no-store' });
        const cache = await caches.open(CACHE_NAME);
        cache.put('./app.js', fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match('./app.js')) || fetch(req);
      }
    })());
    return;
  }

  // その他は cache-first
  event.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
