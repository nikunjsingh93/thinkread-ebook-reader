import React, { useEffect, useState } from "react";
import { apiGetBookmarks, apiDeleteBookmark } from "../lib/api.js";

export default function Bookmarks({ books, onOpenBook, onClose, onToast, onBookmarkChange, onConfirm, open }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, []);

  // Reload bookmarks when component becomes visible (when opened)
  useEffect(() => {
    if (open) {
      loadBookmarks();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadBookmarks() {
    try {
      setLoading(true);
      const data = await apiGetBookmarks();
      // Sort by most recent first
      const sorted = (data.bookmarks || []).sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
      setBookmarks(sorted);
    } catch (err) {
      console.error("Failed to load bookmarks:", err);
      onToast?.("Failed to load bookmarks");
    } finally {
      setLoading(false);
    }
  }

  async function deleteBookmark(bookmarkId) {
    if (!onConfirm) {
      if (!confirm("Delete this bookmark?")) return;
    } else {
      onConfirm(
        "Delete Bookmark",
        "Are you sure you want to delete this bookmark?",
        async () => {
          try {
            await apiDeleteBookmark(bookmarkId);
            // Reload from server to ensure sync
            await loadBookmarks();
            onToast?.("Bookmark deleted");
            // Notify parent that bookmarks changed
            if (onBookmarkChange) onBookmarkChange();
          } catch (err) {
            console.error("Failed to delete bookmark:", err);
            onToast?.("Failed to delete bookmark");
          }
        }
      );
      return;
    }
    
    try {
      await apiDeleteBookmark(bookmarkId);
      // Reload from server to ensure sync
      await loadBookmarks();
      onToast?.("Bookmark deleted");
      // Notify parent that bookmarks changed
      if (onBookmarkChange) onBookmarkChange();
    } catch (err) {
      console.error("Failed to delete bookmark:", err);
      onToast?.("Failed to delete bookmark");
    }
  }

  function handleBookmarkClick(bookmark) {
    const book = books.find(b => b.id === bookmark.bookId);
    if (!book) {
      onToast?.("Book not found");
      return;
    }
    
    // Store bookmark CFI in a way the Reader can access it
    // We'll pass it as a prop or use a different approach
    onOpenBook(book, bookmark.cfi);
    onClose();
  }

  return (
    <div className="page">
      <div className="shelfHeader">
        <div>
          <div style={{fontWeight: 800, fontSize: 18}}>All Bookmarks</div>
          <div className="muted" style={{fontSize: 12}}>
            {bookmarks.length} bookmark(s)
          </div>
        </div>
        <button className="pill" onClick={onClose}>Close</button>
      </div>

      {loading ? (
        <div className="muted" style={{padding: "18px 0", textAlign: "center"}}>
          Loading bookmarks...
        </div>
      ) : bookmarks.length === 0 ? (
        <div className="muted" style={{padding: "18px 0", textAlign: "center"}}>
          No bookmarks yet. Add bookmarks while reading to see them here.
        </div>
      ) : (
        <div style={{display: "flex", flexDirection: "column", gap: "8px", padding: "8px 0"}}>
          {bookmarks.map((bookmark) => {
            const book = books.find(b => b.id === bookmark.bookId);
            return (
              <div
                key={bookmark.id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 16px",
                  cursor: "pointer"
                }}
                onClick={() => handleBookmarkClick(bookmark)}
              >
                <div style={{flex: 1, minWidth: 0}}>
                  <div style={{fontWeight: 600, fontSize: 14, marginBottom: "4px"}}>
                    {bookmark.bookTitle || book?.title || "Unknown Book"}
                  </div>
                  <div className="muted" style={{fontSize: 12}}>
                    {bookmark.page ? `Page ${bookmark.page}` : `${Math.round((bookmark.percent || 0) * 100)}%`}
                  </div>
                </div>
                <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 2C3 1.44772 3.44772 1 4 1H12C12.5523 1 13 1.44772 13 2V13C13 13.2652 12.8946 13.5196 12.7071 13.7071C12.5196 13.8946 12.2652 14 12 14C11.7348 14 11.4804 13.8946 11.2929 13.7071L8 10.4142L4.70711 13.7071C4.51957 13.8946 4.26522 14 4 14C3.73478 14 3.48043 13.8946 3.29289 13.7071C3.10536 13.5196 3 13.2652 3 13V2Z" fill="#dc2626" stroke="#dc2626" strokeWidth="0.5"/>
                  </svg>
                  <button
                    className="pill"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBookmark(bookmark.id);
                    }}
                    style={{
                      padding: "4px 8px",
                      fontSize: "12px",
                      opacity: 0.7
                    }}
                    title="Delete bookmark"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

