import React, { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import SettingsDrawer from "./SettingsDrawer.jsx";
import DictionaryPopup from "./DictionaryPopup.jsx";
import { loadProgress, saveProgress } from "../lib/storage.js";
import { lookupWord, loadDictionary } from "../lib/dictionary.js";

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
  const locationsReadyRef = useRef(false); // Use ref so it's accessible in event handlers
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
  const [dictionaryPopup, setDictionaryPopup] = useState(null); // { word, definition, position: { x, y } }
  const longPressTimerRef = useRef(null);
  const longPressStartRef = useRef(null);
  const longPressPreventRef = useRef(null); // Timer to start preventing default
  const dictionaryCleanupRef = useRef(null);
  const longPressTriggeredRef = useRef(false); // Track if long press was triggered to prevent click


  const fileUrl = useMemo(() => `/api/books/${book.id}/file`, [book.id]);

  // Apply theme settings to epub.js rendition
  function applyPrefs(rendition, p) {
    if (!rendition) return;
    const fontSize = clamp(p.fontSize, 10, 60);
    const lineHeight = clamp(p.lineHeight, 1.0, 2.6);
    const themeMode = p.themeMode || 'pure-white';
    const bg = p.colors?.[themeMode]?.bg || p.bg || "#f6f1e7";
    const fg = p.colors?.[themeMode]?.fg || p.fg || "#1a1a1a";
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

      // Prevent context menu on all iframe content for better mobile experience
      rendition.hooks.content.register((contents) => {
        const preventContextMenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          return false;
        };
        
        // Add context menu prevention at multiple levels with capture phase
        contents.document.addEventListener('contextmenu', preventContextMenu, true);
        contents.document.body.addEventListener('contextmenu', preventContextMenu, true);
        
        // Prevent long press context menu on touch devices
        let touchTimer = null;
        const handleTouchStart = (e) => {
          touchTimer = setTimeout(() => {
            // This is a long press - prevent default behavior
            if (e.cancelable) {
              e.preventDefault();
            }
          }, 500);
        };
        
        const handleTouchEnd = () => {
          if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
        };
        
        const handleTouchMove = () => {
          if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
        };
        
        // Add touch event listeners with capture phase
        contents.document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
        contents.document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
        contents.document.addEventListener('touchmove', handleTouchMove, { passive: true, capture: true });
        
        // Add comprehensive CSS to prevent all selection and callout behaviors
        const style = contents.document.createElement('style');
        style.textContent = `
          *, *::before, *::after {
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
            -moz-user-select: none !important;
            -ms-user-select: none !important;
            user-select: none !important;
            -webkit-tap-highlight-color: transparent !important;
          }
          body {
            -webkit-touch-callout: none !important;
            -webkit-user-select: none !important;
            user-select: none !important;
          }
        `;
        contents.document.head.appendChild(style);
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
      spread: prefs.twoPageLayout ? "auto" : "none",
      flow: "paginated",
    });
    renditionRef.current = rendition;

    const saved = loadProgress(book.id);
    const startAt = saved?.cfi || undefined;

    // Check if we have cached locations and mark as ready immediately
    if (saved?.locations && saved.locations.length > 0) {
      console.log('Found cached locations:', saved.locations.length);
      locationsReadyRef.current = true;
    }

    // Build/load locations
    epub.ready
      .then(() => {
        // Try to restore cached locations first for instant page numbers
        if (saved?.locations && saved.locations.length > 0) {
          try {
            epub.locations.load(saved.locations);
            console.log('Loaded cached locations successfully');
            
            // Trigger a re-render to update the UI with cached page numbers
            setTimeout(() => {
              if (renditionRef.current?.location?.start?.cfi) {
                const loc = renditionRef.current.location;
                onRelocated(loc);
              }
            }, 100);
            
            return Promise.resolve(); // Skip generation
          } catch (err) {
            console.warn('Failed to load cached locations, will regenerate:', err);
            locationsReadyRef.current = false;
            return epub.locations.generate(1600);
          }
        } else {
          console.log('No cached locations found, generating...');
          // No cached locations, generate them
          return epub.locations.generate(1600);
        }
      })
      .then(() => {
        // Mark locations as ready
        locationsReadyRef.current = true;
        
        // Save the generated locations for next time (only if newly generated)
        if (epub.locations?.length() && (!saved?.locations || saved.locations.length === 0)) {
          const locationsArray = epub.locations.save();
          const currentProgress = loadProgress(book.id) || {};
          saveProgress(book.id, { 
            ...currentProgress, 
            locations: locationsArray 
          });
          console.log('Saved new locations to cache:', locationsArray.length);
        }
        
        // Trigger a re-render to update the UI
        if (renditionRef.current?.location?.start?.cfi) {
          const loc = renditionRef.current.location;
          onRelocated(loc);
        }
      })
      .catch((err) => {
        console.warn('Error with locations:', err);
      });

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
      let currentPage = 0;
      let totalPages = 0;
      
      try {
        if (epub.locations?.length()) {
          p = epub.locations.percentageFromCfi(cfi) || 0;
          // Calculate continuous page number from locations array
          const locationIndex = epub.locations.locationFromCfi(cfi);
          currentPage = locationIndex > 0 ? locationIndex : 1;
          totalPages = epub.locations.length();
        }
      } catch {}
      
      setPercent(p);
      // Show "Loading..." until locations are ready, then show page numbers
      const pageText = locationsReadyRef.current && totalPages > 0 ? `Page ${currentPage} of ${totalPages}` : "Loading...";
      setLocationText(pageText);

      // Update last page info for the button
      if (locationsReadyRef.current && currentPage > 0) {
        setLastPageInfo({ page: currentPage, percent: Math.round(p) });
      }

      // Save progress while preserving existing locations
      const existingProgress = loadProgress(book.id) || {};
      saveProgress(book.id, { 
        ...existingProgress,
        cfi, 
        percent: p, 
        updatedAt: Date.now() 
      });
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
          // Preserve existing locations when saving progress
          const existingProgress = loadProgress(book.id) || {};
          saveProgress(book.id, { 
            ...existingProgress,
            cfi, 
            percent: p, 
            updatedAt: Date.now() 
          });
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
      
      // Clear long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
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

  // Dictionary long-press feature - set up after component mounts and epub loads
  useEffect(() => {
    // Load dictionary from server first
    loadDictionary().then(() => {
      console.log('[Dictionary] Dictionary loaded, setting up feature');
    });
    
    // Wait for nav zones to be rendered
    const timer = setTimeout(() => {
      console.log('[Dictionary] Setting up dictionary feature');
      
      // Add event listeners to the navigation zones (since they're on top of the iframe)
      // NavZones are in the readerStage, which is the parent of hostRef
      const readerStage = hostRef.current?.parentElement;
      const navZones = readerStage?.querySelectorAll('.navZone');
      
      const handleLongPressStart = (e) => {
        // Reset the flag
        longPressTriggeredRef.current = false;
        
        // Clear any existing timers
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
        if (longPressPreventRef.current) {
          clearTimeout(longPressPreventRef.current);
        }
        
        // Store the start position and time
        longPressStartRef.current = {
          x: e.clientX || (e.touches && e.touches[0].clientX),
          y: e.clientY || (e.touches && e.touches[0].clientY),
          time: Date.now(),
          shouldPreventDefault: false // Start as false to allow normal clicks
        };
        
        // After 100ms (short delay), start preventing default behavior
        // This allows quick taps to work normally
        longPressPreventRef.current = setTimeout(() => {
          if (longPressStartRef.current) {
            longPressStartRef.current.shouldPreventDefault = true;
          }
        }, 100);
        
        // Set a timer for long press (500ms)
        longPressTimerRef.current = setTimeout(() => {
          handleLongPress(e);
        }, 500);
      };
      
      const handleContextMenu = (e) => {
        // Always prevent context menu on navigation zones
        // We don't want context menus interfering with page navigation or dictionary lookups
        e.preventDefault();
        e.stopPropagation();
        return false;
      };
      
      const handleLongPressEnd = (e) => {
        // Clear both timers if the press ends before completion
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (longPressPreventRef.current) {
          clearTimeout(longPressPreventRef.current);
          longPressPreventRef.current = null;
        }
        longPressStartRef.current = null;
      };
      
      const handleLongPressMove = (e) => {
        // If the user moves too much, cancel the long press
        if (longPressStartRef.current) {
          const currentX = e.clientX || (e.touches && e.touches[0].clientX);
          const currentY = e.clientY || (e.touches && e.touches[0].clientY);
          const deltaX = Math.abs(currentX - longPressStartRef.current.x);
          const deltaY = Math.abs(currentY - longPressStartRef.current.y);
          
          // If movement is more than 10px, cancel long press
          if (deltaX > 10 || deltaY > 10) {
            if (longPressTimerRef.current) {
              clearTimeout(longPressTimerRef.current);
              longPressTimerRef.current = null;
            }
            if (longPressPreventRef.current) {
              clearTimeout(longPressPreventRef.current);
              longPressPreventRef.current = null;
            }
            longPressStartRef.current = null;
          }
        }
      };
      
      const handleClick = (e) => {
        // Prevent navigation if long press was triggered
        if (longPressTriggeredRef.current) {
          e.stopPropagation();
          e.preventDefault();
          longPressTriggeredRef.current = false;
          return false;
        }
      };
      
      const handleLongPress = (e) => {
        // Mark that long press was triggered
        longPressTriggeredRef.current = true;
        
        // Get the iframe and calculate position relative to it
        const iframe = hostRef.current?.querySelector('iframe');
        if (!iframe) {
          return;
        }
        
        const iframeRect = iframe.getBoundingClientRect();
        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
        
        if (!iframeDoc) {
          return;
        }
        
        // Calculate position relative to iframe
        const relativeX = longPressStartRef.current.x - iframeRect.left;
        const relativeY = longPressStartRef.current.y - iframeRect.top;
        
        // Get word at position
        let word = null;
        let range = null;
        
        // Try caretRangeFromPoint (Chrome, Safari)
        if (iframeDoc.caretRangeFromPoint) {
          range = iframeDoc.caretRangeFromPoint(relativeX, relativeY);
        }
        // Try caretPositionFromPoint (Firefox)
        else if (iframeDoc.caretPositionFromPoint) {
          const position = iframeDoc.caretPositionFromPoint(relativeX, relativeY);
          if (position) {
            range = iframeDoc.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.setEnd(position.offsetNode, position.offset);
          }
        }
        
        if (range && range.startContainer) {
          // Get the text node
          const textNode = range.startContainer;
          if (textNode.nodeType === 3) { // TEXT_NODE
            const text = textNode.textContent;
            const offset = range.startOffset;
            
            // Find word boundaries
            let start = offset;
            let end = offset;
            
            // Move start backwards to find start of word
            while (start > 0 && /[a-zA-Z]/.test(text[start - 1])) {
              start--;
            }
            
            // Move end forwards to find end of word
            while (end < text.length && /[a-zA-Z]/.test(text[end])) {
            end++;
          }
          
          word = text.substring(start, end).trim();
        }
      }
      
      if (word) {
        // Look up the word
        const definition = lookupWord(word);
          
        if (definition) {
          const x = longPressStartRef.current.x;
          const y = longPressStartRef.current.y + 20; // Offset below cursor
          
          setDictionaryPopup({
            word: word,
            definition: definition,
            position: { x, y }
          });
        } else {
          // Word not found in dictionary
          onToast?.(`"${word}" not found`);
        }
      }
    };
      
      // Attach listeners to nav zones
      if (navZones && navZones.length > 0) {
        navZones.forEach(zone => {
          zone.addEventListener('mousedown', handleLongPressStart);
          zone.addEventListener('mouseup', handleLongPressEnd);
          zone.addEventListener('mousemove', handleLongPressMove);
          zone.addEventListener('click', handleClick, true); // Capture phase to prevent navigation
          zone.addEventListener('contextmenu', handleContextMenu); // Prevent context menu
          zone.addEventListener('touchstart', handleLongPressStart, { passive: true }); // Passive for better scroll performance
          zone.addEventListener('touchend', handleLongPressEnd);
          zone.addEventListener('touchmove', handleLongPressMove, { passive: true });
        });
      }
      
      // Store cleanup function in a ref so we can call it later
      const cleanup = () => {
        if (navZones) {
          navZones.forEach(zone => {
            zone.removeEventListener('mousedown', handleLongPressStart);
            zone.removeEventListener('mouseup', handleLongPressEnd);
            zone.removeEventListener('mousemove', handleLongPressMove);
            zone.removeEventListener('click', handleClick, true);
            zone.removeEventListener('contextmenu', handleContextMenu);
            zone.removeEventListener('touchstart', handleLongPressStart);
            zone.removeEventListener('touchend', handleLongPressEnd);
            zone.removeEventListener('touchmove', handleLongPressMove);
          });
        }
      };
      
      // Return cleanup to be called on unmount
      dictionaryCleanupRef.current = cleanup;
    }, 500); // Wait 500ms for render to complete
    
    // Cleanup function
    return () => {
      clearTimeout(timer);
      if (dictionaryCleanupRef.current) {
        dictionaryCleanupRef.current();
      }
    };
  }, [book.id]); // Re-run when book changes


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
      // Show navigation indicator
      setNavigatingToPercent(originalPosition.percent);
      
      await renditionRef.current.display(originalPosition.cfi);
      
      // Clear navigation indicator after a short delay
      setTimeout(() => {
        setNavigatingToPercent(null);
      }, 100);
      
      clearLastPositionTimer();
      setHasDragged(false); // Hide the button after using it
      setOriginalPosition(null); // Clear the original position
    } catch (err) {
      console.warn("Failed to go to last position:", err);
      setNavigatingToPercent(null);
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
            style={isFullscreen ? {opacity: 0.8} : {}}
          >
            ⛶
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
        <div style={{display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px', width: '120px'}}>
          <span style={{fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>{locationText || " "}</span>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', padding: '0 20px'}}>
          <div style={{position: 'relative', width: '100%', display: 'flex', alignItems: 'center'}}>
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
          </div>
        </div>

        <div style={{fontSize: '11px', minWidth: '40px', width: '40px', textAlign: 'right'}}>
          {navigatingToPercent !== null ? navigatingToPercent : pct}%
        </div>
      </div>

      {/* Floating "Go back" button popup */}
      {hasDragged && originalPosition && (
        <div
          style={{
            position: 'fixed',
            bottom: '70px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 100,
            animation: 'fadeIn 0.2s ease-in'
          }}
        >
          <button
            className="pill"
            onClick={goToLastPosition}
            style={{
              fontSize: '12px',
              padding: '8px 12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              backdropFilter: 'blur(10px)',
              border: '1px solid var(--border)',
            }}
            title={`Go back to Page ${originalPosition.page} (${originalPosition.percent}%)`}
          >
            ↺ Return to Page {originalPosition.page}
          </button>
        </div>
      )}

      <SettingsDrawer
        open={drawerOpen}
        prefs={prefs}
        onChange={onPrefsChange}
        onClose={() => setDrawerOpen(false)}
      />

      {dictionaryPopup && (
        <DictionaryPopup
          word={dictionaryPopup.word}
          definition={dictionaryPopup.definition}
          position={dictionaryPopup.position}
          onClose={() => setDictionaryPopup(null)}
        />
      )}
    </div>
  );
}
