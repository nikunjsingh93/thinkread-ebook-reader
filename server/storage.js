import fs from "node:fs";
import path from "node:path";

const DEFAULT_STATE = { books: [], prefs: {}, progress: {}, bookmarks: [] };

// Simple in-memory lock to prevent race conditions
const saveLock = new Map();
const MAX_RETRIES = 10;
const RETRY_DELAY = 50; // milliseconds

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function getDataPaths(dataDir) {
  const booksDir = path.join(dataDir, "books");
  const coversDir = path.join(dataDir, "covers");
  const fontsDir = path.join(dataDir, "fonts");
  const statePath = path.join(dataDir, "state.json");
  const dictionaryPath = path.join(dataDir, "dictionary.json");
  ensureDir(dataDir);
  ensureDir(booksDir);
  ensureDir(coversDir);
  ensureDir(fontsDir);
  if (!fs.existsSync(statePath)) {
    fs.writeFileSync(statePath, JSON.stringify(DEFAULT_STATE, null, 2), "utf-8");
  }
  return { booksDir, coversDir, fontsDir, statePath, dictionaryPath };
}

export function loadState(statePath) {
  try {
    const raw = fs.readFileSync(statePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return DEFAULT_STATE;
    if (!Array.isArray(parsed.books)) parsed.books = [];
    if (!parsed.prefs || typeof parsed.prefs !== "object") parsed.prefs = {};
    if (!parsed.progress || typeof parsed.progress !== "object") parsed.progress = {};
    if (!Array.isArray(parsed.bookmarks)) parsed.bookmarks = [];
    return parsed;
  } catch {
    return DEFAULT_STATE;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function saveStateAtomic(statePath, stateObj) {
  const tmp = statePath + ".tmp";
  
  // Retry logic to handle concurrent writes
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Wait if another save is in progress
      while (saveLock.has(statePath)) {
        await sleep(RETRY_DELAY);
      }
      
      // Acquire lock
      saveLock.set(statePath, true);
      
      try {
        // Load current state to merge with any concurrent changes
        let currentState;
        try {
          currentState = loadState(statePath);
        } catch {
          currentState = DEFAULT_STATE;
        }
        
        // Merge the new state with current state (preserve other concurrent changes)
        // For progress, we want to merge at the book level to preserve all books' progress
        let mergedProgress = { ...(currentState.progress || {}) };
        if (stateObj.progress && typeof stateObj.progress === 'object') {
          // Merge progress objects - new state takes precedence for keys it has
          // This preserves all existing book progress while updating the specific book
          mergedProgress = { ...mergedProgress, ...stateObj.progress };
        }
        
        // For bookmarks, merge arrays (append new bookmarks, update existing ones)
        let mergedBookmarks = [...(currentState.bookmarks || [])];
        if (stateObj.bookmarks && Array.isArray(stateObj.bookmarks)) {
          // For each new bookmark, check if it exists and update or add
          stateObj.bookmarks.forEach(newBookmark => {
            const existingIndex = mergedBookmarks.findIndex(b => b.id === newBookmark.id);
            if (existingIndex !== -1) {
              mergedBookmarks[existingIndex] = newBookmark;
            } else {
              mergedBookmarks.push(newBookmark);
            }
          });
        }
        
        // For other top-level keys, merge them too (but don't overwrite progress/bookmarks)
        const mergedState = {
          ...currentState,
          ...stateObj,
          progress: mergedProgress,
          bookmarks: mergedBookmarks
        };
        
        // Write to temp file
        fs.writeFileSync(tmp, JSON.stringify(mergedState, null, 2), "utf-8");
        
        // Atomic rename
        fs.renameSync(tmp, statePath);
        
        return; // Success
      } finally {
        // Release lock
        saveLock.delete(statePath);
      }
    } catch (err) {
      // Release lock on error
      saveLock.delete(statePath);
      
      if (attempt === MAX_RETRIES - 1) {
        throw err; // Re-throw on final attempt
      }
      
      // Wait before retrying
      await sleep(RETRY_DELAY * (attempt + 1));
    }
  }
}
