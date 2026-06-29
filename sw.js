// =============================================
// SERVICE WORKER - Signature App PWA
// Strategie cache-first avec mise a jour reseau
// =============================================
const VERSION = 'sig-app-v3';
const CACHE_STATIC = `${VERSION}-static`;
const CACHE_RUNTIME = `${VERSION}-runtime`;

// Fichiers a precacher (coquille de l'app)
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './manifest.json',
    './icon.svg',
    './icon-maskable.svg',
    './icon-192.png',
    './icon-512.png',
    // Bibliotheques CDN cruciales pour fonctionnement offline
    'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
];

// =============================================
// INSTALL : precache des assets statiques
// =============================================
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_STATIC)
            .then(cache => {
                // Cache chaque ressource individuellement, ignore les echecs CDN
                return Promise.allSettled(
                    STATIC_ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn('[SW] Echec cache:', url, err.message);
                        })
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// =============================================
// ACTIVATE : nettoyer les anciens caches
// =============================================
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key.startsWith('sig-app-') && !key.startsWith(VERSION))
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

// =============================================
// FETCH : cache-first avec fallback reseau
// Pour API (POST email): network-first
// =============================================
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer les requetes non-GET (POST email, etc.)
    if (request.method !== 'GET') return;

    // Ignorer les schemes non-http (chrome-extension, etc.)
    if (!url.protocol.startsWith('http')) return;

    // Envoi email : network-first (donnees dynamiques)
    const isAPI = url.pathname.includes('/api/') ||
                  url.pathname.includes('send-email');

    if (isAPI) {
        event.respondWith(
            fetch(request)
                .then(resp => {
                    if (resp && resp.ok) {
                        const copy = resp.clone();
                        caches.open(CACHE_RUNTIME).then(c => c.put(request, copy));
                    }
                    return resp;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    // Static / CDN : cache-first
    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) {
                // Mise a jour silencieuse en arriere-plan
                fetch(request)
                    .then(resp => {
                        if (resp && resp.ok) {
                            caches.open(CACHE_STATIC).then(c => c.put(request, resp));
                        }
                    })
                    .catch(() => {});
                return cached;
            }
            // Non-cache : aller chercher et mettre en cache
            return fetch(request)
                .then(resp => {
                    if (resp && resp.ok && resp.type !== 'opaque') {
                        const copy = resp.clone();
                        caches.open(CACHE_RUNTIME).then(c => c.put(request, copy));
                    }
                    return resp;
                })
                .catch(() => {
                    // Fallback : retourner index.html pour les navigations
                    if (request.mode === 'navigate') {
                        return caches.match('./index.html');
                    }
                    return new Response('Hors ligne', { status: 503 });
                });
        })
    );
});

// =============================================
// MESSAGE : permettre a la page de forcer skipWaiting
// =============================================
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
