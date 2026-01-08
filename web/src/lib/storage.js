export async function loadPrefs() {
  try {
    const response = await fetch('/api/prefs');
    if (!response.ok) {
      console.warn('Failed to load prefs from server, using defaults');
      return defaultPrefs();
    }
    const p = await response.json();
    const defaults = defaultPrefs();
    // Merge colors object to ensure all theme colors are available (especially eink)
    const mergedColors = { ...defaults.colors, ...(p.colors || {}) };
    return { ...defaults, ...p, colors: mergedColors };
  } catch (err) {
    console.warn('Error loading prefs from server:', err);
    return defaultPrefs();
  }
}

export async function savePrefs(prefs) {
  try {
    const response = await fetch('/api/prefs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(prefs),
    });
    if (!response.ok) {
      throw new Error('Failed to save prefs');
    }
  } catch (err) {
    console.error('Error saving prefs to server:', err);
    // Fallback to localStorage for offline support
    try {
      localStorage.setItem("ser:prefs:v1", JSON.stringify(prefs));
    } catch (localErr) {
      console.error('Failed to save to localStorage as fallback:', localErr);
    }
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
  };
}

export async function loadProgress(bookId) {
  try {
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
      if (response.status === 404) {
        // Check localStorage as fallback
        try {
          const localData = localStorage.getItem(`ser:progress:${bookId}`);
          if (localData) {
            const localProgress = JSON.parse(localData);
            // Sync localStorage data back to server
            try {
              await saveProgress(bookId, localProgress);
            } catch (syncErr) {
              // If sync fails, that's okay - at least we have the local data
              console.warn('Failed to sync localStorage progress to server:', syncErr);
            }
            return localProgress;
          }
        } catch (localErr) {
          // Ignore localStorage errors
        }
        return null;
      }
      throw new Error('Failed to load progress');
    }
    const progress = await response.json();
    
    // Sync server data to localStorage to keep them in sync
    try {
      localStorage.setItem(`ser:progress:${bookId}`, JSON.stringify(progress));
    } catch (localErr) {
      // Ignore localStorage errors - server data is the source of truth
    }
    
    return progress;
  } catch (err) {
    console.warn('Error loading progress from server:', err);
    // Try localStorage as fallback
    try {
      const localData = localStorage.getItem(`ser:progress:${bookId}`);
      if (localData) {
        const localProgress = JSON.parse(localData);
        // Try to sync back to server when connection is restored
        saveProgress(bookId, localProgress).catch(() => {
          // Ignore sync errors - will retry on next load
        });
        return localProgress;
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
