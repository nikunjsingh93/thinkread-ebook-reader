// Service Worker utilities for PWA functionality

// Register service worker
export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[SW] Registered successfully:', registration.scope);

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New version available
                  console.log('[SW] New version available');
                  // You could show a notification to the user here
                }
              });
            }
          });

          // Listen for messages from service worker
          navigator.serviceWorker.addEventListener('message', (event) => {
            console.log('[SW] Message from service worker:', event.data);
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

// Get cached books from service worker
export function getCachedBooks() {
  return new Promise((resolve) => {
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      const messageChannel = new MessageChannel();

      messageChannel.port1.onmessage = (event) => {
        resolve(event.data.cachedBooks || []);
      };

      navigator.serviceWorker.controller.postMessage(
        { type: 'GET_CACHED_BOOKS' },
        [messageChannel.port2]
      );

      // Timeout after 5 seconds
      setTimeout(() => resolve([]), 5000);
    } else {
      resolve([]);
    }
  });
}

// Manually cache a book
export function cacheBook(bookId, url) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_BOOK',
      data: { bookId, url }
    });
  }
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

  // Return cleanup function
  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

// Sync pending data when back online
export function requestBackgroundSync(tag) {
  if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.sync.register(tag);
    });
  }
}

// PWA install prompt handling
let deferredPrompt;

export function initInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    console.log('PWA was installed');
    deferredPrompt = null;
  });
}

export function showInstallPrompt() {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    return deferredPrompt.userChoice;
  }
  return Promise.reject(new Error('Install prompt not available'));
}

export function canInstallPWA() {
  return !!deferredPrompt;
}
