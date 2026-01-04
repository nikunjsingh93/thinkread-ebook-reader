export async function apiGetBooks() {
  try {
    const r = await fetch("/api/books");
    if (!r.ok) throw new Error("Failed to fetch books");
    return r.json();
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

export async function apiUploadBooks(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data?.error || "Upload failed");
  return data;
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
