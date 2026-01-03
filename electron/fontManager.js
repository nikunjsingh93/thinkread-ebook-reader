import fs from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import sanitize from 'sanitize-filename';
import { getDataPaths } from './storage.js';

function getExt(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ext.startsWith('.') ? ext.slice(1) : ext;
}

export function getFonts(dataDir) {
  const { fontsDir } = getDataPaths(dataDir);
  
  try {
    const files = fs.readdirSync(fontsDir);
    const fonts = files.map(filename => {
      const ext = getExt(filename);
      const name = path.basename(filename, path.extname(filename));
      // Extract font family name from filename (remove nanoid suffix)
      const fontFamily = name.replace(/-\w+$/, '').replace(/[-_]/g, ' ');
      const fontPath = path.join(fontsDir, filename);
      const encodedPath = encodeURIComponent(fontPath);
      return {
        filename,
        fontFamily,
        url: `thinkread://${encodedPath}`,
        format: ext
      };
    });
    return { fonts };
  } catch (err) {
    console.error('Error reading fonts directory:', err);
    return { fonts: [] };
  }
}

export function uploadFonts(filePaths, dataDir) {
  const { fontsDir } = getDataPaths(dataDir);
  const uploaded = [];

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      console.error(`Font file not found: ${filePath}`);
      continue;
    }

    const originalName = path.basename(filePath);
    const ext = getExt(originalName);
    const safeBase = sanitize(path.basename(originalName, path.extname(originalName))) || 'font';
    const filename = `${safeBase}-${nanoid(10)}.${ext || 'ttf'}`;
    const destPath = path.join(fontsDir, filename);

    try {
      fs.copyFileSync(filePath, destPath);
      const stats = fs.statSync(destPath);
      uploaded.push({
        filename,
        originalName,
        size: stats.size,
        uploadedAt: Date.now()
      });
    } catch (err) {
      console.error(`Error copying font file ${originalName}:`, err);
    }
  }

  return { uploaded };
}

export function deleteFont(filename, dataDir) {
  const { fontsDir } = getDataPaths(dataDir);
  const fontPath = path.join(fontsDir, filename);

  try {
    if (fs.existsSync(fontPath)) {
      fs.unlinkSync(fontPath);
    }
    return { ok: true };
  } catch (err) {
    console.error('Error deleting font:', err);
    throw new Error('Failed to delete font');
  }
}

export function getFontFilePath(filename, dataDir) {
  const { fontsDir } = getDataPaths(dataDir);
  const fontPath = path.join(fontsDir, filename);
  
  if (!fs.existsSync(fontPath)) {
    throw new Error('Font file not found');
  }

  // Return custom protocol URL for Electron (thinkread://)
  // Encode the path to handle special characters
  const encodedPath = encodeURIComponent(fontPath);
  return `thinkread://${encodedPath}`;
}

