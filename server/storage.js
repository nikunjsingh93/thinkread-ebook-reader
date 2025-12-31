import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE = { books: [] };

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function getDataPaths(dataDir) {
  const booksDir = path.join(dataDir, "books");
  const coversDir = path.join(dataDir, "covers");
  const fontsDir = path.join(dataDir, "fonts");
  const statePath = path.join(dataDir, "state.json");
  ensureDir(dataDir);
  ensureDir(booksDir);
  ensureDir(coversDir);
  ensureDir(fontsDir);
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
  return { booksDir, coversDir, fontsDir, statePath };
}

export function loadState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;
    if (!Array.isArray(parsed.books)) parsed.books = [];
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveStateAtomic(statePath, stateObj) {
  const tmp = statePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(stateObj, null, 2), "utf-8");
  fs.renameSync(tmp, statePath);
}
