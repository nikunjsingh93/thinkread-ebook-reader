// Mobile API adapter using Capacitor plugins
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
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
      encoding: Encoding.UTF8,
    });
    // Capacitor Filesystem returns { data: string } when encoding is specified
    if (typeof result.data === 'string') {
      return JSON.parse(result.data);
    }
    return null;
  } catch (e) {
    console.warn(`Failed to read JSON file ${path}:`, e);
    return null;
  }
}

// Helper to write JSON file
async function writeJsonFile(path, data) {
  await Filesystem.writeFile({
    path,
    data: JSON.stringify(data, null, 2),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
  });
}

// Books storage
let booksCache = null;

export async function mobileGetBooks() {
  // Always read from disk to get latest data
  let books = await readJsonFile(`${getDataPath()}/books.json`);
  // Ensure we always return an array
  if (!Array.isArray(books)) {
    console.warn('Books data is not an array, resetting to empty array');
    books = [];
    // Save empty array to fix corrupted data
    booksCache = [];
    await writeJsonFile(`${getDataPath()}/books.json`, []);
  } else {
    booksCache = books;
  }
  return books;
}

export async function mobileSaveBooks(books) {
  booksCache = books;
  await writeJsonFile(`${getDataPath()}/books.json`, books);
}

// Generate a simple ID (similar to nanoid but simpler)
function generateId(length = 12) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper to sanitize filename
function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9.-]/gi, '_').replace(/_+/g, '_');
}

// Upload books on mobile
export async function mobileUploadBooks(files) {
  // Clear cache to ensure we get fresh data
  booksCache = null;
  const books = await mobileGetBooks();
  const added = [];
  
  // Ensure books directory exists
  const booksDir = `${getDataPath()}/books`;
  try {
    await Filesystem.mkdir({
      path: booksDir,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (e) {
    // Directory might already exist, that's okay
  }
  
  for (const file of files) {
    try {
      // Generate ID and filename
      const id = generateId(12);
      const originalName = file.name;
      const ext = originalName.split('.').pop().toLowerCase();
      const safeBase = sanitizeFilename(originalName.replace(/\.[^/.]+$/, ''));
      const storedName = `${safeBase}-${generateId(10)}.${ext}`;
      const bookPath = `${booksDir}/${storedName}`;
      
      // Read file as base64
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      // Extract base64 data (remove data:type;base64, prefix)
      const base64Data = fileData.split(',')[1];
      
      // Write file to storage
      await Filesystem.writeFile({
        path: bookPath,
        data: base64Data,
        directory: Directory.Data,
      });
      
      // Create book entry
      const book = {
        id,
        type: ext === 'epub' ? 'epub' : (ext === 'mobi' ? 'mobi' : 'epub'),
        title: originalName.replace(/\.[^/.]+$/, ''),
        originalName,
        storedName,
        filename: storedName, // Alias for compatibility
        sizeBytes: file.size,
        coverImage: null, // Cover extraction can be added later
        addedAt: Date.now(),
      };
      
      books.push(book);
      added.push(book);
    } catch (err) {
      console.error('Error uploading book:', err);
      throw new Error(`Failed to upload ${file.name}: ${err.message}`);
    }
  }
  
  // Save updated books list
  booksCache = books;
  await writeJsonFile(`${getDataPath()}/books.json`, books);
  
  // Clear cache so next read gets fresh data
  booksCache = null;
  
  return { added };
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

