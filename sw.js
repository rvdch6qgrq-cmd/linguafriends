const CACHE = 'linguafriends-demo-v1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon.svg'];
self.addEventListener('install', (event) => {event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))); self.skipWaiting();});
self.addEventListener('activate', (event) => {event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))); self.clients.claim();});
self.addEventListener('fetch', (event) => {const req = event.request; if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return; event.respondWith(fetch(req).then(resp => {if (resp.ok) {const clone = resp.clone(); caches.open(CACHE).then(cache => cache.put(req, clone));} return resp;}).catch(() => caches.match(req)));});
