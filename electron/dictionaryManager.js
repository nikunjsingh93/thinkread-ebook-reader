import fs from 'fs';
import path from 'path';

function getDictionaryPath(dataDir) {
  return path.join(dataDir, 'dictionary.json');
}

export function getDictionaryStatus(dataDir) {
  const dictPath = getDictionaryPath(dataDir);
  
  try {
    if (fs.existsSync(dictPath)) {
      const stats = fs.statSync(dictPath);
      const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
      const data = fs.readFileSync(dictPath, 'utf-8');
      const dict = JSON.parse(data);
      const wordCount = Object.keys(dict).length;
      return {
        exists: true,
        wordCount,
        sizeInMB: parseFloat(sizeInMB)
      };
    } else {
      return { exists: false, wordCount: 0 };
    }
  } catch (err) {
    console.error('Error checking dictionary status:', err);
    return { exists: false, wordCount: 0 };
  }
}

export function getDictionary(dataDir) {
  const dictPath = getDictionaryPath(dataDir);
  
  try {
    if (fs.existsSync(dictPath)) {
      const data = fs.readFileSync(dictPath, 'utf-8');
      const dict = JSON.parse(data);
      return dict;
    } else {
      return {};
    }
  } catch (err) {
    console.error('Error loading dictionary:', err);
    throw new Error('Failed to load dictionary');
  }
}

export function saveDictionary(dictionary, dataDir) {
  const dictPath = getDictionaryPath(dataDir);
  
  try {
    if (!dictionary || typeof dictionary !== 'object') {
      throw new Error('Invalid dictionary data');
    }

    const wordCount = Object.keys(dictionary).length;
    const dictString = JSON.stringify(dictionary, null, 2);
    const sizeInMB = (Buffer.byteLength(dictString, 'utf-8') / (1024 * 1024)).toFixed(2);

    fs.writeFileSync(dictPath, dictString, 'utf-8');
    
    console.log(`Dictionary saved: ${wordCount} words, ${sizeInMB}MB`);
    return {
      success: true,
      wordCount,
      sizeInMB: parseFloat(sizeInMB)
    };
  } catch (err) {
    console.error('Error saving dictionary:', err);
    throw new Error('Failed to save dictionary');
  }
}

export function deleteDictionary(dataDir) {
  const dictPath = getDictionaryPath(dataDir);
  
  try {
    if (fs.existsSync(dictPath)) {
      fs.unlinkSync(dictPath);
    }
    return { ok: true };
  } catch (err) {
    console.error('Error deleting dictionary:', err);
    throw new Error('Failed to delete dictionary');
  }
}

