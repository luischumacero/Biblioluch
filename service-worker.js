const CACHE_NAME = 'biblioluch-shell-v6';
const SHELL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './logo-192.png',
    './logo.png',
    './fondo para pc.jpg',
    './fondo celular.jpg',
    './css/styles.css',
    './js/data.js',
    './js/pdf-parser.js',
    './js/quiz-engine.js',
    './js/supabase-config.js',
    './js/app.js',
    './js/social.js',
    './js/notifications.js',
    './js/pwa.js',
    './js/liquid-glass-nav.js'
];
const SHELL_URLS = new Set(SHELL_FILES.map(file => new URL(file, self.registration.scope).href));

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(SHELL_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys
                .filter(key => key.startsWith('biblioluch-shell-') && key !== CACHE_NAME)
                .map(key => caches.delete(key))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request).catch(async () => {
                const cache = await caches.open(CACHE_NAME);
                const offlinePage = await cache.match('./index.html');
                if (offlinePage) return offlinePage;
                throw new Error('La página de Biblioluch no está disponible sin conexión.');
            })
        );
        return;
    }

    if (!SHELL_URLS.has(url.href)) return;

    event.respondWith(
        fetch(request).then(async response => {
            if (response.ok) {
                const cache = await caches.open(CACHE_NAME);
                await cache.put(request, response.clone());
            }
            return response;
        }).catch(async () => {
            const cached = await caches.match(request);
            if (cached) return cached;
            throw new Error(`El recurso solicitado no está disponible sin conexión: ${url.pathname}`);
        })
    );
});

self.addEventListener('push', event => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (error) {
        console.error('No se pudo leer una notificación push:', error);
    }
    event.waitUntil(self.registration.showNotification(payload.title || 'Biblioluch', {
        body: payload.body || 'Tienes una nueva notificación.',
        icon: './logo-192.png',
        badge: './logo-192.png',
        data: payload.data || { url: './' }
    }));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || './', self.registration.scope);
    if (target.origin !== self.location.origin || !target.href.startsWith(self.registration.scope)) return;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
        if (existing) {
            await existing.navigate(target.href);
            await existing.focus();
            return;
        }
        await self.clients.openWindow(target.href);
    })());
});
