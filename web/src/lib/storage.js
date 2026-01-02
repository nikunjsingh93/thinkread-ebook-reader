export async function loadPrefs() {
  try {
    const response = await fetch('/api/prefs');
    if (!response.ok) {
      console.warn('Failed to load prefs from server, using defaults');
      return defaultPrefs();
    }
    const p = await response.json();
    return { ...defaultPrefs(), ...p };
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
      white: {
        bg: "#ffebbd",
        fg: "#35160a"
      },
      dark: {
        bg: "rgb(54, 37, 21)",
        fg: "#ffebbd"
      },
      "pure-black": {
        bg: "#000000",
        fg: "#ffffff"
      }
    },
    // Legacy properties for backward compatibility
    bg: "rgb(54, 37, 21)",
    fg: "#ffebbd",
    sortBy: "upload",     // "upload", "alphabetical", "lastOpened"
    twoPageLayout: false, // Enable two-page side-by-side layout
  };
}

export async function loadProgress(bookId) {
  try {
    const response = await fetch(`/api/progress/${bookId}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error('Failed to load progress');
    }
    const progress = await response.json();
    return progress;
  } catch (err) {
    console.warn('Error loading progress from server:', err);
    return null;
  }
}

export async function saveProgress(bookId, progress) {
  try {
    if (!bookId) {
      console.error('saveProgress called without bookId');
      return;
    }
    
    const response = await fetch(`/api/progress/${bookId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(progress),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to save progress: ${response.status} ${errorText}`);
    }
    
    return await response.json();
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
