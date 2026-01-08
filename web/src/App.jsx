import React, { useEffect, useState } from "react";
import Shelf from "./components/Shelf.jsx";
import Reader from "./components/Reader.jsx";
import Toast from "./components/Toast.jsx";
import ShelfSettingsDrawer from "./components/ShelfSettingsDrawer.jsx";
import Bookmarks from "./components/Bookmarks.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import Login from "./components/Login.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import PWAInstallPrompt from "./components/PWAInstallPrompt.jsx";
import { apiGetBooks } from "./lib/api.js";
import { loadPrefs, savePrefs } from "./lib/storage.js";
import {
  registerServiceWorker,
  onOnlineStatusChange,
  isOnline,
  initInstallPrompt,
  canInstallPWA
} from "./lib/serviceWorker.js";

// Fallback function for synchronous defaults (for error cases)
function defaultPrefs() {
  return {
    fontFamily: "serif",
    fontSize: 18,
    lineHeight: 1.6,
    verticalMargin: 30,
    horizontalMargin: 46,
    themeMode: "pure-white",
    colors: {
      "pure-white": { bg: "#ffffff", fg: "#1a1a1a" },
      white: { bg: "#ffebbd", fg: "#35160a" },
      dark: { bg: "rgb(54, 37, 21)", fg: "#ffebbd" },
      "pure-black": { bg: "#000000", fg: "#ffffff" },
      "eink": { bg: "#ffffff", fg: "#1a1a1a" }
    },
    bg: "rgb(54, 37, 21)",
    fg: "#ffebbd",
    sortBy: "upload",
    twoPageLayout: false,
    voiceGender: "female",
  };
}

// Theme application function
function applyTheme(prefs) {
  const root = document.documentElement;
  const themeMode = prefs.themeMode || 'pure-white';

  if (themeMode === 'pure-white') {
    // Base colors - text closer to black, light backgrounds
    root.style.setProperty('--bg', '#ffffff');
    root.style.setProperty('--panel', '#f8f9fa');
    root.style.setProperty('--text', '#1a1a1a'); // Much darker text
    root.style.setProperty('--muted', '#495057'); // Darker muted text
    root.style.setProperty('--border', 'rgba(0,0,0,0.1)');
    root.style.setProperty('--accent', '#007bff');

    // UI element backgrounds - light versions
    root.style.setProperty('--topbar-bg', 'rgba(248,249,250,0.95)');
    root.style.setProperty('--card-bg', 'rgba(248,249,250,0.9)');
    root.style.setProperty('--pill-bg', 'rgba(248,249,250,0.9)');
    root.style.setProperty('--drawer-bg', 'rgba(255,255,255,0.98)');
    root.style.setProperty('--reader-bar-bg', 'rgba(248,249,250,0.95)');
    root.style.setProperty('--toast-bg', 'rgba(248,249,250,0.95)');
    root.style.setProperty('--backdrop-bg', 'rgba(0,0,0,0.3)');

    // Form elements - light versions
    root.style.setProperty('--input-bg', 'rgba(255,255,255,0.8)');
    root.style.setProperty('--input-border', 'rgba(0,0,0,0.15)');
    root.style.setProperty('--row-bg', 'rgba(0,0,0,0.02)');
    root.style.setProperty('--row-border', 'rgba(0,0,0,0.08)');

    // Additional UI elements - light versions
    root.style.setProperty('--kebab-bg', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--kebab-border', 'rgba(0,0,0,0.15)');
    root.style.setProperty('--cover-border', 'rgba(0,0,0,0.08)');
    // Search and progress bars - light versions
    root.style.setProperty('--search-bg', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--search-border', 'rgba(0,0,0,0.15)');
    root.style.setProperty('--progress-bg', 'rgba(0,0,0,0.7)');
    // Scrollbar colors - default purple
    root.style.setProperty('--scrollbar-thumb', 'rgba(124, 92, 255, 0.4)');
    root.style.setProperty('--scrollbar-thumb-hover', 'rgba(124, 92, 255, 0.6)');
    root.style.setProperty('--scrollbar-track', 'rgba(255, 255, 255, 0.05)');
  } else if (themeMode === 'white') {
    // White theme - cream/off-white UI with warm book colors
    root.style.setProperty('--bg', '#f0ede6'); // Cream background to match topbar
    root.style.setProperty('--panel', '#f0ede6'); // Cream panel color
    root.style.setProperty('--text', '#2c1810'); // Dark brown text
    root.style.setProperty('--muted', '#8b7355'); // Muted brown
    root.style.setProperty('--border', 'rgba(0,0,0,0.08)');
    root.style.setProperty('--accent', '#8b4513'); // Saddle brown accent

    // UI element backgrounds - cream/off-white versions
    root.style.setProperty('--topbar-bg', 'rgba(240,237,230,0.95)');
    root.style.setProperty('--card-bg', 'rgba(240,237,230,0.9)');
    root.style.setProperty('--pill-bg', 'rgba(240,237,230,0.9)');
    root.style.setProperty('--drawer-bg', 'rgba(245,242,235,0.98)');
    root.style.setProperty('--reader-bar-bg', 'rgba(240,237,230,0.95)');
    root.style.setProperty('--toast-bg', 'rgba(240,237,230,0.95)');
    root.style.setProperty('--backdrop-bg', 'rgba(0,0,0,0.25)');

    // Form elements - cream versions
    root.style.setProperty('--input-bg', 'rgba(245,242,235,0.8)');
    root.style.setProperty('--input-border', 'rgba(0,0,0,0.12)');
    root.style.setProperty('--row-bg', 'rgba(0,0,0,0.015)');
    root.style.setProperty('--row-border', 'rgba(0,0,0,0.06)');

    // Additional UI elements - cream versions
    root.style.setProperty('--kebab-bg', 'rgba(245,242,235,0.9)');
    root.style.setProperty('--kebab-border', 'rgba(0,0,0,0.12)');
    root.style.setProperty('--cover-border', 'rgba(0,0,0,0.06)');

    // Search and progress bars - cream versions
    root.style.setProperty('--search-bg', 'rgba(245,242,235,0.9)');
    root.style.setProperty('--search-border', 'rgba(0,0,0,0.12)');
    root.style.setProperty('--progress-bg', 'rgba(0,0,0,0.6)');
    // Scrollbar colors - default purple
    root.style.setProperty('--scrollbar-thumb', 'rgba(124, 92, 255, 0.4)');
    root.style.setProperty('--scrollbar-thumb-hover', 'rgba(124, 92, 255, 0.6)');
    root.style.setProperty('--scrollbar-track', 'rgba(255, 255, 255, 0.05)');
  } else if (themeMode === 'pure-black') {
    root.style.setProperty('--bg', '#000000');
    root.style.setProperty('--panel', '#000000');
    root.style.setProperty('--text', '#ffffff');
    root.style.setProperty('--muted', '#cccccc');
    root.style.setProperty('--border', 'rgba(255,255,255,0.1)');
    root.style.setProperty('--accent', '#7c5cff');

    // UI element backgrounds - pure black versions
    root.style.setProperty('--topbar-bg', 'rgba(0,0,0,0.95)');
    root.style.setProperty('--card-bg', 'rgba(0,0,0,0.9)');
    root.style.setProperty('--pill-bg', 'rgba(0,0,0,0.9)');
    root.style.setProperty('--drawer-bg', 'rgba(0,0,0,0.98)');
    root.style.setProperty('--reader-bar-bg', 'rgba(0,0,0,0.95)');
    root.style.setProperty('--toast-bg', 'rgba(0,0,0,0.95)');
    root.style.setProperty('--backdrop-bg', 'rgba(255,255,255,0.3)');

    // Form elements - black versions
    root.style.setProperty('--input-bg', 'rgba(0,0,0,0.8)');
    root.style.setProperty('--input-border', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--row-bg', 'rgba(255,255,255,0.02)');
    root.style.setProperty('--row-border', 'rgba(255,255,255,0.08)');

    // Additional UI elements - black versions
    root.style.setProperty('--kebab-bg', 'rgba(0,0,0,0.8)');
    root.style.setProperty('--kebab-border', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--cover-border', 'rgba(255,255,255,0.08)');
    // Search and progress bars - black versions
    root.style.setProperty('--search-bg', 'rgba(0,0,0,0.8)');
    root.style.setProperty('--search-border', 'rgba(255,255,255,0.15)');
    root.style.setProperty('--progress-bg', 'rgba(255,255,255,0.3)');
    // Scrollbar colors - default purple
    root.style.setProperty('--scrollbar-thumb', 'rgba(124, 92, 255, 0.4)');
    root.style.setProperty('--scrollbar-thumb-hover', 'rgba(124, 92, 255, 0.6)');
    root.style.setProperty('--scrollbar-track', 'rgba(255, 255, 255, 0.05)');
  } else if (themeMode === 'eink') {
    // Eink theme - all UI elements black and white, reading same as pure-white
    root.style.setProperty('--bg', '#ffffff');
    root.style.setProperty('--panel', '#ffffff');
    root.style.setProperty('--text', '#000000'); // Pure black text
    root.style.setProperty('--muted', '#666666'); // Gray muted text
    root.style.setProperty('--border', 'rgba(0,0,0,0.2)'); // Black border
    root.style.setProperty('--accent', '#000000'); // Black accent (no colors)

    // UI element backgrounds - white/black only
    root.style.setProperty('--topbar-bg', 'rgba(255,255,255,0.95)');
    root.style.setProperty('--card-bg', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--pill-bg', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--drawer-bg', 'rgba(255,255,255,0.98)');
    root.style.setProperty('--reader-bar-bg', 'rgba(255,255,255,0.95)');
    root.style.setProperty('--toast-bg', 'rgba(255,255,255,0.95)');
    root.style.setProperty('--backdrop-bg', 'rgba(0,0,0,0.3)');

    // Form elements - black and white only
    root.style.setProperty('--input-bg', 'rgba(255,255,255,0.8)');
    root.style.setProperty('--input-border', 'rgba(0,0,0,0.2)');
    root.style.setProperty('--row-bg', 'rgba(255,255,255,1)'); // White background for eink
    root.style.setProperty('--row-border', 'rgba(0,0,0,0.1)');

    // Additional UI elements - black and white only
    root.style.setProperty('--kebab-bg', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--kebab-border', 'rgba(0,0,0,0.2)');
    root.style.setProperty('--cover-border', 'rgba(0,0,0,0.1)');
    // Search and progress bars - black and white only
    root.style.setProperty('--search-bg', 'rgba(255,255,255,0.9)');
    root.style.setProperty('--search-border', 'rgba(0,0,0,0.2)');
    root.style.setProperty('--progress-bg', 'rgba(0,0,0,0.7)');
    // Scrollbar colors - light gray for eink
    root.style.setProperty('--scrollbar-thumb', 'rgba(128, 128, 128, 0.4)');
    root.style.setProperty('--scrollbar-thumb-hover', 'rgba(128, 128, 128, 0.6)');
    root.style.setProperty('--scrollbar-track', 'rgba(0, 0, 0, 0.05)');
    // Slider thumb color - black for eink
    root.style.setProperty('--slider-thumb', '#000000');
    // Checkbox accent color - black for eink
    root.style.setProperty('--checkbox-accent', '#000000');
  } else { // dark (default)
    root.style.setProperty('--bg', '#0b0d12');
    root.style.setProperty('--panel', '#121626');
    root.style.setProperty('--text', '#e7e9ee');
    root.style.setProperty('--muted', '#a8b0c2');
    root.style.setProperty('--border', 'rgba(255,255,255,.10)');
    root.style.setProperty('--accent', '#7c5cff');

    // UI element backgrounds - dark versions (original)
    root.style.setProperty('--topbar-bg', 'rgba(11,13,18,.40)');
    root.style.setProperty('--card-bg', 'rgba(18,22,38,.72)');
    root.style.setProperty('--pill-bg', 'rgba(18,22,38,.72)');
    root.style.setProperty('--drawer-bg', 'rgba(18,22,38,.96)');
    root.style.setProperty('--reader-bar-bg', 'rgba(18,22,38,.85)');
    root.style.setProperty('--toast-bg', 'rgba(18,22,38,.88)');
    root.style.setProperty('--backdrop-bg', 'rgba(0,0,0,.45)');

    // Form elements - dark versions (original)
    root.style.setProperty('--input-bg', 'rgba(0,0,0,.16)');
    root.style.setProperty('--input-border', 'rgba(255,255,255,.14)');
    root.style.setProperty('--row-bg', 'rgba(255,255,255,.04)');
    root.style.setProperty('--row-border', 'rgba(255,255,255,.10)');

    // Additional UI elements - dark versions (original)
    root.style.setProperty('--kebab-bg', 'rgba(0,0,0,.20)');
    root.style.setProperty('--kebab-border', 'rgba(255,255,255,.12)');
    root.style.setProperty('--cover-border', 'rgba(255,255,255,.08)');
    // Search and progress bars - dark versions (original)
    root.style.setProperty('--search-bg', 'rgba(18,22,38,.55)');
    root.style.setProperty('--search-border', 'rgba(255,255,255,.12)');
    root.style.setProperty('--progress-bg', 'rgba(255,255,255,0.2)');
    // Scrollbar colors - default purple
    root.style.setProperty('--scrollbar-thumb', 'rgba(124, 92, 255, 0.4)');
    root.style.setProperty('--scrollbar-thumb-hover', 'rgba(124, 92, 255, 0.6)');
    root.style.setProperty('--scrollbar-track', 'rgba(255, 255, 255, 0.05)');
  }
}

export default function App() {
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [prefs, setPrefs] = useState(defaultPrefs());
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarkCfi, setBookmarkCfi] = useState(null);
  const [bookmarkUpdateTrigger, setBookmarkUpdateTrigger] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState(null); // { open: true, title, message, onConfirm, onCancel }

  // Authentication state
  const [currentUser, setCurrentUser] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // PWA and offline state
  const [isOffline, setIsOffline] = useState(!isOnline());
  const [canInstall, setCanInstall] = useState(false);

  // Check authentication on app start
  useEffect(() => {
    checkAuthStatus();
  }, []);

  // Prevent context menu globally on touch devices
  useEffect(() => {
    const preventContextMenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };

    // Add global context menu prevention with capture phase
    document.addEventListener('contextmenu', preventContextMenu, true);

    return () => {
      document.removeEventListener('contextmenu', preventContextMenu, true);
    };
  }, []);

  useEffect(() => {
    let t;
    if (toast) t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function reload() {
    const data = await apiGetBooks();
    setBooks(data.books || []);
  }

  useEffect(() => {
    reload().catch(() => setToast("API not reachable (is the server running?)"));
  }, []);

  // Load preferences on mount
  useEffect(() => {
    loadPrefs().then((loadedPrefs) => {
      setPrefs(loadedPrefs);
    }).catch((err) => {
      console.warn('Failed to load preferences:', err);
      // Keep default prefs that are already set
    });
  }, []);

  // Reload preferences when user changes (login/logout)
  useEffect(() => {
    if (currentUser) {
      loadPrefs().then((loadedPrefs) => {
        setPrefs(loadedPrefs);
      }).catch((err) => {
        console.warn('Failed to load user preferences:', err);
        // Keep default prefs that are already set
      });
    } else {
      // Reset to defaults when logged out
      setPrefs(defaultPrefs());
    }
  }, [currentUser]);

  // Apply theme when prefs change
  useEffect(() => {
    applyTheme(prefs);
  }, [prefs.themeMode]);

  // Listen for fullscreen changes
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Register service worker and handle PWA install prompt
  useEffect(() => {
    registerServiceWorker();
    initInstallPrompt();

    // Check if PWA can be installed
    const checkInstallability = () => {
      setCanInstall(canInstallPWA());
    };

    checkInstallability();
    // Re-check periodically
    const interval = setInterval(checkInstallability, 5000);
    return () => clearInterval(interval);
  }, []);

  // Monitor online/offline status
  useEffect(() => {
    const cleanup = onOnlineStatusChange((online) => {
      const wasOffline = isOffline;
      setIsOffline(!online);

      if (online && wasOffline) {
        // Came back online - refresh books and sync data
        console.log('Back online - refreshing data');
        reload().catch(() => {
          // Ignore reload errors when coming back online
        });
        setToast("Back online - data synced");
      } else if (!online) {
        console.log('Went offline');
        setToast("You're offline - showing cached content");
      }
    });

    return cleanup;
  }, [isOffline]);


  // Authentication functions
  const checkAuthStatus = async () => {
    try {
      const response = await fetch('/api/current-user');
      if (response.ok) {
        const data = await response.json();
        setCurrentUser(data.user);
      } else {
        setCurrentUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      setCurrentUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleLogin = (user) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      setCurrentUser(null);
      // Reset app state
      setSelected(null);
      setSettingsOpen(false);
      setDeleteMode(false);
      setShowBookmarks(false);
      setShowAdminPanel(false);
    } catch (error) {
      console.error('Logout failed:', error);
      // Force logout on client side anyway
      setCurrentUser(null);
    }
  };

  // Handle orientation unlock when setting is disabled


  async function onPrefsChange(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next);

    try {
      await savePrefs(next);
    } catch (err) {
      console.warn('Failed to save preferences:', err);
    }
  }

  // Show loading screen while checking authentication
  if (isAuthLoading) {
    return (
      <div className="appShell" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg)'
      }}>
        <div style={{ color: 'var(--text)' }}>Loading...</div>
      </div>
    );
  }

  // Show login page if not authenticated
  if (!currentUser) {
    return <Login onLogin={handleLogin} onToast={(t) => setToast(t)} />;
  }

  return (
    <div className="appShell">
      {!selected && (
        <div className="topbar">
          <div className="brand">
            <img src="/logo.svg" alt="ThinkRead" style={{height: '24px', width: '24px', objectFit: 'contain'}} onError={(e) => {
              // Fallback to PNG if SVG doesn't exist
              if (e.target.src.endsWith('.svg')) {
                e.target.src = '/logo.png';
              } else {
                // Hide logo if neither exists
                e.target.style.display = 'none';
              }
            }} />
            <span>ThinkRead</span>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
            {isFullscreen && (
              <button
                className="pill"
                onClick={() => {
                  document.exitFullscreen().catch(err => {
                    console.warn('Failed to exit fullscreen:', err);
                  });
                }}
                style={{padding: "6px 8px", minWidth: "auto", fontSize: "14px"}}
                title="Exit Fullscreen"
              >
                ⛶
              </button>
            )}
            {currentUser.isAdmin && (
              <button
                className="pill"
                onClick={() => setShowAdminPanel(true)}
                style={{padding: "6px 8px", minWidth: "auto", fontSize: "14px"}}
                title="Admin Panel"
              >
                👑
              </button>
            )}
            <button
              className="pill"
              onClick={() => setShowBookmarks(true)}
              style={{padding: "6px 8px", minWidth: "auto", fontSize: "14px", display: 'flex', alignItems: 'center', justifyContent: 'center'}}
              title="All Bookmarks"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 2C3 1.44772 3.44772 1 4 1H12C12.5523 1 13 1.44772 13 2V13C13 13.2652 12.8946 13.5196 12.7071 13.7071C12.5196 13.8946 12.2652 14 12 14C11.7348 14 11.4804 13.8946 11.2929 13.7071L8 10.4142L4.70711 13.7071C4.51957 13.8946 4.26522 14 4 14C3.73478 14 3.48043 13.8946 3.29289 13.7071C3.10536 13.5196 3 13.2652 3 13V2Z" fill="currentColor" stroke="currentColor" strokeWidth="0.5"/>
              </svg>
            </button>
            <button
              className="pill"
              onClick={() => setSettingsOpen(true)}
              style={{padding: "6px 8px", minWidth: "auto", fontSize: "14px"}}
              title="Settings"
            >
              ☰
            </button>
          </div>
        </div>
      )}

      {showBookmarks ? (
        <Bookmarks
          books={books}
          onOpenBook={(book, cfi) => {
            setBookmarkCfi(cfi);
            setSelected(book);
            setShowBookmarks(false);
          }}
          onClose={() => {
            setShowBookmarks(false);
            // Trigger bookmark check in Reader when closing bookmarks
            setBookmarkUpdateTrigger(prev => prev + 1);
          }}
          onToast={(t) => setToast(t)}
          onBookmarkChange={() => {
            // Trigger bookmark check in Reader when bookmark is deleted
            setBookmarkUpdateTrigger(prev => prev + 1);
          }}
          onConfirm={(title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm })}
        />
      ) : selected ? (
        <Reader
          book={selected}
          prefs={prefs}
          onPrefsChange={onPrefsChange}
          onBack={() => {
            setSelected(null);
            setBookmarkCfi(null);
          }}
          onToast={(t) => setToast(t)}
          bookmarkUpdateTrigger={bookmarkUpdateTrigger}
          bookmarkCfi={bookmarkCfi}
        />
      ) : (
        <Shelf
          books={books}
          onOpenBook={(b) => setSelected(b)}
          onReload={reload}
          onToast={(t) => setToast(t)}
          sortBy={prefs.sortBy}
          onSortChange={(sortBy) => onPrefsChange({ sortBy })}
          deleteMode={deleteMode}
          onEnterDeleteMode={() => setDeleteMode(true)}
          onExitDeleteMode={() => setDeleteMode(false)}
          onConfirm={(title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm })}
          currentUser={currentUser}
          isOffline={isOffline}
        />
      )}

      <Toast text={toast} />
      <ConfirmDialog
        open={confirmDialog?.open || false}
        title={confirmDialog?.title}
        message={confirmDialog?.message}
        onConfirm={() => {
          if (confirmDialog?.onConfirm) confirmDialog.onConfirm();
          setConfirmDialog(null);
        }}
        onCancel={() => {
          if (confirmDialog?.onCancel) confirmDialog.onCancel();
          setConfirmDialog(null);
        }}
      />

      <ShelfSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEnterDeleteMode={() => setDeleteMode(true)}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
        onConfirm={(title, message, onConfirm) => setConfirmDialog({ open: true, title, message, onConfirm })}
        currentUser={currentUser}
        onLogout={handleLogout}
      />

      {showAdminPanel && (
        <AdminPanel
          onClose={() => setShowAdminPanel(false)}
          onToast={(t) => setToast(t)}
        />
      )}

      <PWAInstallPrompt onToast={(t) => setToast(t)} />
    </div>
  );
}
