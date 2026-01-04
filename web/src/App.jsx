import React, { useEffect, useState } from "react";
import Shelf from "./components/Shelf.jsx";
import Reader from "./components/Reader.jsx";
import Toast from "./components/Toast.jsx";
import ShelfSettingsDrawer from "./components/ShelfSettingsDrawer.jsx";
import Bookmarks from "./components/Bookmarks.jsx";
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import MacTitleBar from "./components/MacTitleBar.jsx";
import { apiGetBooks } from "./lib/api.js";
import { loadPrefs, savePrefs } from "./lib/storage.js";
import { ScreenOrientation } from "@capacitor/screen-orientation";
import { Capacitor, registerPlugin } from "@capacitor/core";
import { App as CapacitorApp } from "@capacitor/app";

// Register custom orientation lock plugin
const OrientationLock = registerPlugin('OrientationLock');
// Register volume key plugin
const VolumeKey = registerPlugin('VolumeKey');

// Fallback function for synchronous defaults (for error cases)
function defaultPrefs() {
  return {
    fontFamily: "literata",
    fontSize: 18,
    fontWeight: 400,
    lineHeight: 1.6,
    textAlign: "justify",
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
    orientationMode: "portrait", // "portrait", "landscape", "reverse-landscape"
    volumeKeyBehavior: "media", // "media", "volumeDownNext", or "volumeUpNext"
    bookDisplayMode: "scroll", // "scroll" or "pagination" - only applies to non-eink themes
  };
}

// Theme application function
function applyTheme(prefs) {
  const root = document.documentElement;
  const body = document.body;
  const themeMode = prefs.themeMode || 'pure-white';
  
  // Add/remove eink-theme class for animation removal
  if (themeMode === 'eink') {
    body.classList.add('eink-theme');
  } else {
    body.classList.remove('eink-theme');
  }

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
  const [readerUiVisible, setReaderUiVisible] = useState(true);

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

  // Handle Android back button (only when not in Reader - Reader handles its own back button)
  useEffect(() => {
    const isMobile = Capacitor.isNativePlatform();
    if (!isMobile) return;

    const backButtonListener = CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      // Don't handle back button when in Reader - let Reader component handle it
      if (selected) {
        return; // Reader will handle this
      }
      
      // If settings drawer is open, close it
      if (settingsOpen) {
        setSettingsOpen(false);
        return;
      }
      
      // If bookmarks are open, close them
      if (showBookmarks) {
        setShowBookmarks(false);
        return;
      }
      
      // Otherwise, exit the app (default behavior)
      CapacitorApp.exitApp();
    });

    return () => {
      backButtonListener.then(listener => listener.remove());
    };
  }, [settingsOpen, showBookmarks, selected]);

  useEffect(() => {
    let t;
    if (toast) t = setTimeout(() => setToast(""), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  async function reload() {
    try {
      const data = await apiGetBooks();
      setBooks(data.books || []);
    } catch (err) {
      console.error('Failed to load books:', err);
      setToast(err?.message || "Failed to load books");
      setBooks([]); // Set empty array on error
    }
  }

  useEffect(() => {
    // Wait a bit for Electron API to be ready
    const timer = setTimeout(() => {
      reload();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Load preferences on mount
  useEffect(() => {
    // Wait a bit for Electron API to be ready
    const timer = setTimeout(() => {
      loadPrefs().then((loadedPrefs) => {
        if (loadedPrefs) {
          setPrefs(loadedPrefs);
          // Set volume key behavior after prefs are loaded
          const isMobile = Capacitor.isNativePlatform();
          if (isMobile && VolumeKey && VolumeKey.setBehavior) {
            const volumeKeyBehavior = loadedPrefs.volumeKeyBehavior || "media";
            setTimeout(() => {
              VolumeKey.setBehavior({ behavior: volumeKeyBehavior })
                .then(() => {
                  console.log('Volume key behavior initialized:', volumeKeyBehavior);
                })
                .catch(err => {
                  console.warn('Failed to initialize volume key behavior:', err);
                });
            }, 1500); // Wait for Capacitor bridge to be fully ready
          }
        }
      }).catch((err) => {
        console.warn('Failed to load preferences:', err);
        // Keep default prefs that are already set
      });
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Apply theme when prefs change
  useEffect(() => {
    applyTheme(prefs);
  }, [prefs.themeMode]);

  // Set volume key behavior when prefs change (for Android)
  useEffect(() => {
    const isMobile = Capacitor.isNativePlatform();
    if (!isMobile) return;

    // Wait a bit for bridge to be ready
    const timer = setTimeout(() => {
      const volumeKeyBehavior = prefs.volumeKeyBehavior || "media";
      console.log('Setting volume key behavior in App:', volumeKeyBehavior);
      
      // Try plugin first
      if (VolumeKey && typeof VolumeKey.setBehavior === 'function') {
        VolumeKey.setBehavior({ behavior: volumeKeyBehavior })
          .then(() => {
            console.log('Volume key behavior set via plugin in App:', volumeKeyBehavior);
          })
          .catch(err => {
            console.warn('Failed to set volume key behavior via plugin, using injection:', err);
            setVolumeKeyBehaviorViaInjection(volumeKeyBehavior);
          });
      } else {
        // Use JavaScript injection as fallback
        setVolumeKeyBehaviorViaInjection(volumeKeyBehavior);
      }
    }, 1500); // Wait 1.5 seconds for Capacitor bridge to be ready

    return () => clearTimeout(timer);
  }, [prefs.volumeKeyBehavior]);

  // Fallback: Set volume key behavior via JavaScript injection
  function setVolumeKeyBehaviorViaInjection(behavior) {
    try {
      // Try multiple times with delays
      const trySet = (attempt = 0) => {
        if (window.VolumeKeyNative && typeof window.VolumeKeyNative.setBehavior === 'function') {
          window.VolumeKeyNative.setBehavior(behavior);
          console.log('Volume key behavior set via JavaScript interface in App:', behavior);
          return;
        }
        
        if (window.setVolumeKeyBehavior && typeof window.setVolumeKeyBehavior === 'function') {
          window.setVolumeKeyBehavior(behavior);
          console.log('Volume key behavior set via global function in App:', behavior);
          return;
        }
        
        if (attempt < 5) {
          setTimeout(() => trySet(attempt + 1), 500);
        } else {
          console.warn('VolumeKeyNative interface not available in App after multiple attempts');
        }
      };
      
      trySet();
    } catch (err) {
      console.warn('Failed to set volume key behavior via injection:', err);
    }
  }

  // Listen for fullscreen changes
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle orientation mode changes (always locked, user selects which orientation)
  const handleOrientationChange = async (orientationMode) => {
    const isMobile = Capacitor.isNativePlatform();
    
    try {
      if (isMobile) {
        // Use custom plugin to set orientation
        console.log('Setting orientation to:', orientationMode);
        try {
          await OrientationLock.setOrientation({ orientation: orientationMode });
        } catch (err) {
          console.error('Failed to set orientation:', err);
        }
      } else {
        // Use web Screen Orientation API for desktop/web
        if (!screen?.orientation || typeof screen.orientation.lock !== 'function') {
          return;
        }

        let orientationToLock;
        if (orientationMode === 'portrait') {
          orientationToLock = 'portrait-primary';
        } else if (orientationMode === 'landscape') {
          orientationToLock = 'landscape-primary';
        } else if (orientationMode === 'reverse-landscape') {
          orientationToLock = 'landscape-secondary';
        } else {
          orientationToLock = 'portrait-primary';
        }

        const lockPromise = screen.orientation.lock(orientationToLock);
        if (lockPromise && typeof lockPromise.catch === 'function') {
          await lockPromise;
        }
      }
    } catch (err) {
      console.error('Orientation change error:', err);
    }
  };

  // Apply orientation mode on mount and when preference changes
  useEffect(() => {
    const isMobile = Capacitor.isNativePlatform();
    if (!isMobile) return;
    
    const orientationMode = prefs.orientationMode || 'portrait';
    
    // Apply orientation immediately
    const applyOrientation = async () => {
      try {
        if (isMobile) {
          // Use custom plugin to set orientation
          console.log('Setting orientation to:', orientationMode);
          try {
            await OrientationLock.setOrientation({ orientation: orientationMode });
          } catch (err) {
            console.error('Failed to set orientation:', err);
          }
        }
      } catch (err) {
        console.error('Orientation change error:', err);
      }
    };
    
    applyOrientation();
    
    // Listen for orientation changes and re-apply if needed
    let lockTimeout = null;
    const orientationChangeHandler = () => {
      // Clear any pending lock
      if (lockTimeout) {
        clearTimeout(lockTimeout);
      }
      
      // Re-apply orientation after a short delay
      lockTimeout = setTimeout(() => {
        applyOrientation();
      }, 50);
    };
    
    // Listen for orientation changes
    window.addEventListener('orientationchange', orientationChangeHandler);
    window.addEventListener('resize', orientationChangeHandler);
    
    return () => {
      if (lockTimeout) {
        clearTimeout(lockTimeout);
      }
      window.removeEventListener('orientationchange', orientationChangeHandler);
      window.removeEventListener('resize', orientationChangeHandler);
    };
  }, [prefs.orientationMode]);


  async function onPrefsChange(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    
    // Handle orientation mode change
    if ('orientationMode' in patch) {
      await handleOrientationChange(patch.orientationMode);
    }
    
    try {
      await savePrefs(next);
    } catch (err) {
      console.warn('Failed to save preferences:', err);
    }
  }

  // Check if we're in Electron on macOS to add padding for title bar
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const isMac = typeof navigator !== 'undefined' && 
    (navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
     navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
  const needsTitleBarPadding = isElectron && isMac;

  return (
    <div className="appShell">
      <MacTitleBar hidden={selected && !readerUiVisible} prefs={prefs} />
      {!selected && (
        <div 
          className="topbar"
          style={needsTitleBarPadding ? { 
            marginTop: '28px',
          } : {}}
        >
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
            {isFullscreen && !Capacitor.isNativePlatform() && (
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
          open={showBookmarks}
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
                  setReaderUiVisible(true); // Reset UI visibility when leaving reader
                }}
                onToast={(t) => setToast(t)}
                bookmarkUpdateTrigger={bookmarkUpdateTrigger}
                bookmarkCfi={bookmarkCfi}
                onUiVisibleChange={setReaderUiVisible}
                onBookmarkChange={() => {
                  // Trigger bookmark check in Reader when bookmark is added/deleted
                  setBookmarkUpdateTrigger(prev => prev + 1);
                }}
              />
      ) : (
        <Shelf prefs={prefs}
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
      />
    </div>
  );
}
