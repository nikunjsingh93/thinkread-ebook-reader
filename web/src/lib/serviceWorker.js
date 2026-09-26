// Register service worker
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    const register = () => {
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
    };
    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });
  }
}

// Check if app is running as PWA
export function isPWA() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;
}

const BOOK_CACHE_NAME = 'thinkread-books-v1';

function notifyBookCacheChanged() {
  window.dispatchEvent?.(new Event('thinkread-book-cache-changed'));
}

function expectedByteCount(sizeBytes) {
  const size = Number(sizeBytes);
  return Number.isSafeInteger(size) && size > 0 ? size : null;
}

async function isCompleteBookResponse(response, sizeBytes) {
  if (!response || response.status !== 200 || response.headers.has('Content-Range')) return false;

  const expected = expectedByteCount(sizeBytes);
  const markedSize = expectedByteCount(response.headers.get('X-ThinkRead-Complete-Size'));
  if (markedSize) return !expected || markedSize === expected;

  // Older caches contain the original server response. Validate its full body
  // once before treating it as an offline book; metadata and range responses
  // are never enough to earn the badge.
  const actualSize = (await response.clone().blob()).size;
  const contentLength = expectedByteCount(response.headers.get('Content-Length'));
  return actualSize > 0 && (!expected || actualSize === expected) &&
    (!contentLength || actualSize === contentLength);
}

export async function getCachedBookResponse(bookId, sizeBytes) {
  if (!('caches' in window)) return null;
  try {
    const cache = await caches.open(BOOK_CACHE_NAME);
    const response = await cache.match(`/api/books/${encodeURIComponent(bookId)}/file`);
    return await isCompleteBookResponse(response, sizeBytes) ? response : null;
  } catch (error) {
    console.warn('[Offline] Failed to verify cached book:', bookId, error);
    return null;
  }
}

export async function getCachedBooks(books = []) {
  const cachedIds = [];
  for (const book of books) {
    if (await getCachedBookResponse(book.id, book.sizeBytes)) cachedIds.push(String(book.id));
  }
  return cachedIds;
}

// Download the archive/document, check its full byte count, then commit it.
export async function cacheBook(bookId, url, sizeBytes) {
  if (!('caches' in window)) return false;
  if (await getCachedBookResponse(bookId, sizeBytes)) return true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetch(url, {
      headers: { 'X-ThinkRead-Cache-Download': '1' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (response.status !== 200 || response.headers.has('Content-Range')) return false;
    const blob = await response.blob();
    const expected = expectedByteCount(sizeBytes);
    const contentLength = expectedByteCount(response.headers.get('Content-Length'));
    if (!blob.size || (expected && blob.size !== expected) ||
        (contentLength && blob.size !== contentLength)) return false;

    const cache = await caches.open(BOOK_CACHE_NAME);
    const headers = new Headers(response.headers);
    headers.set('X-ThinkRead-Complete-Size', String(blob.size));
    await cache.put(url, new Response(blob, { status: 200, headers }));
    const saved = await cache.match(url);
    const savedSize = (await saved.blob()).size;
    if (savedSize !== blob.size) {
      await cache.delete(url);
      return false;
    }
    console.log('[Offline] Complete book cached:', bookId, savedSize);
    notifyBookCacheChanged();
    return true;
  } catch (error) {
    console.warn('[Offline] Failed to cache complete book:', bookId, error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function removeCachedBook(bookId) {
  if (!('caches' in window)) return false;
  const bookPath = `/api/books/${encodeURIComponent(bookId)}/`;
  try {
    // Remove the file and any separately cached cover, EPUB chapters, or
    // metadata for this book. Keep the library list and other books intact.
    for (const cacheName of await caches.keys()) {
      if (!cacheName.startsWith('thinkread-')) continue;
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.startsWith(bookPath)) {
          await cache.delete(request);
        }
      }
    }
    if (await getCachedBookResponse(bookId)) return false;
    notifyBookCacheChanged();
    return true;
  } catch (error) {
    console.warn('[Offline] Failed to remove cached book:', bookId, error);
    return false;
  }
}

export async function isBookCached(bookId, sizeBytes) {
  return !!(await getCachedBookResponse(bookId, sizeBytes));
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
