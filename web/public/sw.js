const CACHE_NAME = 'thinkread-app-v4';
const BOOK_CACHE_NAME = 'thinkread-books-v1';
const OFFLINE_URL = '/';

// Assets to cache on install
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/logo.svg',
  '/logo.png',
  '/logo-dark.svg',
  '/logo-dark.png',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/index.html'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event v4 (persistent books)');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_CACHE_URLS);
    }).then(() => {
      self.skipWaiting();
    })
  );
});

// Activate event - clean up old app caches but KEEP book caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event v4');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old app caches (thinkread-v* or thinkread-app-v*)
          if (cacheName.startsWith('thinkread-v') || (cacheName.startsWith('thinkread-app-') && cacheName !== CACHE_NAME)) {
            console.log('[SW] Deleting old app cache:', cacheName);
            return caches.delete(cacheName);
          }
          // Note: we do NOT delete thinkread-books-* here
        })
      );
    }).then(() => {
      self.clients.claim();
    })
  );
});


// Fetch event - handle different types of requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip sensitive or real-time API requests
  // Allowing health and current-user to fail naturally lets the client detect offline state accurately
  if (url.pathname.startsWith('/api/progress/')) return;
  if (url.pathname === '/api/health') return;
  if (url.pathname === '/api/current-user') return;

  // Handle requests based on type
  if (url.pathname.startsWith('/api/books/') && url.pathname.endsWith('/file')) {
    event.respondWith(handleBookRequest(request));
  } else if (url.pathname.startsWith('/api/books/') && url.pathname.includes('/contents/')) {
    event.respondWith(handleStaticRequest(request));
  } else if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApiRequest(request));
  } else {
    event.respondWith(handleStaticRequest(request));
  }
});

// Handle book file requests - cache them for offline reading
async function handleBookRequest(request) {
  const cache = await caches.open(BOOK_CACHE_NAME);
  const url = new URL(request.url);
  console.log('[SW] Book request:', url.pathname);

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      console.log('[SW] Fetched book from network, updating cache');
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] Network failed for book, trying cache:', url.pathname);
  }

  // Try exact match first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    console.log('[SW] Found exact match in cache:', url.pathname);
    return cachedResponse;
  }

  // Try matching by pathname/URL as a backup (strips query params and ignores headers)
  const cachedUrlResponse = await cache.match(request.url, { ignoreSearch: true });
  if (cachedUrlResponse) {
    console.log('[SW] Found URL match in cache:', url.pathname);
    return cachedUrlResponse;
  }

  // Final attempt: check if any cached key contains the pathname
  const keys = await cache.keys();
  for (const key of keys) {
    if (new URL(key.url).pathname === url.pathname) {
      console.log('[SW] Found pathname match in cache:', url.pathname);
      return await cache.match(key);
    }
  }

  console.warn('[SW] Book not found in cache offline:', url.pathname);
  return new Response(JSON.stringify({ error: "Book not available offline" }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}


// Handle API requests - network first with basic offline handling
async function handleApiRequest(request) {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);

    // Cache successful GET requests for offline use
    if (response.ok && request.method === 'GET') {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    console.log('[SW] API request failed, returning offline response:', url.pathname);

    // Try to find in cache
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);
    if (cachedResponse) return cachedResponse;

    // If not in CACHE_NAME, it might be in BOOK_CACHE_NAME (like metadata)
    const bookCache = await caches.open(BOOK_CACHE_NAME);
    const bookCachedResponse = await bookCache.match(request);
    if (bookCachedResponse) return bookCachedResponse;

    return new Response(JSON.stringify({ error: "Offline" }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle static asset requests - cache first strategy
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  const cachedResponse = await cache.match(request);
  if (cachedResponse) return cachedResponse;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed for static asset:', request.url);
    if (request.mode === 'navigate') {
      const offlineResponse = await cache.match(OFFLINE_URL);
      if (offlineResponse) return offlineResponse;
    }
    return new Response("Not found", { status: 404 });
  }
}

// Message listener for manual caching actions from the client
self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type, bookId, url, data, metadata } = event.data;

  // Support both direct properties and nested 'data' property
  const bId = bookId || data?.bookId;
  const bUrl = url || data?.url;
  const meta = metadata || data?.metadata;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CACHE_BOOK':
      if (bId && bUrl) cacheBook(bId, bUrl);
      break;
    case 'CACHE_BOOK_METADATA':
      if (bId && meta) cacheBookMetadata(bId, meta);
      break;
  }
});

// Manually cache a book
async function cacheBook(bookId, url) {
  const cache = await caches.open(BOOK_CACHE_NAME);
  try {
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
      console.log('[SW] Book cached in persistent storage:', bookId);
    }
  } catch (error) {
    console.warn('[SW] Failed to cache book:', bookId, error);
  }
}

// Cache book metadata for offline use
async function cacheBookMetadata(bookId, metadata) {
  const cache = await caches.open(BOOK_CACHE_NAME);
  const metadataUrl = `/api/books/${bookId}/metadata`;

  try {
    const response = new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(metadataUrl, response);
    console.log('[SW] Book metadata cached in persistent storage:', bookId);
  } catch (error) {
    console.warn('[SW] Failed to cache book metadata:', bookId, error);
  }
}
