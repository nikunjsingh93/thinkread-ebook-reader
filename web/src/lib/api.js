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
    // On mobile, use local storage (mobile upload saves locally)
    const books = await mobile.mobileGetBooks();
    // Normalize format: mobile returns array, but API should return {books: []}
    return Array.isArray(books) ? { books } : books;
  }
  try {
    const r = await fetch("/api/books");
    if (!r.ok) {
      if (r.status === 401) throw new Error("Unauthorized");
      throw new Error("Failed to fetch books");
    }
    const data = await r.json();

    // Deep cache book metadata in both Service Worker and LocalStorage
    try {
      localStorage.setItem('ser:books_cache', JSON.stringify(data));
      console.log('[API] Books list cached to localStorage');
    } catch (e) {
      console.warn('[API] Failed to cache books to localStorage', e);
    }

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      data.books.forEach(book => {
        navigator.serviceWorker.controller.postMessage({
          type: 'CACHE_BOOK_METADATA',
          data: {
            bookId: book.id,
            metadata: {
              title: book.title,
              originalName: book.originalName,
              author: book.author,
              publisher: book.publisher,
              published: book.published,
              language: book.language,
              description: book.description,
              addedAt: book.addedAt,
              sizeBytes: book.sizeBytes,
              coverImage: book.coverImage
            }
          }
        });
      });
    }

    return data;
  } catch (error) {
    console.log('[API] Books fetch failed, checking offline fallbacks');

    // Fallback 1: Try Service Worker cache (even if navigator.onLine is true but fetch failed)
    try {
      const swResponse = await fetch("/api/books");
      if (swResponse.ok) {
        console.log('[API] Using Service Worker cache fallback for books');
        return await swResponse.json();
      }
    } catch (e) { }

    // Fallback 2: Try localStorage cache
    const local = localStorage.getItem('ser:books_cache');
    if (local) {
      console.log('[API] Using localStorage fallback for books');
      try {
        return JSON.parse(local);
      } catch (e) {
        console.error('[API] Corrupt localStorage cache');
      }
    }

    throw error;
  }
}

export async function apiUploadBooks(files, onProgress) {
  if (isElectron()) {
    // In Electron, filePaths is an array of file paths (strings)
    return await window.electronAPI.uploadBooks(files);
  }
  const mobile = await getMobileAPI();
  if (mobile && typeof mobile.mobileUploadBooks === 'function') {
    // On mobile, use mobile upload which saves files locally
    console.log('Using mobile upload function');
    return await mobile.mobileUploadBooks(files);
  }

  const fd = new FormData();
  for (const f of files) fd.append("files", f);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const percentComplete = (event.loaded / event.total) * 100;
        onProgress({
          loaded: event.loaded,
          total: event.total,
          percentage: Math.round(percentComplete),
          files: files.length,
          uploaded: 0, // Will be updated by server response
          remaining: files.length,
          phase: 'uploading'
        });
      }
    });

    xhr.upload.addEventListener('load', () => {
      // Upload complete, now server is processing
      if (onProgress) {
        onProgress({
          loaded: files.length,
          total: files.length,
          percentage: 100,
          files: files.length,
          uploaded: 0,
          remaining: files.length,
          phase: 'processing'
        });
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (onProgress) {
            onProgress({
              loaded: files.length,
              total: files.length,
              percentage: 100,
              files: files.length,
              uploaded: files.length,
              remaining: 0,
              phase: 'complete'
            });
          }
          resolve(data);
        } catch (error) {
          reject(new Error('Invalid response format'));
        }
      } else {
        try {
          const errorData = JSON.parse(xhr.responseText);
          reject(new Error(errorData?.error || `Upload failed with status ${xhr.status}`));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was cancelled'));
    });

    xhr.open('POST', '/api/upload');
    xhr.send(fd);
  });
}

export async function apiDeleteBook(id) {
  if (isElectron()) {
    return await window.electronAPI.deleteBook(id);
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileDeleteBook) {
    return await mobile.mobileDeleteBook(id);
  }
  const r = await fetch(`/api/books/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete failed");
  return r.json();
}

export async function apiGetFonts() {
  if (isElectron()) {
    return await window.electronAPI.getFonts();
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetFonts) {
    return await mobile.mobileGetFonts();
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
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileUploadFonts) {
    // On mobile, use mobile upload which saves files locally
    console.log('Using mobile font upload function');
    return await mobile.mobileUploadFonts(filePaths);
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
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileDeleteFont) {
    return await mobile.mobileDeleteFont(filename);
  }
  const r = await fetch(`/api/fonts/${filename}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Font delete failed");
  return r.json();
}


export async function apiGetDictionaryStatus() {
  if (isElectron()) {
    return await window.electronAPI.getDictionaryStatus();
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetDictionaryStatus) {
    return await mobile.mobileGetDictionaryStatus();
  }
  const r = await fetch("/api/dictionary/status");
  if (!r.ok) throw new Error("Failed to fetch dictionary status");
  return r.json();
}

export async function apiGetDictionary() {
  if (isElectron()) {
    return await window.electronAPI.getDictionary();
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetDictionary) {
    return await mobile.mobileGetDictionary();
  }
  const r = await fetch("/api/dictionary");
  if (!r.ok) throw new Error("Failed to fetch dictionary");
  return r.json();
}

export async function apiSaveDictionary(dictionary) {
  if (isElectron()) {
    return await window.electronAPI.saveDictionary(dictionary);
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileSaveDictionary) {
    return await mobile.mobileSaveDictionary(dictionary);
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
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileDeleteDictionary) {
    return await mobile.mobileDeleteDictionary();
  }
  const r = await fetch("/api/dictionary", { method: "DELETE" });
  if (!r.ok) throw new Error("Dictionary delete failed");
  return r.json();
}

export async function apiGetBookmarks() {
  if (isElectron()) {
    return await window.electronAPI.getBookmarks();
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetBookmarks) {
    const result = await mobile.mobileGetBookmarks();
    // Ensure we return {bookmarks: []} format
    return Array.isArray(result) ? { bookmarks: result } : result;
  }
  const r = await fetch("/api/bookmarks");
  if (!r.ok) throw new Error("Failed to fetch bookmarks");
  return r.json();
}

export async function apiSaveBookmark(bookmark) {
  if (isElectron()) {
    return await window.electronAPI.saveBookmark(bookmark);
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileSaveBookmark) {
    return await mobile.mobileSaveBookmark(bookmark);
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
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileDeleteBookmark) {
    return await mobile.mobileDeleteBookmark(id);
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
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetBookFileUrl) {
    return await mobile.mobileGetBookFileUrl(bookId);
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
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetBookCoverUrl) {
    return await mobile.mobileGetBookCoverUrl(bookId);
  }
  return `/api/books/${bookId}/cover`;
}

// Helper function to get font file URL
export async function apiGetFontFileUrl(filename) {
  if (isElectron()) {
    return await window.electronAPI.getFontFilePath(filename);
  }
  const mobile = await getMobileAPI();
  if (mobile && mobile.mobileGetFontFileUrl) {
    return await mobile.mobileGetFontFileUrl(filename);
  }
  return `/api/fonts/${filename}`;
}

// --- Authentication API ---
export async function apiLogin(username, password) {
  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Login failed");
  return data;
}

export async function apiLogout() {
  const r = await fetch("/api/logout", { method: "POST" });
  if (!r.ok) throw new Error("Logout failed");
  return r.json();
}

export async function apiGetCurrentUser() {
  const r = await fetch("/api/current-user");
  if (!r.ok) throw new Error("Failed to get current user");
  return r.json();
}

// --- User Management API (Admin Only) ---
export async function apiGetUsers() {
  const r = await fetch("/api/users");
  if (!r.ok) throw new Error("Failed to fetch users");
  return r.json();
}

export async function apiCreateUser(userData) {
  const r = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userData),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Create user failed");
  return data;
}

export async function apiDeleteUser(userId) {
  const r = await fetch(`/api/users/${userId}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete user failed");
  return r.json();
}

// --- TTS API ---
export async function apiGetTTSVoices() {
  const r = await fetch("/api/tts/voices");
  if (!r.ok) throw new Error("Failed to fetch TTS voices");
  return r.json();
}

export async function apiGenerateTTS(text, options = {}) {
  const { voice, rate = 1.0, pitch = 1.0, lang = 'en-US' } = options;

  const r = await fetch("/api/tts/speak", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice, rate, pitch, lang }),
  });

  if (!r.ok) {
    const error = await r.json().catch(() => ({}));
    throw new Error(error?.error || "TTS generation failed");
  }

  // Return the audio blob
  return await r.blob();
}

// --- TTS Progress API ---
export async function apiGetTTSProgress(bookId) {
  if (isMobile()) {
    try {
      const data = localStorage.getItem(`tts_progress_${bookId}`);
      return data ? JSON.parse(data) : null;
    } catch { return null; }
  }
  const r = await fetch(`/api/tts/progress/${bookId}`);
  if (!r.ok) throw new Error("Failed to fetch TTS progress");
  return r.json();
}

export async function apiSaveTTSProgress(bookId, progress) {
  if (isMobile()) {
    localStorage.setItem(`tts_progress_${bookId}`, JSON.stringify(progress));
    return { success: true };
  }
  const r = await fetch(`/api/tts/progress/${bookId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(progress),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "TTS progress save failed");
  return data;
}

export async function apiDeleteTTSProgress(bookId) {
  if (isMobile()) {
    localStorage.removeItem(`tts_progress_${bookId}`);
    return { success: true };
  }
  const r = await fetch(`/api/tts/progress/${bookId}`, { method: "DELETE" });
  if (!r.ok) throw new Error("TTS progress delete failed");
  return r.json();
}
