const CACHE_NAME = 'habit-trophy-v1';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json'
];

// 1. Service Worker Installation & Asset Caching
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Caching App Shell Assets');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// 2. Service Worker Activation & Old Cache Cleanup
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Clearing Old Cache:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Network First with Cache Fallback for Assets
self.addEventListener('fetch', (event) => {
    // Avoid caching non-HTTP requests (e.g. chrome-extension or external CDNs if needed, though Lucide can be cached)
    if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('unpkg.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Fetch in background to update cache (Stale-While-Revalidate)
                    fetch(event.request).then((networkResponse) => {
                        if (networkResponse.status === 200) {
                            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
                        }
                    }).catch(() => { /* ignore offline fetch errors */ });
                    
                    return cachedResponse;
                }
                
                return fetch(event.request).then((networkResponse) => {
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                        return networkResponse;
                    }
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                    return networkResponse;
                });
            })
    );
});

// 4. Background Web Push Notification Receiver
self.addEventListener('push', (event) => {
    let data = { title: 'HabitTrophy', body: '오늘의 습관을 실천할 시간입니다! 🏆' };
    
    if (event.data) {
        try {
            data = event.data.json();
        } catch (e) {
            data = { title: 'HabitTrophy', body: event.data.text() };
        }
    }
    
    const options = {
        body: data.body,
        icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 fill=%22%230f111a%22 rx=%2220%22/><text y=%22.75em%22 x=%22.1em%22 font-size=%2270%22>🏆</text></svg>',
        badge: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏆</text></svg>',
        vibrate: [100, 50, 100],
        data: {
            url: self.location.origin
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

// 5. Notification Click Action
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then((clientList) => {
            // If already open, focus it
            for (const client of clientList) {
                if (client.url === '/' && 'focus' in client) {
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});
