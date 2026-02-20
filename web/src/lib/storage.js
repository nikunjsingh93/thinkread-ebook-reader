export async function loadPrefs() {
  // Always try to load from localStorage first for "instant" feel
  let localPrefs = null;
  try {
    const saved = localStorage.getItem("ser:prefs:v1");
    if (saved) {
      localPrefs = JSON.parse(saved);
      console.log('[Storage] Loaded local prefs from localStorage');
    }
  } catch (e) {
    console.warn('[Storage] Failed to parse local prefs', e);
  }

  try {
    const response = await fetch('/api/prefs');
    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized");
      console.warn('Failed to load prefs from server, using local fallback');
      return localPrefs || defaultPrefs();
    }
    const p = await response.json();
    const defaults = defaultPrefs();

    // Merge colors object to ensure all theme colors are available
    const mergedColors = { ...defaults.colors, ...(p.colors || {}) };
    const mergedPrefs = { ...defaults, ...p, colors: mergedColors };

    // Always sync server prefs to localStorage on success
    try {
      localStorage.setItem("ser:prefs:v1", JSON.stringify(mergedPrefs));
    } catch (e) { }

    return mergedPrefs;
  } catch (err) {
    if (err.message === "Unauthorized") throw err;
    console.warn('Error loading prefs from server (offline?), using local fallback:', err);
    return localPrefs || defaultPrefs();
  }
}

export async function savePrefs(prefs) {
  // Always save to localStorage immediately for offline support
  try {
    localStorage.setItem("ser:prefs:v1", JSON.stringify(prefs));
  } catch (localErr) {
    console.error('Failed to save to localStorage:', localErr);
  }

  try {
    const response = await fetch('/api/prefs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prefs),
    });
    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized");
      throw new Error('Failed to save prefs to server');
    }
  } catch (err) {
    if (err.message === "Unauthorized") throw err;
    console.error('Error saving prefs to server (deferred):', err);
  }
}

export function defaultPrefs() {
  return {
    fontFamily: "serif",
    fontSize: 18,       // px
    lineHeight: 1.6,
    verticalMargin: 30,   // px (top/bottom padding)
    horizontalMargin: 46, // px (left/right padding)
    themeMode: "pure-white",    // "pure-white", "white", "dark", "pure-black"
    // Theme-specific colors
    colors: {
      "pure-white": {
        bg: "#ffffff",
        fg: "#1a1a1a"
      },
      "white": {
        bg: "#ffebbd",
        fg: "#35160a"
      },
      "dark": {
        bg: "rgb(54, 37, 21)",
        fg: "#ffebbd"
      },
      "pure-black": {
        bg: "#000000",
        fg: "#ffffff"
      },
      "eink": {
        bg: "#ffffff",
        fg: "#1a1a1a"
      }
    },
    // Legacy properties for backward compatibility
    bg: "rgb(54, 37, 21)",
    fg: "#ffebbd",
    sortBy: "upload",     // "upload", "alphabetical", "lastOpened"
    twoPageLayout: false, // Enable two-page side-by-side layout
    voiceGender: "female", // "male" or "female" for text-to-speech (legacy, kept for backward compatibility)
    voiceName: null, // Name of the selected voice (if null, uses voiceGender or default)
    readingSpeed: 1.0, // Speech rate (0.1 to 10, where 1.0 is normal speed)
  };
}

export async function loadProgress(bookId) {
  try {
    // Get local progress first for comparison
    let localProgress = null;
    try {
      const localData = localStorage.getItem(`ser:progress:${bookId}`);
      if (localData) {
        localProgress = JSON.parse(localData);
      }
    } catch (e) {
      console.warn('Failed to parse local progress:', e);
    }

    // Use cache: 'no-store' to ensure we always get fresh data from server
    // This is critical for iOS/iPadOS PWA where cached progress can cause sync issues
    const response = await fetch(`/api/progress/${bookId}`, {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      }
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized");
      if (response.status === 404) {
        if (localProgress) {
          // Sync localStorage data back to server
          try {
            await saveProgress(bookId, localProgress);
          } catch (syncErr) {
            if (syncErr.message === "Unauthorized") throw syncErr;
            console.warn('Failed to sync localStorage progress to server:', syncErr);
          }
          return localProgress;
        }
        return null;
      }
      throw new Error('Failed to load progress from server');
    }

    const serverProgress = await response.json();

    // Sync logic: compare timestamps (updatedAt)
    if (localProgress && localProgress.updatedAt > (serverProgress.updatedAt || 0)) {
      console.log(`Local progress for ${bookId} is newer than server. Syncing to server...`);
      try {
        await saveProgress(bookId, localProgress);
        return localProgress;
      } catch (syncErr) {
        console.warn('Failed to sync newer local progress to server:', syncErr);
        return localProgress;
      }
    }

    // Server is newer or equal, or no local progress
    // Sync server data to localStorage to keep them in sync
    if (serverProgress) {
      try {
        localStorage.setItem(`ser:progress:${bookId}`, JSON.stringify(serverProgress));
      } catch (localErr) {
        console.warn('Failed to sync progress to localStorage:', localErr);
      }
    }

    return serverProgress;
  } catch (err) {
    if (err.message === "Unauthorized") throw err;
    console.warn('Error loading progress from server, falling back to local:', err);
    // Try localStorage as fallback
    try {
      const localData = localStorage.getItem(`ser:progress:${bookId}`);
      if (localData) {
        return JSON.parse(localData);
      }
    } catch (localErr) {
      // Ignore localStorage errors
    }
    return null;
  }
}

export async function saveProgress(bookId, progress) {
  try {
    if (!bookId) {
      console.error('saveProgress called without bookId');
      return;
    }

    // Use cache: 'no-store' and ensure request bypasses cache
    // This is critical for iOS/iPadOS PWA to ensure progress syncs properly
    const response = await fetch(`/api/progress/${bookId}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
      },
      body: JSON.stringify(progress),
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error("Unauthorized");
      const errorText = await response.text();
      throw new Error(`Failed to save progress: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    // Always sync to localStorage when server save succeeds to keep them in sync
    try {
      localStorage.setItem(`ser:progress:${bookId}`, JSON.stringify(progress));
    } catch (localErr) {
      // Ignore localStorage errors - server is the source of truth
      console.warn('Failed to sync progress to localStorage:', localErr);
    }

    return result;
  } catch (err) {
    if (err.message === "Unauthorized") throw err;
    console.error(`Error saving progress for book ${bookId}:`, err);
    // Fallback to localStorage for offline support
    try {
      localStorage.setItem(`ser:progress:${bookId}`, JSON.stringify(progress));
    } catch (localErr) {
      console.error('Failed to save to localStorage as fallback:', localErr);
    }
    throw err; // Re-throw so caller knows it failed
  }
}
