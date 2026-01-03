import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initDatabase, closeDatabase, getBooks, getPrefs, savePrefs, getProgress, saveProgress, getBookmarks, saveBookmark, deleteBookmark } from './database.js';
import { getDataPaths, ensureDir } from './storage.js';
import { uploadBooks, deleteBook, getBookFilePath, getBookCoverPath } from './bookManager.js';
import { getFonts, uploadFonts, deleteFont, getFontFilePath } from './fontManager.js';
import { getDictionaryStatus, getDictionary, saveDictionary, deleteDictionary } from './dictionaryManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;
let dataDir = null;

// Get user data directory
function getUserDataDir() {
  if (dataDir) return dataDir;
  
  // In production, use app.getPath('userData')
  // In development, use a local data directory
  if (app.isPackaged) {
    dataDir = path.join(app.getPath('userData'), 'ThinkRead');
  } else {
    dataDir = path.join(__dirname, '..', 'data');
  }
  
  ensureDir(dataDir);
  return dataDir;
}

function createWindow() {
  // Get absolute path to preload script
  const preloadPath = path.join(__dirname, 'preload.js');
  console.log('Preload script path:', preloadPath);
  console.log('Preload script exists:', fs.existsSync(preloadPath));
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    titleBarStyle: 'hiddenInset', // macOS style with native traffic lights
    backgroundColor: '#ffffff',
    show: false, // Don't show until ready
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'web', 'dist', 'index.html'))
      .catch(err => {
        console.error('Failed to load file:', err);
      });
  } else {
    mainWindow.loadURL('http://localhost:5173')
      .catch(err => {
        console.error('Failed to load URL:', err);
      });
  }

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Log errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level === 3) { // error
      console.error('Renderer error:', message, 'at', sourceId, ':', line);
    }
  });

  mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
    console.error('Preload script error:', preloadPath, error);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register custom protocol for serving local files
function registerLocalFileProtocol() {
  protocol.registerFileProtocol('thinkread', (request, callback) => {
    try {
      const url = request.url.substr(12); // Remove 'thinkread://' prefix
      const filePath = decodeURIComponent(url);
      
      // Security check: only allow files from data directory
      const userDataDir = getUserDataDir();
      const { booksDir, coversDir, fontsDir } = getDataPaths(userDataDir);
      
      // Check if file is in allowed directories
      const normalizedPath = path.normalize(filePath);
      const normalizedBooksDir = path.normalize(booksDir);
      const normalizedCoversDir = path.normalize(coversDir);
      const normalizedFontsDir = path.normalize(fontsDir);
      
      if (normalizedPath.startsWith(normalizedBooksDir) ||
          normalizedPath.startsWith(normalizedCoversDir) ||
          normalizedPath.startsWith(normalizedFontsDir)) {
        // Verify file exists
        if (fs.existsSync(filePath)) {
          callback({ path: filePath });
        } else {
          console.error('File not found:', filePath);
          callback({ error: -6 }); // FILE_NOT_FOUND
        }
      } else {
        console.error('Access denied to file outside data directory:', filePath);
        callback({ error: -6 }); // FILE_NOT_FOUND
      }
    } catch (err) {
      console.error('Protocol handler error:', err);
      callback({ error: -6 }); // FILE_NOT_FOUND
    }
  });
}

app.whenReady().then(() => {
  // Register custom protocol - must be done when app is ready
  registerLocalFileProtocol();
  
  // Initialize database
  const userDataDir = getUserDataDir();
  initDatabase(userDataDir);
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', async () => {
  await closeDatabase();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

// Helper to ensure database is initialized
function ensureDatabase() {
  try {
    const userDataDir = getUserDataDir();
    initDatabase(userDataDir);
  } catch (err) {
    console.error('Failed to initialize database:', err);
    throw err;
  }
}

// Get books
ipcMain.handle('get-books', () => {
  ensureDatabase();
  return getBooks();
});

// Upload books
ipcMain.handle('upload-books', async (event, filePaths) => {
  const userDataDir = getUserDataDir();
  return await uploadBooks(filePaths, userDataDir);
});

// Delete book
ipcMain.handle('delete-book', async (event, bookId) => {
  const userDataDir = getUserDataDir();
  return await deleteBook(bookId, userDataDir);
});

// Get book file path (for epub.js)
ipcMain.handle('get-book-file-path', async (event, bookId) => {
  const userDataDir = getUserDataDir();
  return await getBookFilePath(bookId, userDataDir);
});

// Get book cover path
ipcMain.handle('get-book-cover-path', async (event, bookId) => {
  const userDataDir = getUserDataDir();
  return await getBookCoverPath(bookId, userDataDir);
});

// Get fonts
ipcMain.handle('get-fonts', () => {
  const userDataDir = getUserDataDir();
  return getFonts(userDataDir);
});

// Upload fonts
ipcMain.handle('upload-fonts', (event, filePaths) => {
  const userDataDir = getUserDataDir();
  return uploadFonts(filePaths, userDataDir);
});

// Delete font
ipcMain.handle('delete-font', (event, filename) => {
  const userDataDir = getUserDataDir();
  return deleteFont(filename, userDataDir);
});

// Get font file path
ipcMain.handle('get-font-file-path', (event, filename) => {
  const userDataDir = getUserDataDir();
  return getFontFilePath(filename, userDataDir);
});

// Preferences
ipcMain.handle('get-prefs', () => {
  ensureDatabase();
  return getPrefs();
});

ipcMain.handle('save-prefs', (event, prefs) => {
  ensureDatabase();
  return savePrefs(prefs);
});

// Progress
ipcMain.handle('get-progress', (event, bookId) => {
  ensureDatabase();
  return getProgress(bookId);
});

ipcMain.handle('save-progress', (event, bookId, progress) => {
  ensureDatabase();
  return saveProgress(bookId, progress);
});

// Bookmarks
ipcMain.handle('get-bookmarks', () => {
  ensureDatabase();
  return getBookmarks();
});

ipcMain.handle('save-bookmark', (event, bookmark) => {
  ensureDatabase();
  return saveBookmark(bookmark);
});

ipcMain.handle('delete-bookmark', (event, bookmarkId) => {
  ensureDatabase();
  return deleteBookmark(bookmarkId);
});

// Dictionary
ipcMain.handle('get-dictionary-status', () => {
  const userDataDir = getUserDataDir();
  return getDictionaryStatus(userDataDir);
});

ipcMain.handle('get-dictionary', () => {
  const userDataDir = getUserDataDir();
  return getDictionary(userDataDir);
});

ipcMain.handle('save-dictionary', (event, dictionary) => {
  const userDataDir = getUserDataDir();
  return saveDictionary(dictionary, userDataDir);
});

ipcMain.handle('delete-dictionary', () => {
  const userDataDir = getUserDataDir();
  return deleteDictionary(userDataDir);
});

// Show file dialog for selecting books
ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Window controls
ipcMain.handle('close-window', () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

ipcMain.handle('minimize-window', () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle('maximize-window', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

// Get window fullscreen state
ipcMain.handle('is-window-fullscreen', () => {
  return mainWindow ? mainWindow.isFullScreen() : false;
});

