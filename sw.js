// sw.js - Simplified for GitHub Pages + GAS
const CACHE_NAME = 'pusda-v2.8.3';
const STATIC_ASSETS = [
    './',
    './index.html',
    './presensi.html',
    './admin.html',
    './profile_raport.html',
    './css/presensi.css',
    './css/admin.css',
    './js/presensi.js',
    './js/admin.js'
];

// Install - Cache static assets only
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching static assets');
                // Cache satu per satu, skip yang gagal
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Failed to cache ${url}:`, err.message);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] Install complete');
                return self.skipWaiting();
            })
    );
});

// Activate - Clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Network first, cache fallback for static only
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // ✅ JANGAN intercept request ke Google Apps Script
    if (url.hostname.includes('script.google.com') || 
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('googleusercontent.com')) {
        // Biarkan browser handle langsung
        return;
    }
    
    // ✅ JANGAN intercept request ke CDN external
    if (url.hostname !== self.location.hostname) {
        return;
    }
    
    // Untuk static assets: Network first, cache fallback
    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Clone dan cache response yang sukses
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Fallback ke cache jika offline
                return caches.match(event.request).then((cachedResponse) => {
                    return cachedResponse || new Response('Offline', { status: 503 });
                });
            })
    );
});
