/* Firebase Cloud Messaging service worker */
/* eslint-env serviceworker */

// Firebase SDK for service worker
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

// Firebase config will be passed via the main app during SW registration
// For the messaging service worker, we just need a minimal config
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebase.initializeApp(event.data.config);

    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      if (title) {
        self.registration.showNotification(title, {
          body: body || '',
          icon: '/static/icons/icon-192.png',
          badge: '/static/icons/icon-192.png',
          vibrate: [200, 100, 200],
          data: payload.data || {}
        });
      }
    });
  }
});

// Handle notification click — navigate to the app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/mycashback') && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(self.registration.scope || '/');
    })
  );
});
