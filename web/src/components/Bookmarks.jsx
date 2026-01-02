import React, { useEffect, useState } from "react";
import { apiGetBookmarks, apiDeleteBookmark } from "../lib/api.js";

export default function Bookmarks({ books, onOpenBook, onClose, onToast }) {
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookmarks();
  }, []);

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
    if (!confirm("Delete this bookmark?")) return;
    
    try {
      await apiDeleteBookmark(bookmarkId);
      setBookmarks(bookmarks.filter(b => b.id !== bookmarkId));
      onToast?.("Bookmark deleted");
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
                  <span style={{fontSize: "20px"}}>🔖</span>
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

