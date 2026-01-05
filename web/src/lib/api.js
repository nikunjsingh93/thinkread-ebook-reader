export async function apiGetBooks() {
  try {
    const r = await fetch("/api/books");
    if (!r.ok) throw new Error("Failed to fetch books");
    const data = await r.json();

    // Cache book metadata for offline use
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
    // If offline, try to get cached books from service worker
    if (!navigator.onLine) {
      console.log('Offline - attempting to get cached books');
      // The service worker will handle this and return cached books
      const r = await fetch("/api/books");
      if (r.ok) return r.json();
    }
    throw error;
  }
}

export async function apiUploadBooks(files, onProgress) {
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
  const r = await fetch(`/api/books/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Delete failed");
  return r.json();
}

export async function apiGetFonts() {
  const r = await fetch("/api/fonts");
  if (!r.ok) throw new Error("Failed to fetch fonts");
  return r.json();
}

export async function apiUploadFonts(files) {
  const fd = new FormData();
  for (const f of files) fd.append("fonts", f);
  const r = await fetch("/api/fonts/upload", { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Font upload failed");
  return data;
}

export async function apiDeleteFont(filename) {
  const r = await fetch(`/api/fonts/${filename}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Font delete failed");
  return r.json();
}

export async function apiGetFontFileUrl(filename) {
  const r = await fetch(`/api/fonts/${filename}/file`);
  if (!r.ok) throw new Error("Failed to get font file URL");
  return r.text();
}

export async function apiGetDictionaryStatus() {
  const r = await fetch("/api/dictionary/status");
  if (!r.ok) throw new Error("Failed to fetch dictionary status");
  return r.json();
}

export async function apiGetDictionary() {
  const r = await fetch("/api/dictionary");
  if (!r.ok) throw new Error("Failed to fetch dictionary");
  return r.json();
}

export async function apiSaveDictionary(dictionary) {
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
  const r = await fetch("/api/dictionary", { method: "DELETE" });
  if (!r.ok) throw new Error("Dictionary delete failed");
  return r.json();
}

export async function apiGetBookmarks() {
  const r = await fetch("/api/bookmarks");
  if (!r.ok) throw new Error("Failed to fetch bookmarks");
  return r.json();
}

export async function apiSaveBookmark(bookmark) {
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
  const r = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("Bookmark delete failed");
  return r.json();
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
