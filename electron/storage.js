import fs from 'fs';
import path from 'path';

export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getDataPaths(dataDir) {
  const booksDir = path.join(dataDir, 'books');
  const coversDir = path.join(dataDir, 'covers');
  const fontsDir = path.join(dataDir, 'fonts');
  
  ensureDir(dataDir);
  ensureDir(booksDir);
  ensureDir(coversDir);
  ensureDir(fontsDir);
  
  return { booksDir, coversDir, fontsDir };
}

