const CACHE_NAME = "xplus-pwa-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // لا نتدخل بطلبات الشبكة حاليًا.
});
