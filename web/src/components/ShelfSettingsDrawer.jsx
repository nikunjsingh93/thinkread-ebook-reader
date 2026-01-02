import React, { useEffect, useState, useRef } from "react";
import { apiGetFonts, apiUploadFonts, apiDeleteFont, apiGetDictionaryStatus, apiDeleteDictionary } from "../lib/api.js";
import {
  importDictionaryJSON,
  saveDictionary,
  loadDictionary
} from "../lib/dictionary.js";

export default function ShelfSettingsDrawer({ open, onClose, onEnterDeleteMode, prefs, onPrefsChange, onConfirm }) {
  const [fonts, setFonts] = useState([]);
  const [uploadingFonts, setUploadingFonts] = useState(false);
  const fontInputRef = useRef(null);
  const [dictionaryExists, setDictionaryExists] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadMessage, setDownloadMessage] = useState('');

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
      loadDictionaryStatus();
      setDownloadMessage(''); // Clear any previous messages
    }
  }, [open]);

  async function loadDictionaryStatus() {
    try {
      const status = await apiGetDictionaryStatus();
      setDictionaryExists(status.exists);
      setWordCount(status.exists ? status.wordCount : 0);
    } catch (err) {
      console.error("Failed to load dictionary status:", err);
    }
  }

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
    const performDelete = async () => {
      try {
        await apiDeleteFont(filename);
        await loadFonts(); // Reload the font list
      } catch (err) {
        alert(err?.message || "Font delete failed");
      }
    };

    if (onConfirm) {
      onConfirm(
        "Delete Font",
        "Are you sure you want to delete this font?",
        performDelete
      );
    } else {
      if (!confirm("Delete this font?")) return;
      await performDelete();
    }
  }
  
  async function handleDictionaryDownload() {
    setDownloading(true);
    setDownloadMessage('Downloading dictionary (100,000+ words)...');
    
    try {
      // Download dictionary
      const response = await fetch('https://raw.githubusercontent.com/matthewreagan/WebstersEnglishDictionary/master/dictionary.json');
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      setDownloadMessage('Processing dictionary...');
      const text = await response.text();
      const result = await importDictionaryJSON(new Blob([text], { type: 'application/json' }));
      
      if (result.success) {
        setDownloadMessage('Saving dictionary to server...');
        const saveResult = await saveDictionary();
        
        if (saveResult.success) {
          setDictionaryExists(true);
          setWordCount(saveResult.wordCount);
          setDownloadMessage(`✓ Successfully downloaded and saved ${saveResult.wordCount.toLocaleString()} words!`);
        } else {
          setDownloadMessage(`✗ Failed to save: ${saveResult.error}`);
        }
      } else {
        setDownloadMessage(`✗ Import failed: ${result.error}`);
      }
    } catch (error) {
      setDownloadMessage(`✗ Download failed: ${error.message}`);
      console.error('Dictionary download error:', error);
    } finally {
      setDownloading(false);
    }
  }

  async function handleDictionaryDelete() {
    const performDelete = async () => {
      try {
        await apiDeleteDictionary();
        setDictionaryExists(false);
        setWordCount(0);
        setDownloadMessage('✓ Dictionary deleted');

        // Reload dictionary from server (empty now)
        await loadDictionary();
      } catch (err) {
        alert(err?.message || "Dictionary delete failed");
      }
    };

    if (onConfirm) {
      onConfirm(
        "Delete Dictionary",
        "Delete the dictionary? You'll need to download it again.",
        performDelete
      );
    } else {
      if (!confirm("Delete the dictionary? You'll need to download it again.")) return;
      await performDelete();
    }
  }

  function onThemeModeChange(themeMode) {
    onPrefsChange({ themeMode });
  }

  if (!open) return null;

  return (
    <div className="drawerBackdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink: 0}}>
          <h3>App Settings</h3>
          <button className="pill" onClick={onClose}>Done</button>
        </div>

        <div style={{marginTop: "20px", overflowY: "auto", overflowX: "hidden", flex: 1, paddingRight: "4px"}}>
          <h4 style={{marginBottom: "12px", color: "var(--text)"}}>Appearance</h4>

          <div className="row">
            <label>Theme Mode</label>
            <select
              value={prefs.themeMode || 'light'}
              onChange={(e) => onThemeModeChange(e.target.value)}
            >
              <option value="pure-white">Pure White</option>
              <option value="white">White</option>
              <option value="dark">Dark</option>
              <option value="pure-black">Pure Black</option>
              <option value="eink">E-Ink</option>
            </select>
          </div>

          <div className="muted" style={{fontSize: 12, padding: "8px 2px", marginBottom: "20px"}}>
            Choose your preferred theme. Pure White and White are light themes, Dark uses warm colors, Pure Black is optimized for OLED displays.
          </div>

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
            <div style={{marginTop: "12px", padding: "8px", background: "var(--row-bg)", borderRadius: "4px"}}>
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
            <label>Current Dictionary</label>
            <div style={{fontSize: '14px', color: 'var(--muted)'}}>
              {dictionaryExists ? `${wordCount.toLocaleString()} words` : 'Not downloaded'}
            </div>
          </div>
          
          {downloadMessage && (
            <div style={{
              fontSize: '13px',
              padding: '12px',
              borderRadius: '8px',
              marginTop: '12px',
              backgroundColor: prefs.themeMode === 'eink'
                ? 'var(--row-bg)'
                : downloadMessage.startsWith('✓') 
                  ? 'rgba(0,200,0,0.15)' 
                  : downloadMessage.startsWith('⚠') 
                    ? 'rgba(255,200,0,0.15)' 
                    : downloadMessage.startsWith('Downloading') || downloadMessage.startsWith('Processing') || downloadMessage.startsWith('Saving')
                      ? 'rgba(100,100,255,0.15)'
                      : 'rgba(200,0,0,0.15)',
              color: prefs.themeMode === 'eink'
                ? 'var(--text)'
                : downloadMessage.startsWith('✓') 
                  ? '#50fa7b' 
                  : downloadMessage.startsWith('⚠') 
                    ? '#f1fa8c' 
                    : downloadMessage.startsWith('Downloading') || downloadMessage.startsWith('Processing') || downloadMessage.startsWith('Saving')
                      ? '#8be9fd'
                      : '#ff5555',
              border: prefs.themeMode === 'eink'
                ? '1px solid var(--border)'
                : `1px solid ${
                    downloadMessage.startsWith('✓') 
                      ? 'rgba(0,200,0,0.3)' 
                      : downloadMessage.startsWith('⚠') 
                        ? 'rgba(255,200,0,0.3)' 
                        : downloadMessage.startsWith('Downloading') || downloadMessage.startsWith('Processing') || downloadMessage.startsWith('Saving')
                          ? 'rgba(100,100,255,0.3)'
                          : 'rgba(200,0,0,0.3)'
                  }`,
              lineHeight: '1.5'
            }}>
              {downloadMessage}
            </div>
          )}

          <div className="row" style={{flexDirection: 'column', alignItems: 'stretch', gap: '12px', marginTop: '16px'}}>
            {!dictionaryExists ? (
              <button
                onClick={handleDictionaryDownload}
                disabled={downloading}
                className="pill"
                style={{
                  fontSize: '14px',
                  padding: '12px 24px',
                  cursor: downloading ? 'wait' : 'pointer',
                  width: '100%'
                }}
              >
                {downloading ? 'Downloading...' : 'Download Dictionary (100,000+ words)'}
              </button>
            ) : (
              <button
                onClick={handleDictionaryDelete}
                disabled={downloading}
                className="pill"
                style={{
                  fontSize: '14px',
                  padding: '12px 24px',
                  width: '100%',
                  backgroundColor: prefs.themeMode === 'eink' ? 'var(--row-bg)' : 'rgba(255, 0, 0, 0.2)',
                  border: prefs.themeMode === 'eink' ? '1px solid var(--border)' : '1px solid rgba(255, 0, 0, 0.4)',
                  color: prefs.themeMode === 'eink' ? 'var(--text)' : undefined
                }}
              >
                Remove Dictionary
              </button>
            )}
          </div>

          <div className="muted" style={{fontSize: 12, padding: "8px 2px", marginTop: "16px"}}>
            Long-press any word while reading to see its definition. The dictionary is saved on the server and persists across sessions.
          </div>
        </div>
      </div>
    </div>
  );
}
