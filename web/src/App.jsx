import React, { useEffect, useState } from "react";
import Shelf from "./components/Shelf.jsx";
import Reader from "./components/Reader.jsx";
import Toast from "./components/Toast.jsx";
import ShelfSettingsDrawer from "./components/ShelfSettingsDrawer.jsx";
import { apiGetBooks } from "./lib/api.js";
import { loadPrefs, savePrefs } from "./lib/storage.js";

// Theme application function
function applyTheme(prefs) {
  const root = document.documentElement;
  const themeMode = prefs.themeMode || 'dark';

  if (themeMode === 'light') {
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
    root.style.setProperty('--progress-bg', 'rgba(0,0,0,0.3)');
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
  }
}

export default function App() {
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [prefs, setPrefs] = useState(loadPrefs());
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);

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

  // Apply theme when prefs change
  useEffect(() => {
    applyTheme(prefs);
  }, [prefs.themeMode]);


  function onPrefsChange(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  }

  return (
    <div className="appShell">
      {!selected && (
        <div className="topbar">
          <div className="brand">
            <span>ThinkRead</span>
          </div>
          <div style={{display: "flex", alignItems: "center", gap: "12px"}}>
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

      {selected ? (
        <Reader
          book={selected}
          prefs={prefs}
          onPrefsChange={onPrefsChange}
          onBack={() => {
            setSelected(null);
          }}
          onToast={(t) => setToast(t)}
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
        />
      )}

      <Toast text={toast} />

      <ShelfSettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onEnterDeleteMode={() => setDeleteMode(true)}
        prefs={prefs}
        onPrefsChange={onPrefsChange}
      />
    </div>
  );
}
