// UNSAID service worker: shows push notifications and opens the app when one is tapped.
// It does not cache anything, so a new deploy is always what people get.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {}; try { d = event.data ? event.data.json() : {}; } catch { /* not JSON */ }
  const title = typeof d.title === 'string' ? d.title.slice(0, 60) : 'UNSAID';
  const body = typeof d.body === 'string' ? d.body.slice(0, 140) : 'You have a new alert';
  const tag = typeof d.tag === 'string' ? d.tag.slice(0, 40) : 'unsaid';
  event.waitUntil(self.registration.showNotification(title, {
    body, tag, renotify: true, icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', data: { url: '/#/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL('/#/notifications', self.location.origin).href;     // always the Alerts page; never a link taken from the push
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const mine = all.find((c) => new URL(c.url).origin === self.location.origin);
    if (mine) { await mine.focus(); try { await mine.navigate(target); } catch { /* ignore */ } return; }
    await self.clients.openWindow(target);
  })());
});
