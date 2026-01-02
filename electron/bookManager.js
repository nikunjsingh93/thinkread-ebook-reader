import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import epubParser from 'epub';
import { nanoid } from 'nanoid';
import sanitize from 'sanitize-filename';
import { getDataPaths } from './storage.js';
import { addBook, deleteBook as dbDeleteBook, getBook } from './database.js';

const execAsync = promisify(exec);

function getExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

function guessTypeByExt(ext) {
  const extLower = ext.toLowerCase();
  if (extLower === 'epub') return 'epub';
  if (extLower === 'mobi') return 'mobi';
  return 'unknown';
}

async function extractCoverImage(epubPath, bookId, coversDir) {
  return new Promise((resolve, reject) => {
    const epub = new epubParser(epubPath);
    epub.on('end', () => {
      if (epub.metadata.cover) {
        const coverId = epub.metadata.cover;
        epub.getImage(coverId, (error, img, mimeType) => {
          if (error) {
            console.log(`No cover found for book ${bookId}:`, error.message);
            return resolve(null);
          }

          const coverExt = mimeType === 'image/jpeg' ? 'jpg' : 'png';
          const coverFilename = `${bookId}.${coverExt}`;
          const coverPath = path.join(coversDir, coverFilename);

          fs.writeFile(coverPath, img, (err) => {
            if (err) {
              console.error(`Error saving cover for book ${bookId}:`, err);
              return resolve(null);
            }
            console.log(`Extracted cover for book ${bookId}`);
            resolve(coverFilename);
          });
        });
      } else {
        resolve(null);
      }
    });

    epub.on('error', (error) => {
      console.log(`Error parsing epub for book ${bookId}:`, error.message);
      resolve(null);
    });

    epub.parse();
  });
}

export async function uploadBooks(filePaths, dataDir) {
  const { booksDir, coversDir } = getDataPaths(dataDir);
  const added = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      continue;
    }

    const originalName = path.basename(filePath);
    const ext = getExt(originalName);
    let type = guessTypeByExt(ext);
    let storedName = originalName;
    let finalType = type;
    let fileSize = fs.statSync(filePath).size;

    // Convert MOBI to EPUB if needed
    if (type === 'mobi') {
      try {
        const outputPath = path.join(booksDir, `${path.basename(filePath, path.extname(filePath))}-${nanoid(10)}.epub`);
        
        await execAsync(`ebook-convert "${filePath}" "${outputPath}"`);
        
        storedName = path.basename(outputPath);
        finalType = 'epub';
        
        const stats = fs.statSync(outputPath);
        fileSize = stats.size;
      } catch (err) {
        console.error('Error converting MOBI to EPUB:', err);
        throw new Error('Failed to convert MOBI file to EPUB. Please ensure Calibre is installed.');
      }
    } else {
      // Copy file to books directory
      const safeBase = sanitize(path.basename(originalName, path.extname(originalName))) || 'book';
      storedName = `${safeBase}-${nanoid(10)}.${ext || 'bin'}`;
      const destPath = path.join(booksDir, storedName);
      fs.copyFileSync(filePath, destPath);
    }

    const id = nanoid(12);
    const safeTitle = path.basename(originalName, path.extname(originalName));

    // Extract cover image for epub files
    let coverImage = null;
    if (finalType === 'epub') {
      const epubPath = path.join(booksDir, storedName);
      coverImage = await extractCoverImage(epubPath, id, coversDir);
    }

    const book = {
      id,
      type: finalType,
      title: safeTitle,
      originalName,
      storedName,
      sizeBytes: fileSize,
      coverImage,
      addedAt: Date.now(),
    };

    await addBook(book);
    added.push(book);
  }

  return { added };
}

export async function deleteBook(bookId, dataDir) {
  const book = await getBook(bookId);
  if (!book) {
    throw new Error('Book not found');
  }

  const { booksDir, coversDir } = getDataPaths(dataDir);

  // Delete book file
  const bookPath = path.join(booksDir, book.stored_name);
  if (fs.existsSync(bookPath)) {
    try {
      fs.unlinkSync(bookPath);
    } catch (err) {
      console.error('Error deleting book file:', err);
    }
  }

  // Delete cover image
  if (book.cover_image) {
    const coverPath = path.join(coversDir, book.cover_image);
    if (fs.existsSync(coverPath)) {
      try {
        fs.unlinkSync(coverPath);
      } catch (err) {
        console.error('Error deleting cover image:', err);
      }
    }
  }

  // Delete from database (cascade will delete progress and bookmarks)
  await dbDeleteBook(bookId);
  return { ok: true };
}

export function getBookFilePath(bookId, dataDir) {
  return new Promise(async (resolve, reject) => {
    try {
      const book = await getBook(bookId);
      if (!book) {
        return reject(new Error('Book not found'));
      }

      const { booksDir } = getDataPaths(dataDir);
      const filePath = path.join(booksDir, book.stored_name);
      
      if (!fs.existsSync(filePath)) {
        return reject(new Error('Book file not found'));
      }

      // Return file:// URL for Electron
      resolve(`file://${filePath}`);
    } catch (err) {
      reject(err);
    }
  });
}

export function getBookCoverPath(bookId, dataDir) {
  return new Promise(async (resolve, reject) => {
    try {
      const book = await getBook(bookId);
      if (!book || !book.cover_image) {
        return reject(new Error('Cover not found'));
      }

      const { coversDir } = getDataPaths(dataDir);
      const coverPath = path.join(coversDir, book.cover_image);
      
      if (!fs.existsSync(coverPath)) {
        return reject(new Error('Cover file not found'));
      }

      // Return file:// URL for Electron
      resolve(`file://${coverPath}`);
    } catch (err) {
      reject(err);
    }
  });
}

