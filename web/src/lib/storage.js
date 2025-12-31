const PREFS_KEY = "ser:prefs:v1";

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const p = JSON.parse(raw);
    return { ...defaultPrefs(), ...p };
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function defaultPrefs() {
  return {
    fontFamily: "serif",
    fontSize: 18,       // px
    lineHeight: 1.6,
    verticalMargin: 30,   // px (top/bottom padding)
    horizontalMargin: 46, // px (left/right padding)
    bg: "#f6f1e7",
    fg: "#1a1a1a",
    sortBy: "upload",     // "upload", "alphabetical", "lastOpened"
    twoPageLayout: false, // Enable two-page side-by-side layout
  };
}

export function progressKey(bookId) {
  return `ser:progress:${bookId}`;
}

export function loadProgress(bookId) {
  try {
    const raw = localStorage.getItem(progressKey(bookId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveProgress(bookId, progress) {
  localStorage.setItem(progressKey(bookId), JSON.stringify(progress));
}
