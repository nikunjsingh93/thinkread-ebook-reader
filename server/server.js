import express from "express";
import path from "node:path";
import fs from "node:fs";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import morgan from "morgan";
import multer from "multer";
import mime from "mime-types";
import sanitize from "sanitize-filename";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";
import epubParser from "epub";
import session from "express-session";
import { getDataPaths, loadState, saveStateAtomic } from "./storage.js";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const { booksDir, coversDir, fontsDir, statePath, dictionaryPath } = getDataPaths(DATA_DIR);

function getExt(originalName = "") {
  const ext = path.extname(originalName).toLowerCase();
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

function guessTypeByExt(ext) {
  const extLower = ext.toLowerCase();
  if (extLower === "epub") return "epub";
  if (extLower === "mobi") return "mobi";
  return "unknown";
}

async function extractCoverImage(epubPath, bookId) {
  return new Promise((resolve, reject) => {
    const epub = new epubParser(epubPath);
    epub.on("end", () => {
      // Check if there's a cover image
      if (epub.metadata.cover) {
        const coverId = epub.metadata.cover;
        const coverImage = epub.manifest[coverId];
        if (coverImage && coverImage.href) {
          // Get the full path to the cover image within the epub
          epub.getImage(coverId, (error, img, mimeType) => {
            if (error) {
              console.log(`No cover found for book ${bookId}:`, error.message);
              return resolve({ cover: null, metadata: epub.metadata });
            }

            // Save the cover image
            const coverExt = mimeType === 'image/jpeg' ? 'jpg' : 'png';
            const coverFilename = `${bookId}.${coverExt}`;
            const coverPath = path.join(coversDir, coverFilename);

            fs.writeFile(coverPath, img, (err) => {
              if (err) {
                console.error(`Error saving cover for book ${bookId}:`, err);
                return resolve({ cover: null, metadata: epub.metadata });
              }
              console.log(`Extracted cover for book ${bookId}`);
              resolve({ cover: coverFilename, metadata: epub.metadata });
            });
          });
        } else {
          resolve({ cover: null, metadata: epub.metadata });
        }
      } else {
        resolve({ cover: null, metadata: epub.metadata });
      }
    });

    epub.on("error", (error) => {
      console.log(`Error parsing epub for book ${bookId}:`, error.message);
      resolve({ cover: null, metadata: null });
    });

    epub.parse();
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, booksDir),
  filename: (req, file, cb) => {
    const ext = getExt(file.originalname);
    const safeBase = sanitize(path.basename(file.originalname, path.extname(file.originalname))) || "book";
    cb(null, `${safeBase}-${nanoid(10)}.${ext || "bin"}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 1024 * 1024 * 1024, // 1GB
    files: 200,
  },
  fileFilter: (req, file, cb) => {
    const ext = getExt(file.originalname).toLowerCase();
    const allowedExts = ["epub", "mobi"];
    if (!allowedExts.includes(ext)) {
      return cb(new Error(`File type .${ext} is not supported. Supported formats: ${allowedExts.join(", ")}`));
    }
    cb(null, true);
  },
});

// Font upload configuration
const fontStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, fontsDir),
  filename: (req, file, cb) => {
    const ext = getExt(file.originalname);
    const safeBase = sanitize(path.basename(file.originalname, path.extname(file.originalname))) || "font";
    cb(null, `${safeBase}-${nanoid(10)}.${ext || "ttf"}`);
  },
});

const fontUpload = multer({
  storage: fontStorage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per font file
    files: 50,
  },
  fileFilter: (req, file, cb) => {
    const ext = getExt(file.originalname).toLowerCase();
    const allowedExts = ["ttf", "otf", "woff", "woff2"];
    if (!allowedExts.includes(ext)) {
      return cb(new Error(`Font type .${ext} is not supported. Supported formats: ${allowedExts.join(", ")}`));
    }
    cb(null, true);
  },
});

const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "50mb" })); // Increased for dictionary

// Session middleware
app.use(session({
  secret: 'thinkread-session-secret-' + nanoid(16), // Generate a unique secret
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// --- API ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// --- Authentication API ---
app.post("/api/login", (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    const state = loadState(statePath);
    const user = state.users.find(u => u.username === username && u.password === password);

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Set user in session
    req.session.userId = user.id;

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (err) {
    console.error("Error during login:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/logout", (req, res) => {
  try {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ error: "Logout failed" });
      }
      res.json({ success: true });
    });
  } catch (err) {
    console.error("Error during logout:", err);
    res.status(500).json({ error: "Logout failed" });
  }
});

app.get("/api/current-user", (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const user = state.users.find(u => u.id === req.session.userId);
    if (!user) {
      // Clear session if user doesn't exist
      req.session.destroy();
      return res.status(401).json({ error: "User not found" });
    }

    // Return user data without password
    const { password: _, ...userWithoutPassword } = user;
    res.json({ user: userWithoutPassword });
  } catch (err) {
    console.error("Error getting current user:", err);
    res.status(500).json({ error: "Failed to get current user" });
  }
});

// --- User Management API (Admin Only) ---
app.get("/api/users", (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Return all users without passwords
    const usersWithoutPasswords = state.users.map(user => {
      const { password: _, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({ users: usersWithoutPasswords });
  } catch (err) {
    console.error("Error getting users:", err);
    res.status(500).json({ error: "Failed to get users" });
  }
});

app.post("/api/users", (req, res) => {
  try {
    const { username, password, isAdmin } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password required" });
    }

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Check if user already exists
    if (state.users.find(u => u.username === username)) {
      return res.status(400).json({ error: "Username already exists" });
    }

    const newUser = {
      id: nanoid(12),
      username,
      password,
      isAdmin: Boolean(isAdmin),
      createdAt: Date.now()
    };

    state.users.push(newUser);
    saveStateAtomic(statePath, state);

    // Return user data without password
    const { password: _, ...userWithoutPassword } = newUser;
    res.json({ user: userWithoutPassword });
  } catch (err) {
    console.error("Error creating user:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
});

app.delete("/api/users/:userId", (req, res) => {
  try {
    const { userId } = req.params;

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    // Prevent deleting the current user
    if (userId === req.session.userId) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const userIndex = state.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      return res.status(404).json({ error: "User not found" });
    }

    // Count remaining admins
    const remainingAdmins = state.users.filter(u => u.id !== userId && u.isAdmin).length;
    if (remainingAdmins === 0) {
      return res.status(400).json({ error: "Cannot delete last admin user" });
    }

    // Remove user
    state.users.splice(userIndex, 1);

    // Clean up user-specific data
    if (state.prefs && state.prefs[userId]) {
      delete state.prefs[userId];
    }
    if (state.progress && state.progress[userId]) {
      delete state.progress[userId];
    }
    if (state.bookmarks) {
      state.bookmarks = state.bookmarks.filter(b => b.userId !== userId);
    }

    saveStateAtomic(statePath, state);
    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting user:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.get("/api/books", (req, res) => {
  const state = loadState(statePath);
  // Sort newest first
  const books = [...state.books].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  res.json({ books });
});

// --- User Preferences API ---
app.get("/api/prefs", (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const userPrefs = (state.prefs && state.prefs[req.session.userId]) || {};
    res.json(userPrefs);
  } catch (err) {
    console.error("Error loading prefs:", err);
    res.status(500).json({ error: "Failed to load preferences" });
  }
});

app.post("/api/prefs", async (req, res) => {
  try {
    const prefs = req.body;
    if (!prefs || typeof prefs !== 'object') {
      return res.status(400).json({ error: "Invalid preferences data" });
    }

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    // Initialize prefs object if it doesn't exist
    if (!state.prefs) state.prefs = {};
    state.prefs[req.session.userId] = prefs;
    await saveStateAtomic(statePath, state);

    res.json({ success: true });
  } catch (err) {
    console.error("Error saving prefs:", err);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

// --- Book Progress API ---
app.get("/api/progress/:bookId", (req, res) => {
  try {
    const { bookId } = req.params;
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const userProgress = state.progress?.[req.session.userId]?.[bookId] || null;
    res.json(userProgress);
  } catch (err) {
    console.error("Error loading progress:", err);
    res.status(500).json({ error: "Failed to load progress" });
  }
});

app.post("/api/progress/:bookId", async (req, res) => {
  try {
    const { bookId } = req.params;
    const progress = req.body;

    if (!progress || typeof progress !== 'object') {
      return res.status(400).json({ error: "Invalid progress data" });
    }

    if (!bookId) {
      return res.status(400).json({ error: "Book ID is required" });
    }

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    // Initialize progress structure if it doesn't exist
    if (!state.progress) state.progress = {};
    if (!state.progress[req.session.userId]) state.progress[req.session.userId] = {};

    state.progress[req.session.userId][bookId] = progress;

    await saveStateAtomic(statePath, state);

    res.json({ success: true });
  } catch (err) {
    console.error(`Error saving progress for book ${req.params.bookId}:`, err);
    res.status(500).json({ error: "Failed to save progress" });
  }
});

app.post("/api/upload", upload.array("files", 200), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required for book uploads" });
    }
  } catch (err) {
    console.error("Error checking permissions:", err);
    return res.status(500).json({ error: "Permission check failed" });
  }

  const files = req.files || [];
  const state = loadState(statePath);

  const added = [];
  for (const f of files) {
    let ext = getExt(f.originalname);
    let type = guessTypeByExt(ext);
    let storedName = f.filename;
    let finalType = type;
    let fileSize = f.size;

    // Convert MOBI to EPUB
    if (type === "mobi") {
      try {
        const inputPath = path.join(booksDir, f.filename);
        const outputPath = path.join(booksDir, `${path.basename(f.filename, path.extname(f.filename))}-${nanoid(10)}.epub`);
        
        // Use ebook-convert from Calibre to convert MOBI to EPUB
        await execAsync(`ebook-convert "${inputPath}" "${outputPath}"`);
        
        // Delete original MOBI file
        try {
          fs.unlinkSync(inputPath);
        } catch (err) {
          console.error("Error deleting original MOBI file:", err);
        }
        
        // Update file info
        storedName = path.basename(outputPath);
        finalType = "epub";
        ext = "epub";
        
        // Update file size
        try {
          const stats = fs.statSync(outputPath);
          fileSize = stats.size;
        } catch (err) {
          console.error("Error getting converted file stats:", err);
        }
      } catch (err) {
        console.error("Error converting MOBI to EPUB:", err);
        // If conversion fails, return error
        return res.status(500).json({ error: "Failed to convert MOBI file to EPUB. Please ensure Calibre is installed." });
      }
    }

    const id = nanoid(12);
    const originalName = f.originalname;
    let safeTitle = path.basename(originalName, path.extname(originalName));

    // Extract cover image and metadata for epub files
    let coverImage = null;
    let metadata = null;
    if (finalType === "epub") {
      const epubPath = path.join(booksDir, storedName);
      const result = await extractCoverImage(epubPath, id);
      coverImage = result.cover;
      metadata = result.metadata;
    }

    // Extract useful metadata fields
    let author = null;
    let publisher = null;
    let published = null;
    let language = null;
    let description = null;

    if (metadata) {
      // Try different metadata field names that EPUB parsers might use
      author = metadata.creator || metadata.author || metadata['dc:creator'] || null;
      publisher = metadata.publisher || metadata['dc:publisher'] || null;
      published = metadata.date || metadata.published || metadata['dc:date'] || null;
      language = metadata.language || metadata['dc:language'] || null;
      description = metadata.description || metadata['dc:description'] || null;

      // Handle author arrays (some EPUBs have multiple authors)
      if (Array.isArray(author)) {
        author = author.join(', ');
      }

      // Try to extract a better title from metadata if available
      const metadataTitle = metadata.title || metadata['dc:title'];
      if (metadataTitle && typeof metadataTitle === 'string' && metadataTitle.trim()) {
        safeTitle = metadataTitle.trim();
      }

      console.log(`Extracted metadata for book ${id}:`, {
        author,
        publisher,
        published,
        language,
        title: safeTitle
      });
    }

    const book = {
      id,
      type: finalType,
      title: safeTitle,
      originalName,
      storedName,
      sizeBytes: fileSize,
      coverImage,
      author,
      publisher,
      published,
      language,
      description,
      addedAt: Date.now(),
    };
    state.books.push(book);
    added.push(book);
  }

  await saveStateAtomic(statePath, state);
  res.json({ added });
});

app.delete("/api/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const state = loadState(statePath);

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required for book deletion" });
    }

    const idx = state.books.findIndex((b) => b.id === id);
    if (idx === -1) return res.status(404).json({ error: "Not found" });

    const [book] = state.books.splice(idx, 1);
    await saveStateAtomic(statePath, state);

    // best-effort remove file
    try {
      fs.unlinkSync(path.join(booksDir, book.storedName));
    } catch {}

    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting book:", err);
    res.status(500).json({ error: "Failed to delete book" });
  }
});

app.get("/api/books/:id/file", (req, res) => {
  const { id } = req.params;
  const state = loadState(statePath);
  const book = state.books.find((b) => b.id === id);
  if (!book) return res.status(404).send("Not found");

  const filePath = path.join(booksDir, book.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send("Missing file");

  const contentType = mime.lookup(filePath) || "application/octet-stream";
  res.setHeader("Content-Type", contentType);
  // inline so epubjs can fetch it
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(book.originalName)}`);
  res.sendFile(filePath);
});

app.get("/api/books/:id/cover", (req, res) => {
  const { id } = req.params;
  const state = loadState(statePath);
  const book = state.books.find((b) => b.id === id);
  if (!book || !book.coverImage) return res.status(404).send("No cover found");

  const coverPath = path.join(coversDir, book.coverImage);
  if (!fs.existsSync(coverPath)) return res.status(404).send("Cover file missing");

  const contentType = mime.lookup(coverPath) || "image/jpeg";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
  res.sendFile(coverPath);
});

// Get list of uploaded fonts
app.get("/api/fonts", (req, res) => {
  try {
    const files = fs.readdirSync(fontsDir);
    const fonts = files.map(filename => {
      const ext = getExt(filename);
      const name = path.basename(filename, path.extname(filename));
      // Extract font family name from filename (remove nanoid suffix)
      const fontFamily = name.replace(/-\w+$/, '').replace(/[-_]/g, ' ');
      return {
        filename,
        fontFamily,
        url: `/api/fonts/${filename}`,
        format: ext
      };
    });
    res.json({ fonts });
  } catch (err) {
    console.error("Error reading fonts directory:", err);
    res.json({ fonts: [] });
  }
});

// Upload fonts
app.post("/api/fonts/upload", fontUpload.array("fonts", 50), async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required for font uploads" });
    }

    const files = req.files || [];
    const uploaded = files.map(f => ({
      filename: f.filename,
      originalName: f.originalname,
      size: f.size,
      uploadedAt: Date.now()
    }));

    res.json({ uploaded });
  } catch (err) {
    console.error("Error uploading fonts:", err);
    res.status(500).json({ error: "Failed to upload fonts" });
  }
});

// Serve font files
app.get("/api/fonts/:filename", (req, res) => {
  const { filename } = req.params;
  const fontPath = path.join(fontsDir, filename);

  if (!fs.existsSync(fontPath)) {
    return res.status(404).send("Font file not found");
  }

  const ext = getExt(filename).toLowerCase();
  let contentType = "application/octet-stream";
  switch (ext) {
    case "ttf": contentType = "font/ttf"; break;
    case "otf": contentType = "font/otf"; break;
    case "woff": contentType = "font/woff"; break;
    case "woff2": contentType = "font/woff2"; break;
  }

  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
  res.setHeader("Access-Control-Allow-Origin", "*"); // Allow cross-origin for font loading
  res.sendFile(fontPath);
});

// Delete font
app.delete("/api/fonts/:filename", (req, res) => {
  const { filename } = req.params;

  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required for font deletion" });
    }

    const fontPath = path.join(fontsDir, filename);
    if (fs.existsSync(fontPath)) {
      fs.unlinkSync(fontPath);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting font:", err);
    res.status(500).json({ error: "Failed to delete font" });
  }
});

// --- Bookmarks API ---
app.get("/api/bookmarks", (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const userBookmarks = (state.bookmarks || []).filter(b => b.userId === req.session.userId);
    res.json({ bookmarks: userBookmarks });
  } catch (err) {
    console.error("Error loading bookmarks:", err);
    res.status(500).json({ error: "Failed to load bookmarks" });
  }
});

app.post("/api/bookmarks", async (req, res) => {
  try {
    const bookmark = req.body;

    if (!bookmark || typeof bookmark !== 'object') {
      return res.status(400).json({ error: "Invalid bookmark data" });
    }

    if (!bookmark.bookId || !bookmark.cfi) {
      return res.status(400).json({ error: "Book ID and CFI are required" });
    }

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    if (!state.bookmarks) state.bookmarks = [];

    // Check if bookmark already exists for this user, book and CFI
    const existingIndex = state.bookmarks.findIndex(
      b => b.userId === req.session.userId && b.bookId === bookmark.bookId && b.cfi === bookmark.cfi
    );

    if (existingIndex !== -1) {
      // Update existing bookmark
      state.bookmarks[existingIndex] = {
        ...state.bookmarks[existingIndex],
        ...bookmark,
        userId: req.session.userId,
        updatedAt: Date.now()
      };
    } else {
      // Add new bookmark
      const newBookmark = {
        id: nanoid(12),
        ...bookmark,
        userId: req.session.userId,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      state.bookmarks.push(newBookmark);
    }

    await saveStateAtomic(statePath, state);
    res.json({ success: true });
  } catch (err) {
    console.error("Error saving bookmark:", err);
    res.status(500).json({ error: "Failed to save bookmark" });
  }
});

app.delete("/api/bookmarks/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    if (!state.bookmarks) state.bookmarks = [];

    const index = state.bookmarks.findIndex(b => b.id === id && b.userId === req.session.userId);
    if (index === -1) {
      return res.status(404).json({ error: "Bookmark not found" });
    }

    // Remove the bookmark
    state.bookmarks.splice(index, 1);

    await saveStateAtomic(statePath, state);

    res.json({ success: true });
  } catch (err) {
    console.error("Error deleting bookmark:", err);
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

// --- Dictionary API ---
// Get dictionary status
app.get("/api/dictionary/status", (req, res) => {
  try {
    if (fs.existsSync(dictionaryPath)) {
      const stats = fs.statSync(dictionaryPath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      // Count words without loading entire file into memory
      const data = fs.readFileSync(dictionaryPath, "utf-8");
      const dict = JSON.parse(data);
      const wordCount = Object.keys(dict).length;
      res.json({ 
        exists: true, 
        wordCount,
        sizeInMB: parseFloat(sizeInMB)
      });
    } else {
      res.json({ exists: false, wordCount: 0 });
    }
  } catch (err) {
    console.error("Error checking dictionary status:", err);
    res.json({ exists: false, wordCount: 0 });
  }
});

// Get dictionary data
app.get("/api/dictionary", (req, res) => {
  try {
    if (fs.existsSync(dictionaryPath)) {
      const data = fs.readFileSync(dictionaryPath, "utf-8");
      const dict = JSON.parse(data);
      res.json(dict);
    } else {
      res.json({});
    }
  } catch (err) {
    console.error("Error loading dictionary:", err);
    res.status(500).json({ error: "Failed to load dictionary" });
  }
});

// Save dictionary
app.post("/api/dictionary", (req, res) => {
  try {
    const dictionary = req.body;
    if (!dictionary || typeof dictionary !== 'object') {
      return res.status(400).json({ error: "Invalid dictionary data" });
    }

    const wordCount = Object.keys(dictionary).length;
    const dictString = JSON.stringify(dictionary, null, 2);
    const sizeInMB = (Buffer.byteLength(dictString, 'utf-8') / (1024 * 1024)).toFixed(2);

    // Save to file
    fs.writeFileSync(dictionaryPath, dictString, "utf-8");
    
    console.log(`Dictionary saved: ${wordCount} words, ${sizeInMB}MB`);
    res.json({ 
      success: true, 
      wordCount,
      sizeInMB: parseFloat(sizeInMB)
    });
  } catch (err) {
    console.error("Error saving dictionary:", err);
    res.status(500).json({ error: "Failed to save dictionary" });
  }
});

// Delete dictionary
app.delete("/api/dictionary", (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const state = loadState(statePath);
    const currentUser = state.users.find(u => u.id === req.session.userId);
    if (!currentUser || !currentUser.isAdmin) {
      return res.status(403).json({ error: "Admin access required for dictionary deletion" });
    }

    if (fs.existsSync(dictionaryPath)) {
      fs.unlinkSync(dictionaryPath);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Error deleting dictionary:", err);
    res.status(500).json({ error: "Failed to delete dictionary" });
  }
});

// Multer error handler (and others)
app.use((err, req, res, next) => {
  if (err) {
    const msg = err.message || "Upload failed";
    return res.status(400).json({ error: msg });
  }
  next();
});

// --- Static web ---
const publicDir = path.join(__dirname, "public");
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, { maxAge: "1h" }));
  // SPA fallback (excluding /api)
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) return res.status(404).end();
    res.sendFile(path.join(publicDir, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.type("text/plain").send("Web build not found. Build the web app (or use Docker).");
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ThinkRead running on http://0.0.0.0:${PORT}`);
  console.log(`DATA_DIR: ${DATA_DIR}`);
});
