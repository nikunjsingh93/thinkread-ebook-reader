// Mobile API adapter using Capacitor plugins
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import JSZip from 'jszip';

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

export async function mobileDeleteBook(id) {
  // Load books
  const books = await mobileGetBooks();
  const book = books.find(b => b.id === id);
  
  if (!book) {
    throw new Error('Book not found');
  }
  
  try {
    // Delete the book file
    const bookPath = `${getDataPath()}/books/${book.filename}`;
    await Filesystem.deleteFile({
      path: bookPath,
      directory: Directory.Data,
    });
    
    // Delete cover image if it exists
    if (book.coverImage) {
      try {
        const coverPath = `${getDataPath()}/covers/${book.coverImage}`;
        await Filesystem.deleteFile({
          path: coverPath,
          directory: Directory.Data,
        });
      } catch (coverErr) {
        // Cover might not exist, that's okay
        console.warn('Failed to delete cover image:', coverErr);
      }
    }
    
    // Remove from books list
    const filtered = books.filter(b => b.id !== id);
    booksCache = filtered;
    await writeJsonFile(`${getDataPath()}/books.json`, filtered);
    
    return { success: true };
  } catch (err) {
    console.error('Error deleting book:', err);
    throw new Error(`Failed to delete book: ${err.message}`);
  }
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
      
      // Extract cover image for EPUB files using JSZip (more reliable than epubjs)
      let coverImage = null;
      if (ext === 'epub') {
        try {
          console.log('[Cover Extraction] Starting cover extraction for EPUB');
          // Add timeout to prevent hanging
          const coverExtractionPromise = (async () => {
            try {
              // Convert base64 to ArrayBuffer for JSZip
              console.log('[Cover Extraction] Converting base64 to ArrayBuffer');
              const binaryString = atob(base64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const arrayBuffer = bytes.buffer;
              
              // Check if JSZip is available
              if (!JSZip) {
                console.error('[Cover Extraction] JSZip is not available');
                return null;
              }
              
              // Load EPUB as ZIP
              console.log('[Cover Extraction] Loading EPUB as ZIP');
              const zip = await JSZip.loadAsync(arrayBuffer);
              console.log('[Cover Extraction] ZIP loaded successfully');
              
              // Find the OPF file (usually in META-INF/container.xml)
              console.log('[Cover Extraction] Looking for OPF file');
              let opfPath = null;
              const containerFile = zip.file('META-INF/container.xml');
              if (containerFile) {
                console.log('[Cover Extraction] Found container.xml');
                const containerXml = await containerFile.async('string');
                // Parse container.xml to find OPF path
                const opfMatch = containerXml.match(/full-path="([^"]+\.opf)"/i);
                if (opfMatch) {
                  opfPath = opfMatch[1];
                  console.log('[Cover Extraction] Found OPF path from container:', opfPath);
                }
              }
              
              // If no container.xml, try to find .opf file directly
              if (!opfPath) {
                console.log('[Cover Extraction] Searching for .opf files directly');
                const opfFiles = Object.keys(zip.files).filter(name => name.endsWith('.opf'));
                if (opfFiles.length > 0) {
                  opfPath = opfFiles[0];
                  console.log('[Cover Extraction] Found OPF file:', opfPath);
                }
              }
              
              if (!opfPath) {
                console.warn('[Cover Extraction] Could not find OPF file in EPUB');
                return null;
              }
              
              // Read and parse OPF file
              console.log('[Cover Extraction] Reading OPF file:', opfPath);
              const opfFile = zip.file(opfPath);
              if (!opfFile) {
                console.warn('[Cover Extraction] OPF file not found in ZIP');
                return null;
              }
              
              const opfXml = await opfFile.async('string');
              const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
              console.log('[Cover Extraction] OPF directory:', opfDir);
              
              // Debug: Log a sample of the OPF to understand structure
              const manifestStart = opfXml.indexOf('<manifest');
              const manifestEnd = opfXml.indexOf('</manifest>');
              if (manifestStart >= 0 && manifestEnd > manifestStart) {
                const manifestSection = opfXml.substring(manifestStart, manifestEnd + 10);
                console.log('[Cover Extraction] Manifest section (first 500 chars):', manifestSection.substring(0, 500));
              }
              
              // Find cover image reference in OPF
              console.log('[Cover Extraction] Searching for cover image in OPF');
              let coverHref = null;
              let coverMimeType = 'image/jpeg';
              
              // Method 1: Look for metadata cover property
              const coverIdMatch = opfXml.match(/<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i);
              if (coverIdMatch) {
                console.log('[Cover Extraction] Found cover metadata:', coverIdMatch[1]);
                const coverId = coverIdMatch[1];
                // Find item with this id in manifest
                const itemMatch = opfXml.match(new RegExp(`<item[^>]*id=["']${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*href=["']([^"']+)["']`, 'i'));
                if (itemMatch) {
                  coverHref = itemMatch[1];
                  console.log('[Cover Extraction] Found cover href from metadata:', coverHref);
                  // Try to get media-type
                  const mediaTypeMatch = opfXml.match(new RegExp(`<item[^>]*id=["']${coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["'][^>]*media-type=["']([^"']+)["']`, 'i'));
                  if (mediaTypeMatch) {
                    coverMimeType = mediaTypeMatch[1];
                  }
                }
              }
              
              // Method 2: Look for item with properties="cover-image"
              if (!coverHref) {
                console.log('[Cover Extraction] Trying method 2: cover-image property');
                const coverItemMatch = opfXml.match(/<item[^>]*properties=["']cover-image["'][^>]*href=["']([^"']+)["']/i);
                if (coverItemMatch) {
                  coverHref = coverItemMatch[1];
                  console.log('[Cover Extraction] Found cover href from cover-image property:', coverHref);
                  // Try to get media-type
                  const mediaTypeMatch = opfXml.match(/<item[^>]*properties=["']cover-image["'][^>]*media-type=["']([^"']+)["']/i);
                  if (mediaTypeMatch) {
                    coverMimeType = mediaTypeMatch[1];
                  }
                }
              }
              
              // Method 3: Find first image in manifest (more flexible regex)
              if (!coverHref) {
                console.log('[Cover Extraction] Trying method 3: first image in manifest');
                // Try flexible regex that handles attributes in any order
                const imageMatches = opfXml.matchAll(/<item[^>]*media-type=["']image\/(jpeg|jpg|png|gif|webp)["'][^>]*>/gi);
                for (const match of imageMatches) {
                  const itemTag = match[0];
                  // Extract href from the item tag (attributes can be in any order)
                  const hrefMatch = itemTag.match(/href=["']([^"']+)["']/i);
                  if (hrefMatch) {
                    coverHref = hrefMatch[1];
                    // Extract media-type
                    const mediaTypeMatch = itemTag.match(/media-type=["']image\/(jpeg|jpg|png|gif|webp)["']/i);
                    if (mediaTypeMatch) {
                      coverMimeType = `image/${mediaTypeMatch[1]}`;
                    }
                    console.log('[Cover Extraction] Found first image in manifest:', coverHref);
                    break; // Use first image found
                  }
                }
              }
              
              // Method 4: Parse all items and find images (most robust)
              if (!coverHref) {
                console.log('[Cover Extraction] Trying method 4: parse all items');
                // Find all item tags
                const allItems = opfXml.matchAll(/<item[^>]+>/gi);
                for (const itemMatch of allItems) {
                  const itemTag = itemMatch[0];
                  // Check if it's an image
                  if (itemTag.match(/media-type=["']image\//i)) {
                    const hrefMatch = itemTag.match(/href=["']([^"']+)["']/i);
                    if (hrefMatch) {
                      coverHref = hrefMatch[1];
                      const mediaTypeMatch = itemTag.match(/media-type=["']([^"']+)["']/i);
                      if (mediaTypeMatch) {
                        coverMimeType = mediaTypeMatch[1];
                      }
                      console.log('[Cover Extraction] Found image item:', coverHref);
                      break;
                    }
                  }
                }
              }
              
              if (!coverHref) {
                console.warn('[Cover Extraction] Could not find cover image in OPF');
                return null;
              }
              
              // Resolve relative path
              const coverPath = coverHref.startsWith('/') ? coverHref.substring(1) : (opfDir + coverHref);
              console.log('[Cover Extraction] Resolved cover path:', coverPath);
              
              // Get cover image from ZIP
              const coverFile = zip.file(coverPath);
              if (!coverFile) {
                console.warn(`[Cover Extraction] Cover image file not found: ${coverPath}`);
                // Try alternative path resolution
                const altPath = coverHref.replace(/^\.\//, '').replace(/^\//, '');
                const altCoverFile = zip.file(altPath);
                if (altCoverFile) {
                  console.log(`[Cover Extraction] Found cover at alternative path: ${altPath}`);
                  const coverBase64 = await altCoverFile.async('base64');
                  const coverExt = coverMimeType.includes('jpeg') || coverMimeType.includes('jpg') ? 'jpg' : 
                                  coverMimeType.includes('png') ? 'png' : 'jpg';
                  const coverFilename = `${id}.${coverExt}`;
                  const coverPathStorage = `${getDataPath()}/covers/${coverFilename}`;
                  await ensureDirectory(`${getDataPath()}/covers`);
                  await Filesystem.writeFile({
                    path: coverPathStorage,
                    data: coverBase64,
                    directory: Directory.Data,
                  });
                  console.log('[Cover Extraction] Cover saved successfully:', coverFilename);
                  return coverFilename;
                }
                return null;
              }
              
              // Get cover image as base64
              console.log('[Cover Extraction] Extracting cover image as base64');
              const coverBase64 = await coverFile.async('base64');
              
              // Determine file extension
              const coverExt = coverMimeType.includes('jpeg') || coverMimeType.includes('jpg') ? 'jpg' : 
                              coverMimeType.includes('png') ? 'png' : 'jpg';
              const coverFilename = `${id}.${coverExt}`;
              const coverPathStorage = `${getDataPath()}/covers/${coverFilename}`;
              
              // Ensure covers directory exists
              await ensureDirectory(`${getDataPath()}/covers`);
              
              // Save cover image
              console.log('[Cover Extraction] Saving cover image to:', coverPathStorage);
              await Filesystem.writeFile({
                path: coverPathStorage,
                data: coverBase64,
                directory: Directory.Data,
              });
              
              console.log('[Cover Extraction] Cover saved successfully:', coverFilename);
              return coverFilename;
            } catch (zipErr) {
              console.error('[Cover Extraction] Error extracting cover with JSZip:', zipErr);
              console.error('[Cover Extraction] Error stack:', zipErr.stack);
              return null;
            }
          })();
          
          // Wait for cover extraction with overall timeout
          coverImage = await Promise.race([
            coverExtractionPromise,
            new Promise((resolve) => {
              setTimeout(() => {
                console.warn('[Cover Extraction] Timeout after 10 seconds');
                resolve(null);
              }, 10000);
            })
          ]);
          console.log('[Cover Extraction] Final result:', coverImage);
        } catch (coverErr) {
          console.error('[Cover Extraction] Failed to extract cover image:', coverErr);
          console.error('[Cover Extraction] Error stack:', coverErr.stack);
          // Continue without cover - not a critical error
          coverImage = null;
        }
      } else {
        console.log('[Cover Extraction] Skipping cover extraction for non-EPUB file');
      }
      
      // Create book entry
      const book = {
        id,
        type: ext === 'epub' ? 'epub' : (ext === 'mobi' ? 'mobi' : 'epub'),
        title: originalName.replace(/\.[^/.]+$/, ''),
        originalName,
        storedName,
        filename: storedName, // Alias for compatibility
        sizeBytes: file.size,
        coverImage: coverImage,
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
  
  const coverPath = `${getDataPath()}/covers/${book.coverImage}`;
  
  try {
    // Read the cover image as base64
    const result = await Filesystem.readFile({
      path: coverPath,
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
    const ext = book.coverImage.split('.').pop().toLowerCase();
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
    
    // Create a Blob and blob URL
    const blob = new Blob([bytes], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    
    return blobUrl;
  } catch (err) {
    console.error('Error reading cover image:', err);
    return null;
  }
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

