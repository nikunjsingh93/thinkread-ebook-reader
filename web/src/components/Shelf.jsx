import React, { useMemo, useRef, useState } from "react";
import { apiUploadBooks, apiDeleteBook } from "../lib/api.js";
import { loadProgress } from "../lib/storage.js";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function coverLetter(title) {
  const t = (title || "").trim();
  return (t[0] || "📘").toUpperCase();
}

export default function Shelf({ books, onOpenBook, onReload, onToast }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return books;
    return books.filter(b => (b.title || b.originalName || "").toLowerCase().includes(q));
  }, [books, query]);

  async function pickFiles() {
    inputRef.current?.click();
  }

  async function onFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true);
    try {
      await apiUploadBooks(files);
      onToast?.(`Uploaded ${files.length} book(s)`);
      await onReload?.();
    } catch (err) {
      onToast?.(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function deleteBook(id) {
    if (!confirm("Delete this book from the shelf?")) return;
    try {
      await apiDeleteBook(id);
      onToast?.("Deleted");
      await onReload?.();
    } catch (err) {
      onToast?.(err?.message || "Delete failed");
    }
  }

  return (
    <div className="page">
      <div className="shelfHeader">
        <div>
          <div style={{fontWeight: 800, fontSize: 18}}>Your Library</div>
          <div className="muted" style={{fontSize: 12}}>
            EPUB only • {books.length} book(s)
          </div>
        </div>

        <div style={{display:"flex", gap:10, alignItems:"center"}}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              width: 220,
              border: "1px solid rgba(255,255,255,.12)",
              background: "rgba(18,22,38,.55)",
              color: "var(--text)",
              borderRadius: 999,
              padding: "10px 12px"
            }}
          />
          <button className="pill" onClick={pickFiles} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".epub"
            multiple
            onChange={onFileChange}
            style={{display:"none"}}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="muted" style={{padding: "18px 0"}}>
          No books yet. Click <b>Upload</b> to add EPUB files.
        </div>
      ) : (
        <div className="grid">
          {filtered.map((b) => {
            const progress = loadProgress(b.id);
            const pct = progress?.percent != null ? Math.round(progress.percent * 100) : null;
            return (
              <div className="card" key={b.id} onClick={() => onOpenBook(b)}>
                <button
                  className="kebab"
                  onClick={(e) => { e.stopPropagation(); deleteBook(b.id); }}
                  title="Delete"
                  aria-label="Delete"
                >
                  ✕
                </button>
                <div className="cover">{coverLetter(b.title)}</div>
                <div className="cardBody">
                  <div className="title" title={b.title}>{b.title}</div>
                  <div className="small">
                    {pct != null ? `Progress: ${pct}%` : "New"} • {formatBytes(b.sizeBytes)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
