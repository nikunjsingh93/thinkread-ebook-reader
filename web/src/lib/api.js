export async function apiGetBooks() {
  const r = await fetch("/api/books");
  if (!r.ok) throw new Error("Failed to fetch books");
  return r.json();
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
