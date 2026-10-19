const CACHE_NAME = 'biblioluch-shell-v1';
const SHELL_FILES = [
    './',
    './index.html',
    './manifest.json',
    './logo-192.png',
    './logo.png',
    './css/styles.css',
    './js/data.js',
    './js/pdf-parser.js',
    './js/quiz-engine.js',
    './js/supabase-config.js',
    './js/app.js',
    './js/social.js',
    './js/pwa.js'
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
