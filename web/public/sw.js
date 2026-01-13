// Service Worker for ThinkRead PWA
const CACHE_NAME = 'thinkread-v2';
const OFFLINE_URL = '/';

// Assets to cache on install
const STATIC_CACHE_URLS = [
  '/',
  '/manifest.json',
  '/logo.svg',
  '/logo.png',
  // Add other static assets as needed
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Network first for API calls
  NETWORK_FIRST: 'network-first',
  // Cache first for static assets
  CACHE_FIRST: 'cache-first',
  // Stale while revalidate for books
  STALE_WHILE_REVALIDATE: 'stale-while-revalidate'
};

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_CACHE_URLS);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event');
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
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - handle different types of requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST requests like saving progress should go directly to network)
  if (request.method !== 'GET') return;

  // Skip progress API requests - they should always fetch fresh data from server
  // This is critical for iOS/iPadOS where cached progress can cause sync issues
  if (url.pathname.startsWith('/api/progress/')) {
    return; // Let the request go directly to network, bypassing service worker
  }

  // Handle different URL patterns
  if (url.pathname.startsWith('/api/books/') && url.pathname.endsWith('/file')) {
    // Book files - cache them when accessed
    event.respondWith(handleBookRequest(request));
  } else if (url.pathname.startsWith('/api/books/') && url.pathname.includes('/contents/')) {
    // Individual book files (unzipped) - cache them as they are accessed for faster subsequent reads
    event.respondWith(handleStaticRequest(request));
  } else if (url.pathname.startsWith('/api/')) {
    // API requests - network first, with offline fallback
    event.respondWith(handleApiRequest(request));
  } else {
    // Static assets - cache first
    event.respondWith(handleStaticRequest(request));
  }
});

// Handle book file requests - cache them for offline reading
async function handleBookRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    // Try network first
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch (error) {
    console.log('[SW] Network failed for book, trying cache:', request.url);
  }

  // Try cache as fallback
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Return offline page if nothing works
  return new Response('Book not available offline', {
    status: 503,
    statusText: 'Service Unavailable',
    headers: { 'Content-Type': 'text/plain' }
  });
}

// Handle API requests - network first with basic offline handling
async function handleApiRequest(request) {
  try {
    // Try network first
    const response = await fetch(request);
    return response;
  } catch (error) {
    console.log('[SW] API request failed, returning offline response:', request.url);

    // For book list requests, return cached books info
    if (request.url.includes('/api/books')) {
      return handleOfflineBooksRequest();
    }

    // For other API requests, return offline error
    return new Response(JSON.stringify({
      error: 'Offline',
      message: 'This feature requires an internet connection'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Handle offline books request - return cached book metadata
async function handleOfflineBooksRequest() {
  const cache = await caches.open(CACHE_NAME);
  const cachedBooks = [];

  // Get all cached requests
  const requests = await cache.keys();

  // Find cached book files and extract metadata
  for (const request of requests) {
    if (request.url.includes('/api/books/') && request.url.endsWith('/file')) {
      try {
        // Extract book ID from URL
        const urlParts = request.url.split('/api/books/')[1].split('/file')[0];
        const bookId = urlParts;

        // Try to get book metadata from cached metadata first
        let bookMetadata = null;
        const metadataRequest = new Request(`/api/books/${bookId}/metadata`);
        const cachedMetadata = await cache.match(metadataRequest);
        if (cachedMetadata) {
          try {
            bookMetadata = await cachedMetadata.json();
          } catch (e) {
            console.warn('[SW] Failed to parse cached metadata for:', bookId);
          }
        }

        // Create book entry with proper metadata or fallback
        const bookEntry = {
          id: bookId,
          cached: true,
          offline: true,
          ...bookMetadata // Spread cached metadata if available
        };

        // If no cached metadata, create a minimal entry
        if (!bookMetadata) {
          bookEntry.title = `Offline Book (${bookId.substring(0, 8)})`;
          bookEntry.addedAt = Date.now(); // Use current time as fallback
        }

        cachedBooks.push(bookEntry);
      } catch (error) {
        console.warn('[SW] Error parsing cached book URL:', request.url);
      }
    }
  }

  return new Response(JSON.stringify({
    books: cachedBooks,
    offline: true,
    message: 'Showing cached books only'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Handle static asset requests - cache first strategy
async function handleStaticRequest(request) {
  const cache = await caches.open(CACHE_NAME);

  // Try cache first
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    // Try network
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache successful responses
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Static asset not available:', request.url);
    // Return offline fallback for HTML requests
    if (request.headers.get('accept').includes('text/html')) {
      return cache.match(OFFLINE_URL);
    }
  }
}

// Handle background sync for uploading progress/settings
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === 'sync-progress') {
    event.waitUntil(syncPendingProgress());
  } else if (event.tag === 'sync-prefs') {
    event.waitUntil(syncPendingPrefs());
  }
});

// Sync pending progress data
async function syncPendingProgress() {
  // This would be implemented to sync any queued progress data
  // For now, just log that sync was attempted
  console.log('[SW] Syncing pending progress...');
}

// Sync pending preferences
async function syncPendingPrefs() {
  // This would be implemented to sync any queued preferences
  console.log('[SW] Syncing pending preferences...');
}

// Handle push messages (if needed in the future)
self.addEventListener('push', (event) => {
  console.log('[SW] Push message received:', event);

  if (event.data) {
    const data = event.data.json();
    // Handle push notification
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  const { type, data } = event.data;

  switch (type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
    case 'CACHE_BOOK':
      // Manually cache a book
      cacheBook(data.bookId, data.url);
      break;
    case 'GET_CACHED_BOOKS':
      // Return list of cached books
      getCachedBooks().then(books => {
        event.ports[0].postMessage({ cachedBooks: books });
      });
      break;
    case 'CACHE_BOOK_METADATA':
      // Cache book metadata for offline use
      cacheBookMetadata(data.bookId, data.metadata);
      break;
  }
});

// Manually cache a book
async function cacheBook(bookId, url) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(url);
    if (response.ok) {
      await cache.put(url, response);
      console.log('[SW] Book cached:', bookId);
    }
  } catch (error) {
    console.warn('[SW] Failed to cache book:', bookId, error);
  }
}

// Cache book metadata for offline use
async function cacheBookMetadata(bookId, metadata) {
  const cache = await caches.open(CACHE_NAME);
  const metadataUrl = `/api/books/${bookId}/metadata`;

  try {
    const response = new Response(JSON.stringify(metadata), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put(metadataUrl, response);
    console.log('[SW] Book metadata cached:', bookId);
  } catch (error) {
    console.warn('[SW] Failed to cache book metadata:', bookId, error);
  }
}

// Get list of cached books
async function getCachedBooks() {
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  const cachedBooks = [];

  for (const request of requests) {
    if (request.url.includes('/api/books/') && request.url.endsWith('/file')) {
      const bookId = request.url.split('/api/books/')[1].split('/file')[0];
      cachedBooks.push(bookId);
    }
  }

  return cachedBooks;
}

