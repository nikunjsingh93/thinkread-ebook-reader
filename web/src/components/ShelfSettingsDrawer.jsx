import React, { useEffect, useState, useRef } from "react";
import { apiGetFonts, apiUploadFonts, apiDeleteFont } from "../lib/api.js";

export default function ShelfSettingsDrawer({ open, onClose, onEnterDeleteMode }) {
  const [fonts, setFonts] = useState([]);
  const [uploadingFonts, setUploadingFonts] = useState(false);
  const fontInputRef = useRef(null);

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
        </div>
      </div>
    </div>
  );
}
