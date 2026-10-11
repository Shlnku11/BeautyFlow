self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'BeautyFlow', body: 'Есть новое уведомление.' };
  }

  const title = typeof payload.title === 'string' ? payload.title : 'BeautyFlow';
  const body = typeof payload.body === 'string' ? payload.body : 'Есть новое уведомление.';
  const route = typeof payload.url === 'string' && payload.url.startsWith('/app/') ? payload.url : '/app';
  const tag = typeof payload.tag === 'string' ? payload.tag : 'beautyflow-notification';

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const focusedApp = windows.find((client) => client.focused && new URL(client.url).origin === self.location.origin && new URL(client.url).pathname.startsWith('/app'));
    if (focusedApp) {
      focusedApp.postMessage({ type: 'beautyflow:notification', tag });
      return;
    }
    await self.registration.showNotification(title, {
      body,
      tag,
      icon: '/images/beautyflow-icon.svg',
      badge: '/images/beautyflow-icon.svg',
      data: { route },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const route = typeof event.notification.data?.route === 'string' && event.notification.data.route.startsWith('/app/')
    ? event.notification.data.route
    : '/app';
  const targetUrl = new URL(route, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin && 'focus' in client);
    if (existing) {
      await existing.focus();
      if ('navigate' in existing && new URL(existing.url).pathname !== route) await existing.navigate(targetUrl);
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
