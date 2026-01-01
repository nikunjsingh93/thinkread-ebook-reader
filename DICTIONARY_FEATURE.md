# Dictionary Feature

A long-press dictionary feature has been added to the ebook reader!

## How to Use

When reading a book:

1. **Desktop**: Click and hold (long-press) on any word for 500ms to see its definition
2. **Mobile/Touch**: Tap and hold on any word for 500ms to see its definition

A popup will appear showing the word and its definition from the offline dictionary.

##Features

- **Offline Dictionary**: Works completely offline with over 1000 common English words
- **Long Press Detection**: Automatically detects when you hold on a word
- **Smart Word Detection**: Can handle basic word variations (plurals, past tense, gerunds)
- **Clean UI**: Popup appears near the word you selected with a clean, modern design
- **Easy to Close**: Click anywhere outside the popup or click the X button to close it

## Dictionary Coverage

The dictionary includes:
- Over 1000 common English words
- Basic word form handling (e.g., "running" → "run", "books" → "book")
- Common words found in literature and everyday reading

If a word is not in the dictionary, you'll see a toast notification indicating it wasn't found.

## Implementation Details

- **Location**: `/web/src/lib/dictionary.js` - Main dictionary file with word definitions
- **Component**: `/web/src/components/DictionaryPopup.jsx` - Popup UI component  
- **Integration**: `/web/src/components/Reader.jsx` - Long-press detection and integration

## Expanding the Dictionary

To add more words, edit `/web/src/lib/dictionary.js` and add entries in the format:

```javascript
"word": "definition goes here",
```

The dictionary is stored as a simple JavaScript object for fast offline lookups.

