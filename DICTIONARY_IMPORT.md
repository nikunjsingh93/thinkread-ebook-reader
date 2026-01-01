# Dictionary Import Guide

The ebook reader now supports importing custom dictionaries to enhance the long-press word lookup feature.

## Features

- **Long-press Dictionary Lookup**: Hold any word for 500ms to see its definition
- **Offline Dictionary**: All lookups work without internet connection
- **Custom Dictionary Import**: Add your own words and definitions
- **Multiple Format Support**: Import from JSON or text-based formats
- **Persistent Storage**: Imported dictionaries are saved in your browser

## How to Use

### Long-Press to Look Up Words

1. Open any book in the reader
2. Long-press (hold) any word for about half a second
3. A popup will appear showing the word's definition
4. Click anywhere outside the popup or the X button to close it

**Note**: Long-pressing will NOT trigger page navigation, so you can look up words freely!

## Importing Dictionaries

### Accessing the Import Feature

1. Open any book
2. Click the "Aa" button in the top-right corner
3. Scroll down to the "Dictionary" section
4. Click "Choose File" under "Import Dictionary"
5. Select your dictionary file
6. Wait for the import to complete

The current dictionary size (word count) is displayed in the settings.

## Supported Dictionary Formats

### 1. JSON Format (.json)

A simple key-value object where keys are words and values are definitions:

```json
{
  "apple": "a round fruit with red or green skin",
  "book": "a written or printed work consisting of pages",
  "computer": "an electronic device for storing and processing data",
  "dictionary": "a reference book containing words and their meanings"
}
```

### 2. Text/Tab-Delimited Format (.txt, .tab, .dict)

Each line contains a word and its definition separated by a tab, pipe, or space:

```
word	definition
apple	a round fruit with red or green skin
book	a written or printed work consisting of pages
computer	an electronic device for storing and processing data
```

**Supported delimiters**:
- Tab character (`\t`)
- Pipe character (`|`)
- First space in the line

**Comments**: Lines starting with `#` are ignored

Example with pipe delimiter:
```
apple|a round fruit with red or green skin
book|a written or printed work consisting of pages
# This is a comment and will be ignored
computer|an electronic device for storing and processing data
```

### 3. Compressed StarDict Format (.dict.dz)

Gzip-compressed dictionary files in StarDict format. These files are automatically decompressed and parsed.

**Features**:
- Supports standard gzip compression
- Automatically decompresses using browser's native DecompressionStream API
- Ideal for large dictionaries (saves bandwidth and storage)
- Same text format as .dict files, just compressed

**Browser Support**:
- Modern browsers (Chrome 80+, Firefox 65+, Safari 16.4+, Edge 80+) support native decompression
- Falls back gracefully if decompression is not supported

**Example**: Many StarDict dictionaries come as `.dict.dz` files which can be imported directly without manual decompression.

## Finding Dictionary Files

### Free Dictionary Sources

1. **English Wiktionary Exports**: You can download dictionary data from Wiktionary
2. **StarDict Dictionaries**: Search for "StarDict dictionary English download" - many free dictionaries are available in .dict.dz format
3. **Custom Word Lists**: Create your own dictionary file with specialized vocabulary
4. **Academic Dictionaries**: Many universities provide free dictionary databases
5. **XDXF Dictionaries**: Can be converted to text format and imported

**Popular StarDict Dictionary Sites**:
- Many StarDict dictionaries are available online in compressed .dict.dz format
- These are ideal as they contain thousands of words in a small file size
- Simply download and import directly - no need to decompress manually!

### Creating Your Own Dictionary

You can create a simple text file with your own vocabulary:

1. Create a new text file (e.g., `my_dictionary.txt`)
2. Add one word per line with its definition:
   ```
   serendipity	finding something good without looking for it
   ephemeral	lasting for a very short time
   ubiquitous	present everywhere at the same time
   ```
3. Save the file
4. Import it through the settings

## Tips

- **Start Small**: Test with a small dictionary first to ensure the format is correct
- **Check Format**: Make sure your file uses consistent delimiters
- **Word Count**: After importing, check the word count to verify all words were added
- **Add Incrementally**: You can import multiple dictionary files - words are added to the existing dictionary
- **Case Insensitive**: All words are stored in lowercase, so lookups work regardless of capitalization

## Smart Word Matching

The dictionary automatically handles common word variations:

- **Plurals**: "books" → "book"
- **Past Tense**: "walked" → "walk"
- **Gerunds**: "walking" → "walk"

So you don't need to add every variation of every word!

## Troubleshooting

### Import Failed

- Check that your file is properly formatted
- Ensure you're using one of the supported formats (.json, .txt, .tab, .dict)
- Verify that the file isn't corrupted
- Try with a smaller test file first

### Word Not Found

- Make sure the word is in your dictionary (check the word count)
- Try the base form of the word (e.g., "run" instead of "running")
- Import a more comprehensive dictionary file

### Storage Limits

- Dictionaries are stored in browser localStorage (typically 5-10MB limit)
- For very large dictionaries (50,000+ words), you may hit storage limits
- Consider using a curated dictionary with the most common words

## Example Dictionary Files

### Small Test Dictionary (test_dict.json)
```json
{
  "test": "a procedure to establish quality or reliability",
  "example": "a thing characteristic of its kind",
  "dictionary": "a book of words with their meanings",
  "import": "to bring goods or services into a country",
  "export": "to send goods or services to another country"
}
```

### Tab-Delimited Format (words.txt)
```
hello	a greeting or expression of goodwill
goodbye	a parting phrase
please	a polite expression of request
thank	to express gratitude
welcome	to greet someone in a friendly way
```

## Advanced Usage

### Exporting Your Dictionary

The dictionary is automatically saved to your browser's localStorage. If you want to export it:

1. Open the browser console (F12)
2. Run: `localStorage.getItem('customDictionary')`
3. Copy the JSON output
4. Save it to a file for backup or sharing

### Clearing the Dictionary

To start fresh:

1. Open the browser console (F12)
2. Run: `localStorage.removeItem('customDictionary')`
3. Refresh the page

The built-in dictionary (1000+ common words) will always be available even if you clear custom dictionaries.

