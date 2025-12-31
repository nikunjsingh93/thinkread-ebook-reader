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
import { getDataPaths, loadState, saveStateAtomic } from "./storage.js";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const { booksDir, coversDir, statePath } = getDataPaths(DATA_DIR);

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
              return resolve(null);
            }

            // Save the cover image
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
      } else {
        resolve(null);
      }
    });

    epub.on("error", (error) => {
      console.log(`Error parsing epub for book ${bookId}:`, error.message);
      resolve(null);
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

const app = express();
app.use(morgan("dev"));
app.use(express.json({ limit: "2mb" }));

// --- API ---
app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/books", (req, res) => {
  const state = loadState(statePath);
  // Sort newest first
  const books = [...state.books].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  res.json({ books });
});

app.post("/api/upload", upload.array("files", 200), async (req, res) => {
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
    const safeTitle = path.basename(originalName, path.extname(originalName));

    // Extract cover image for epub files
    let coverImage = null;
    if (finalType === "epub") {
      const epubPath = path.join(booksDir, storedName);
      coverImage = await extractCoverImage(epubPath, id);
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
    state.books.push(book);
    added.push(book);
  }

  saveStateAtomic(statePath, state);
  res.json({ added });
});

app.delete("/api/books/:id", (req, res) => {
  const { id } = req.params;
  const state = loadState(statePath);
  const idx = state.books.findIndex((b) => b.id === id);
  if (idx === -1) return res.status(404).json({ error: "Not found" });

  const [book] = state.books.splice(idx, 1);
  saveStateAtomic(statePath, state);

  // best-effort remove file
  try {
    fs.unlinkSync(path.join(booksDir, book.storedName));
  } catch {}

  res.json({ ok: true });
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
