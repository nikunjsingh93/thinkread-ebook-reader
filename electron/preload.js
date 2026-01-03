const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Books
  getBooks: () => ipcRenderer.invoke('get-books'),
  uploadBooks: (filePaths) => ipcRenderer.invoke('upload-books', filePaths),
  deleteBook: (bookId) => ipcRenderer.invoke('delete-book', bookId),
  getBookFilePath: (bookId) => ipcRenderer.invoke('get-book-file-path', bookId),
  getBookCoverPath: (bookId) => ipcRenderer.invoke('get-book-cover-path', bookId),
  
  // Fonts
  getFonts: () => ipcRenderer.invoke('get-fonts'),
  uploadFonts: (filePaths) => ipcRenderer.invoke('upload-fonts', filePaths),
  deleteFont: (filename) => ipcRenderer.invoke('delete-font', filename),
  getFontFilePath: (filename) => ipcRenderer.invoke('get-font-file-path', filename),
  
  // Preferences
  getPrefs: () => ipcRenderer.invoke('get-prefs'),
  savePrefs: (prefs) => ipcRenderer.invoke('save-prefs', prefs),
  
  // Progress
  getProgress: (bookId) => ipcRenderer.invoke('get-progress', bookId),
  saveProgress: (bookId, progress) => ipcRenderer.invoke('save-progress', bookId, progress),
  
  // Bookmarks
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  saveBookmark: (bookmark) => ipcRenderer.invoke('save-bookmark', bookmark),
  deleteBookmark: (bookmarkId) => ipcRenderer.invoke('delete-bookmark', bookmarkId),
  
  // Dictionary
  getDictionaryStatus: () => ipcRenderer.invoke('get-dictionary-status'),
  getDictionary: () => ipcRenderer.invoke('get-dictionary'),
  saveDictionary: (dictionary) => ipcRenderer.invoke('save-dictionary', dictionary),
  deleteDictionary: () => ipcRenderer.invoke('delete-dictionary'),
  
  // File dialogs
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Window controls
  closeWindow: () => ipcRenderer.invoke('close-window'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  
  // Window state
  isWindowFullscreen: () => ipcRenderer.invoke('is-window-fullscreen'),
  onWindowFullscreenChanged: (callback) => {
    ipcRenderer.on('window-fullscreen-changed', (event, isFullscreen) => {
      callback(isFullscreen);
    });
    // Return cleanup function
    return () => {
      ipcRenderer.removeAllListeners('window-fullscreen-changed');
    };
  },
});

