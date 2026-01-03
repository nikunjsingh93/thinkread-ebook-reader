// Check if we're running in Electron (dynamic check)
function isElectron() {
  return typeof window !== 'undefined' && window.electronAPI;
}

// Check if we're running on mobile (Capacitor)
function isMobile() {
  try {
    return typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

// Import mobile API functions (lazy load to avoid errors in non-mobile environments)
let mobileAPI = null;
async function getMobileAPI() {
  if (!isMobile()) return null;
  if (!mobileAPI) {
    try {
      mobileAPI = await import('./mobile-api.js');
    } catch (e) {
      console.warn('Mobile API not available:', e);
      return null;
    }
  }
  return mobileAPI;
}

export async function apiGetBooks() {
  if (isElectron()) {
    return await window.electronAPI.getBooks();
  }
  const mobile = await getMobileAPI();
  if (mobile) {
    return await mobile.mobileGetBooks();
  }
  const r = await fetch("/api/books");
  if (!r.ok) throw new Error("Failed to fetch books");
  return r.json();
}

export async function apiUploadBooks(filePaths) {
  if (isElectron()) {
    // In Electron, filePaths is an array of file paths (strings)
    return await window.electronAPI.uploadBooks(filePaths);
  }
  // Fallback for web version - filePaths is an array of File objects
  const fd = new FormData();
  for (const f of filePaths) fd.append("files", f);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Upload failed");
  return data;
}

export async function apiDeleteBook(id) {
  if (isElectron()) {
    return await window.electronAPI.deleteBook(id);
  }
  const r = await fetch(`/api/books/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete failed");
  return r.json();
}

export async function apiGetFonts() {
  if (isElectron()) {
    return await window.electronAPI.getFonts();
  }
  const r = await fetch("/api/fonts");
  if (!r.ok) throw new Error("Failed to fetch fonts");
  return r.json();
}

export async function apiUploadFonts(filePaths) {
  if (isElectron()) {
    // In Electron, filePaths is an array of file paths (strings)
    return await window.electronAPI.uploadFonts(filePaths);
  }
  // Fallback for web version - filePaths is an array of File objects
  const fd = new FormData();
  for (const f of filePaths) fd.append("fonts", f);
  const r = await fetch("/api/fonts/upload", { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Font upload failed");
  return data;
}

export async function apiDeleteFont(filename) {
  if (isElectron()) {
    return await window.electronAPI.deleteFont(filename);
  }
  const r = await fetch(`/api/fonts/${filename}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Font delete failed");
  return r.json();
}

export async function apiGetDictionaryStatus() {
  if (isElectron()) {
    return await window.electronAPI.getDictionaryStatus();
  }
  const r = await fetch("/api/dictionary/status");
  if (!r.ok) throw new Error("Failed to fetch dictionary status");
  return r.json();
}

export async function apiGetDictionary() {
  if (isElectron()) {
    return await window.electronAPI.getDictionary();
  }
  const r = await fetch("/api/dictionary");
  if (!r.ok) throw new Error("Failed to fetch dictionary");
  return r.json();
}

export async function apiSaveDictionary(dictionary) {
  if (isElectron()) {
    return await window.electronAPI.saveDictionary(dictionary);
  }
  const r = await fetch("/api/dictionary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(dictionary),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Dictionary save failed");
  return data;
}

export async function apiDeleteDictionary() {
  if (isElectron()) {
    return await window.electronAPI.deleteDictionary();
  }
  const r = await fetch("/api/dictionary", { method: "DELETE" });
  if (!r.ok) throw new Error("Dictionary delete failed");
  return r.json();
}

export async function apiGetBookmarks() {
  if (isElectron()) {
    return await window.electronAPI.getBookmarks();
  }
  const r = await fetch("/api/bookmarks");
  if (!r.ok) throw new Error("Failed to fetch bookmarks");
  return r.json();
}

export async function apiSaveBookmark(bookmark) {
  if (isElectron()) {
    return await window.electronAPI.saveBookmark(bookmark);
  }
  const r = await fetch("/api/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bookmark),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Bookmark save failed");
  return data;
}

export async function apiDeleteBookmark(id) {
  if (isElectron()) {
    return await window.electronAPI.deleteBookmark(id);
  }
  const r = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Bookmark delete failed");
  return r.json();
}

// Helper function to get book file URL (for epub.js)
export async function apiGetBookFileUrl(bookId) {
  if (isElectron()) {
    return await window.electronAPI.getBookFilePath(bookId);
  }
  return `/api/books/${bookId}/file`;
}

// Helper function to get book cover URL
export async function apiGetBookCoverUrl(bookId) {
  if (isElectron()) {
    try {
      return await window.electronAPI.getBookCoverPath(bookId);
    } catch (err) {
      return null; // Cover not found
    }
  }
  return `/api/books/${bookId}/cover`;
}

// Helper function to get font file URL
export async function apiGetFontFileUrl(filename) {
  if (isElectron()) {
    return await window.electronAPI.getFontFilePath(filename);
  }
  return `/api/fonts/${filename}`;
}
