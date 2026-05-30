// ═══════════════════════════════════════════════
//   A.R. Library — Service Worker (Push Notifications)
//   Place this file at root: /sw.js
// ═══════════════════════════════════════════════

const CACHE_NAME = 'ar-library-v1';

// Install
self.addEventListener('install', e => {
  self.skipWaiting();
});

// Activate
self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// ── PUSH EVENT (background notification) ───────
self.addEventListener('push', e => {
  let data = { title: 'A.R. Library', body: 'New notice from library!', tag: 'ar-notice' };
  try {
    if (e.data) data = { ...data, ...JSON.parse(e.data.text()) };
  } catch (_) {}

  const options = {
    body: data.body,
    tag: data.tag || 'ar-notice',       // same tag = replaces old notification
    renotify: true,
    icon: '/icon-192.png',               // agar icon ho to
    badge: '/icon-72.png',
    vibrate: [200, 100, 200],
    requireInteraction: false,           // auto dismiss after a while
    data: { url: self.location.origin }  // tap karne par app open ho
  };

  e.waitUntil(
    self.registration.showNotification(data.title || 'A.R. Library', options)
  );
});

// ── NOTIFICATION CLICK ──────────────────────────
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Agar app already open hai to focus karo
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) return c.focus();
      }
      // Warna new tab
      if (clients.openWindow) return clients.openWindow(target);
    })
  );
});
