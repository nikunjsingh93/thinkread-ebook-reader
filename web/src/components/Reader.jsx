import React, { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import SettingsDrawer from "./SettingsDrawer.jsx";
import { loadProgress, saveProgress } from "../lib/storage.js";

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

export default function Reader({ book, prefs, onPrefsChange, onBack, onToast }) {
  const hostRef = useRef(null);
  const renditionRef = useRef(null);
  const epubBookRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [percent, setPercent] = useState(0);
  const [locationText, setLocationText] = useState("");


  const fileUrl = useMemo(() => `/api/books/${book.id}/file`, [book.id]);

  // Apply theme settings to epub.js rendition
  function applyPrefs(rendition, p) {
    if (!rendition) return;
    const fontSize = clamp(p.fontSize, 10, 60);
    const lineHeight = clamp(p.lineHeight, 1.0, 2.6);
    const bg = p.bg || "#f6f1e7";
    const fg = p.fg || "#1a1a1a";
    const fontFamily = p.fontFamily || "serif";

    // Set container background too
    if (hostRef.current) {
      hostRef.current.style.background = bg;
      hostRef.current.style.color = fg;
    }

    try {
      // Register or update the theme - epub.js will merge with existing
      // Use !important to override inline styles and embedded CSS from EPUB files
      rendition.themes.register("custom", {
        body: {
          "font-family": `${fontFamily} !important`,
          "font-size": `${fontSize}px !important`,
          "line-height": `${lineHeight} !important`,
          "color": `${fg} !important`,
          "background": `${bg} !important`,
        },
        // Apply to all text elements - use !important to override inline styles
        "p, span, div, li, td, th, blockquote, pre, code, em, strong, b, i, u, a": {
          "color": `${fg} !important`,
          "font-family": `${fontFamily} !important`,
          "font-size": `${fontSize}px !important`,
          "line-height": `${lineHeight} !important`,
        },
        // Headings - apply color and font-family but preserve relative sizing
        "h1, h2, h3, h4, h5, h6": {
          "color": `${fg} !important`,
          "font-family": `${fontFamily} !important`,
          "line-height": `${lineHeight} !important`,
        }
      });
      
      // Select the theme to apply it
      rendition.themes.select("custom");
    } catch (err) {
      console.error("Error applying theme:", err);
    }
  }

  useEffect(() => {
    if (book.type !== "epub") {
      onToast?.("This simple build supports EPUB only.");
      onBack?.();
      return;
    }

    let destroyed = false;

    const epub = ePub(fileUrl, { openAs: "epub" });
    epubBookRef.current = epub;

    const host = hostRef.current;
    const rendition = epub.renderTo(host, {
      width: "100%",
      height: "100%",
      spread: "none",
      flow: "paginated",
    });
    renditionRef.current = rendition;

    const saved = loadProgress(book.id);
    const startAt = saved?.cfi || undefined;

    // Apply prefs first, then display
    applyPrefs(rendition, prefs);
    
    // Display after a small delay to ensure theme is registered
    setTimeout(() => {
      rendition.display(startAt).catch(() => rendition.display());
    }, 50);

    // Build locations (for percent) lazily
    epub.ready
      .then(() => epub.locations.generate(1600))
      .catch(() => null);

    const onRelocated = (loc) => {
      if (destroyed) return;
      const cfi = loc?.start?.cfi;
      let p = 0;
      try {
        if (epub.locations?.length()) {
          p = epub.locations.percentageFromCfi(cfi) || 0;
        }
      } catch {}
      setPercent(p);
      setLocationText(loc?.start?.displayed?.page ? `Page ${loc.start.displayed.page}` : "");
      saveProgress(book.id, { cfi, percent: p, updatedAt: Date.now() });
    };

    rendition.on("relocated", onRelocated);

    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") rendition.next();
      if (e.key === "ArrowLeft") rendition.prev();
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      destroyed = true;
      window.removeEventListener("keydown", onKeyDown);
      try { rendition?.off("relocated", onRelocated); } catch {}
      try { rendition?.destroy(); } catch {}
      try { epub?.destroy(); } catch {}
      renditionRef.current = null;
      epubBookRef.current = null;
    };
  }, [book.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply prefs when changed
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;

    // Get current location before applying prefs
    const currentCfi = r.location?.start?.cfi;

    // Apply preferences
    applyPrefs(r, prefs);

    // Resize rendition when prefs change (for margin changes)
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          r.resize();
        } catch {}
      }, 10);
    });

    // Force re-render by re-displaying the current page
    // This is necessary for epub.js to apply theme changes
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (currentCfi) {
          r.display(currentCfi).catch(() => {
            // Fallback: try to get current location again and display
            try {
              const loc = r.location?.start?.cfi;
              if (loc) {
                r.display(loc).catch(() => {});
              } else {
                // If no location, try next/prev to trigger re-render
                r.next().catch(() => r.prev().catch(() => {}));
              }
            } catch {}
          });
        } else {
          // If no location, try to display first page
          r.display().catch(() => {});
        }
      }, 50);
    });
  }, [prefs]);


  async function goPrev() {
    try { await renditionRef.current?.prev(); } catch {}
  }
  async function goNext() {
    try { await renditionRef.current?.next(); } catch {}
  }
  function toggleUI() {
    setUiVisible(v => !v);
  }

  const pct = Math.round((percent || 0) * 100);

  const verticalMargin = clamp(prefs.verticalMargin || 30, 0, 180);
  const horizontalMargin = clamp(prefs.horizontalMargin || 46, 0, 180);

  return (
    <div className="readerShell">
      <div className={`readerTop ${!uiVisible ? 'hidden' : ''}`}>
        <button className="pill" onClick={onBack}>← Library</button>
        <div className="readerTitle" title={book.title}>{book.title}</div>
        <button className="pill" onClick={() => setDrawerOpen(true)}>Aa</button>
      </div>

      <div className="readerStage">
        {/* tap zones */}
        <div className="navZone navLeft" onClick={goPrev} aria-label="Previous page" />
        <div className="navZone navRight" onClick={goNext} aria-label="Next page" />
        <div className="navZone navMid" onClick={toggleUI} aria-label="Toggle UI" />

        <div
          className="renditionHost"
          ref={hostRef}
          style={{
            paddingLeft: `${horizontalMargin}px`,
            paddingRight: `${horizontalMargin}px`,
            paddingTop: `${verticalMargin}px`,
            paddingBottom: `${verticalMargin}px`,
          }}
        />
      </div>

      <div className={`bottomBar ${!uiVisible ? 'hidden' : ''}`}>
        <div>{locationText || " "}</div>
        <div>{pct}%</div>
      </div>

      <SettingsDrawer
        open={drawerOpen}
        prefs={prefs}
        onChange={onPrefsChange}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
