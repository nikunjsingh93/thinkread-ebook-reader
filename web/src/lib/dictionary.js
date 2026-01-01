// Dictionary management using server-side storage
import { apiGetDictionary, apiSaveDictionary } from './api.js';

let dictionary = {};
let isLoaded = false;

/**
 * Load dictionary from server
 */
export async function loadDictionary() {
  if (isLoaded) return;
  
  try {
    const data = await apiGetDictionary();
    Object.assign(dictionary, data);
    isLoaded = true;
    console.log(`[Dictionary] Loaded ${Object.keys(dictionary).length} words from server`);
  } catch (error) {
    console.error('Failed to load dictionary from server:', error);
  }
}

/**
 * Save dictionary to server
 * @returns {Promise<{success: boolean, wordCount?: number, error?: string}>}
 */
export async function saveDictionary() {
  try {
    const result = await apiSaveDictionary(dictionary);
    return { success: true, wordCount: result.wordCount };
  } catch (error) {
    console.error('Failed to save dictionary to server:', error);
    return { 
      success: false, 
      error: error.message 
    };
  }
}

/**
 * Look up a word in the dictionary
 * @param {string} word - The word to look up
 * @returns {string|null} - The definition or null if not found
 */
export function lookupWord(word) {
  if (!word) return null;
  
  // Normalize the word: lowercase and trim
  const normalized = word.toLowerCase().trim();
  
  // Remove common punctuation from the end
  const cleaned = normalized.replace(/[.,!?;:'")\]}\-]+$/g, '');
  
  // Try exact match first
  if (dictionary[cleaned]) {
    return dictionary[cleaned];
  }
  
  // Try without 's' at the end (simple plural handling)
  if (cleaned.endsWith('s')) {
    const singular = cleaned.slice(0, -1);
    if (dictionary[singular]) {
      return dictionary[singular];
    }
  }
  
  // Try without 'ed' at the end (simple past tense handling)
  if (cleaned.endsWith('ed')) {
    const base = cleaned.slice(0, -2);
    if (dictionary[base]) {
      return dictionary[base];
    }
    // Try with just 'e' removed (like 'liked' -> 'like')
    const baseWithE = cleaned.slice(0, -1);
    if (dictionary[baseWithE]) {
      return dictionary[baseWithE];
    }
  }
  
  // Try without 'ing' at the end (simple gerund handling)
  if (cleaned.endsWith('ing')) {
    const base = cleaned.slice(0, -3);
    if (dictionary[base]) {
      return dictionary[base];
    }
    // Try with 'e' added back (like 'making' -> 'make')
    const baseWithE = base + 'e';
    if (dictionary[baseWithE]) {
      return dictionary[baseWithE];
    }
  }
  
  // Not found
  return null;
}

/**
 * Get the total number of words in the dictionary
 * @returns {number} - The count of words
 */
export function getWordCount() {
  return Object.keys(dictionary).length;
}

/**
 * Clear all words from the dictionary
 */
export function clearDictionary() {
  Object.keys(dictionary).forEach(key => delete dictionary[key]);
}

/**
 * Import dictionary from a JSON file
 * @param {File} file - The JSON file containing word definitions
 * @returns {Promise<{success: boolean, count: number, error?: string}>}
 */
export async function importDictionaryJSON(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    // Validate that it's an object with string keys and values
    if (typeof data !== 'object' || Array.isArray(data)) {
      return {
        success: false,
        count: 0,
        error: 'Invalid format: expected an object with word-definition pairs'
      };
    }
    
    // Clear existing dictionary
    clearDictionary();
    
    let count = 0;
    for (const [word, definition] of Object.entries(data)) {
      if (typeof word === 'string' && typeof definition === 'string') {
        dictionary[word.toLowerCase()] = definition;
        count++;
      }
    }
    
    return {
      success: true,
      count: count
    };
  } catch (error) {
    return {
      success: false,
      count: 0,
      error: error.message
    };
  }
}

// Auto-load dictionary from server on module import
loadDictionary();
