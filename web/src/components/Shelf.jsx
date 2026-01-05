import React, { useMemo, useRef, useState, useEffect } from "react";
import { apiUploadBooks, apiDeleteBook } from "../lib/api.js";
import { loadProgress } from "../lib/storage.js";
import UploadProgress from "./UploadProgress.jsx";

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// Detect iOS devices
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
}

function coverLetter(title) {
  const t = (title || "").trim();
  return (t[0] || "📘").toUpperCase();
}

function formatDate(dateString) {
  if (!dateString) return "";

  try {
    // Handle different date formats that might come from EPUB metadata
    let date;

    // Try to parse as ISO date first
    date = new Date(dateString);

    // If that fails, try some common EPUB date formats
    if (isNaN(date.getTime())) {
      // Try YYYY-MM-DD format
      const isoMatch = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (isoMatch) {
        date = new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
      } else {
        // Try YYYY-MM format
        const yearMonthMatch = dateString.match(/^(\d{4})-(\d{2})/);
        if (yearMonthMatch) {
          date = new Date(parseInt(yearMonthMatch[1]), parseInt(yearMonthMatch[2]) - 1, 1);
        } else {
          // Try just YYYY format
          const yearMatch = dateString.match(/^(\d{4})/);
          if (yearMatch) {
            date = new Date(parseInt(yearMatch[1]), 0, 1);
          }
        }
      }
    }

    // Check if date is valid
    if (isNaN(date.getTime())) {
      return dateString; // Return original string if invalid date
    }

    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };

    return date.toLocaleDateString('en-US', options);
  } catch (error) {
    return dateString; // Return original string if parsing fails
  }
}

export default function Shelf({ books, onOpenBook, onReload, onToast, sortBy, onSortChange, deleteMode, onEnterDeleteMode, onExitDeleteMode, onConfirm, currentUser, isOffline }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [query, setQuery] = useState("");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [selectedBooks, setSelectedBooks] = useState(new Set());
  const [progressData, setProgressData] = useState({});
  const [progressLoading, setProgressLoading] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [bookDetailsModal, setBookDetailsModal] = useState(null); // { book, position }

  // Long press handling for book details
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (sortDropdownOpen && !event.target.closest('.sort-dropdown')) {
        setSortDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [sortDropdownOpen]);

  // Load progress data for all books (with Safari optimization)
  useEffect(() => {
    const loadAllProgress = async () => {
      setProgressLoading(true);

      // Safari performs better with smaller batches to avoid network congestion
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const batchSize = isSafari ? 5 : 20; // Smaller batches for Safari

      const progressMap = {};
      const batches = [];

      // Split books into batches
      for (let i = 0; i < books.length; i += batchSize) {
        batches.push(books.slice(i, i + batchSize));
      }

      // Process batches sequentially to avoid overwhelming Safari
      for (const batch of batches) {
        const progressPromises = batch.map(async (book) => {
          try {
            const progress = await loadProgress(book.id);
            return { bookId: book.id, progress };
          } catch (err) {
            // Reduce console noise for Safari network issues
            if (!isSafari) {
              console.warn(`Failed to load progress for book ${book.id}:`, err);
            }
            return { bookId: book.id, progress: null };
          }
        });

        const results = await Promise.all(progressPromises);
        results.forEach(({ bookId, progress }) => {
          progressMap[bookId] = progress;
        });

        // Update progress data incrementally for better UX
        setProgressData(prev => ({ ...prev, ...progressMap }));
      }

      setProgressLoading(false);
    };

    if (books.length > 0) {
      loadAllProgress();
    } else {
      setProgressLoading(false);
    }
    // Reset image loading counter when books change
    setImagesLoaded(0);
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

  // Long press handlers for book details
  function handleBookLongPressStart(book, event) {
    // Clear any existing timers
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    // Store the start position
    longPressStartRef.current = {
      x: event.clientX || (event.touches && event.touches[0].clientX),
      y: event.clientY || (event.touches && event.touches[0].clientY),
      time: Date.now()
    };

    // Set a timer for long press (shorter for mobile)
    const longPressDelay = isIOS() ? 500 : 700;
    longPressTimerRef.current = setTimeout(() => {
      // Show book details modal
      setBookDetailsModal({
        book,
        position: longPressStartRef.current
      });
    }, longPressDelay);
  }

  function handleBookLongPressEnd() {
    // Clear the timer if user releases before long press
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // Reset the start position
    longPressStartRef.current = null;
  }

  function handleBookLongPressMove(event) {
    // Cancel long press only if user moves finger/mouse significantly (indicating scroll)
    if (longPressStartRef.current && longPressTimerRef.current) {
      const currentX = event.clientX || (event.touches && event.touches[0].clientX);
      const currentY = event.clientY || (event.touches && event.touches[0].clientY);

      const deltaX = Math.abs(currentX - longPressStartRef.current.x);
      const deltaY = Math.abs(currentY - longPressStartRef.current.y);
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      // Only cancel long press if moved more than 10px (indicating scroll, not just finger jitter)
      if (distance > 10) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
        longPressStartRef.current = null; // Reset to prevent further checks
      }
    }
  }

  // Download book function
  function downloadBook(book) {
    const downloadUrl = `/api/books/${book.id}/file`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = book.originalName || `${book.title}.epub`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setBookDetailsModal(null);
  }

  function enterMultiSelectMode() {
    onEnterDeleteMode();
    setSelectedBooks(new Set());
  }

  function exitMultiSelectMode() {
    onExitDeleteMode();
    setSelectedBooks(new Set());
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
          // For lastOpened sorting, only sort if we have complete progress data
          // If progress is still loading, return 0 (no sorting) to show loading state
          const hasProgressData = Object.keys(progressData).length > 0 && !progressLoading;

          if (!hasProgressData) {
            // Don't sort yet - show loading state instead
            return 0;
          }

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
  }, [books, query, sortBy, progressData, progressLoading]);

  async function pickFiles() {
    inputRef.current?.click();
  }

  async function onFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    setUploading(true);
    setUploadProgress({
      percentage: 0,
      files: files.length,
      uploaded: 0,
      remaining: files.length
    });

    try {
      await apiUploadBooks(files, (progress) => {
        setUploadProgress(progress);
      });
      onToast?.(`Successfully uploaded ${files.length} book(s)`);
      await onReload?.();
    } catch (err) {
      onToast?.(err?.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(null);
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
                  opacity: selectedBooks.size === 0 ? 0.5 : 1,
                  backgroundColor: selectedBooks.size === 0 ? "#ffcccc" : "#ff4444",
                  color: "white",
                  border: "1px solid #cc0000"
                }}
              >
                Delete ({selectedBooks.size})
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={{fontWeight: 800, fontSize: 18, display: 'flex', alignItems: 'center', gap: '8px'}}>
                Hi {currentUser?.username}, Your Library
                {isOffline && (
                  <span style={{
                    background: 'var(--accent)',
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    OFFLINE
                  </span>
                )}
              </div>
              <div className="muted" style={{fontSize: 12}}>
                {currentUser?.isAdmin ?
                  `EPUB, MOBI ${books.length} Book${books.length !== 1 ? 's' : ''}${isOffline ? ' (cached)' : ''}` :
                  `${books.length} Book${books.length !== 1 ? 's' : ''}${isOffline ? ' (cached)' : ''}`
                }
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
          {isOffline ? (
            <>You're offline. No cached books available. Connect to the internet to view your library.</>
          ) : currentUser?.isAdmin ? (
            <>No books yet. Click <b>Upload</b> to add EPUB or MOBI files.</>
          ) : (
            <>No books yet. Contact an administrator to add books.</>
          )}
        </div>
      ) : (
        <>
          {/* Show loading progress for Safari within grid */}
          {/^((?!chrome|android).)*safari/i.test(navigator.userAgent) && imagesLoaded < filtered.length && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '12px',
              color: 'var(--muted)',
              fontSize: '12px',
              width: '100%',
              marginBottom: '8px'
            }}>
              Loading covers: {imagesLoaded}/{filtered.length}
            </div>
          )}

          {/* Show sorting loading indicator within the grid */}
          {sortBy === "lastOpened" && progressLoading && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              padding: '20px',
              color: 'var(--muted)',
              fontSize: '14px',
              width: '100%'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '16px',
                  height: '16px',
                  border: '2px solid var(--border)',
                  borderTop: '2px solid var(--accent, #007acc)',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                Loading reading progress...
              </div>
            </div>
          )}

          <div className="grid">
          {/* Only show books when sorting is complete */}
          {!(sortBy === "lastOpened" && progressLoading) && filtered.map((b) => {
            const progress = progressData[b.id];
            const pct = progress?.percent != null ? Math.round(progress.percent * 100) : null;
            return (
              <div
                className={`card ${deleteMode ? 'multi-select' : ''}`}
                key={b.id}
                onClick={() => deleteMode ? toggleBookSelection(b.id) : onOpenBook(b)}
                onMouseDown={(e) => !deleteMode && handleBookLongPressStart(b, e)}
                onMouseMove={(e) => !deleteMode && handleBookLongPressMove(e)}
                onMouseUp={() => !deleteMode && handleBookLongPressEnd()}
                onMouseLeave={() => !deleteMode && handleBookLongPressEnd()}
                onTouchStart={(e) => !deleteMode && handleBookLongPressStart(b, e)}
                onTouchMove={(e) => !deleteMode && handleBookLongPressMove(e)}
                onTouchEnd={() => !deleteMode && handleBookLongPressEnd()}
                onTouchCancel={() => !deleteMode && handleBookLongPressEnd()}
                onContextMenu={(e) => {
                  // Prevent right-click context menu
                  e.preventDefault();
                  e.stopPropagation();
                  return false;
                }}
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
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: '4px'
                      }}
                      onLoad={() => setImagesLoaded(prev => prev + 1)}
                      onError={(e) => {
                        // Fallback to letter if image fails to load
                        e.target.style.display = 'none';
                        e.target.parentNode.textContent = coverLetter(b.title);
                        setImagesLoaded(prev => prev + 1); // Count as loaded even on error
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
        </>
      )}

      <UploadProgress
        isVisible={uploading}
        progress={uploadProgress}
        onCancel={() => {
          // For now, we don't support cancelling uploads as it would require
          // modifying the XMLHttpRequest. We can add this later if needed.
          onToast?.("Cannot cancel upload in progress");
        }}
      />

      {/* CSS animation for loading spinner */}
      <style>
        {`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}
      </style>

      {/* Book Details Modal */}
      {bookDetailsModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '20px'
          }}
          onClick={() => setBookDetailsModal(null)}
        >
          <div
            style={{
              backgroundColor: 'var(--panel)',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto',
              border: '1px solid var(--border)',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, color: 'var(--text)', fontSize: '20px', fontWeight: '600' }}>
                Book Details
              </h2>
              <button
                onClick={() => setBookDetailsModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  color: 'var(--muted)',
                  padding: '0',
                  lineHeight: '1'
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
              <div style={{
                width: '80px',
                height: '120px',
                flexShrink: 0,
                borderRadius: '4px',
                overflow: 'hidden',
                backgroundColor: 'var(--row-bg)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {bookDetailsModal.book.coverImage ? (
                  <img
                    src={`/api/books/${bookDetailsModal.book.id}/cover`}
                    alt={`${bookDetailsModal.book.title} cover`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.parentNode.textContent = coverLetter(bookDetailsModal.book.title);
                    }}
                  />
                ) : (
                  coverLetter(bookDetailsModal.book.title)
                )}
              </div>

              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 8px 0', color: 'var(--text)', fontSize: '18px', fontWeight: '500' }}>
                  {bookDetailsModal.book.title}
                </h3>
                {bookDetailsModal.book.author && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--muted)', fontSize: '14px' }}>
                    Author: {bookDetailsModal.book.author}
                  </p>
                )}
                {bookDetailsModal.book.publisher && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--muted)', fontSize: '14px' }}>
                    Publisher: {bookDetailsModal.book.publisher}
                  </p>
                )}
                {bookDetailsModal.book.published && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--muted)', fontSize: '14px' }}>
                    Published: {formatDate(bookDetailsModal.book.published)}
                  </p>
                )}
                {bookDetailsModal.book.language && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--muted)', fontSize: '14px' }}>
                    Language: {bookDetailsModal.book.language}
                  </p>
                )}
                {bookDetailsModal.book.sizeBytes && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--muted)', fontSize: '14px' }}>
                    Size: {formatBytes(bookDetailsModal.book.sizeBytes)}
                  </p>
                )}
                {bookDetailsModal.book.addedAt && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--muted)', fontSize: '14px' }}>
                    Added: {new Date(bookDetailsModal.book.addedAt).toLocaleDateString()}
                  </p>
                )}
                {bookDetailsModal.book.cached && (
                  <p style={{ margin: '0 0 4px 0', color: 'var(--accent, #007acc)', fontSize: '14px', fontWeight: '500' }}>
                    ✓ Available offline
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => downloadBook(bookDetailsModal.book)}
                style={{
                  backgroundColor: 'var(--accent, #007acc)',
                  color: 'white',
                  border: 'none',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 10V16M12 16L9 13M12 16L15 13M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H14L19 8V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Download EPUB
              </button>
              <button
                onClick={() => setBookDetailsModal(null)}
                style={{
                  backgroundColor: 'transparent',
                  color: 'var(--muted)',
                  border: '1px solid var(--border)',
                  padding: '10px 16px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
