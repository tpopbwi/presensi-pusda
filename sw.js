// ============================================================
// SW.JS - v2.8.0 (NETWORK-FIRST STRATEGY)
// ============================================================
// STRATEGI:
// - Network-First untuk API calls (selalu fetch dari server)
// - Cache-First untuk aset statis (CSS, JS, Gambar)
// - Fallback offline untuk halaman utama
// ============================================================

const CACHE_NAME = 'pusda-v2.8.0';
const API_CACHE_NAME = 'pusda-api-v1';
const STATIC_ASSETS = [
    '/',
    '/presensi.html',
    '/presensi.css',
    '/presensi.js',
    '/index.html',
    '/raport.html'
];

// Install - Cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS).catch(err => {
                    console.warn('[SW] Failed to cache some assets:', err);
                    // Cache one by one to avoid full failure
                    return Promise.allSettled(
                        STATIC_ASSETS.map(url => 
                            cache.add(url).catch(e => console.warn(`Failed to cache ${url}`))
                        )
                    );
                });
            })
            .then(() => self.skipWaiting())
    );
});

// Activate - Cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME && cacheName !== API_CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Network-First for API, Cache-First for static
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;
    
    // API requests - Network-First with short timeout
    if (url.pathname.includes('/exec') || url.searchParams.has('action')) {
        event.respondWith(
            fetch(event.request, { 
                cache: 'no-store',
                redirect: 'follow'
            })
            .then((response) => {
                // Clone response for caching if successful
                if (response && response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(API_CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch((error) => {
                console.warn('[SW] Network failed, trying cache:', error);
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    
                    // Fallback for offline
                    return new Response(JSON.stringify({
                        status: 'error',
                        message: 'Offline - Tidak dapat terhubung ke server'
                    }), {
                        headers: { 'Content-Type': 'application/json' }
                    });
                });
            })
        );
        return;
    }
    
    // Static assets - Cache-First
    if (event.request.destination === 'style' || 
        event.request.destination === 'script' ||
        event.request.destination === 'image' ||
        url.pathname.endsWith('.html')) {
        
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                
                return fetch(event.request).then((response) => {
                    if (response && response.status === 200) {
                        const responseClone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                    return response;
                }).catch(() => {
                    // Fallback untuk halaman HTML
                    if (event.request.destination === 'document') {
                        return caches.match('/presensi.html');
                    }
                });
            })
        );
        return;
    }
    
    // Default - Network only
    event.respondWith(fetch(event.request));
});

// Background Sync untuk offline submit (opsional)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-presensi') {
        console.log('[SW] Background sync triggered');
        event.waitUntil(syncOfflinePresensi());
    }
});

async function syncOfflinePresensi() {
    // Implementasi offline queue bisa ditambahkan di sini
    console.log('[SW] Sync complete');
}

// Push notification (opsional)
self.addEventListener('push', (event) => {
    const options = {
        body: event.data ? event.data.text() : 'Notifikasi baru',
        icon: '/assets/logo.png',
        badge: '/assets/logo.png',
        vibrate: [200, 100, 200]
    };
    
    event.waitUntil(
        self.registration.showNotification('E-Presensi PUSDA', options)
    );
});
