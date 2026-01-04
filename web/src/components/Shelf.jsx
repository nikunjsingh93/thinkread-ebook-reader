import React, { useMemo, useRef, useState, useEffect } from "react";
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

export default function Shelf({ books, onOpenBook, onReload, onToast, sortBy, onSortChange, deleteMode, onEnterDeleteMode, onExitDeleteMode, onConfirm, currentUser }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  const [progressData, setProgressData] = useState({});

  useEffect(() => {
    function handleClickOutside(event) {
      if (sortDropdownOpen && !event.target.closest('.sort-dropdown')) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortDropdownOpen]);

  // Load progress data for all books
  useEffect(() => {
    const loadAllProgress = async () => {
      const progressPromises = books.map(async (book) => {
        try {
          const progress = await loadProgress(book.id);
          return { bookId: book.id, progress };
        } catch (err) {
          console.warn(`Failed to load progress for book ${book.id}:`, err);
          return { bookId: book.id, progress: null };
        }
      });

      const results = await Promise.all(progressPromises);
      const progressMap = {};
      results.forEach(({ bookId, progress }) => {
        progressMap[bookId] = progress;
      });
      setProgressData(progressMap);
    };

    if (books.length > 0) {
      loadAllProgress();
    }
  }, [books]);

  function toggleBookSelection(bookId) {
    const newSelected = new Set(selectedBooks);
    if (newSelected.has(bookId)) {
      newSelected.delete(bookId);
    } else {
      newSelected.add(bookId);
    }
    setSelectedBooks(newSelected);
  }

  function enterMultiSelectMode() {
    onEnterDeleteMode();
    setSelectedBooks(new Set());
  }

  function exitMultiSelectMode() {
    onExitDeleteMode();
    setSelectedBooks(new Set());
  }

  function selectAllBooks() {
    setSelectedBooks(new Set(filtered.map(b => b.id)));
  }

  function clearSelection() {
    setSelectedBooks(new Set());
  }

  async function deleteSelectedBooks() {
    if (selectedBooks.size === 0) return;

    const performDelete = async () => {
      try {
        for (const bookId of selectedBooks) {
          await apiDeleteBook(bookId);
        }
        setSelectedBooks(new Set());
        onExitDeleteMode();
        onReload?.();
        onToast?.(`Deleted ${selectedBooks.size} book(s)`);
      } catch (err) {
        onToast?.(err?.message || "Delete failed");
      }
    };

    const count = selectedBooks.size;
    const bookText = count === 1 ? "book" : "books";

    if (onConfirm) {
      onConfirm(
        "Delete Books",
        `Are you sure you want to delete ${count} ${bookText}?`,
        performDelete
      );
    } else {
      const confirmed = window.confirm(
        `Are you sure you want to delete ${count} ${bookText}?`
      );
      if (confirmed) {
        await performDelete();
      }
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filteredBooks = books;

    // Apply search filter
    if (q) {
      filteredBooks = books.filter(b => (b.title || b.originalName || "").toLowerCase().includes(q));
    }

    // Apply sorting
    filteredBooks = [...filteredBooks].sort((a, b) => {
      switch (sortBy) {
        case "alphabetical":
          return (a.title || a.originalName || "").localeCompare(b.title || b.originalName || "");
        case "lastOpened":
          // Sort by last opened (most recently read first, then books never opened)
          const aProgress = progressData[a.id];
          const bProgress = progressData[b.id];
          if (!aProgress && !bProgress) return 0;
          if (!aProgress) return 1; // Books never opened go to end
          if (!bProgress) return -1; // Books never opened go to end
          // Sort by most recent updatedAt first (descending)
          return (bProgress?.updatedAt || 0) - (aProgress?.updatedAt || 0);
        case "upload":
        default:
          // Sort by upload date (newest first)
          return (b.addedAt || 0) - (a.addedAt || 0);
      }
    });

    return filteredBooks;
  }, [books, query, sortBy, progressData]);

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
    const performDelete = async () => {
      try {
        await apiDeleteBook(id);
        onToast?.("Deleted");
        await onReload?.();
      } catch (err) {
        onToast?.(err?.message || "Delete failed");
      }
    };

    if (onConfirm) {
      onConfirm(
        "Delete Book",
        "Are you sure you want to delete this book from the shelf?",
        performDelete
      );
    } else {
      if (!confirm("Delete this book from the shelf?")) return;
      await performDelete();
    }
  }

  return (
    <div className="page">
      <div className="shelfHeader">
        {deleteMode ? (
          <>
            <div>
              <div style={{fontWeight: 800, fontSize: 18}}>
                Delete Books ({selectedBooks.size} selected)
              </div>
              <div className="muted" style={{fontSize: 12}}>
                Select books to delete
              </div>
            </div>

            <div style={{display:"flex", gap:10, alignItems:"center", flex: 1, minWidth: 0, justifyContent: "flex-end"}}>
              <button className="pill" onClick={selectAllBooks} style={{fontSize: "12px", padding: "4px 8px"}}>
                Select All
              </button>
              <button className="pill" onClick={clearSelection} style={{fontSize: "12px", padding: "4px 8px"}}>
                Clear
              </button>
              <button className="pill" onClick={exitMultiSelectMode} style={{fontSize: "12px", padding: "4px 8px"}}>
                Cancel
              </button>
              <button
                className="pill"
                onClick={deleteSelectedBooks}
                disabled={selectedBooks.size === 0}
                style={{
                  fontSize: "12px",
                  padding: "4px 8px",
                  opacity: selectedBooks.size === 0 ? 0.5 : 1
                }}
              >
                Delete ({selectedBooks.size})
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={{fontWeight: 800, fontSize: 18}}>
                Hi {currentUser?.username}, Your Library
              </div>
              <div className="muted" style={{fontSize: 12}}>
                {currentUser?.isAdmin ? `EPUB, MOBI ${books.length} books` : `${books.length} books`}
              </div>
            </div>

            <div style={{display:"flex", gap:10, alignItems:"center", flex: 1, minWidth: 0, justifyContent: "flex-end"}}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            style={{
              flex: 1,
              minWidth: 0,
              maxWidth: 220,
              border: `1px solid var(--search-border)`,
              background: "var(--search-bg)",
              color: "var(--text)",
              borderRadius: 999,
              padding: "10px 12px"
            }}
          />
          {currentUser?.isAdmin && (
            <button className="pill" onClick={pickFiles} disabled={uploading} style={{whiteSpace: "nowrap", flexShrink: 0}}>
              {uploading ? "Uploading…" : "Upload"}
            </button>
          )}
          <div style={{position: "relative"}} className="sort-dropdown">
            <button
              className="pill"
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              style={{padding: "8px", minWidth: "auto", flexShrink: 0}}
              title="Sort options"
            >
              ⇅
            </button>
            {sortDropdownOpen && (
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: "4px",
                background: "var(--drawer-bg)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "8px 0",
                minWidth: "160px",
                zIndex: 1000,
                boxShadow: "0 4px 12px rgba(0,0,0,0.3)"
              }}>
                <button
                  onClick={() => {
                    onSortChange("upload");
                    setSortDropdownOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 16px",
                    background: sortBy === "upload" ? "var(--row-bg)" : "transparent",
                    border: "none",
                    color: sortBy === "upload" ? "var(--text)" : "var(--muted)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "all 0.15s ease",
                    borderRadius: "4px"
                  }}
                  onMouseEnter={(e) => {
                    if (sortBy !== "upload") {
                      e.target.style.background = "var(--row-bg)";
                      e.target.style.color = "var(--text)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (sortBy !== "upload") {
                      e.target.style.background = "transparent";
                      e.target.style.color = "var(--muted)";
                    }
                  }}
                >
                  📅 Sort by Upload Date
                </button>
                <button
                  onClick={() => {
                    onSortChange("alphabetical");
                    setSortDropdownOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 16px",
                    background: sortBy === "alphabetical" ? "var(--row-bg)" : "transparent",
                    border: "none",
                    color: sortBy === "alphabetical" ? "var(--text)" : "var(--muted)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "all 0.15s ease",
                    borderRadius: "4px"
                  }}
                  onMouseEnter={(e) => {
                    if (sortBy !== "alphabetical") {
                      e.target.style.background = "var(--row-bg)";
                      e.target.style.color = "var(--text)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (sortBy !== "alphabetical") {
                      e.target.style.background = "transparent";
                      e.target.style.color = "var(--muted)";
                    }
                  }}
                >
                  🔤 Sort Alphabetically
                </button>
                <button
                  onClick={() => {
                    onSortChange("lastOpened");
                    setSortDropdownOpen(false);
                  }}
                  style={{
                    display: "block",
                    width: "100%",
                    padding: "8px 16px",
                    background: sortBy === "lastOpened" ? "var(--row-bg)" : "transparent",
                    border: "none",
                    color: sortBy === "lastOpened" ? "var(--text)" : "var(--muted)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontSize: "14px",
                    transition: "all 0.15s ease",
                    borderRadius: "4px"
                  }}
                  onMouseEnter={(e) => {
                    if (sortBy !== "lastOpened") {
                      e.target.style.background = "var(--row-bg)";
                      e.target.style.color = "var(--text)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (sortBy !== "lastOpened") {
                      e.target.style.background = "transparent";
                      e.target.style.color = "var(--muted)";
                    }
                  }}
                >
                  📖 Sort by Last Opened
                </button>
              </div>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".epub,.mobi"
            multiple
            onChange={onFileChange}
            style={{display:"none"}}
          />
        </div>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="muted" style={{padding: "18px 0"}}>
          {currentUser?.isAdmin ? (
            <>No books yet. Click <b>Upload</b> to add EPUB or MOBI files.</>
          ) : (
            <>No books yet. Contact an administrator to add books.</>
          )}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((b) => {
            const progress = progressData[b.id];
            const pct = progress?.percent != null ? Math.round(progress.percent * 100) : null;
            return (
              <div
                className={`card ${deleteMode ? 'multi-select' : ''}`}
                key={b.id}
                onClick={() => deleteMode ? toggleBookSelection(b.id) : onOpenBook(b)}
              >
                {deleteMode && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      zIndex: 10
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBooks.has(b.id)}
                      onChange={() => toggleBookSelection(b.id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '16px',
                        height: '16px',
                        accentColor: 'var(--accent, #007acc)'
                      }}
                    />
                  </div>
                )}
                <div className="cover">
                  {b.coverImage ? (
                    <img
                      src={`/api/books/${b.id}/cover`}
                      alt={`${b.title} cover`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '4px'
                      }}
                      onError={(e) => {
                        // Fallback to letter if image fails to load
                        e.target.style.display = 'none';
                        e.target.parentNode.textContent = coverLetter(b.title);
                      }}
                    />
                  ) : (
                    coverLetter(b.title)
                  )}
                </div>
                <div className="cardBody">
                  <div className="title" title={b.title}>{b.title}</div>
                  <div className="small">
                    {pct != null ? `Progress: ${pct}%` : "New"}{currentUser?.isAdmin ? ` • ${formatBytes(b.sizeBytes)}` : ""}
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
