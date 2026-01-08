// Service Worker Minimal Configuration
// インストールはするが、キャッシュは制御せず全てネットワークを通す
// これにより起動エラーを防ぐ

self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', event => {
  // キャッシュ戦略を行わず、そのままネットワークへリクエストを流す
  event.respondWith(fetch(event.request));
});
