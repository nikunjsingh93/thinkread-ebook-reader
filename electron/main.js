import { app, BrowserWindow, ipcMain, dialog } from 'electron';
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
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: 'hiddenInset', // macOS style
    backgroundColor: '#ffffff',
  });

  // Load the app
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '..', 'web', 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  // Open DevTools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
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

// Get books
ipcMain.handle('get-books', () => {
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
  return getPrefs();
});

ipcMain.handle('save-prefs', (event, prefs) => {
  return savePrefs(prefs);
});

// Progress
ipcMain.handle('get-progress', (event, bookId) => {
  return getProgress(bookId);
});

ipcMain.handle('save-progress', (event, bookId, progress) => {
  return saveProgress(bookId, progress);
});

// Bookmarks
ipcMain.handle('get-bookmarks', () => {
  return getBookmarks();
});

ipcMain.handle('save-bookmark', (event, bookmark) => {
  return saveBookmark(bookmark);
});

ipcMain.handle('delete-bookmark', (event, bookmarkId) => {
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

