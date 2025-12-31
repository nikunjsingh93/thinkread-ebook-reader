import React, { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import SettingsDrawer from "./SettingsDrawer.jsx";
import { loadProgress, saveProgress } from "../lib/storage.js";

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function getFontFormat(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  switch (ext) {
    case 'ttf': return 'truetype';
    case 'otf': return 'opentype';
    case 'woff': return 'woff';
    case 'woff2': return 'woff2';
    default: return 'truetype';
  }
}

export default function Reader({ book, prefs, onPrefsChange, onBack, onToast }) {
  const hostRef = useRef(null);
  const renditionRef = useRef(null);
  const epubBookRef = useRef(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const [percent, setPercent] = useState(0);
  const [locationText, setLocationText] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [navigatingToPercent, setNavigatingToPercent] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);
  const [lastPageInfo, setLastPageInfo] = useState(null);
  const [originalPosition, setOriginalPosition] = useState(null);
  const [lastPositionTimer, setLastPositionTimer] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);


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
      // Check if this is a custom font that needs @font-face loading
      const isCustomFont = fontFamily.startsWith('custom:');
      let actualFontFamily = fontFamily;

      if (isCustomFont) {
        const parts = fontFamily.substring(7).split(':'); // Remove 'custom:' prefix and split filename:fontFamily
        const filename = parts[0];
        actualFontFamily = parts[1];
      }

      // Register or update the theme - epub.js will merge with existing
      // Use !important to override inline styles and embedded CSS from EPUB files
      rendition.themes.register("custom", {
        body: {
          "font-family": `${actualFontFamily} !important`,
          "font-size": `${fontSize}px !important`,
          "line-height": `${lineHeight} !important`,
          "color": `${fg} !important`,
          "background": `${bg} !important`,
        },
        // Apply to all text elements - use !important to override inline styles
        "p, span, div, li, td, th, blockquote, pre, code, em, strong, b, i, u, a": {
          "color": `${fg} !important`,
          "font-family": `${actualFontFamily} !important`,
          "font-size": `${fontSize}px !important`,
          "line-height": `${lineHeight} !important`,
        },
        // Headings - apply color and font-family but preserve relative sizing
        "h1, h2, h3, h4, h5, h6": {
          "color": `${fg} !important`,
          "font-family": `${actualFontFamily} !important`,
          "line-height": `${lineHeight} !important`,
        }
      });

      // Inject custom font CSS into the epub iframe if needed
      if (isCustomFont) {
        const filename = fontFamily.substring(7).split(':')[0]; // Extract filename from 'custom:filename:fontFamily'

        // Wait for the rendition to be ready, then inject font-face CSS
        rendition.hooks.content.register((contents) => {
          const css = `
            @font-face {
              font-family: '${actualFontFamily}';
              src: url('/api/fonts/${filename}') format('${getFontFormat(filename)}');
              font-display: swap;
            }
          `;

          // Inject the CSS into the iframe's head
          const style = contents.document.createElement('style');
          style.textContent = css;
          contents.document.head.appendChild(style);
        });
      }

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
      spread: prefs.twoPageLayout ? "auto" : "none",
      flow: "paginated",
    });
    renditionRef.current = rendition;

    const saved = loadProgress(book.id);
    const startAt = saved?.cfi || undefined;

    // Build locations (for percent) lazily
    epub.ready
      .then(() => epub.locations.generate(1600))
      .catch(() => null);

    // Wait for epub to be ready before displaying
    epub.ready.then(() => {
      // Apply prefs first, then display
      applyPrefs(rendition, prefs);

      // Display after a small delay to ensure theme is registered
      setTimeout(() => {
        if (startAt) {
          rendition.display(startAt).then(() => {
            setIsLoading(false);
          }).catch((err) => {
            console.warn("Failed to restore position, trying fallback methods");

              // Try to restore by percentage if we have it
              if (saved?.percent && saved.percent > 0) {
                setTimeout(() => {
                  try {
                    const cfiFromPercent = epub.locations.cfiFromPercentage(saved.percent);
                    if (cfiFromPercent) {
                      rendition.display(cfiFromPercent).then(() => {
                        setIsLoading(false);
                      }).catch(() => {
                        rendition.display().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
                      });
                    } else {
                      rendition.display().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
                    }
                  } catch {
                    rendition.display().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
                  }
                }, 500);
              } else {
                rendition.display().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
              }
            });
        } else {
          rendition.display().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
        }
      }, 100);
    }).catch((err) => {
      console.warn("EPUB failed to load:", err);
    });

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
      const pageText = loc?.start?.displayed?.page ? `Page ${loc.start.displayed.page}` : "";
      setLocationText(pageText);

      // Update last page info for the button
      if (pageText) {
        setLastPageInfo({ page: loc.start.displayed.page, percent: Math.round(p) });
      }

      saveProgress(book.id, { cfi, percent: p, updatedAt: Date.now() });
    };

    rendition.on("relocated", onRelocated);

    // Save progress periodically and on page visibility change
    const saveCurrentProgress = () => {
      if (destroyed) return;
      try {
        const loc = rendition.location;
        if (loc?.start?.cfi) {
          const cfi = loc.start.cfi;
          let p = 0;
          try {
            if (epub.locations?.length()) {
              p = epub.locations.percentageFromCfi(cfi) || 0;
            }
          } catch {}
          saveProgress(book.id, { cfi, percent: p, updatedAt: Date.now() });
        }
      } catch (err) {
        console.warn("Failed to save progress:", err);
      }
    };

    // Save progress every 30 seconds
    const progressInterval = setInterval(saveCurrentProgress, 30000);

    // Save progress when page becomes hidden (user switches tabs/closes browser)
    const onVisibilityChange = () => {
      if (document.hidden) {
        saveCurrentProgress();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const onKeyDown = (e) => {
      if (e.key === "ArrowRight") rendition.next();
      if (e.key === "ArrowLeft") rendition.prev();
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      destroyed = true;
      clearInterval(progressInterval);
      clearLastPositionTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("keydown", onKeyDown);

      // Save progress when component unmounts
      saveCurrentProgress();

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

    // Check if two-page layout changed and update spread
    const newSpread = prefs.twoPageLayout ? "auto" : "none";
    const spreadChanged = r.settings?.spread !== newSpread;

    if (spreadChanged) {

      // Use epub.js spread method to change layout
      setTimeout(() => {
        try {
          r.spread(newSpread);

          // Force resize and re-display
          setTimeout(() => {
            r.resize();
            if (currentCfi) {
              r.display(currentCfi).catch(() => {});
            }
          }, 50);
        } catch (err) {
          console.warn("Failed to apply spread change:", err);
          // Fallback: try direct settings change
          try {
            r.settings.spread = newSpread;
            r.resize();
          } catch (fallbackErr) {
            console.warn("Fallback also failed:", fallbackErr);
          }
        }
      }, 50);
    }

    // Apply preferences
    applyPrefs(r, prefs);

    // Resize rendition when prefs change (for margin changes)
    if (!spreadChanged) {
      requestAnimationFrame(() => {
        setTimeout(() => {
          try {
            r.resize();
          } catch {}
        }, 10);
      });

      // Force re-render by re-displaying the current page
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
    }
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

  async function goToPercent(percent, isDragging = false) {
    if (!renditionRef.current || !epubBookRef.current) return;

    try {
      if (!isDragging) {
        setNavigatingToPercent(percent);
      }

      const cfi = epubBookRef.current.locations.cfiFromPercentage(percent / 100);
      if (cfi) {
        await renditionRef.current.display(cfi);
        if (!isDragging) {
          setNavigatingToPercent(null);
        }
      }
    } catch (err) {
      console.warn("Failed to navigate to percentage:", err);
      if (!isDragging) {
        setNavigatingToPercent(null);
      }
    }
  }

  async function goToLastPosition() {
    if (!originalPosition?.cfi || !renditionRef.current) return;

    try {
      await renditionRef.current.display(originalPosition.cfi);
      clearLastPositionTimer();
      setHasDragged(false); // Hide the button after using it
      setOriginalPosition(null); // Clear the original position
    } catch (err) {
      console.warn("Failed to go to last position:", err);
    }
  }

  function handleSliderChange(e) {
    const newPercent = Number(e.target.value);

    // Clear any existing timer since they're actively navigating
    clearLastPositionTimer();

    // Capture original position on first drag
    if (!hasDragged && !originalPosition) {
      setOriginalPosition({
        percent: pct,
        page: lastPageInfo?.page,
        cfi: renditionRef.current?.location?.start?.cfi
      });
    }

    setNavigatingToPercent(newPercent);
    setHasDragged(true);
    goToPercent(newPercent, true);
  }

  function handleSliderMouseUp() {
    setNavigatingToPercent(null);
    // Start timer to clear original position after 5 minutes of reading
    startLastPositionTimer();
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      // Enter fullscreen
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Failed to enter fullscreen:', err);
      });
    } else {
      // Exit fullscreen
      document.exitFullscreen().catch(err => {
        console.warn('Failed to exit fullscreen:', err);
      });
    }
  }

  // Listen for fullscreen changes
  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(!!document.fullscreenElement);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  function startLastPositionTimer() {
    // Clear any existing timer
    if (lastPositionTimer) {
      clearTimeout(lastPositionTimer);
    }

    // Set new timer for 5 minutes (300,000 ms)
    const timer = setTimeout(() => {
      setHasDragged(false);
      setOriginalPosition(null);
      setLastPositionTimer(null);
    }, 5 * 60 * 1000); // 5 minutes

    setLastPositionTimer(timer);
  }

  function clearLastPositionTimer() {
    if (lastPositionTimer) {
      clearTimeout(lastPositionTimer);
      setLastPositionTimer(null);
    }
  }

  const pct = Math.round((percent || 0) * 100);

  const verticalMargin = clamp(prefs.verticalMargin || 30, 0, 180);
  const horizontalMargin = clamp(prefs.horizontalMargin || 46, 0, 180);

  return (
    <div className="readerShell">
      <div className={`readerTop ${!uiVisible ? 'hidden' : ''}`}>
        <button className="pill" onClick={onBack}>← Library</button>
        <div className="readerTitle" title={book.title}>{book.title}</div>
        <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
          <button
            className="pill"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{fontSize: '14px', padding: '6px'}}
          >
            {isFullscreen ? '⊡' : '⊞'}
          </button>
          <button className="pill" onClick={() => setDrawerOpen(true)}>Aa</button>
        </div>
      </div>

      <div className="readerStage">
        {/* tap zones */}
        <div className="navZone navLeft" onClick={goPrev} aria-label="Previous page" />
        <div className="navZone navRight" onClick={goNext} aria-label="Next page" />
        <div className="navZone navMid" onClick={toggleUI} aria-label="Toggle UI" />

        {isLoading && (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'var(--muted)',
            fontSize: '14px',
            zIndex: 5
          }}>
            Loading...
          </div>
        )}

        <div
          className="renditionHost"
          ref={hostRef}
          style={{
            paddingLeft: `${horizontalMargin}px`,
            paddingRight: `${horizontalMargin}px`,
            paddingTop: `${verticalMargin}px`,
            paddingBottom: `${verticalMargin}px`,
            opacity: isLoading ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}
        />
      </div>

      <div className={`bottomBar ${!uiVisible ? 'hidden' : ''}`}>
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0}}>
          {hasDragged && originalPosition && (
            <button
              className="pill"
              onClick={goToLastPosition}
              style={{fontSize: '10px', padding: '2px 6px', height: 'auto'}}
              title={`Go back to Page ${originalPosition.page} (${originalPosition.percent}%)`}
            >
              ↺ Page {originalPosition.page}
            </button>
          )}
          <span style={{fontSize: '11px', whiteSpace: 'nowrap'}}>{locationText || " "}</span>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', padding: '0 20px', position: 'relative'}}>
          <input
            type="range"
            min="0"
            max="100"
            value={navigatingToPercent !== null ? navigatingToPercent : pct}
            onChange={handleSliderChange}
            onMouseUp={handleSliderMouseUp}
            style={{
              width: '100%',
              height: '4px',
              cursor: 'pointer',
              background: 'rgba(255,255,255,0.2)',
              borderRadius: '2px'
            }}
            title={`Navigate to position: ${navigatingToPercent !== null ? navigatingToPercent : pct}%`}
          />
          {hasDragged && originalPosition && (
            <div
              style={{
                position: 'absolute',
                left: `${originalPosition.percent}%`,
                top: '50%',
                transform: 'translate(-50%, -50%)',
                width: '8px',
                height: '8px',
                backgroundColor: 'var(--accent, #007acc)',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.8)',
                boxShadow: '0 0 4px rgba(0,122,204,0.3)',
                pointerEvents: 'none',
                zIndex: 10
              }}
              title={`Original position: Page ${originalPosition.page} (${originalPosition.percent}%)`}
            />
          )}
        </div>

        <div style={{fontSize: '11px', minWidth: '40px', textAlign: 'right'}}>
          {navigatingToPercent !== null ? navigatingToPercent : pct}%
        </div>
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
