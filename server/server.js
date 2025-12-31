import express from "express";
import path from "node:path";
import fs from "node:fs";
import morgan from "morgan";
import multer from "multer";
import mime from "mime-types";
import sanitize from "sanitize-filename";
import { nanoid } from "nanoid";
import { fileURLToPath } from "node:url";
import { getDataPaths, loadState, saveStateAtomic } from "./storage.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT ? Number(process.env.PORT) : 8080;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const { booksDir, statePath } = getDataPaths(DATA_DIR);

function getExt(originalName = "") {
  const ext = path.extname(originalName).toLowerCase();
  return ext.startsWith(".") ? ext.slice(1) : ext;
}

function guessTypeByExt(ext) {
  if (ext === "epub") return "epub";
  return "unknown";
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
    const ext = getExt(file.originalname);
    // Keep it intentionally simple: EPUB only.
    if (ext !== "epub") return cb(new Error("Only .epub files are supported in this simple build."));
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

app.post("/api/upload", upload.array("files", 200), (req, res) => {
  const files = req.files || [];
  const state = loadState(statePath);

  const added = [];
  for (const f of files) {
    const ext = getExt(f.originalname);
    const type = guessTypeByExt(ext);
    const id = nanoid(12);
    const originalName = f.originalname;
    const safeTitle = path.basename(originalName, path.extname(originalName));

    const book = {
      id,
      type,
      title: safeTitle,
      originalName,
      storedName: f.filename,
      sizeBytes: f.size,
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

app.listen(PORT, () => {
  console.log(`ThinkRead running on http://localhost:${PORT}`);
  console.log(`DATA_DIR: ${DATA_DIR}`);
});
