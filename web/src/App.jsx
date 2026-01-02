import React, { useEffect, useState } from "react";
import Shelf from "./components/Shelf.jsx";
import Reader from "./components/Reader.jsx";
import Toast from "./components/Toast.jsx";
import ShelfSettingsDrawer from "./components/ShelfSettingsDrawer.jsx";
import { apiGetBooks } from "./lib/api.js";
import { loadPrefs, savePrefs } from "./lib/storage.js";

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
      />
    </div>
  );
}
