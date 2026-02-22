// Register service worker
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Use local sw.js
      navigator.serviceWorker.register('/sw.js')

        .then((registration) => {
          console.log('[SW] Registered successfully:', registration.scope);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                // New update available, notify user or auto-reload
                console.log('[SW] New version available! Reloading...');
                newWorker.postMessage({ type: 'SKIP_WAITING' });
                setTimeout(() => window.location.reload(), 500);
              }
            });
          });
        })
        .catch((error) => {
          console.error('[SW] Registration failed:', error);
        });
    });
  }
}

// Check if app is running as PWA
export function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

// Get cached books from Cache API directly
export async function getCachedBooks() {
  if (!('caches' in window)) return [];
  try {
    const cacheNames = await caches.keys();
    console.log('[Offline] Checking caches:', cacheNames);
    const cachedBooks = new Set();

    for (const name of cacheNames) {
      if (name.startsWith('thinkread-')) {
        const cache = await caches.open(name);
        const requests = await cache.keys();
        console.log(`[Offline] Cache "${name}" has ${requests.length} resources`);

        for (const req of requests) {
          const url = req.url;
          // Look for book file requests
          // Matches /api/books/123/file or .../api/books/123/file
          const fileMatch = url.match(/\/api\/books\/([^/]+)\/file/);
          if (fileMatch) {
            console.log(`[Offline] Found cached book file: ${fileMatch[1]}`);
            cachedBooks.add(String(fileMatch[1]));
          }

          // Also check for metadata requests as a secondary source
          const metaMatch = url.match(/\/api\/books\/([^/]+)\/metadata/);
          if (metaMatch) {
            console.log(`[Offline] Found cached book metadata: ${metaMatch[1]}`);
            cachedBooks.add(String(metaMatch[1]));
          }
        }
      }
    }
    const result = Array.from(cachedBooks);
    console.log('[Offline] Total cached books found:', result);
    return result;
  } catch (error) {
    console.warn('[Offline] Failed to read cached books:', error);
    return [];
  }
}


// Manually cache a book
export async function cacheBook(bookId, url) {
  const BOOK_CACHE_NAME = 'thinkread-books-v1';

  // Option 1: Send message to Service Worker
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_BOOK',
      bookId, // Correctly match what sw.js expects
      url
    });
  }

  // Option 2: Also try to cache directly from the client as a fallback
  if ('caches' in window) {
    try {
      const cache = await caches.open(BOOK_CACHE_NAME);
      // Construct full URL for matching consistency if needed, but relative usually works
      const response = await fetch(url);
      if (response.ok) {
        // Important: Use the same URL format that SW uses
        await cache.put(url, response);
        console.log('[Client] Book cached directly in persistent storage:', bookId);
        return true;
      }
    } catch (error) {
      console.warn('[Client] Failed to cache book directly:', error);
    }
  }
  return false;
}

// Check if a specific book is cached
export async function isBookCached(bookId) {
  if (!('caches' in window)) return false;
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      if (name.startsWith('thinkread-')) {
        const cache = await caches.open(name);
        const url = `/api/books/${bookId}/file`;
        const match = await cache.match(url);
        if (match) return true;
      }
    }
  } catch (err) {
    console.warn('Error checking cache for book:', bookId, err);
  }
  return false;
}


// Check online status
export function isOnline() {
  return navigator.onLine;
}

// Listen for online/offline events
export function onOnlineStatusChange(callback) {
  const handleOnline = () => callback(true);
  const handleOffline = () => callback(false);

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

let deferredPrompt;

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });
}

export async function showInstallPrompt() {
  if (!deferredPrompt) return false;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return outcome === 'accepted';
}

export function canInstallPWA() {
  return !!deferredPrompt;
}
