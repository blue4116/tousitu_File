self.addEventListener("install", event => { self.skipWaiting(); });
self.addEventListener("activate", event => { event.waitUntil(self.clients.claim()); });
self.addEventListener("fetch", event => {
  // GitHub Pages向けの最小Service Worker。オフライン保存・Web Pushは未実装です。
});
