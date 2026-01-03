// Mobile API adapter using Capacitor plugins
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

const isMobile = () => Capacitor.isNativePlatform();

// Helper to get data directory path
function getDataPath() {
  return 'data';
}

// Helper to ensure directory exists
async function ensureDirectory(dirPath) {
  try {
    await Filesystem.mkdir({
      path: dirPath,
      directory: Directory.Data,
      recursive: true,
    });
  } catch (e) {
    // Directory might already exist, that's okay
    // Only throw if it's not a "directory exists" error
    if (!e.message?.includes('already exists') && !e.message?.includes('EEXIST')) {
      console.warn(`Failed to create directory ${dirPath}:`, e);
    }
  }
}

// Helper to get parent directory from a file path
function getParentDirectory(filePath) {
  const parts = filePath.split('/');
  parts.pop(); // Remove filename
  return parts.join('/');
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
  // Ensure parent directory exists before writing
  const parentDir = getParentDirectory(path);
  if (parentDir) {
    await ensureDirectory(parentDir);
  }
  
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

// Helper to extract font family name from filename
function extractFontFamilyFromFilename(filename) {
  // Remove extension and clean up the name
  const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
  // Remove common suffixes like -Regular, -Bold, etc.
  const cleaned = nameWithoutExt
    .replace(/[-_](Regular|Bold|Italic|Light|Medium|SemiBold|ExtraBold|Black|Thin|ExtraLight)$/i, '')
    .replace(/[-_]([0-9]+)$/, '') // Remove numbers at the end
    .trim();
  // Convert to title case
  return cleaned
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ') || 'Custom Font';
}

// Upload books on mobile
export async function mobileUploadBooks(files) {
  // Clear cache to ensure we get fresh data
  booksCache = null;
  const books = await mobileGetBooks();
  const added = [];
  
  // Ensure base data directory exists first
  await ensureDirectory(getDataPath());
  
  // Ensure books directory exists
  const booksDir = `${getDataPath()}/books`;
  await ensureDirectory(booksDir);
  
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
  const fonts = await readJsonFile(`${getDataPath()}/fonts.json`) || [];
  return { fonts };
}

// Upload fonts on mobile
export async function mobileUploadFonts(files) {
  // Ensure base data directory exists
  await ensureDirectory(getDataPath());
  
  // Ensure fonts directory exists
  const fontsDir = `${getDataPath()}/fonts`;
  await ensureDirectory(fontsDir);
  
  // Load existing fonts
  const fontsData = await readJsonFile(`${getDataPath()}/fonts.json`) || [];
  const existingFonts = Array.isArray(fontsData) ? fontsData : [];
  
  const added = [];
  
  for (const file of files) {
    try {
      // Generate ID and filename
      const originalName = file.name;
      const ext = originalName.split('.').pop().toLowerCase();
      const safeBase = sanitizeFilename(originalName.replace(/\.[^/.]+$/, ''));
      const storedName = `${safeBase}-${generateId(10)}.${ext}`;
      const fontPath = `${fontsDir}/${storedName}`;
      
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
        path: fontPath,
        data: base64Data,
        directory: Directory.Data,
      });
      
      // Extract font family name from filename
      const fontFamily = extractFontFamilyFromFilename(originalName);
      
      // Create font entry
      const font = {
        filename: storedName,
        fontFamily: fontFamily,
        originalName: originalName,
        sizeBytes: file.size,
        uploadedAt: Date.now(),
      };
      
      existingFonts.push(font);
      added.push(font);
    } catch (err) {
      console.error('Error uploading font:', err);
      throw new Error(`Failed to upload ${file.name}: ${err.message}`);
    }
  }
  
  // Save updated fonts list
  await writeJsonFile(`${getDataPath()}/fonts.json`, existingFonts);
  
  return { fonts: existingFonts, added };
}

// Delete font
export async function mobileDeleteFont(filename) {
  try {
    // Delete the font file
    await Filesystem.deleteFile({
      path: `${getDataPath()}/fonts/${filename}`,
      directory: Directory.Data,
    });
    
    // Remove from fonts list
    const fonts = await readJsonFile(`${getDataPath()}/fonts.json`) || [];
    const filtered = fonts.filter(f => f.filename !== filename);
    await writeJsonFile(`${getDataPath()}/fonts.json`, filtered);
    
    return { success: true };
  } catch (e) {
    console.error('Error deleting font:', e);
    throw new Error(`Failed to delete font: ${e.message}`);
  }
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
  // For mobile, we need to read the file and create a blob URL for epub.js
  const books = await mobileGetBooks();
  const book = books.find(b => b.id === bookId);
  if (!book) throw new Error('Book not found');
  
  const bookPath = `${getDataPath()}/books/${book.filename}`;
  
  try {
    // Read the file as base64
    const result = await Filesystem.readFile({
      path: bookPath,
      directory: Directory.Data,
    });
    
    // Convert base64 to binary string
    const base64Data = result.data;
    const binaryString = atob(base64Data);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Create a Blob and blob URL
    const blob = new Blob([bytes], { type: 'application/epub+zip' });
    const blobUrl = URL.createObjectURL(blob);
    
    return blobUrl;
  } catch (err) {
    console.error('Error reading book file:', err);
    throw new Error(`Failed to read book file: ${err.message}`);
  }
}

export async function mobileGetBookCoverUrl(bookId) {
  const books = await mobileGetBooks();
  const book = books.find(b => b.id === bookId);
  if (!book || !book.coverImage) return null;
  
  return `capacitor://localhost/${getDataPath()}/covers/${bookId}.jpg`;
}

export async function mobileGetFontFileUrl(filename) {
  const fontPath = `${getDataPath()}/fonts/${filename}`;
  
  try {
    // Read the font file as base64
    const result = await Filesystem.readFile({
      path: fontPath,
      directory: Directory.Data,
    });
    
    // Convert base64 to binary string
    const base64Data = result.data;
    const binaryString = atob(base64Data);
    
    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    // Determine MIME type based on file extension
    const ext = filename.split('.').pop().toLowerCase();
    let mimeType = 'font/ttf';
    switch (ext) {
      case 'ttf': mimeType = 'font/ttf'; break;
      case 'otf': mimeType = 'font/otf'; break;
      case 'woff': mimeType = 'font/woff'; break;
      case 'woff2': mimeType = 'font/woff2'; break;
    }
    
    // Create a Blob and blob URL
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    
    return blobUrl;
  } catch (err) {
    console.error('Error reading font file:', err);
    throw new Error(`Failed to read font file: ${err.message}`);
  }
}

