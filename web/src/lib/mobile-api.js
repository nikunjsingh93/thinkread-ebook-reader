// Mobile API adapter using Capacitor plugins
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const isMobile = () => Capacitor.isNativePlatform();

// Helper to get data directory path
function getDataPath() {
  return 'data';
}

// Helper to read JSON file
async function readJsonFile(path) {
  try {
    const result = await Filesystem.readFile({
      path,
      directory: Directory.Data,
    });
    return JSON.parse(result.data);
  } catch (e) {
    return null;
  }
}

// Helper to write JSON file
async function writeJsonFile(path, data) {
  await Filesystem.writeFile({
    path,
    data: JSON.stringify(data, null, 2),
    directory: Directory.Data,
  });
}

// Books storage
let booksCache = null;

export async function mobileGetBooks() {
  if (booksCache) return booksCache;
  
  const books = await readJsonFile(`${getDataPath()}/books.json`) || [];
  booksCache = books;
  return books;
}

export async function mobileSaveBooks(books) {
  booksCache = books;
  await writeJsonFile(`${getDataPath()}/books.json`, books);
}

// Preferences storage
export async function mobileGetPrefs() {
  return await readJsonFile(`${getDataPath()}/prefs.json`) || {};
}

export async function mobileSavePrefs(prefs) {
  await writeJsonFile(`${getDataPath()}/prefs.json`, prefs);
}

// Progress storage
export async function mobileGetProgress(bookId) {
  const progress = await readJsonFile(`${getDataPath()}/progress.json`) || {};
  return progress[bookId] || null;
}

export async function mobileSaveProgress(bookId, progressData) {
  const progress = await readJsonFile(`${getDataPath()}/progress.json`) || {};
  progress[bookId] = progressData;
  await writeJsonFile(`${getDataPath()}/progress.json`, progress);
}

// Bookmarks storage
export async function mobileGetBookmarks() {
  return await readJsonFile(`${getDataPath()}/bookmarks.json`) || [];
}

export async function mobileSaveBookmark(bookmark) {
  const bookmarks = await mobileGetBookmarks();
  const existing = bookmarks.findIndex(b => b.id === bookmark.id);
  if (existing >= 0) {
    bookmarks[existing] = bookmark;
  } else {
    bookmarks.push(bookmark);
  }
  await writeJsonFile(`${getDataPath()}/bookmarks.json`, bookmarks);
}

export async function mobileDeleteBookmark(id) {
  const bookmarks = await mobileGetBookmarks();
  const filtered = bookmarks.filter(b => b.id !== id);
  await writeJsonFile(`${getDataPath()}/bookmarks.json`, filtered);
}

// Fonts storage
export async function mobileGetFonts() {
  return await readJsonFile(`${getDataPath()}/fonts.json`) || [];
}

// Dictionary storage
export async function mobileGetDictionaryStatus() {
  const dict = await readJsonFile(`${getDataPath()}/dictionary.json`);
  return {
    exists: !!dict,
    wordCount: dict ? Object.keys(dict).length : 0,
  };
}

export async function mobileGetDictionary() {
  return await readJsonFile(`${getDataPath()}/dictionary.json`) || {};
}

export async function mobileSaveDictionary(dictionary) {
  await writeJsonFile(`${getDataPath()}/dictionary.json`, dictionary);
  return {
    success: true,
    wordCount: Object.keys(dictionary).length,
  };
}

export async function mobileDeleteDictionary() {
  try {
    await Filesystem.deleteFile({
      path: `${getDataPath()}/dictionary.json`,
      directory: Directory.Data,
    });
  } catch (e) {
    // File doesn't exist, that's okay
  }
}

// File operations
export async function mobileGetBookFileUrl(bookId) {
  // For mobile, we'll use Capacitor's file:// protocol
  const books = await mobileGetBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) throw new Error('Book not found');
  
  // Return a path that can be used with Capacitor
  return `capacitor://localhost/${getDataPath()}/books/${book.filename}`;
}

export async function mobileGetBookCoverUrl(bookId) {
  const books = await mobileGetBooks();
  const book = books.find(b => b.id === bookId);
  if (!book || !book.coverImage) return null;
  
  return `capacitor://localhost/${getDataPath()}/covers/${bookId}.jpg`;
}

export async function mobileGetFontFileUrl(filename) {
  return `capacitor://localhost/${getDataPath()}/fonts/${filename}`;
}

