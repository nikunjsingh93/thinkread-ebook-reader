import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let db = null;
let dbPath = null;
let dataDir = null;

export function initDatabase(dir) {
  if (db) return db;
  
  dataDir = dir;
  dbPath = path.join(dataDir, 'thinkread.db');
  
  // Create database if it doesn't exist
  db = new Database(dbPath);
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON');
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      cover_image TEXT,
      added_at INTEGER NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS preferences (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    
    CREATE TABLE IF NOT EXISTS progress (
      book_id TEXT PRIMARY KEY,
      cfi TEXT,
      percentage REAL,
      location INTEGER,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    
    CREATE TABLE IF NOT EXISTS bookmarks (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      cfi TEXT NOT NULL,
      text TEXT,
      note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );
    
    CREATE INDEX IF NOT EXISTS idx_bookmarks_book_id ON bookmarks(book_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_cfi ON bookmarks(book_id, cfi);
  `);
  
  return db;
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}

// Ensure database is initialized
// If dataDir is provided, use it; otherwise use stored dataDir
function ensureDb(providedDataDir = null) {
  if (!db) {
    const dirToUse = providedDataDir || dataDir;
    if (!dirToUse) {
      throw new Error('Database not initialized. Please call initDatabase() first with a data directory.');
    }
    initDatabase(dirToUse);
  }
}

// Books
export function getBooks() {
  ensureDb();
  const stmt = db.prepare('SELECT * FROM books ORDER BY added_at DESC');
  const books = stmt.all().map(row => ({
    id: row.id,
    type: row.type,
    title: row.title,
    originalName: row.original_name,
    storedName: row.stored_name,
    sizeBytes: row.size_bytes,
    coverImage: row.cover_image,
    addedAt: row.added_at
  }));
  return { books };
}

export function addBook(book) {
  ensureDb();
  const stmt = db.prepare(`
    INSERT INTO books (id, type, title, original_name, stored_name, size_bytes, cover_image, added_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    book.id,
    book.type,
    book.title,
    book.originalName,
    book.storedName,
    book.sizeBytes,
    book.coverImage || null,
    book.addedAt
  );
  return book;
}

export function deleteBook(bookId) {
  ensureDb();
  const stmt = db.prepare('DELETE FROM books WHERE id = ?');
  const result = stmt.run(bookId);
  return { ok: result.changes > 0 };
}

export function getBook(bookId) {
  ensureDb();
  const stmt = db.prepare('SELECT * FROM books WHERE id = ?');
  const row = stmt.get(bookId);
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    original_name: row.original_name,
    stored_name: row.stored_name,
    size_bytes: row.size_bytes,
    cover_image: row.cover_image,
    added_at: row.added_at
  };
}

// Preferences
export function getPrefs() {
  ensureDb();
  const stmt = db.prepare('SELECT value FROM preferences WHERE key = ?');
  const row = stmt.get('prefs');
  if (row) {
    return JSON.parse(row.value);
  }
  return null;
}

export function savePrefs(prefs) {
  ensureDb();
  const stmt = db.prepare('INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)');
  stmt.run('prefs', JSON.stringify(prefs));
  return { success: true };
}

// Progress
export function getProgress(bookId) {
  ensureDb();
  const stmt = db.prepare('SELECT * FROM progress WHERE book_id = ?');
  const row = stmt.get(bookId);
  if (row) {
    return {
      cfi: row.cfi,
      percentage: row.percentage,
      location: row.location,
      updatedAt: row.updated_at
    };
  }
  return null;
}

export function saveProgress(bookId, progress) {
  ensureDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO progress (book_id, cfi, percentage, location, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    bookId,
    progress.cfi || null,
    progress.percentage || null,
    progress.location || null,
    Date.now()
  );
  return { success: true };
}

// Bookmarks
export function getBookmarks() {
  ensureDb();
  const stmt = db.prepare('SELECT * FROM bookmarks ORDER BY created_at DESC');
  const bookmarks = stmt.all().map(row => ({
    id: row.id,
    bookId: row.book_id,
    cfi: row.cfi,
    text: row.text,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
  return { bookmarks };
}

export function saveBookmark(bookmark) {
  ensureDb();
  
  // Check if bookmark already exists for this book and CFI
  const checkStmt = db.prepare('SELECT id FROM bookmarks WHERE book_id = ? AND cfi = ?');
  const existing = checkStmt.get(bookmark.bookId, bookmark.cfi);
  
  if (existing) {
    // Update existing bookmark
    const updateStmt = db.prepare(`
      UPDATE bookmarks 
      SET text = ?, note = ?, updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(
      bookmark.text || null,
      bookmark.note || null,
      Date.now(),
      existing.id
    );
    return { success: true, id: existing.id };
  } else {
    // Insert new bookmark
    const id = bookmark.id || generateId();
    const insertStmt = db.prepare(`
      INSERT INTO bookmarks (id, book_id, cfi, text, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(
      id,
      bookmark.bookId,
      bookmark.cfi,
      bookmark.text || null,
      bookmark.note || null,
      Date.now(),
      Date.now()
    );
    return { success: true, id };
  }
}

export function deleteBookmark(bookmarkId) {
  ensureDb();
  const stmt = db.prepare('DELETE FROM bookmarks WHERE id = ?');
  const result = stmt.run(bookmarkId);
  return { success: result.changes > 0 };
}

function generateId() {
  // Simple ID generator (you can use nanoid if preferred)
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

