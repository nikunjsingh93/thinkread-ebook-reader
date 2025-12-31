import React, { useEffect, useState } from "react";
import Shelf from "./components/Shelf.jsx";
import Reader from "./components/Reader.jsx";
import Toast from "./components/Toast.jsx";
import { apiGetBooks } from "./lib/api.js";
import { loadPrefs, savePrefs } from "./lib/storage.js";

export default function App() {
  const [books, setBooks] = useState([]);
  const [selected, setSelected] = useState(null);
  const [prefs, setPrefs] = useState(loadPrefs());
  const [toast, setToast] = useState("");
  const [readerFullscreen, setReaderFullscreen] = useState(false);

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

  // Reset fullscreen state when book selection changes
  useEffect(() => {
    if (selected) {
      setReaderFullscreen(false);
    }
  }, [selected]);

  function onPrefsChange(patch) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    savePrefs(next);
  }

  return (
    <div className={`appShell ${readerFullscreen ? 'readerFullscreen' : ''}`}>
      {!readerFullscreen && (
        <div className="topbar">
          <div className="brand">
            <span style={{display:"inline-flex", width: 10, height: 10, borderRadius: 999, background: "var(--accent)"}} />
            <span>ThinkRead</span>
          </div>
          <div className="muted" style={{fontSize: 12}}>
            {selected ? "Reading" : "Shelf"}
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
            setReaderFullscreen(false);
          }}
          onToast={(t) => setToast(t)}
          onFullscreenChange={setReaderFullscreen}
        />
      ) : (
        <Shelf
          books={books}
          onOpenBook={(b) => setSelected(b)}
          onReload={reload}
          onToast={(t) => setToast(t)}
        />
      )}

      <Toast text={toast} />
    </div>
  );
}
