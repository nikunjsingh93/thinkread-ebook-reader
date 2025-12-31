import React, { useEffect } from "react";

export default function SettingsDrawer({ open, prefs, onChange, onClose }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose?.();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
          <label>Margins</label>
          <input
            type="range"
            min="10"
            max="110"
            value={prefs.margin}
            onChange={(e) => onChange({ margin: Number(e.target.value) })}
          />
          <div style={{width: 42, textAlign:"right"}}>{prefs.margin}px</div>
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
          <input
            type="color"
            value={prefs.bg}
            onChange={(e) => onChange({ bg: e.target.value })}
          />
        </div>

        <div className="row">
          <label>Text</label>
          <input
            type="color"
            value={prefs.fg}
            onChange={(e) => onChange({ fg: e.target.value })}
          />
        </div>

        <div className="muted" style={{fontSize: 12, padding: "8px 2px"}}>
          Tip: Tap the middle of the page to show/hide the reader toolbar.
        </div>
      </div>
    </div>
  );
}
