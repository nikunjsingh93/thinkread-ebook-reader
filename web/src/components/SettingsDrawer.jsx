import React, { useEffect, useState } from "react";
import { apiGetFonts } from "../lib/api.js";
import { defaultPrefs } from "../lib/storage.js";

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
    // Load fonts when component mounts
    loadFonts();
  }, []);

  useEffect(() => {
    // Also load fonts when drawer opens (in case fonts were added)
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

  // Check if we're in Electron on macOS to add top padding for title bar
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const isMac = typeof navigator !== 'undefined' && 
    (navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
     navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
  const needsTitleBarPadding = isElectron && isMac;

  return (
    <div className="drawerBackdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="drawer" 
        onClick={(e) => e.stopPropagation()}
        style={needsTitleBarPadding ? { paddingTop: '42px' } : {}}
      >
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink: 0, marginBottom: "8px"}}>
          <h3>Reading settings</h3>
          <button className="pill" onClick={onClose}>Done</button>
        </div>

        <div style={{overflowY: "auto", overflowX: "hidden", flex: 1, paddingRight: "4px"}}>
        <div className="row">
          <label>Font</label>
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px', width: '100%'}}>
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
              {/* Fallback option for custom fonts that aren't loaded yet */}
              {prefs.fontFamily && prefs.fontFamily.startsWith('custom:') && !fonts.some(font => `custom:${font.filename}:${font.fontFamily}` === prefs.fontFamily) && (
                <option value={prefs.fontFamily}>
                  {prefs.fontFamily.split(':')[2] || 'Custom Font'} (Custom)
                </option>
              )}
            </select>
            <div className="muted" style={{fontSize: 11}}>
              Tip: Upload more fonts in app settings
            </div>
          </div>
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
          <label>Two Page Layout</label>
          <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
            <input
              type="checkbox"
              checked={prefs.twoPageLayout || false}
              onChange={(e) => onChange({ twoPageLayout: e.target.checked })}
              style={{width: '16px', height: '16px'}}
            />
            <span style={{fontSize: '14px'}}>Enable side-by-side pages</span>
          </label>
        </div>

        <div className="row">
          <label>Background</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg,
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
              title={`Background color: ${prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg}`}
            />
            <input
              type="color"
              value={prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg}
                onChange={(e) => {
                const themeMode = prefs.themeMode || 'pure-white';
                const newColors = {
                  ...prefs.colors,
                  [themeMode]: {
                    ...prefs.colors[themeMode],
                    bg: e.target.value
                  }
                };
                onChange({ colors: newColors });
              }}
              style={{
                position: 'absolute',
                opacity: 0,
                pointerEvents: 'none',
                width: '1px',
                height: '1px'
              }}
            />
            <span style={{fontSize: '12px', color: 'var(--muted)'}}>
              {prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg}
            </span>
          </div>
        </div>

        <div className="row">
          <label>Text</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
            <div
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: prefs.colors?.[prefs.themeMode || 'pure-white']?.fg || prefs.fg,
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
              title={`Text color: ${prefs.colors?.[prefs.themeMode || 'pure-white']?.fg || prefs.fg}`}
            />
            <input
              type="color"
              value={prefs.colors?.[prefs.themeMode || 'pure-white']?.fg || prefs.fg}
              onChange={(e) => {
                const themeMode = prefs.themeMode || 'pure-white';
                const newColors = {
                  ...prefs.colors,
                  [themeMode]: {
                    ...prefs.colors[themeMode],
                    fg: e.target.value
                  }
                };
                onChange({ colors: newColors });
              }}
              style={{
                position: 'absolute',
                opacity: 0,
                pointerEvents: 'none',
                width: '1px',
                height: '1px'
              }}
            />
            <span style={{fontSize: '12px', color: 'var(--muted)'}}>
              {prefs.colors?.[prefs.themeMode || 'pure-white']?.fg || prefs.fg}
            </span>
          </div>
        </div>

        <div className="row">
          <label></label>
          <button
            className="pill"
            onClick={() => {
              const themeMode = prefs.themeMode || 'pure-white';
              const defaultColors = defaultPrefs().colors;
              const newColors = {
                ...prefs.colors,
                [themeMode]: {
                  ...defaultColors[themeMode]
                }
              };
              onChange({ colors: newColors });
            }}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              opacity: 0.8
            }}
          >
            Restore Default Colors
          </button>
        </div>

        <div className="row">
          <label>Lock Orientation</label>
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <label style={{display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer'}}>
              <input
                type="checkbox"
                checked={prefs.lockOrientation || false}
                onChange={(e) => onChange({ lockOrientation: e.target.checked })}
                style={{width: '16px', height: '16px'}}
              />
              <span style={{fontSize: '14px'}}>Prevent screen rotation</span>
            </label>
            <div className="muted" style={{fontSize: 11, paddingLeft: '24px'}}>
              Note: Requires device support
            </div>
          </div>
        </div>

        <div className="muted" style={{fontSize: 12, padding: "8px 2px"}}>
          Tip: Long-press any word while reading to see its definition. Tap the middle of the page to show/hide the reader toolbar.
        </div>
        </div>
      </div>
    </div>
  );
}
