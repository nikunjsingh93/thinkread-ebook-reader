# ThinkRead - Electron Standalone App

This is the Electron version of ThinkRead, a standalone eBook reader application for macOS.

## Features

- **Standalone Application**: No server required - everything runs locally
- **Local Storage**: All data (books, bookmarks, progress, settings) stored locally using SQLite
- **File Management**: Books, covers, fonts, and dictionary stored in local file system
- **Native File Dialogs**: Uses Electron's native file dialogs for uploading books and fonts
- **Mac App**: Built as a native macOS application (.dmg)

## Development

### Prerequisites

- Node.js 18+ 
- npm or yarn
- For MOBI conversion: Calibre (optional, install `ebook-convert` command)

### Setup

1. Install dependencies:
```bash
npm install
cd web && npm install
```

2. Run in development mode:
```bash
npm run dev
```

This will:
- Start the Vite dev server for the web UI
- Launch Electron with hot reload

### Building

1. Build the web app:
```bash
npm run build:web
```

2. Build the Electron app for Mac:
```bash
npm run build:electron
```

The built app will be in the `dist` folder.

## Project Structure

```
.
├── electron/          # Electron main process files
│   ├── main.js       # Main Electron process
│   ├── preload.js    # Preload script (IPC bridge)
│   ├── database.js   # SQLite database operations
│   ├── storage.js    # File system utilities
│   ├── bookManager.js    # Book file management
│   ├── fontManager.js    # Font file management
│   └── dictionaryManager.js  # Dictionary file management
├── web/              # React frontend
│   └── src/
│       ├── components/   # React components
│       └── lib/          # API and storage utilities
└── data/             # Local data directory (created at runtime)
    ├── books/        # Book files
    ├── covers/       # Cover images
    ├── fonts/        # Custom fonts
    ├── dictionary.json  # Dictionary data
    └── thinkread.db  # SQLite database
```

## Data Storage

- **SQLite Database** (`thinkread.db`): Stores books metadata, preferences, reading progress, and bookmarks
- **File System**: Stores actual book files, cover images, fonts, and dictionary JSON

In development, data is stored in `./data/`.
In production, data is stored in `~/Library/Application Support/ThinkRead/`.

## IPC API

The app uses Electron's IPC for communication between renderer and main process:

- `get-books`: Get list of all books
- `upload-books`: Upload book files
- `delete-book`: Delete a book
- `get-book-file-path`: Get file path for epub.js
- `get-book-cover-path`: Get cover image path
- `get-fonts`: Get list of fonts
- `upload-fonts`: Upload font files
- `get-prefs` / `save-prefs`: Preferences
- `get-progress` / `save-progress`: Reading progress
- `get-bookmarks` / `save-bookmark` / `delete-bookmark`: Bookmarks
- `get-dictionary` / `save-dictionary`: Dictionary management

## Notes

- This branch is for Electron only - no server-side code is used
- All API calls in the frontend are replaced with IPC calls
- The app works completely offline
- MOBI files are converted to EPUB using Calibre's `ebook-convert` (if available)

