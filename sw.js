// 最小のApp Shellキャッシュ
const CACHE_NAME = "bowlliard-cache-v1.1";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// install: キャッシュ作成
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// activate: 旧キャッシュ削除
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// fetch: キャッシュ優先（App Shellのみ安定させる）
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // GAS等の外部リクエストは素通し（キャッシュしない）
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
