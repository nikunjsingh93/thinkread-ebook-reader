import React, { useEffect, useState } from "react";
import { apiGetFonts } from "../lib/api.js";

export default function SettingsDrawer({ open, prefs, onChange, onClose }) {
  const [fonts, setFonts] = useState([]);

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

  if (!open) return null;

  return (
    <div className="drawerBackdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <h3>Reading settings</h3>
          <button className="pill" onClick={onClose}>Done</button>
        </div>

        <div className="row">
          <label>Font</label>
          <select
            value={prefs.fontFamily}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
          >
            <option value="serif">Serif</option>
            <option value="sans-serif">Sans</option>
            <option value="Georgia, serif">Georgia</option>
            <option value="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial">System</option>
            {fonts.map((font) => (
              <option key={font.filename} value={`custom:${font.filename}:${font.fontFamily}`}>
                {font.fontFamily} (Custom)
              </option>
            ))}
          </select>
        </div>

        <div className="row">
          <label>Font size</label>
          <input
            type="range"
            min="12"
            max="34"
            value={prefs.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
          <div style={{width: 42, textAlign:"right"}}>{prefs.fontSize}px</div>
        </div>

        <div className="row">
          <label>Vertical margins</label>
          <input
            type="range"
            min="10"
            max="110"
            value={prefs.verticalMargin}
            onChange={(e) => onChange({ verticalMargin: Number(e.target.value) })}
          />
          <div style={{width: 42, textAlign:"right"}}>{prefs.verticalMargin}px</div>
        </div>

        <div className="row">
          <label>Horizontal margins</label>
          <input
            type="range"
            min="10"
            max="110"
            value={prefs.horizontalMargin}
            onChange={(e) => onChange({ horizontalMargin: Number(e.target.value) })}
          />
          <div style={{width: 42, textAlign:"right"}}>{prefs.horizontalMargin}px</div>
        </div>

        <div className="row">
          <label>Line height</label>
          <input
            type="range"
            min="12"
            max="22"
            value={Math.round(prefs.lineHeight * 10)}
            onChange={(e) => onChange({ lineHeight: Number(e.target.value) / 10 })}
          />
          <div style={{width: 42, textAlign:"right"}}>{prefs.lineHeight.toFixed(1)}</div>
        </div>

        <div className="row">
          <label>Background</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: prefs.bg,
                border: '2px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={(e) => {
                // Find the hidden color input and click it
                const colorInput = e.currentTarget.nextSibling;
                if (colorInput) colorInput.click();
              }}
              title={`Background color: ${prefs.bg}`}
            />
            <input
              type="color"
              value={prefs.bg}
              onChange={(e) => onChange({ bg: e.target.value })}
              style={{
                position: 'absolute',
                opacity: 0,
                pointerEvents: 'none',
                width: '1px',
                height: '1px'
              }}
            />
            <span style={{fontSize: '12px', color: 'var(--muted)'}}>{prefs.bg}</span>
          </div>
        </div>

        <div className="row">
          <label>Text</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: prefs.fg,
                border: '2px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                position: 'relative'
              }}
              onClick={(e) => {
                // Find the hidden color input and click it
                const colorInput = e.currentTarget.nextSibling;
                if (colorInput) colorInput.click();
              }}
              title={`Text color: ${prefs.fg}`}
            />
            <input
              type="color"
              value={prefs.fg}
              onChange={(e) => onChange({ fg: e.target.value })}
              style={{
                position: 'absolute',
                opacity: 0,
                pointerEvents: 'none',
                width: '1px',
                height: '1px'
              }}
            />
            <span style={{fontSize: '12px', color: 'var(--muted)'}}>{prefs.fg}</span>
          </div>
        </div>

        <div className="muted" style={{fontSize: 12, padding: "8px 2px"}}>
          Tip: Tap the middle of the page to show/hide the reader toolbar.
        </div>
      </div>
    </div>
  );
}
