// Fresh Folds service worker: shows phone notifications for order updates.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = { title: "Fresh Folds", body: "You have a new order update.", url: "/" };
      try {
        const sub = await self.registration.pushManager.getSubscription();
        if (sub) {
          const r = await fetch("/api/push/latest?endpoint=" + encodeURIComponent(sub.endpoint));
          if (r.ok) data = await r.json();
        }
      } catch (_) {}
      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "/icons/192",
        badge: "/icons/192",
        tag: "freshfolds-order",
        renotify: true,
        data: { url: data.url },
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.indexOf(url) !== -1 && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
