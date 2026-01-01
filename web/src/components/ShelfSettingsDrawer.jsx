import React, { useEffect, useState, useRef } from "react";
import { apiGetFonts, apiUploadFonts, apiDeleteFont } from "../lib/api.js";
import { 
  getWordCount, 
  importDictionaryJSON, 
  importDictionaryText,
  saveDictionary 
} from "../lib/dictionary.js";

export default function ShelfSettingsDrawer({ open, onClose, onEnterDeleteMode }) {
  const [fonts, setFonts] = useState([]);
  const [uploadingFonts, setUploadingFonts] = useState(false);
  const fontInputRef = useRef(null);
  const [wordCount, setWordCount] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const dictInputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      loadFonts();
      setWordCount(getWordCount());
      setImportMessage(''); // Clear any previous messages
    }
  }, [open]);

  async function loadFonts() {
    try {
      const data = await apiGetFonts();
      setFonts(data.fonts || []);
    } catch (err) {
      console.error("Failed to load fonts:", err);
    }
  }

  async function pickFontFiles() {
    fontInputRef.current?.click();
  }

  async function onFontFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploadingFonts(true);
    try {
      await apiUploadFonts(files);
      await loadFonts(); // Reload the font list
    } catch (err) {
      alert(err?.message || "Font upload failed");
    } finally {
      setUploadingFonts(false);
    }
  }

  async function deleteFont(filename) {
    if (!confirm("Delete this font?")) return;
    try {
      await apiDeleteFont(filename);
      await loadFonts(); // Reload the font list
    } catch (err) {
      alert(err?.message || "Font delete failed");
    }
  }
  
  async function handleDictionaryImport(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    setImportMessage('');
    
    try {
      let result;
      const fileName = file.name.toLowerCase();
      
      if (fileName.endsWith('.json')) {
        result = await importDictionaryJSON(file);
      } else if (fileName.endsWith('.txt') || fileName.endsWith('.tab') || fileName.endsWith('.dict')) {
        result = await importDictionaryText(file);
      } else {
        // Try text format as default
        result = await importDictionaryText(file);
      }
      
      if (result.success) {
        // Save to localStorage
        saveDictionary();
        setWordCount(getWordCount());
        setImportMessage(`✓ Successfully imported ${result.count} words!`);
      } else {
        setImportMessage(`✗ Import failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      setImportMessage(`✗ Import failed: ${error.message}`);
    } finally {
      setImporting(false);
      // Clear the file input
      if (dictInputRef.current) {
        dictInputRef.current.value = '';
      }
    }
  }

  if (!open) return null;

  return (
    <div className="drawerBackdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <h3>App Settings</h3>
          <button className="pill" onClick={onClose}>Done</button>
        </div>

        <div style={{marginTop: "20px"}}>
          <h4 style={{marginBottom: "12px", color: "var(--text)"}}>Library Management</h4>

          <div className="row" style={{marginBottom: "20px"}}>
            <label>Delete Books</label>
            <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
              <button
                className="pill"
                onClick={() => {
                  onClose();
                  onEnterDeleteMode();
                }}
                style={{fontSize: "12px", padding: "6px 12px"}}
              >
                Select Books to Delete
              </button>
            </div>
          </div>

          <div className="muted" style={{fontSize: 12, padding: "8px 2px", marginBottom: "20px"}}>
            Select and delete multiple books at once.
          </div>

          <h4 style={{marginBottom: "12px", color: "var(--text)"}}>Font Management</h4>

          <div className="row">
            <label>Upload Fonts</label>
            <div style={{display: "flex", gap: "8px", alignItems: "center"}}>
              <button
                className="pill"
                onClick={pickFontFiles}
                disabled={uploadingFonts}
                style={{fontSize: "12px", padding: "6px 12px"}}
              >
                {uploadingFonts ? "Uploading…" : "Upload Font"}
              </button>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,.woff,.woff2"
                multiple
                onChange={onFontFileChange}
                style={{display: "none"}}
              />
            </div>
          </div>

          {fonts.length > 0 && (
            <div style={{marginTop: "12px", padding: "8px", background: "rgba(255,255,255,0.05)", borderRadius: "4px"}}>
              <div style={{fontSize: "12px", color: "var(--muted)", marginBottom: "8px"}}>Uploaded Fonts:</div>
              {fonts.map((font) => (
                <div key={font.filename} style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "4px 0",
                  fontSize: "12px"
                }}>
                  <span style={{fontFamily: `'${font.fontFamily}'`}}>{font.fontFamily}</span>
                  <button
                    onClick={() => deleteFont(font.filename)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--muted)",
                      cursor: "pointer",
                      fontSize: "14px",
                      padding: "2px 4px"
                    }}
                    title="Delete font"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="muted" style={{fontSize: 12, padding: "8px 2px", marginTop: "16px"}}>
            Upload TTF, OTF, WOFF, or WOFF2 font files to use them in the reader.
          </div>

          <h4 style={{marginTop: "20px", marginBottom: "12px", color: "var(--text)"}}>Dictionary</h4>
          
          <div className="row">
            <label>Dictionary Size</label>
            <div style={{fontSize: '14px', color: 'var(--muted)'}}>
              {wordCount.toLocaleString()} words
            </div>
          </div>
          
          <div className="row" style={{flexDirection: 'column', alignItems: 'stretch', gap: '8px'}}>
            <label>Import Dictionary</label>
            <input
              ref={dictInputRef}
              type="file"
              accept=".json,.txt,.tab,.dict"
              onChange={handleDictionaryImport}
              disabled={importing}
              style={{
                fontSize: '14px',
                padding: '8px',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                backgroundColor: 'rgba(18,22,38,.72)',
                color: 'var(--text)',
                cursor: importing ? 'wait' : 'pointer'
              }}
            />
            <div style={{fontSize: '12px', color: 'var(--muted)', lineHeight: '1.4'}}>
              Supports: JSON (.json), Text/Tab-delimited (.txt, .tab, .dict)
              <br />
              Format: <code style={{backgroundColor: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: '2px'}}>word{'\t'}definition</code>
            </div>
            {importMessage && (
              <div style={{
                fontSize: '13px',
                padding: '8px',
                borderRadius: '4px',
                backgroundColor: importMessage.startsWith('✓') ? 'rgba(0,200,0,0.15)' : 'rgba(200,0,0,0.15)',
                color: importMessage.startsWith('✓') ? '#50fa7b' : '#ff5555',
                border: `1px solid ${importMessage.startsWith('✓') ? 'rgba(0,200,0,0.3)' : 'rgba(200,0,0,0.3)'}`
              }}>
                {importMessage}
              </div>
            )}
          </div>

          <div className="muted" style={{fontSize: 12, padding: "8px 2px", marginTop: "16px"}}>
            Long-press any word while reading to see its definition. Import custom dictionaries to expand vocabulary.
          </div>
        </div>
      </div>
    </div>
  );
}
