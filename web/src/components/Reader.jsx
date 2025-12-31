import React, { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import SettingsDrawer from "./SettingsDrawer.jsx";
import { loadProgress, saveProgress } from "../lib/storage.js";

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

export default function Reader({ book, prefs, onPrefsChange, onBack, onToast, onFullscreenChange }) {
  const hostRef = useRef(null);
  const renditionRef = useRef(null);
  const epubBookRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [percent, setPercent] = useState(0);
  const [locationText, setLocationText] = useState("");

  // Notify parent when UI visibility changes
  useEffect(() => {
    onFullscreenChange?.(!uiVisible);
  }, [uiVisible, onFullscreenChange]);

  const fileUrl = useMemo(() => `/api/books/${book.id}/file`, [book.id]);

  // Apply theme settings to epub.js rendition
  function applyPrefs(rendition, p) {
    if (!rendition) return;
    const fontSize = clamp(p.fontSize, 10, 60);
    const margin = clamp(p.margin, 0, 180);
    const lineHeight = clamp(p.lineHeight, 1.0, 2.6);
    const bg = p.bg || "#f6f1e7";
    const fg = p.fg || "#1a1a1a";
    const fontFamily = p.fontFamily || "serif";

    // Set container background too
    if (hostRef.current) {
      hostRef.current.style.background = bg;
      hostRef.current.style.color = fg;
    }

    rendition.themes.register("custom", {
      body: {
        "font-family": fontFamily,
        "font-size": `${fontSize}px`,
        "line-height": `${lineHeight}`,
        "color": fg,
        "background": bg,
        "padding-left": `${margin}px`,
        "padding-right": `${margin}px`,
        "padding-top": "24px",
        "padding-bottom": "36px",
      },
      "p, span, div": {
        "color": fg
      }
    });
    rendition.themes.select("custom");
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

    applyPrefs(rendition, prefs);

    rendition.display(startAt).catch(() => rendition.display());

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
    applyPrefs(r, prefs);
  }, [prefs]);

  // Resize rendition when UI visibility changes (fullscreen toggle)
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;
    // Use requestAnimationFrame with a small delay to ensure DOM and CSS have updated
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          r.resize();
        } catch {}
      }, 10);
    });
  }, [uiVisible]);

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

  return (
    <div className="readerShell">
      {uiVisible && (
        <div className="readerTop">
          <button className="pill" onClick={onBack}>← Library</button>
          <div className="readerTitle" title={book.title}>{book.title}</div>
          <button className="pill" onClick={() => setDrawerOpen(true)}>Aa</button>
        </div>
      )}

      <div className="readerStage">
        {/* tap zones */}
        <div className="navZone navLeft" onClick={goPrev} aria-label="Previous page" />
        <div className="navZone navRight" onClick={goNext} aria-label="Next page" />
        <div className="navZone navMid" onClick={toggleUI} aria-label="Toggle UI" />

        <div className="renditionHost" ref={hostRef} />
      </div>

      {uiVisible && (
        <div className="bottomBar">
          <div>{locationText || " "}</div>
          <div>{pct}%</div>
        </div>
      )}

      <SettingsDrawer
        open={drawerOpen}
        prefs={prefs}
        onChange={onPrefsChange}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
