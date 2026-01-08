import React, { useEffect, useState, useRef } from "react";
import { apiGetFonts } from "../lib/api.js";
import { defaultPrefs } from "../lib/storage.js";

// Language code to human-readable name mapping
function getLanguageName(langCode) {
  const langMap = {
    'en': 'English',
    'en-us': 'English (US)',
    'en-gb': 'English (UK)',
    'en-au': 'English (Australia)',
    'en-ca': 'English (Canada)',
    'en-ie': 'English (Ireland)',
    'en-nz': 'English (New Zealand)',
    'en-za': 'English (South Africa)',
    'es': 'Spanish',
    'es-es': 'Spanish (Spain)',
    'es-mx': 'Spanish (Mexico)',
    'es-ar': 'Spanish (Argentina)',
    'es-co': 'Spanish (Colombia)',
    'es-us': 'Spanish (US)',
    'fr': 'French',
    'fr-fr': 'French (France)',
    'fr-ca': 'French (Canada)',
    'fr-be': 'French (Belgium)',
    'de': 'German',
    'de-de': 'German (Germany)',
    'de-at': 'German (Austria)',
    'de-ch': 'German (Switzerland)',
    'it': 'Italian',
    'it-it': 'Italian (Italy)',
    'pt': 'Portuguese',
    'pt-br': 'Portuguese (Brazil)',
    'pt-pt': 'Portuguese (Portugal)',
    'ru': 'Russian',
    'ru-ru': 'Russian',
    'ja': 'Japanese',
    'ja-jp': 'Japanese',
    'zh': 'Chinese',
    'zh-cn': 'Chinese (Simplified)',
    'zh-tw': 'Chinese (Traditional)',
    'zh-hk': 'Chinese (Hong Kong)',
    'ko': 'Korean',
    'ko-kr': 'Korean',
    'ar': 'Arabic',
    'ar-sa': 'Arabic (Saudi Arabia)',
    'ar-ae': 'Arabic (UAE)',
    'nl': 'Dutch',
    'nl-nl': 'Dutch (Netherlands)',
    'nl-be': 'Dutch (Belgium)',
    'pl': 'Polish',
    'pl-pl': 'Polish',
    'tr': 'Turkish',
    'tr-tr': 'Turkish',
    'sv': 'Swedish',
    'sv-se': 'Swedish',
    'da': 'Danish',
    'da-dk': 'Danish',
    'no': 'Norwegian',
    'no-no': 'Norwegian',
    'fi': 'Finnish',
    'fi-fi': 'Finnish',
    'el': 'Greek',
    'el-gr': 'Greek',
    'he': 'Hebrew',
    'he-il': 'Hebrew',
    'hi': 'Hindi',
    'hi-in': 'Hindi',
    'th': 'Thai',
    'th-th': 'Thai',
    'vi': 'Vietnamese',
    'vi-vn': 'Vietnamese',
    'cs': 'Czech',
    'cs-cz': 'Czech',
    'hu': 'Hungarian',
    'hu-hu': 'Hungarian',
    'ro': 'Romanian',
    'ro-ro': 'Romanian',
    'uk': 'Ukrainian',
    'uk-ua': 'Ukrainian',
    'id': 'Indonesian',
    'id-id': 'Indonesian',
    'ms': 'Malay',
    'ms-my': 'Malay',
    'ca': 'Catalan',
    'ca-es': 'Catalan',
    'sk': 'Slovak',
    'sk-sk': 'Slovak',
    'hr': 'Croatian',
    'hr-hr': 'Croatian',
    'bg': 'Bulgarian',
    'bg-bg': 'Bulgarian',
    'sr': 'Serbian',
    'sr-rs': 'Serbian',
    'sl': 'Slovenian',
    'sl-si': 'Slovenian',
    'et': 'Estonian',
    'et-ee': 'Estonian',
    'lv': 'Latvian',
    'lv-lv': 'Latvian',
    'lt': 'Lithuanian',
    'lt-lt': 'Lithuanian',
    'ga': 'Irish',
    'ga-ie': 'Irish',
    'mt': 'Maltese',
    'mt-mt': 'Maltese',
    'is': 'Icelandic',
    'is-is': 'Icelandic',
    'cy': 'Welsh',
    'cy-gb': 'Welsh',
  };

  // Normalize language code to lowercase
  const normalized = langCode.toLowerCase();
  
  // Try exact match first
  if (langMap[normalized]) {
    return langMap[normalized];
  }
  
  // Try with just the base language (e.g., 'en' from 'en-us')
  const baseLang = normalized.split('-')[0];
  if (langMap[baseLang]) {
    return langMap[baseLang];
  }
  
  // If no match found, return formatted version of the code
  return langCode.split('-').map(part => 
    part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  ).join('-');
}

export default function SettingsDrawer({ open, prefs, onChange, onClose }) {
  const [fonts, setFonts] = useState([]);
  const [voices, setVoices] = useState([]);
  const bgColorInputRef = useRef(null);
  const fgColorInputRef = useRef(null);

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
      loadVoices();
    }
  }, [open]);

  function loadVoices() {
    if (!('speechSynthesis' in window)) {
      setVoices([]);
      return;
    }

    const loadVoicesList = () => {
      const availableVoices = speechSynthesis.getVoices();
      
      if (availableVoices.length === 0) {
        // Voices not loaded yet, try again after a short delay
        setTimeout(() => {
          const retryVoices = speechSynthesis.getVoices();
          if (retryVoices.length > 0) {
            formatAndSetVoices(retryVoices);
          }
        }, 100);
        return;
      }
      
      formatAndSetVoices(availableVoices);
    };

    const formatAndSetVoices = (availableVoices) => {
      // Filter and format voices
      const formattedVoices = availableVoices
        .filter(voice => {
          // Only show voices with a name
          return voice.name && voice.name.trim().length > 0;
        })
        .map(voice => ({
          name: voice.name,
          lang: voice.lang,
          langName: getLanguageName(voice.lang),
          voice: voice
        }))
        // Sort by language name, then by voice name
        .sort((a, b) => {
          if (a.langName !== b.langName) {
            return a.langName.localeCompare(b.langName);
          }
          return a.name.localeCompare(b.name);
        });
      
      setVoices(formattedVoices);
    };

    // Load voices immediately if available
    loadVoicesList();

    // Listen for voices to be loaded (important for Chrome)
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = loadVoicesList;
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

  if (!open) return null;

  return (
    <div className="drawerBackdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
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
          <label>Font weight</label>
          <input
            type="range"
            min="300"
            max="700"
            step="100"
            value={prefs.fontWeight || 400}
            onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
          />
          <div style={{width: 42, textAlign:"right"}}>{prefs.fontWeight || 400}</div>
        </div>

        <div className="row">
          <label>Vertical margins</label>
          <input
            type="range"
            min="1"
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
            min="1"
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
          <label>Text alignment</label>
          <select
            value={prefs.textAlign || 'justify'}
            onChange={(e) => onChange({ textAlign: e.target.value })}
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
            <option value="justify">Justify</option>
          </select>
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
          <label>Read the Book</label>
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px', width: '100%'}}>
            {!('speechSynthesis' in window) ? (
              <div className="muted" style={{fontSize: 11}}>
                Text-to-speech is not supported in this browser
              </div>
            ) : voices.length === 0 ? (
              <div className="muted" style={{fontSize: 11}}>
                Loading voices...
              </div>
            ) : (
              <>
                <select
                  value={prefs.voiceName || ''}
                  onChange={(e) => onChange({ voiceName: e.target.value || null })}
                >
                  <option value="">Default (browser will choose)</option>
                  {voices.map((voiceInfo, index) => (
                    <option key={index} value={voiceInfo.name}>
                      {voiceInfo.name} ({voiceInfo.langName})
                    </option>
                  ))}
                  {/* Show saved voice even if not in current list (may have changed browsers) */}
                  {prefs.voiceName && !voices.some(v => v.name === prefs.voiceName) && (
                    <option value={prefs.voiceName} disabled>
                      {prefs.voiceName} (not available)
                    </option>
                  )}
                </select>
                <div className="muted" style={{fontSize: 11}}>
                  Requires browser support for text-to-speech
                </div>
              </>
            )}
          </div>
        </div>

        <div className="row">
          <label>Background</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', position: 'relative'}}>
            <div
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg,
                border: '2px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                position: 'relative',
                zIndex: 1
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (bgColorInputRef.current) {
                  bgColorInputRef.current.click();
                }
              }}
              title={`Background color: ${prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg}`}
            />
            <input
              ref={bgColorInputRef}
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
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                zIndex: 2
              }}
            />
            <span style={{fontSize: '12px', color: 'var(--muted)'}}>
              {prefs.colors?.[prefs.themeMode || 'pure-white']?.bg || prefs.bg}
            </span>
          </div>
        </div>

        <div className="row">
          <label>Text</label>
          <div style={{display: 'flex', alignItems: 'center', gap: '8px', position: 'relative'}}>
            <div
              style={{
                width: '32px',
                height: '32px',
                backgroundColor: prefs.colors?.[prefs.themeMode || 'pure-white']?.fg || prefs.fg,
                border: '2px solid rgba(255,255,255,0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                position: 'relative',
                zIndex: 1
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (fgColorInputRef.current) {
                  fgColorInputRef.current.click();
                }
              }}
              title={`Text color: ${prefs.colors?.[prefs.themeMode || 'pure-white']?.fg || prefs.fg}`}
            />
            <input
              ref={fgColorInputRef}
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
                width: '32px',
                height: '32px',
                cursor: 'pointer',
                zIndex: 2
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

        <div className="muted" style={{fontSize: 12, padding: "8px 2px"}}>
          Tip: Long-press any word while reading to see its definition. Tap the middle of the page to show/hide the reader toolbar.
          <br />
        </div>
        </div>
      </div>
    </div>
  );
}
