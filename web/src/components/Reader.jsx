import React, { useEffect, useMemo, useRef, useState } from "react";
import ePub from "epubjs";
import * as pdfjsLib from "pdfjs-dist";
import SettingsDrawer from "./SettingsDrawer.jsx";
import DictionaryPopup from "./DictionaryPopup.jsx";
import { loadProgress, saveProgress } from "../lib/storage.js";
import { lookupWord, loadDictionary } from "../lib/dictionary.js";
import { apiSaveBookmark, apiDeleteBookmark, apiGetBookmarks, apiGetFontFileUrl, apiGenerateTTS, apiGetTTSVoices, apiSaveTTSProgress, apiGetTTSProgress, apiDeleteTTSProgress } from "../lib/api.js";
import { cacheBook } from "../lib/serviceWorker.js";

// Configure PDF.js worker
// Use local worker file for Docker compatibility
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
pdfjsLib.GlobalWorkerOptions.imageResourcesPath = '/image_decoders/';

// Configure CMaps and Standard Fonts path
// This is needed for many PDFs to render text correctly
const PDF_ASSETS_CONFIG = {
  cMapUrl: '/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/standard_fonts/',
  wasmUrl: '/wasm/',
  imageResourcesPath: '/image_decoders/',
};

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// Simple language name formatter
function formatLanguageName(langCode) {
  if (!langCode) return '';
  // Replace underscores with hyphens and capitalize
  return langCode.replace('_', '-');
}

// Detect iOS devices
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
}

// Selection API approach to extract word at coordinates
function extractWordUsingSelectionAPI(doc, x, y) {
  try {
    // Save current selection
    const savedSelection = doc.getSelection();
    const savedRange = savedSelection.rangeCount > 0 ? savedSelection.getRangeAt(0).cloneRange() : null;

    // Create a new range at the coordinates
    const range = doc.caretRangeFromPoint(x, y);
    if (!range) {
      console.log('[Dictionary] Selection API: caretRangeFromPoint returned null');
      return null;
    }

    // Expand the range to select the word
    const selection = doc.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Try to expand selection to word boundaries
    if (selection.modify) {
      // Use modify method if available (Chrome, Safari)
      selection.modify('extend', 'backward', 'word');
      selection.modify('extend', 'forward', 'word');
    } else {
      // Fallback: manually expand the range
      expandRangeToWord(range);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    // Get the selected text
    const selectedText = selection.toString().trim();
    console.log('[Dictionary] Selection API selected text:', selectedText);

    // Extract the word from the selection
    const words = selectedText.match(/\b[a-zA-Z]{3,}\b/g);
    const word = words && words.length > 0 ? words[0] : null;

    // Restore original selection
    selection.removeAllRanges();
    if (savedRange) {
      selection.addRange(savedRange);
    }

    return word;
  } catch (error) {
    console.log('[Dictionary] Selection API failed:', error);
    return null;
  }
}

// Helper function to expand range to word boundaries manually
function expandRangeToWord(range) {
  if (!range || !range.startContainer) return;

  // Move start backward to word boundary
  while (range.startOffset > 0) {
    const char = range.startContainer.textContent[range.startOffset - 1];
    if (!/\w/.test(char)) break;
    range.setStart(range.startContainer, range.startOffset - 1);
  }

  // Move end forward to word boundary
  while (range.endOffset < range.endContainer.textContent.length) {
    const char = range.endContainer.textContent[range.endOffset];
    if (!/\w/.test(char)) break;
    range.setEnd(range.endContainer, range.endOffset + 1);
  }
}

// Helper function to find the text node containing a specific word
function findTextNodeContainingWord(element, word) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null, false);

  let node;
  while (node = walker.nextNode()) {
    if (node.textContent && node.textContent.includes(word)) {
      return node;
    }
  }

  return null;
}

// Programmatic selection creation at a point
function createSelectionAtPoint(doc, x, y) {
  try {
    console.log('[Dictionary] Starting programmatic selection at:', x, y);

    // Find the element at the click position
    const element = doc.elementFromPoint(x, y);
    if (!element) {
      console.log('[Dictionary] No element found at coordinates');
      return null;
    }

    // Get all text content from this element and its children
    const textContent = element.textContent || '';
    if (!textContent.trim()) {
      console.log('[Dictionary] Element has no text content');
      return null;
    }

    console.log('[Dictionary] Element text content:', textContent.substring(0, 100));

    // Find all words in the text
    const words = textContent.match(/\b[a-zA-Z]{3,}\b/g);
    if (!words || words.length === 0) {
      console.log('[Dictionary] No words found in element');
      return null;
    }

    console.log('[Dictionary] Found words:', words);

    // Try to determine which word was clicked by creating ranges for each word
    // and checking which word's bounding rect contains the click coordinates
    let bestWord = null;
    let bestDistance = Infinity;

    for (const word of words) {
      try {
        // Find the text node containing this word
        const textNode = findTextNodeContainingWord(element, word);
        if (!textNode) continue;

        const wordStart = textNode.textContent.indexOf(word);
        if (wordStart === -1) continue;

        // Create a range for this word
        const range = doc.createRange();
        range.setStart(textNode, wordStart);
        range.setEnd(textNode, wordStart + word.length);

        // Get bounding rect for this word
        const rect = range.getBoundingClientRect();

        // Check if click coordinates are within this word's rect
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          console.log('[Dictionary] Found exact word match:', word);
          return word;
        }

        // If not exact match, calculate distance to center of word
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;
        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        if (distance < bestDistance) {
          bestDistance = distance;
          bestWord = word;
        }
      } catch (e) {
        console.log('[Dictionary] Error checking word:', word, e);
      }
    }

    if (bestWord) {
      console.log('[Dictionary] Best word match:', bestWord, 'distance:', bestDistance);
      return bestWord;
    }

    // Final fallback: return the first word
    console.log('[Dictionary] Using first word as final fallback:', words[0]);
    return words[0];

  } catch (error) {
    console.log('[Dictionary] Programmatic selection failed:', error);
    return null;
  }
}

// Fallback function to extract word from element when caretRangeFromPoint fails
function extractWordFromElementAtPosition(element, x, y) {
  if (!element || !element.textContent) {
    return null;
  }

  const text = element.textContent;
  console.log('[Dictionary] Element text content:', text.substring(0, 100) + '...');

  // Find all words in the text
  const words = text.match(/\b[a-zA-Z]{3,}\b/g); // Words with 3+ letters
  if (!words || words.length === 0) {
    return null;
  }

  console.log('[Dictionary] Found words in element:', words.slice(0, 5));

  // Try to estimate which word was clicked based on position
  try {
    const rect = element.getBoundingClientRect();
    const elementWidth = rect.width;
    const relativeX = x - rect.left;

    // Estimate position in text based on relative X position
    const textLength = text.length;
    const charIndex = Math.floor((relativeX / elementWidth) * textLength);

    console.log('[Dictionary] Estimated char index:', charIndex, 'of', textLength);

    // Find the word that contains this character index
    let currentIndex = 0;
    for (const word of words) {
      const wordStart = text.indexOf(word, currentIndex);
      const wordEnd = wordStart + word.length;

      if (charIndex >= wordStart && charIndex <= wordEnd) {
        console.log('[Dictionary] Selected word based on position:', word);
        return word;
      }

      currentIndex = wordEnd;
    }
  } catch (e) {
    console.log('[Dictionary] Position-based selection failed:', e);
  }

  // Fallback: return the middle word or first word
  const middleIndex = Math.floor(words.length / 2);
  console.log('[Dictionary] Using middle word as fallback:', words[middleIndex]);
  return words[middleIndex] || words[0];
}

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

// Helper to get font URL (works in Electron, mobile, and web)
async function getFontUrl(filename) {
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const isMobile = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform();

  if (isElectron || isMobile) {
    try {
      return await apiGetFontFileUrl(filename);
    } catch (err) {
      console.warn('Failed to get font URL, using fallback:', err);
      return `/api/fonts/${filename}`;
    }
  }
  return `/api/fonts/${filename}`;
}

export default function Reader({ book, prefs, onPrefsChange, onBack, onToast, bookmarkCfi, bookmarkUpdateTrigger }) {
  const hostRef = useRef(null);
  const renditionRef = useRef(null);
  const epubBookRef = useRef(null);
  const locationsReadyRef = useRef(false); // Use ref so it's accessible in event handlers
  const savedProgressRef = useRef(null); // Use ref to store current progress so it's accessible in closures
  const currentBookIdRef = useRef(null); // Track current book ID to ensure we're saving to the right book
  const isRestoringRef = useRef(false); // Flag to prevent saving progress while restoring position
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
  const [hasBookmark, setHasBookmark] = useState(false); // Track if current page has a bookmark
  const [tocOpen, setTocOpen] = useState(false);
  const [toc, setToc] = useState([]); // Table of contents
  const tocRef = useRef([]); // Ref for TOC to avoid stale closures in event handlers
  useEffect(() => { tocRef.current = toc; }, [toc]);
  const longPressTimerRef = useRef(null);
  const pdfDocRef = useRef(null); // PDF document reference
  const pdfPageNumRef = useRef(1); // Current PDF page number
  const pdfTotalPagesRef = useRef(0); // Total PDF pages
  const pdfZoomRef = useRef(1.0); // PDF zoom level (default 1.0, will be set based on container)
  const pdfDefaultScaleRef = useRef(1.0); // Default scale for fitting container
  const [pdfScrollMode, setPdfScrollMode] = useState('vertical'); // 'vertical' or 'horizontal' - default vertical
  const longPressStartRef = useRef(null);
  const longPressPreventRef = useRef(null); // Timer to start preventing default
  const dictionaryCleanupRef = useRef(null);
  const longPressTriggeredRef = useRef(false); // Track if long press was triggered to prevent click
  const [isSpeaking, setIsSpeaking] = useState(false);
  const isSpeakingRef = useRef(false);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  const audioRef = useRef(null); // Audio element for playback
  const audioSourceRef = useRef(null); // Current audio source URL
  const ttsTextRef = useRef(null); // Store extracted text
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentChapterName, setCurrentChapterName] = useState('');
  const [ttsVoices, setTtsVoices] = useState([]);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [showAudioPlayer, setShowAudioPlayer] = useState(false);
  const savedAudioPositionRef = useRef(0); // Store position to resume from
  const pdfObserverRef = useRef(null); // Observer for lazy loading PDF pages in vertical mode


  const fileUrl = useMemo(() => `/api/books/${book.id}/file`, [book.id]);
  const contentsUrl = useMemo(() => `/api/books/${book.id}/contents/`, [book.id]);

  // Cache book for offline reading when opened - but ONLY if it's reasonably sized
  useEffect(() => {
    // Only auto-cache books smaller than 50MB to avoid freezing on large books
    // If book.sizeBytes is missing, we assume it's small enough or let the user manually cache it
    if (book.id && fileUrl && (!book.sizeBytes || book.sizeBytes < 50 * 1024 * 1024)) {
      cacheBook(book.id, fileUrl);
    }
  }, [book.id, fileUrl, book.sizeBytes]);

  // Apply theme settings to epub.js rendition
  function applyPrefs(rendition, p) {
    if (!rendition) return;
    const fontSize = clamp(p.fontSize, 10, 60);
    const lineHeight = clamp(p.lineHeight, 1.0, 2.6);
    const themeMode = p.themeMode || 'pure-white';
    const bg = p.colors?.[themeMode]?.bg || p.bg || "#f6f1e7";
    const fg = p.colors?.[themeMode]?.fg || p.fg || "#1a1a1a";
    const fontFamily = p.fontFamily || "serif";
    const fontWeight = p.fontWeight || 400;
    const textAlign = p.textAlign || "justify";

    // Set container background too
    if (hostRef.current) {
      hostRef.current.style.background = bg;
      hostRef.current.style.color = fg;
    }

    try {
      // Check if this is a custom font that needs @font-face loading
      const isCustomFont = fontFamily.startsWith('custom:');
      let actualFontFamily = fontFamily;
      let needsFontLoading = false;
      let fontFilename = null;

      if (isCustomFont) {
        const parts = fontFamily.substring(7).split(':'); // Remove 'custom:' prefix and split filename:fontFamily
        fontFilename = parts[0];
        actualFontFamily = parts[1];
        needsFontLoading = true;
      }

      // Register or update the theme - epub.js will merge with existing
      // Use !important to override inline styles and embedded CSS from EPUB files
      rendition.themes.register("custom", {
        body: {
          "font-family": `${actualFontFamily} !important`,
          "font-size": `${fontSize}px !important`,
          "font-weight": `${fontWeight} !important`,
          "line-height": `${lineHeight} !important`,
          "text-align": `${textAlign} !important`,
          "color": `${fg} !important`,
          "background": `${bg} !important`,
        },
        // Apply to all text elements - use !important to override inline styles
        "p, span, div, li, td, th, blockquote, pre, code, em, strong, b, i, u, a": {
          "color": `${fg} !important`,
          "font-family": `${actualFontFamily} !important`,
          "font-size": `${fontSize}px !important`,
          "font-weight": `${fontWeight} !important`,
          "line-height": `${lineHeight} !important`,
          "text-align": `${textAlign} !important`,
        },
        // Headings - apply color and font-family but preserve relative sizing
        "h1, h2, h3, h4, h5, h6": {
          "color": `${fg} !important`,
          "font-family": `${actualFontFamily} !important`,
          "font-weight": `${fontWeight} !important`,
          "line-height": `${lineHeight} !important`,
        }
      });

      // Inject font CSS into the epub iframe if needed (for custom fonts)
      if (needsFontLoading && fontFilename) {
        // Wait for the rendition to be ready, then inject font-face CSS
        rendition.hooks.content.register(async (contents) => {
          const fontUrl = await getFontUrl(fontFilename);
          const css = `
            @font-face {
              font-family: '${actualFontFamily}';
              src: url('${fontUrl}') format('${getFontFormat(fontFilename)}');
              font-display: swap;
            }
            body, p, div, span, h1, h2, h3, h4, h5, h6 {
              font-family: '${actualFontFamily}' !important;
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
        contents.document.addEventListener('touchstart', handleTouchStart, { passive: false, capture: true });
        contents.document.addEventListener('touchend', handleTouchEnd, { passive: true, capture: true });
        contents.document.addEventListener('touchmove', handleTouchMove, { passive: true, capture: true });

        // Add comprehensive CSS to prevent all selection and callout behaviors
        // Also prevent images from being split across pages
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
          img {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            -webkit-column-break-inside: avoid !important;
            display: block !important;
            max-width: 100% !important;
            height: auto !important;
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

  // Function to render a PDF page with zoom support
  const renderPDFPage = async (pageNum, container, zoomLevel = null) => {
    if (!pdfDocRef.current || !container) return;

    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });

      // Get container dimensions (accounting for padding)
      const containerRect = container.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(container);
      const paddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
      const paddingRight = parseFloat(computedStyle.paddingRight) || 0;
      const paddingTop = parseFloat(computedStyle.paddingTop) || 0;
      const paddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

      const availableWidth = containerRect.width - paddingLeft - paddingRight;
      const availableHeight = containerRect.height - paddingTop - paddingBottom;

      // Calculate default scale to fit container while maintaining aspect ratio
      const scaleX = availableWidth / viewport.width;
      const scaleY = availableHeight / viewport.height;
      const fitScale = Math.min(scaleX, scaleY);

      // Store default scale if not already set or if resetting
      if (!pdfDefaultScaleRef.current || zoomLevel === null || zoomLevel === 1.0) {
        pdfDefaultScaleRef.current = fitScale;
      }

      // Use provided zoom level or current zoom, multiplied by default scale
      const baseScale = pdfDefaultScaleRef.current;
      const zoom = zoomLevel !== null ? zoomLevel : pdfZoomRef.current;
      const finalScale = baseScale * zoom;

      // Cap scale for performance (max 3x zoom)
      const cappedScale = Math.min(finalScale, 3.0);

      // Create viewport at the logical scale (what we want to display)
      const scaledViewport = page.getViewport({ scale: cappedScale });

      // Use device pixel ratio for crisp rendering on high-DPI displays
      const devicePixelRatio = window.devicePixelRatio || 1;

      // Clear container
      container.innerHTML = '';

      // Create canvas wrapper for centering and scrolling
      const wrapper = document.createElement('div');
      wrapper.className = 'pdf-page-wrapper';
      wrapper.style.display = 'flex';
      wrapper.style.justifyContent = 'center';
      wrapper.style.alignItems = 'center';
      wrapper.style.width = '100%';
      wrapper.style.height = '100%';
      wrapper.style.minHeight = `${scaledViewport.height}px`;
      wrapper.style.overflow = 'auto';

      // Create canvas with high-DPI support
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      // Logical display dimensions (CSS pixels)
      const displayWidth = scaledViewport.width;
      const displayHeight = scaledViewport.height;

      // Internal canvas resolution (for high-DPI displays)
      canvas.width = displayWidth * devicePixelRatio;
      canvas.height = displayHeight * devicePixelRatio;

      // CSS size (what shows on screen)
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;

      // Scale the drawing context to match the internal resolution
      context.scale(devicePixelRatio, devicePixelRatio);

      // Style canvas
      canvas.style.display = 'block';
      canvas.style.maxWidth = '100%';
      canvas.style.height = 'auto';
      canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

      wrapper.appendChild(canvas);
      container.appendChild(wrapper);

      // Render page - viewport is already at the correct logical scale
      // The scaled context will handle the high-DPI rendering
      const renderContext = {
        canvasContext: context,
        viewport: scaledViewport
      };

      await page.render(renderContext).promise;

      // Update zoom ref if zoom level was provided
      if (zoomLevel !== null) {
        pdfZoomRef.current = zoomLevel;
      }

      // Update progress
      const totalPages = pdfTotalPagesRef.current;
      const currentPercent = totalPages > 0 ? (pageNum / totalPages) : 0;
      setPercent(currentPercent);
      setLocationText(`Page ${pageNum} of ${totalPages}`);
      setLastPageInfo({ page: pageNum, percent: Math.round(currentPercent * 100) });

      // Save progress (but don't save if we're restoring position)
      if (!isRestoringRef.current) {
        const currentBookId = currentBookIdRef.current;
        if (currentBookId) {
          const progressToSave = {
            page: pageNum,
            totalPages: totalPages,
            percent: currentPercent,
            updatedAt: Date.now()
          };
          savedProgressRef.current = progressToSave;
          saveProgress(currentBookId, progressToSave).catch((err) => {
            console.error(`Failed to save PDF progress for book ${currentBookId}:`, err);
          });
        }
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Error rendering PDF page:', err);
      setIsLoading(false);
      onToast?.("Failed to render PDF page. Please try again.");
    }
  };

  // Function to render all PDF pages in vertical scrolling mode with lazy loading
  const renderPDFVertical = async (pdf, container, startPage = 1) => {
    if (!pdf || !container) return;

    // Cleanup previous observer if any
    if (pdfObserverRef.current) {
      pdfObserverRef.current.disconnect();
      pdfObserverRef.current = null;
    }

    // Store toggleUI reference for use in event handlers
    const toggleUIHandler = () => {
      setUiVisible(v => !v);
    };

    try {
      const totalPages = pdf.numPages;
      if (totalPages === 0) {
        setIsLoading(false);
        return;
      }

      // Get container dimensions
      const containerRect = container.getBoundingClientRect();
      const availableWidth = containerRect.width;

      // Clear container
      container.innerHTML = '';

      // Create a scrollable container that fills the entire viewport
      const scrollContainer = document.createElement('div');
      scrollContainer.className = 'pdf-vertical-scroll-container';
      scrollContainer.style.width = '100%';
      scrollContainer.style.height = '100%';
      scrollContainer.style.overflowY = 'auto';
      scrollContainer.style.overflowX = 'hidden';
      scrollContainer.style.position = 'absolute';
      scrollContainer.style.top = '0';
      scrollContainer.style.left = '0';
      scrollContainer.style.right = '0';
      scrollContainer.style.bottom = '0';

      // Create wrapper for all pages
      const pagesWrapper = document.createElement('div');
      pagesWrapper.style.width = '100%';
      pagesWrapper.style.display = 'flex';
      pagesWrapper.style.flexDirection = 'column';
      pagesWrapper.style.alignItems = 'center';
      pagesWrapper.style.padding = '0';
      pagesWrapper.style.margin = '0';

      const devicePixelRatio = window.devicePixelRatio || 1;

      // Get the first page to estimate dimensions for all placeholders
      // This is much faster than loading all pages
      const firstPage = await pdf.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1.0 });
      const firstScale = availableWidth / firstViewport.width;
      const estimatedPageHeight = firstViewport.height * firstScale;

      const renderedPages = new Set();

      // Setup IntersectionObserver for lazy rendering
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute('data-page-number'));
            if (!renderedPages.has(pageNum)) {
              renderedPages.add(pageNum);
              renderLazyPage(pdf, pageNum, entry.target, availableWidth, devicePixelRatio);
            }
          }
        });
      }, {
        root: scrollContainer,
        rootMargin: '1000px', // Pre-render pages within 1000px of viewport
        threshold: 0
      });

      pdfObserverRef.current = observer;

      const renderLazyPage = async (pdfDoc, pageNum, pageWrapper, width, dpr) => {
        try {
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.0 });
          const scale = width / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          // Create canvas
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');

          const displayWidth = scaledViewport.width;
          const displayHeight = scaledViewport.height;

          canvas.width = displayWidth * dpr;
          canvas.height = displayHeight * dpr;
          canvas.style.width = `${displayWidth}px`;
          canvas.style.height = `${displayHeight}px`;
          canvas.style.display = 'block';
          canvas.style.maxWidth = '100%';
          canvas.style.height = 'auto';
          canvas.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';

          context.scale(dpr, dpr);

          const renderContext = {
            canvasContext: context,
            viewport: scaledViewport
          };

          await page.render(renderContext).promise;

          // Clear placeholder content and add canvas
          pageWrapper.innerHTML = '';
          pageWrapper.appendChild(canvas);
          // Adjust height to actual rendered height to handle different page sizes
          pageWrapper.style.height = 'auto';
          pageWrapper.style.minHeight = `${displayHeight}px`;
        } catch (err) {
          console.error(`Error rendering page ${pageNum}:`, err);
        }
      };

      // Create placeholders for all pages
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageWrapper = document.createElement('div');
        pageWrapper.className = 'pdf-page-wrapper-vertical';
        pageWrapper.setAttribute('data-page-number', pageNum);
        pageWrapper.style.width = '100%';
        pageWrapper.style.minHeight = `${estimatedPageHeight}px`;
        pageWrapper.style.display = 'flex';
        pageWrapper.style.justifyContent = 'center';
        pageWrapper.style.alignItems = 'flex-start';
        pageWrapper.style.padding = '0';
        pageWrapper.style.margin = '0';
        pageWrapper.style.backgroundColor = 'transparent';

        // Add a simple loading indicator in the placeholder
        const loader = document.createElement('div');
        loader.textContent = `Page ${pageNum}`;
        loader.style.padding = '20px';
        loader.style.color = 'var(--muted)';
        loader.style.opacity = '0.3';
        pageWrapper.appendChild(loader);

        pagesWrapper.appendChild(pageWrapper);
        observer.observe(pageWrapper);
      }

      // Explicitly set total height to avoid layout shifts during initial scroll
      pagesWrapper.style.minHeight = `${estimatedPageHeight * totalPages}px`;

      scrollContainer.appendChild(pagesWrapper);
      container.appendChild(scrollContainer);

      // Scroll to saved position if available and update initial progress
      const savedProgress = savedProgressRef.current;

      if (savedProgress && savedProgress.page) {
        // Update initial progress and page number from saved progress
        pdfPageNumRef.current = Math.max(1, Math.min(savedProgress.page, totalPages));

        // Set initial percentage
        if (savedProgress.percent !== undefined && savedProgress.percent !== null) {
          let savedPercent = savedProgress.percent;
          if (savedPercent > 1) savedPercent = savedPercent / 100;
          setPercent(Math.max(0, Math.min(1, savedPercent)));
        } else {
          const calculatedPercent = totalPages > 0 ? (savedProgress.page - 0.5) / totalPages : 0;
          setPercent(calculatedPercent);
        }
        setLocationText(`Page ${pdfPageNumRef.current} of ${totalPages}`);

        // Scroll to saved position
        const scrollToY = savedProgress.scrollTop || 0;

        // More robust scroll restoration
        const attemptScroll = (retryCount = 0) => {
          if (!scrollContainer) return;

          const scrollHeight = scrollContainer.scrollHeight;
          const clientHeight = scrollContainer.clientHeight;
          const maxScroll = Math.max(0, scrollHeight - clientHeight);

          let targetScroll = 0;
          if (scrollToY > 0) {
            targetScroll = Math.min(scrollToY, maxScroll);
          } else if (savedProgress.page > 1) {
            let calculatedScroll = 0;
            const children = pagesWrapper.children;
            for (let i = 0; i < savedProgress.page - 1 && i < children.length; i++) {
              calculatedScroll += children[i].offsetHeight || estimatedPageHeight;
            }
            targetScroll = Math.min(calculatedScroll, maxScroll);
          }

          scrollContainer.scrollTop = targetScroll;

          // If we scrolled to 0 but expected more, or if layout seems incomplete, retry once
          if (retryCount < 2 && targetScroll === 0 && (scrollToY > 0 || savedProgress.page > 1)) {
            setTimeout(() => attemptScroll(retryCount + 1), 200);
          }
        };

        setTimeout(() => attemptScroll(0), 100);
      } else {
        // No saved progress, start at beginning
        pdfPageNumRef.current = startPage || 1;
        setPercent(0);
        setLocationText(`Page ${pdfPageNumRef.current} of ${totalPages}`);
      }

      // Track tap position for UI toggle
      let scrollTimeout = null;
      let tapStartX = 0;
      let tapStartY = 0;
      let tapStartTime = 0;

      const handleTapStart = (clientX, clientY) => {
        tapStartX = clientX;
        tapStartY = clientY;
        tapStartTime = Date.now();
      };

      const handleTapEnd = (clientX, clientY) => {
        const moveX = Math.abs(clientX - tapStartX);
        const moveY = Math.abs(clientY - tapStartY);
        const timeDelta = Date.now() - tapStartTime;

        // If finger/mouse moved less than 10px and released within 500ms, it's a tap
        if (moveX < 10 && moveY < 10 && timeDelta < 500) {
          const viewportWidth = window.innerWidth;
          const relativePercent = clientX / viewportWidth;

          // Only toggle if tap is in middle area (30% to 70% of width)
          if (relativePercent >= 0.3 && relativePercent <= 0.7) {
            toggleUIHandler();
            return true;
          }
        }
        return false;
      };

      // Touch events
      scrollContainer.addEventListener('touchstart', (e) => {
        const touch = e.touches[0];
        if (touch) {
          handleTapStart(touch.clientX, touch.clientY);
        }
      }, { passive: true });

      scrollContainer.addEventListener('touchend', (e) => {
        const touch = e.changedTouches[0];
        if (touch) {
          if (handleTapEnd(touch.clientX, touch.clientY)) {
            // Prevent subsequent click event
            if (e.cancelable) e.preventDefault();
          }
        }
      }, { passive: false });

      // Mouse events for desktop
      scrollContainer.addEventListener('mousedown', (e) => {
        handleTapStart(e.clientX, e.clientY);
      });

      scrollContainer.addEventListener('click', (e) => {
        // Only trigger if handleTapEnd determines it was a tap (not a drag)
        if (handleTapEnd(e.clientX, e.clientY)) {
          e.preventDefault();
          e.stopPropagation();
        }
      });

      scrollContainer.addEventListener('scroll', () => {
        // Clear previous timeout
        if (scrollTimeout) clearTimeout(scrollTimeout);

        // Debounce scroll tracking
        scrollTimeout = setTimeout(() => {
          const scrollTop = scrollContainer.scrollTop;
          const scrollHeight = scrollContainer.scrollHeight;
          const clientHeight = scrollContainer.clientHeight;

          // Calculate which page is currently visible based on scroll position
          let currentPage = 1;
          let accumulatedHeight = 0;

          // Find which page the user is currently viewing
          for (let i = 0; i < pagesWrapper.children.length; i++) {
            const pageWrapper = pagesWrapper.children[i];
            const pageHeight = pageWrapper.offsetHeight || 0;
            const pageBottom = accumulatedHeight + pageHeight;

            // Check if scroll position is within this page's bounds
            // Consider the page visible if we're in the top portion of the viewport
            const viewportTop = scrollTop;
            const viewportCenter = scrollTop + (clientHeight / 2);

            // If viewport center is within this page, this is the current page
            if (viewportCenter >= accumulatedHeight && viewportCenter < pageBottom) {
              currentPage = i + 1;
              break;
            }

            // If we haven't reached this page yet, update accumulated height
            accumulatedHeight = pageBottom;

            // If we're past all pages, set to last page
            if (scrollTop >= accumulatedHeight) {
              currentPage = i + 1;
            }
          }

          // Ensure current page is within valid range
          currentPage = Math.max(1, Math.min(currentPage, totalPages));
          pdfPageNumRef.current = currentPage;

          // Calculate progress percentage more robustly
          // We use actual current page + progress within that page for the percentage
          // This avoids jumps when estimated scroll height is wrong
          let pageTop = 0;
          for (let i = 0; i < currentPage - 1 && i < pagesWrapper.children.length; i++) {
            pageTop += pagesWrapper.children[i].offsetHeight || 0;
          }
          const currentPageHeight = pagesWrapper.children[currentPage - 1]?.offsetHeight || estimatedPageHeight;
          const progressInPage = currentPageHeight > 0 ? Math.min(1, Math.max(0, (scrollTop - pageTop) / currentPageHeight)) : 0;

          // Formula: (Already read pages + progress in current page) / total pages
          const percent = totalPages > 0 ? (currentPage - 1 + progressInPage) / totalPages : 0;

          setPercent(percent);
          setLocationText(`Page ${currentPage} of ${totalPages}`);

          // Save progress (debounced)
          if (!isRestoringRef.current && currentBookIdRef.current) {
            const progressToSave = {
              page: currentPage,
              totalPages: totalPages,
              percent: percent, // Store as 0-1
              scrollTop: scrollTop,
              updatedAt: Date.now()
            };
            savedProgressRef.current = progressToSave;
            saveProgress(currentBookIdRef.current, progressToSave).catch((err) => {
              console.error(`Failed to save PDF progress:`, err);
            });
          }
        }, 100); // Reduced debounce for more responsive updates
      });

      setIsLoading(false);
    } catch (err) {
      console.error('Error rendering PDF in vertical mode:', err);
      setIsLoading(false);
      onToast?.("Failed to render PDF. Please try again.");
    }
  };

  useEffect(() => {
    if (book.type === "pdf") {
      // Handle PDF files using PDF.js
      setIsLoading(true);
      currentBookIdRef.current = book.id;

      // Load PDF document
      pdfjsLib.getDocument({
        url: fileUrl,
        ...PDF_ASSETS_CONFIG
      }).promise
        .then((pdf) => {
          pdfDocRef.current = pdf;
          pdfTotalPagesRef.current = pdf.numPages;

          // Load saved progress
          loadProgress(book.id).then((progressData) => {
            isRestoringRef.current = true;
            if (progressData?.page && progressData.page > 0 && progressData.page <= pdf.numPages) {
              pdfPageNumRef.current = progressData.page;
              savedProgressRef.current = progressData;
            } else {
              pdfPageNumRef.current = 1;
            }

            // Render PDF after a short delay to ensure container is sized
            if (hostRef.current) {
              setTimeout(() => {
                pdfZoomRef.current = 1.0; // Reset zoom on initial load
                // Use vertical mode by default
                if (pdfScrollMode === 'vertical') {
                  renderPDFVertical(pdf, hostRef.current, pdfPageNumRef.current).then(() => {
                    // Allow saving after a short delay
                    setTimeout(() => {
                      isRestoringRef.current = false;
                    }, 1000);
                  });
                } else {
                  renderPDFPage(pdfPageNumRef.current, hostRef.current, 1.0).then(() => {
                    // Allow saving after a short delay
                    setTimeout(() => {
                      isRestoringRef.current = false;
                    }, 1000);
                  });
                }
              }, 100);
            }
          }).catch(() => {
            // No saved progress, start at page 1
            isRestoringRef.current = true;
            pdfPageNumRef.current = 1;
            pdfZoomRef.current = 1.0; // Reset zoom on initial load
            if (hostRef.current) {
              setTimeout(() => {
                // Use vertical mode by default
                if (pdfScrollMode === 'vertical') {
                  renderPDFVertical(pdf, hostRef.current, 1).then(() => {
                    setTimeout(() => {
                      isRestoringRef.current = false;
                    }, 1000);
                  });
                } else {
                  renderPDFPage(1, hostRef.current, 1.0).then(() => {
                    setTimeout(() => {
                      isRestoringRef.current = false;
                    }, 1000);
                  });
                }
              }, 100);
            }
          });
        })
        .catch((err) => {
          console.error('Error loading PDF:', err);
          setIsLoading(false);
          onToast?.("Failed to load PDF. Please try again.");
        });

      return () => {
        // Cleanup: clear PDF on unmount
        pdfDocRef.current = null;
        pdfPageNumRef.current = 1;
        pdfTotalPagesRef.current = 0;
        if (hostRef.current) {
          hostRef.current.innerHTML = '';
        }
      };
    }

    if (book.type !== "epub") {
      onToast?.("Unsupported file type. Supported formats: EPUB, PDF.");
      onBack?.();
      return;
    }

    let destroyed = false;

    // Use unzipped/partial loading for all EPUBs for better performance
    // This points to the new /contents/ directory proxy on the server
    const epub = ePub(contentsUrl);
    epubBookRef.current = epub;

    const host = hostRef.current;
    const rendition = epub.renderTo(host, {
      width: "100%",
      height: "100%",
      spread: prefs.twoPageLayout ? "auto" : "none",
      flow: "paginated",
    });
    renditionRef.current = rendition;

    const onRelocated = (loc) => {
      if (destroyed) return;
      const cfi = loc?.start?.cfi;
      let p = 0;
      let currentPage = 0;
      let totalPages = 0;

      // Stop TTS when page changes
      if (isSpeakingRef.current && audioRef.current) {
        stopTTS();
      }

      // Update current chapter name
      if (tocRef.current.length > 0) {
        try {
          const currentToc = tocRef.current;
          // Try to get href from location object first
          let currentHref = null;

          if (loc) {
            currentHref = loc?.start?.href ||
              loc?.start?.displayed?.href ||
              loc?.start?.loc?.href ||
              loc?.displayed?.href ||
              loc?.href;
          }

          // Fallback: try to get from rendition's current location
          if (!currentHref && renditionRef.current) {
            try {
              currentHref = renditionRef.current.location?.start?.href;
            } catch { }
          }

          let matchingChapter = null;
          if (currentHref) {
            // Normalize current href (strip leading / if any)
            const currentHrefNormalized = currentHref.startsWith('/') ? currentHref.substring(1) : currentHref;

            // Try direct match
            matchingChapter = currentToc.find(item => {
              const itemHrefNormalized = item.href.startsWith('/') ? item.href.substring(1) : item.href;
              // Check for exact match or match after # hash
              if (itemHrefNormalized === currentHrefNormalized) return true;
              // Check if filenames match (case-insensitive)
              if (itemHrefNormalized.toLowerCase() === currentHrefNormalized.toLowerCase()) return true;
              // Partial match - check if one contains the other
              return itemHrefNormalized.includes(currentHrefNormalized) ||
                currentHrefNormalized.includes(itemHrefNormalized);
            });

            // If no direct match, try matching by full href path
            if (!matchingChapter) {
              const currentFullHref = currentHref.split('#')[0].split('?')[0];
              matchingChapter = currentToc.find(item => {
                const itemFullHref = item.href.split('#')[0].split('?')[0];
                return currentFullHref === itemFullHref ||
                  currentFullHref.endsWith(itemFullHref) ||
                  itemFullHref.endsWith(currentFullHref);
              });
            }

            // If still no match, try finding by position in TOC (closest previous chapter)
            if (!matchingChapter && epubBookRef.current && cfi) {
              try {
                // Find the chapter that's closest to current position
                let bestMatch = null;
                let bestIndex = -1;

                for (let i = 0; i < currentToc.length; i++) {
                  const item = currentToc[i];
                  try {
                    const itemCfi = epubBookRef.current.locations?.cfiFromHref?.(item.href);
                    if (itemCfi && cfi >= itemCfi) {
                      // Current position is at or after this chapter
                      if (i > bestIndex) {
                        bestIndex = i;
                        bestMatch = item;
                      }
                    }
                  } catch (e) {
                    // Skip items that can't be converted
                  }
                }

                if (bestMatch) {
                  matchingChapter = bestMatch;
                }
              } catch (e) {
                // CFI comparison failed
              }
            }

            if (matchingChapter) {
              setCurrentChapterName(matchingChapter.label);
            } else {
              // Default if no match found
              setCurrentChapterName('Reading');
            }
          } else {
            // No href available yet
            setCurrentChapterName('Reading');
          }
        } catch (err) {
          console.warn('Failed to get chapter name:', err);
          setCurrentChapterName('Reading');
        }
      } else if (!currentChapterName) {
        // No TOC available yet
        setCurrentChapterName('Reading');
      }

      try {
        if (epub.locations?.length()) {
          p = epub.locations.percentageFromCfi(cfi) || 0;
          // Calculate continuous page number from locations array
          const locationIndex = epub.locations.locationFromCfi(cfi);
          currentPage = locationIndex > 0 ? locationIndex : 1;
          totalPages = epub.locations.length();
        } else if (epub.spine?.length) {
          // Fallback to spine-based progress for large books that skipped pagination
          // Try multiple ways to get the current spine index
          const spineIndex = loc.start?.index !== undefined ? loc.start.index : (epub.spine.get(cfi)?.index || 0);

          // Use a rough estimate from spine index
          p = (spineIndex / epub.spine.length);
          currentPage = spineIndex + 1;
          totalPages = epub.spine.length;

          console.log(`[Large Book] Fallback progress: section ${currentPage}/${totalPages}, percent ${Math.round(p * 100)}%`);
        }
      } catch (err) {
        console.warn('Error calculating progress fallback:', err);
      }

      setPercent(p);

      // Select appropriate location text
      let pageText = "Loading...";
      if (totalPages > 0) {
        if (epub.locations?.length() > 0) {
          pageText = `Page ${currentPage} of ${totalPages}`;
        } else {
          // Fallback style for very large books without precise location markers
          pageText = `Section ${currentPage} of ${totalPages}`;
        }
      }
      setLocationText(pageText);

      // Update last page info for the button
      if (currentPage > 0) {
        setLastPageInfo({ page: currentPage, percent: Math.round(p * 100) });
      }

      // Check if current page has a bookmark (we'll load bookmarks and check)
      checkBookmarkForCurrentPage(cfi);

      // Don't save progress if we're still restoring the position
      if (isRestoringRef.current) {
        return;
      }

      // Get current saved progress and preserve locations
      const saved = savedProgressRef.current || {};

      // Get current locations from epub if available, otherwise use saved ones
      let locationsToSave = saved.locations;
      try {
        if (epub.locations?.length()) {
          const currentLocations = epub.locations.save();
          if (currentLocations && Array.isArray(currentLocations) && currentLocations.length > 0) {
            locationsToSave = currentLocations;
          }
        }
      } catch (err) {
        console.warn('Failed to get current locations:', err);
      }

      // Save progress while preserving locations
      const progressToSave = {
        cfi,
        percent: p,
        locations: locationsToSave,
        updatedAt: Date.now()
      };

      // Preserve any other fields from saved progress
      if (saved && typeof saved === 'object') {
        Object.keys(saved).forEach(key => {
          if (key !== 'cfi' && key !== 'percent' && key !== 'updatedAt' && key !== 'locations') {
            progressToSave[key] = saved[key];
          }
        });
      }

      // Update the ref so future saves have the latest data
      savedProgressRef.current = progressToSave;

      // Get the current book ID from ref
      const currentBookId = currentBookIdRef.current;
      if (!currentBookId) {
        return;
      }

      // Save progress (fire and forget, but log errors)
      saveProgress(currentBookId, progressToSave).catch((err) => {
        console.error(`Failed to save progress for book ${currentBookId}:`, err);
      });
    };

    rendition.on("relocated", onRelocated);

    // Declare variables in proper scope
    // Use bookmark CFI if provided, otherwise will be set from saved progress
    let startAt = bookmarkCfi || undefined;

    // Track current book ID
    currentBookIdRef.current = book.id;

    // Load progress asynchronously first
    loadProgress(book.id).then((progressData) => {
      if (destroyed) return;

      // Parse locations if they're stored as a string (legacy format)
      let parsedProgress = progressData;
      if (progressData?.locations && typeof progressData.locations === 'string') {
        try {
          parsedProgress = {
            ...progressData,
            locations: JSON.parse(progressData.locations)
          };
        } catch (err) {
          console.warn('Failed to parse locations string:', err);
          parsedProgress = { ...progressData, locations: null };
        }
      }

      savedProgressRef.current = parsedProgress;
      // Set initial percent state if available to show progress immediately
      if (parsedProgress?.percent !== undefined) {
        setPercent(parsedProgress.percent);
      }
      // Use bookmark CFI if provided, otherwise use saved progress CFI
      if (!startAt) {
        startAt = parsedProgress?.cfi || undefined;
      }

      // Check if we have cached locations and mark as ready immediately
      if (parsedProgress?.locations && Array.isArray(parsedProgress.locations) && parsedProgress.locations.length > 0) {
        console.log('Found cached locations:', parsedProgress.locations.length);
        locationsReadyRef.current = true;
      }

      // Build/load locations
      epub.ready
        .then(() => {
          // Try to restore cached locations first for instant page numbers
          const saved = savedProgressRef.current;
          if (saved?.locations && Array.isArray(saved.locations) && saved.locations.length > 0) {
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
            // For very large books, location generation can still take a long time
            // even with unzipped access. We only do it if the book is < 100MB
            // or we could skip it and let user trigger it.
            // For now, let's keep it but use a larger threshold/chunk size if possible.
            if (book.sizeBytes && book.sizeBytes > 100 * 1024 * 1024) {
              console.log('Very large book detected, skipping automatic location generation to save bandwidth');
              locationsReadyRef.current = false;
              return Promise.resolve();
            }

            console.log('No cached locations found, generating...');
            // No cached locations, generate them
            return epub.locations.generate(1600);
          }
        })
        .then(() => {
          // Mark locations as ready
          locationsReadyRef.current = true;

          // Save the generated locations for next time (only if newly generated)
          const saved = savedProgressRef.current;
          if (epub.locations?.length() && (!saved?.locations || !Array.isArray(saved.locations) || saved.locations.length === 0)) {
            const locationsArray = epub.locations.save();
            // Update the saved progress ref so future progress saves include locations
            savedProgressRef.current = {
              ...saved,
              locations: locationsArray
            };
            console.log('Generated new locations:', locationsArray.length);

            // Save to server immediately with current progress
            const currentLoc = renditionRef.current?.location;
            const currentCfi = currentLoc?.start?.cfi;
            let currentPercent = 0;
            try {
              if (epub.locations?.length() && currentCfi) {
                currentPercent = epub.locations.percentageFromCfi(currentCfi) || 0;
              }
            } catch { }

            const progressToSave = {
              ...savedProgressRef.current,
              cfi: currentCfi || saved?.cfi,
              percent: currentPercent || saved?.percent || 0,
              updatedAt: Date.now()
            };
            const currentBookId = currentBookIdRef.current;
            if (currentBookId) {
              saveProgress(currentBookId, progressToSave).catch((err) => {
                console.warn(`Failed to save locations for book ${currentBookId}:`, err);
              });
            }
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
        if (destroyed) return;

        // Extract table of contents
        try {
          const navigation = epub.navigation;
          if (navigation && navigation.toc) {
            // Flatten the TOC tree into a list
            const flattenToc = (items) => {
              const result = [];
              const processItem = (item, level = 0) => {
                if (item.href) {
                  result.push({
                    label: item.label || item.title || 'Untitled',
                    href: item.href,
                    level: level
                  });
                }
                if (item.subitems && item.subitems.length > 0) {
                  item.subitems.forEach(subitem => processItem(subitem, level + 1));
                }
              };
              items.forEach(item => processItem(item));
              return result;
            };
            const tocList = flattenToc(navigation.toc);
            setToc(tocList);
          }
        } catch (err) {
          console.warn('Failed to extract TOC:', err);
        }

        // Apply prefs first, then display
        applyPrefs(rendition, prefs);

        // If using custom font, inject CSS directly into iframe after a short delay
        const fontFamily = prefs.fontFamily || "serif";
        if (fontFamily.startsWith('custom:')) {
          setTimeout(() => {
            try {
              const iframe = hostRef.current?.querySelector('iframe');
              if (iframe && iframe.contentDocument) {
                const doc = iframe.contentDocument;
                const filename = fontFamily.substring(7).split(':')[0];
                const actualFontFamily = fontFamily.substring(7).split(':')[1];

                // Remove any existing custom font styles first
                const existingStyles = doc.querySelectorAll('style[data-custom-font]');
                existingStyles.forEach(style => style.remove());

                const css = `
                  @font-face {
                    font-family: '${actualFontFamily}';
                    src: url('/api/fonts/${filename}') format('${getFontFormat(filename)}');
                    font-display: swap;
                  }
                `;

                const style = doc.createElement('style');
                style.setAttribute('data-custom-font', 'true');
                style.textContent = css;
                doc.head.appendChild(style);

                console.log('Injected custom font CSS for new book:', actualFontFamily);
              }
            } catch (err) {
              console.warn('Failed to inject font CSS for new book:', err);
            }
          }, 200); // Delay to ensure iframe is fully loaded
        }

        // Display after a small delay to ensure theme is registered
        setTimeout(() => {
          const saved = savedProgressRef.current;

          // Set flag to prevent saving progress while restoring
          isRestoringRef.current = true;

          if (startAt) {
            rendition.display(startAt).then(() => {
              setIsLoading(false);
              // Allow saving progress after a short delay to ensure position is stable
              setTimeout(() => {
                isRestoringRef.current = false;
              }, 1000);
            }).catch((err) => {
              console.warn("Failed to restore position, trying fallback methods", err);

              // Try to restore by percentage if we have it
              if (saved?.percent && saved.percent > 0 && epub.locations?.length()) {
                setTimeout(() => {
                  try {
                    const cfiFromPercent = epub.locations.cfiFromPercentage(saved.percent);
                    if (cfiFromPercent) {
                      rendition.display(cfiFromPercent).then(() => {
                        setIsLoading(false);
                        setTimeout(() => {
                          isRestoringRef.current = false;
                        }, 1000);
                      }).catch(() => {
                        rendition.display().then(() => {
                          setIsLoading(false);
                          isRestoringRef.current = false;
                        }).catch(() => {
                          setIsLoading(false);
                          isRestoringRef.current = false;
                        });
                      });
                    } else {
                      rendition.display().then(() => {
                        setIsLoading(false);
                        isRestoringRef.current = false;
                      }).catch(() => {
                        setIsLoading(false);
                        isRestoringRef.current = false;
                      });
                    }
                  } catch {
                    rendition.display().then(() => {
                      setIsLoading(false);
                      isRestoringRef.current = false;
                    }).catch(() => {
                      setIsLoading(false);
                      isRestoringRef.current = false;
                    });
                  }
                }, 500);
              } else {
                rendition.display().then(() => {
                  setIsLoading(false);
                  isRestoringRef.current = false;
                }).catch(() => {
                  setIsLoading(false);
                  isRestoringRef.current = false;
                });
              }
            });
          } else {
            rendition.display().then(() => {
              setIsLoading(false);
              isRestoringRef.current = false;
            }).catch(() => {
              setIsLoading(false);
              isRestoringRef.current = false;
            });
          }
        }, 100);
      }).catch((err) => {
        console.warn("EPUB failed to load:", err);
      });
    }).catch((err) => {
      console.warn("Failed to load progress:", err);
      // Continue without saved progress
      // saved and startAt are already null/undefined

      // Still try to display the book
      epub.ready.then(() => {
        if (destroyed) return;
        applyPrefs(rendition, prefs);
        setTimeout(() => {
          rendition.display().then(() => setIsLoading(false)).catch(() => setIsLoading(false));
        }, 100);
      }).catch((err) => {
        console.warn("EPUB failed to load:", err);
      });
    });


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
            } else if (epub.spine?.length) {
              // Fallback for large books without generated locations
              const spineIndex = loc.start?.index !== undefined ? loc.start.index : (epub.spine.get(cfi)?.index || 0);
              p = (spineIndex / epub.spine.length);
            }
          } catch { }

          // Get current saved progress and preserve locations
          const saved = savedProgressRef.current || {};

          // Get current locations from epub if available, otherwise use saved ones
          let locationsToSave = saved.locations;
          try {
            if (epub.locations?.length()) {
              const currentLocations = epub.locations.save();
              if (currentLocations && Array.isArray(currentLocations) && currentLocations.length > 0) {
                locationsToSave = currentLocations;
              }
            }
          } catch (err) {
            console.warn('Failed to get current locations:', err);
          }

          // Save progress while preserving locations
          const progressToSave = {
            cfi,
            percent: p,
            locations: locationsToSave,
            updatedAt: Date.now()
          };

          // Preserve any other fields from saved progress
          if (saved && typeof saved === 'object') {
            Object.keys(saved).forEach(key => {
              if (key !== 'cfi' && key !== 'percent' && key !== 'updatedAt' && key !== 'locations') {
                progressToSave[key] = saved[key];
              }
            });
          }

          // Update the ref so future saves have the latest data
          savedProgressRef.current = progressToSave;

          // Get the current book ID from ref
          const currentBookId = currentBookIdRef.current;
          if (currentBookId) {
            // Save progress (fire and forget, but log errors)
            saveProgress(currentBookId, progressToSave).catch((err) => {
              console.error(`Failed to save periodic progress for book ${currentBookId}:`, err);
            });
          }
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
      if (e.key === "Escape") {
        setDrawerOpen(false);
        setTocOpen(false);
      }
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

      if (pdfObserverRef.current) {
        pdfObserverRef.current.disconnect();
        pdfObserverRef.current = null;
      }

      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("keydown", onKeyDown);

      // Save progress when component unmounts
      saveCurrentProgress();

      try { rendition?.off("relocated", onRelocated); } catch { }
      try { rendition?.destroy(); } catch { }
      try { epub?.destroy(); } catch { }
      renditionRef.current = null;
      epubBookRef.current = null;
    };
  }, [book.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply prefs when changed
  useEffect(() => {
    const r = renditionRef.current;
    if (!r) return;

    // Don't apply prefs changes if we're still restoring position
    if (isRestoringRef.current) {
      return;
    }

    // Get current location before applying prefs - use actual current location
    let currentCfi = r.location?.start?.cfi;

    // If no current location yet, the book might not be loaded - skip re-display
    if (!currentCfi) {
      // Still apply the prefs, but don't re-display (book will display when ready)
      applyPrefs(r, prefs);
      return;
    }

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
              r.display(currentCfi).catch(() => { });
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

    // Force re-rendering with updated preferences
    requestAnimationFrame(() => {
      setTimeout(() => {
        try {
          // Reapply the epub.js theme to update settings
          applyPrefs(r, prefs);

          // Inject font CSS immediately for existing content if it's a custom font
          const fontFamily = prefs.fontFamily || "serif";
          if (fontFamily.startsWith('custom:')) {
            const iframe = hostRef.current?.querySelector('iframe');
            if (iframe && iframe.contentDocument) {
              const doc = iframe.contentDocument;
              const filename = fontFamily.substring(7).split(':')[0];
              const actualFontFamily = fontFamily.substring(7).split(':')[1];

              // Remove any existing custom font styles first
              const existingStyles = doc.querySelectorAll('style[data-custom-font]');
              existingStyles.forEach(style => style.remove());

              const css = `
                @font-face {
                  font-family: '${actualFontFamily}';
                  src: url('/api/fonts/${filename}') format('${getFontFormat(filename)}');
                  font-display: swap;
                }
              `;

              const style = doc.createElement('style');
              style.setAttribute('data-custom-font', 'true');
              style.textContent = css;
              doc.head.appendChild(style);

              console.log('Injected custom font CSS for:', actualFontFamily);
            }
          }

          // For margin/layout changes, force complete re-layout
          // Resize first
          r.resize();

          // Force re-render with layout recalculation
          // Use the actual current location, not the captured one (which might be stale)
          const actualCurrentCfi = r.location?.start?.cfi || currentCfi;
          if (actualCurrentCfi) {
            // Try multiple approaches to ensure proper re-rendering
            r.display(actualCurrentCfi).then(() => {
              // Additional resize after display to ensure layout is correct
              setTimeout(() => {
                try {
                  r.resize();
                } catch (err) {
                  console.warn('Secondary resize failed:', err);
                }
              }, 50);
            }).catch(() => {
              // Fallback: try to get current location again and display
              try {
                const loc = r.location?.start?.cfi;
                if (loc) {
                  r.display(loc).catch(() => { });
                } else {
                  // If no location, don't reset - just try next/prev to trigger re-render
                  r.next().catch(() => r.prev().catch(() => { }));
                }
              } catch { }
            });
          } else {
            // If no location, don't reset to first page - just apply prefs
          }
        } catch (err) {
          console.warn('Failed to apply preference changes:', err);
        }
      }, 150); // Slightly longer delay for margin changes
    });
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
      console.log('[Dictionary] Found nav zones:', navZones?.length || 0);

      const handleLongPressStart = (e) => {
        console.log('[Dictionary] Touch/mouse start event:', e.type, 'at', e.clientX, e.clientY);
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

        // Handle preventDefault timing - don't prevent on nav zone events
        // The epub iframe content will handle preventing long press behavior
        if (e.type === 'touchstart') {
          // For touch events, don't prevent default - let normal tap behavior work
          // The epub content will handle preventing context menus on long press
          longPressPreventRef.current = setTimeout(() => {
            if (longPressStartRef.current) {
              longPressStartRef.current.shouldPreventDefault = true;
              console.log('[Dictionary] Long press detected, will prevent click');
            }
          }, 200); // Allow normal taps under 200ms
        } else {
          // For mouse events, use shorter delay
          longPressPreventRef.current = setTimeout(() => {
            if (longPressStartRef.current) {
              longPressStartRef.current.shouldPreventDefault = true;
              console.log('[Dictionary] Setting preventDefault flag after 100ms');
            }
          }, 100);
        }

        // Set a timer for long press (shorter on iOS for better responsiveness)
        const longPressDelay = isIOS() ? 300 : 500;
        console.log('[Dictionary] Starting long press timer for', longPressDelay, 'ms');
        longPressTimerRef.current = setTimeout(() => {
          console.log('[Dictionary] Long press timer fired, calling handleLongPress');
          handleLongPress(e);
        }, longPressDelay);
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
        console.log('[Dictionary] Click event, longPressTriggered:', longPressTriggeredRef.current);
        // Prevent navigation if long press was triggered
        if (longPressTriggeredRef.current) {
          console.log('[Dictionary] Preventing click due to long press');
          e.stopPropagation();
          e.preventDefault();
          longPressTriggeredRef.current = false;
          return false;
        }
      };

      const handleLongPress = (e) => {
        console.log('[Dictionary] Long press triggered at:', longPressStartRef.current);
        // Mark that long press was triggered
        longPressTriggeredRef.current = true;

        // Get the iframe and calculate position relative to it
        const iframe = hostRef.current?.querySelector('iframe');
        if (!iframe) {
          console.log('[Dictionary] No iframe found');
          return;
        }

        const iframeRect = iframe.getBoundingClientRect();
        console.log('[Dictionary] iframe rect:', iframeRect);
        console.log('[Dictionary] iframe dimensions:', iframeRect.width, 'x', iframeRect.height);

        const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;

        if (!iframeDoc) {
          console.log('[Dictionary] No iframe document found');
          return;
        }

        // Check if we can access the iframe content (same-origin)
        try {
          // Test if we can access the document
          const testAccess = iframeDoc.body;
          console.log('[Dictionary] Iframe content access OK, body exists:', !!testAccess);
        } catch (e) {
          console.log('[Dictionary] Cannot access iframe content (cross-origin restriction):', e.message);
          onToast?.('Dictionary unavailable for this book (cross-origin content)');
          return;
        }

        // Calculate position relative to iframe - Safari might need different calculation
        let relativeX = longPressStartRef.current.x - iframeRect.left;
        let relativeY = longPressStartRef.current.y - iframeRect.top;

        console.log('[Dictionary] Absolute coords:', longPressStartRef.current.x, longPressStartRef.current.y);
        console.log('[Dictionary] Iframe offset:', iframeRect.left, iframeRect.top);
        console.log('[Dictionary] Iframe size:', iframeRect.width, 'x', iframeRect.height);
        console.log('[Dictionary] Calculated relative coords:', relativeX, relativeY);

        // Check if coordinates are within iframe bounds
        const withinBounds = relativeX >= 0 && relativeX <= iframeRect.width &&
          relativeY >= 0 && relativeY <= iframeRect.height;
        console.log('[Dictionary] Coordinates within iframe bounds:', withinBounds);

        // Safari might need page-relative coordinates instead of viewport-relative
        if (isIOS()) {
          const pageX = longPressStartRef.current.x + window.scrollX;
          const pageY = longPressStartRef.current.y + window.scrollY;
          const iframePageLeft = iframeRect.left + window.scrollX;
          const iframePageTop = iframeRect.top + window.scrollY;

          relativeX = pageX - iframePageLeft;
          relativeY = pageY - iframePageTop;

          console.log('[Dictionary] Safari page-relative coords:', relativeX, relativeY);

          const safariWithinBounds = relativeX >= 0 && relativeX <= iframeRect.width &&
            relativeY >= 0 && relativeY <= iframeRect.height;
          console.log('[Dictionary] Safari coordinates within bounds:', safariWithinBounds);
        }

        // Get word at position
        let word = null;
        let range = null;

        // Try caretRangeFromPoint first (works on Mac, Android, and sometimes iOS)
        if (iframeDoc.caretRangeFromPoint) {
          console.log('[Dictionary] Using caretRangeFromPoint with coords:', relativeX, relativeY);

          // For Safari, try to focus the iframe content first
          if (isIOS()) {
            try {
              iframe.contentWindow.focus();
              console.log('[Dictionary] Focused iframe content for Safari');
            } catch (e) {
              console.log('[Dictionary] Could not focus iframe content:', e);
            }
          }

          // Debug: check what's at this position
          const elementAtPoint = iframeDoc.elementFromPoint(relativeX, relativeY);
          console.log('[Dictionary] Element at point:', elementAtPoint?.tagName, elementAtPoint?.textContent?.substring(0, 50));

          range = iframeDoc.caretRangeFromPoint(relativeX, relativeY);
          console.log('[Dictionary] caretRangeFromPoint result:', range);

          if (!range) {
            // caretRangeFromPoint failed, try fallback methods
            console.log('[Dictionary] caretRangeFromPoint failed, trying fallback methods');

            // Try with different coordinate systems for Safari
            if (isIOS()) {
              // Try viewport coordinates directly
              const viewportX = longPressStartRef.current.x;
              const viewportY = longPressStartRef.current.y;
              console.log('[Dictionary] Trying viewport coords:', viewportX, viewportY);
              range = iframeDoc.caretRangeFromPoint(viewportX, viewportY);
              console.log('[Dictionary] Viewport coords result:', range);

              // Try page coordinates
              if (!range) {
                const pageX = viewportX + window.scrollX;
                const pageY = viewportY + window.scrollY;
                console.log('[Dictionary] Trying page coords:', pageX, pageY);
                range = iframeDoc.caretRangeFromPoint(pageX, pageY);
                console.log('[Dictionary] Page coords result:', range);
              }
            }

            // If still no range, try iframe-relative coordinates
            if (!range && elementAtPoint) {
              console.log('[Dictionary] Trying iframe document coordinates');

              // Try coordinates relative to the iframe's document
              const iframeBounds = iframe.getBoundingClientRect();
              const docRelativeX = relativeX;
              const docRelativeY = relativeY;

              console.log('[Dictionary] Trying doc-relative coords:', docRelativeX, docRelativeY);
              range = iframeDoc.caretRangeFromPoint(docRelativeX, docRelativeY);
              console.log('[Dictionary] Doc-relative result:', range);

              // If still no range, try Selection API approach first
              if (!range) {
                console.log('[Dictionary] Trying Selection API approach');
                word = extractWordUsingSelectionAPI(iframeDoc, relativeX, relativeY);
                console.log('[Dictionary] Selection API result:', word);
              }

              // If Selection API also fails, try creating a selection programmatically
              if (!range && !word) {
                console.log('[Dictionary] Selection API failed, trying programmatic selection');
                word = createSelectionAtPoint(iframeDoc, relativeX, relativeY);
                console.log('[Dictionary] Programmatic selection result:', word);
              }

              // Final fallback: manual text extraction
              if (!word) {
                console.log('[Dictionary] All methods failed, using manual text extraction from element');
                word = extractWordFromElementAtPosition(elementAtPoint, relativeX, relativeY);
                console.log('[Dictionary] Manual extraction result:', word);
              }
            }
          }
        } else if (iframeDoc.caretPositionFromPoint) {
          // Try caretPositionFromPoint (Firefox)
          console.log('[Dictionary] Using caretPositionFromPoint');
          const position = iframeDoc.caretPositionFromPoint(relativeX, relativeY);
          if (position) {
            range = iframeDoc.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.setEnd(position.offsetNode, position.offset);
          }
        } else {
          // Browser doesn't support caretRangeFromPoint or caretPositionFromPoint, try alternatives
          console.log('[Dictionary] caretRangeFromPoint/caretPositionFromPoint not supported, trying alternatives');

          // Try programmatic selection first
          word = createSelectionAtPoint(iframeDoc, relativeX, relativeY);
          console.log('[Dictionary] Programmatic selection result:', word);

          if (!word) {
            // Try Selection API as fallback
            word = extractWordUsingSelectionAPI(iframeDoc, relativeX, relativeY);
            console.log('[Dictionary] Selection API result:', word);
          }

          if (!word) {
            // Final fallback: manual extraction
            const elementAtPoint = iframeDoc.elementFromPoint(relativeX, relativeY);
            if (elementAtPoint) {
              word = extractWordFromElementAtPosition(elementAtPoint, relativeX, relativeY);
              console.log('[Dictionary] Manual extraction result:', word);
            }
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
            while (start > 0 && /[a-zA-Z0-9]/.test(text[start - 1])) {
              start--;
            }

            // Move end forwards to find end of word
            while (end < text.length && /[a-zA-Z0-9]/.test(text[end])) {
              end++;
            }

            word = text.substring(start, end).trim();
          }
        }

        // iOS/Safari fallback: if caretRangeFromPoint didn't work, try multiple methods
        if (isIOS() && !word) {
          try {
            const absX = longPressStartRef.current.x;
            const absY = longPressStartRef.current.y;

            // Try using window.caretRangeFromPoint with absolute coordinates (Safari)
            const iframeWindow = iframe.contentWindow;
            if (iframeWindow && iframeWindow.caretRangeFromPoint) {
              try {
                range = iframeWindow.caretRangeFromPoint(absX, absY);
                if (range && range.startContainer) {
                  const textNode = range.startContainer;
                  if (textNode.nodeType === 3) {
                    const text = textNode.textContent;
                    const offset = range.startOffset;
                    let start = offset;
                    let end = offset;
                    while (start > 0 && /[a-zA-Z0-9]/.test(text[start - 1])) {
                      start--;
                    }
                    while (end < text.length && /[a-zA-Z0-9]/.test(text[end])) {
                      end++;
                    }
                    word = text.substring(start, end).trim();
                  }
                }
              } catch (e) {
                // Continue to next fallback
              }
            }

            // Try document.elementFromPoint and manual text extraction
            if (!word && iframeDoc.elementFromPoint) {
              try {
                const iframeRect = iframe.getBoundingClientRect();
                const relativeX = absX - iframeRect.left;
                const relativeY = absY - iframeRect.top;

                const element = iframeDoc.elementFromPoint(relativeX, relativeY);
                if (element && element.textContent) {
                  // Try to find word at approximate position by searching text
                  const text = element.textContent;
                  const words = text.match(/\b[a-zA-Z0-9]+\b/g);
                  if (words && words.length > 0) {
                    // Use first word as fallback - not perfect but better than nothing
                    word = words[0];
                  }
                }
              } catch (e) {
                // Final fallback failed
              }
            }
          } catch (iosError) {
            console.warn('iOS/Safari text selection fallback failed:', iosError);
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
          zone.addEventListener('touchstart', handleLongPressStart, { passive: false }); // Need non-passive for preventDefault in Safari
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


  // Check if current page has a bookmark
  const checkBookmarkForCurrentPage = async (cfi) => {
    try {
      const data = await apiGetBookmarks();
      const currentBookId = currentBookIdRef.current;
      if (!currentBookId) return;

      const bookmark = data.bookmarks?.find(
        b => b.bookId === currentBookId && b.cfi === cfi
      );
      setHasBookmark(!!bookmark);
    } catch (err) {
      // Ignore errors
    }
  };

  // Re-check bookmarks when bookmarkUpdateTrigger changes (e.g., after deletion)
  useEffect(() => {
    if (bookmarkUpdateTrigger > 0 && renditionRef.current?.location?.start?.cfi) {
      const cfi = renditionRef.current.location.start.cfi;
      checkBookmarkForCurrentPage(cfi);
    }
  }, [bookmarkUpdateTrigger]);

  // Toggle bookmark at current location (add if not exists, remove if exists)
  const addBookmark = async () => {
    try {
      const loc = renditionRef.current?.location;
      if (!loc?.start?.cfi) return;

      const cfi = loc.start.cfi;
      const currentBookId = currentBookIdRef.current;
      if (!currentBookId) return;

      // Check if bookmark already exists
      const data = await apiGetBookmarks();
      const existingBookmark = data.bookmarks?.find(
        b => b.bookId === currentBookId && b.cfi === cfi
      );

      if (existingBookmark) {
        // Remove existing bookmark
        await apiDeleteBookmark(existingBookmark.id);
        setHasBookmark(false);
        onToast?.("Bookmark removed");
      } else {
        // Add new bookmark
        let currentPage = 0;
        let p = 0;
        try {
          if (epubBookRef.current?.locations?.length()) {
            p = epubBookRef.current.locations.percentageFromCfi(cfi) || 0;
            const locationIndex = epubBookRef.current.locations.locationFromCfi(cfi);
            currentPage = locationIndex > 0 ? locationIndex : 1;
          }
        } catch { }

        const bookmark = {
          bookId: currentBookId,
          bookTitle: book.title,
          cfi: cfi,
          percent: p,
          page: currentPage
        };

        await apiSaveBookmark(bookmark);
        setHasBookmark(true);
        onToast?.("Bookmark added");
      }
    } catch (err) {
      console.error("Failed to toggle bookmark:", err);
      onToast?.("Failed to toggle bookmark");
    }
  };

  // PDF zoom functions
  async function zoomInPDF() {
    if (book.type !== "pdf" || !pdfDocRef.current || !hostRef.current) return;

    const currentZoom = pdfZoomRef.current;
    const newZoom = Math.min(currentZoom + 0.25, 3.0); // Max 3x zoom
    pdfZoomRef.current = newZoom;

    setIsLoading(true);
    await renderPDFPage(pdfPageNumRef.current, hostRef.current, newZoom);
  }

  async function zoomOutPDF() {
    if (book.type !== "pdf" || !pdfDocRef.current || !hostRef.current) return;

    const currentZoom = pdfZoomRef.current;
    const newZoom = Math.max(currentZoom - 0.25, 0.5); // Min 0.5x zoom
    pdfZoomRef.current = newZoom;

    setIsLoading(true);
    await renderPDFPage(pdfPageNumRef.current, hostRef.current, newZoom);
  }

  async function goPrev() {
    if (book.type === "pdf") {
      if (pdfScrollMode === 'vertical') {
        // Vertical mode: scroll to previous page
        const scrollContainer = hostRef.current?.querySelector('.pdf-vertical-scroll-container');
        if (scrollContainer) {
          const pagesWrapper = scrollContainer.firstElementChild;
          if (pagesWrapper && pdfPageNumRef.current > 1) {
            pdfPageNumRef.current--;
            // Calculate scroll position for the previous page
            let scrollToY = 0;
            for (let i = 0; i < pdfPageNumRef.current - 1; i++) {
              const pageWrapper = pagesWrapper.children[i];
              if (pageWrapper) {
                scrollToY += pageWrapper.offsetHeight || 0;
              }
            }
            scrollContainer.scrollTo({
              top: scrollToY,
              behavior: 'smooth'
            });
          }
        }
      } else {
        // Horizontal mode: render previous page
        if (pdfDocRef.current && pdfPageNumRef.current > 1) {
          pdfPageNumRef.current--;
          pdfZoomRef.current = 1.0; // Reset zoom to default
          if (hostRef.current) {
            setIsLoading(true);
            await renderPDFPage(pdfPageNumRef.current, hostRef.current, 1.0);
          }
        }
      }
      return;
    }
    // EPUB navigation
    try { await renditionRef.current?.prev(); } catch { }
  }
  async function goNext() {
    if (book.type === "pdf") {
      if (pdfScrollMode === 'vertical') {
        // Vertical mode: scroll to next page
        const scrollContainer = hostRef.current?.querySelector('.pdf-vertical-scroll-container');
        if (scrollContainer) {
          const pagesWrapper = scrollContainer.firstElementChild;
          if (pagesWrapper && pdfPageNumRef.current < pdfTotalPagesRef.current) {
            pdfPageNumRef.current++;
            // Calculate scroll position for the next page
            let scrollToY = 0;
            for (let i = 0; i < pdfPageNumRef.current - 1; i++) {
              const pageWrapper = pagesWrapper.children[i];
              if (pageWrapper) {
                scrollToY += pageWrapper.offsetHeight || 0;
              }
            }
            scrollContainer.scrollTo({
              top: scrollToY,
              behavior: 'smooth'
            });
          }
        }
      } else {
        // Horizontal mode: render next page
        if (pdfDocRef.current && pdfPageNumRef.current < pdfTotalPagesRef.current) {
          pdfPageNumRef.current++;
          pdfZoomRef.current = 1.0; // Reset zoom to default
          if (hostRef.current) {
            setIsLoading(true);
            await renderPDFPage(pdfPageNumRef.current, hostRef.current, 1.0);
          }
        }
      }
      return;
    }
    // EPUB navigation
    try { await renditionRef.current?.next(); } catch { }
  }
  function toggleUI() {
    setUiVisible(v => !v);
  }

  async function goToPercent(percent, isDragging = false) {
    if (book.type === "pdf") {
      // PDF navigation by percentage
      if (!pdfDocRef.current || !hostRef.current) return;

      try {
        if (!isDragging) {
          setNavigatingToPercent(percent);
        }

        const totalPages = pdfTotalPagesRef.current;
        const targetPage = Math.max(1, Math.min(totalPages, Math.ceil((percent / 100) * totalPages)));

        pdfPageNumRef.current = targetPage;

        if (pdfScrollMode === 'vertical') {
          // Vertical mode: scroll to position
          const scrollContainer = hostRef.current?.querySelector('.pdf-vertical-scroll-container');
          if (scrollContainer) {
            const scrollHeight = scrollContainer.scrollHeight;
            const clientHeight = scrollContainer.clientHeight;
            const maxScroll = Math.max(0, scrollHeight - clientHeight);
            const scrollTo = (percent / 100) * maxScroll;

            // Update page number based on target percentage
            const targetPage = Math.max(1, Math.min(totalPages, Math.ceil((percent / 100) * totalPages)));
            pdfPageNumRef.current = targetPage;

            // Update progress state (convert percent 0-100 to 0-1)
            const percentDecimal = percent / 100;
            setPercent(percentDecimal);
            setLocationText(`Page ${targetPage} of ${totalPages}`);

            scrollContainer.scrollTo({
              top: scrollTo,
              behavior: isDragging ? 'auto' : 'smooth'
            });

            // After scrolling, update page number based on actual scroll position
            setTimeout(() => {
              const actualScrollTop = scrollContainer.scrollTop;
              const pagesWrapper = scrollContainer.firstElementChild;
              if (pagesWrapper) {
                let currentPage = 1;
                let accumulatedHeight = 0;

                for (let i = 0; i < pagesWrapper.children.length; i++) {
                  const pageWrapper = pagesWrapper.children[i];
                  const pageHeight = pageWrapper.offsetHeight || 0;
                  const pageBottom = accumulatedHeight + pageHeight;
                  const viewportCenter = actualScrollTop + (clientHeight / 2);

                  if (viewportCenter >= accumulatedHeight && viewportCenter < pageBottom) {
                    currentPage = i + 1;
                    break;
                  }
                  accumulatedHeight = pageBottom;
                }

                pdfPageNumRef.current = Math.max(1, Math.min(currentPage, totalPages));
                setLocationText(`Page ${pdfPageNumRef.current} of ${totalPages}`);
              }
            }, isDragging ? 50 : 400); // Shorter delay when dragging
          }

          if (!isDragging) {
            setNavigatingToPercent(null);
          }
        } else {
          // Horizontal mode: render target page
          pdfZoomRef.current = 1.0; // Reset zoom when navigating by slider
          setIsLoading(true);
          await renderPDFPage(targetPage, hostRef.current, 1.0);

          if (!isDragging) {
            setNavigatingToPercent(null);
          }
        }
      } catch (err) {
        console.warn("Failed to navigate PDF to percentage:", err);
        setIsLoading(false);
        if (!isDragging) {
          setNavigatingToPercent(null);
        }
      }
      return;
    }

    // EPUB navigation
    if (!renditionRef.current || !epubBookRef.current) return;

    try {
      if (!isDragging) {
        setNavigatingToPercent(percent);
      }

      const locations = epubBookRef.current.locations;
      if (locations?.length() > 0) {
        const cfi = locations.cfiFromPercentage(percent / 100);
        if (cfi) {
          await renditionRef.current.display(cfi);
        }
      } else if (epubBookRef.current.spine?.length > 0) {
        // Fallback: navigate to spine item for large books without locations
        const spine = epubBookRef.current.spine;
        const targetIndex = Math.floor((percent / 100) * spine.length);
        const item = spine.get(targetIndex);
        if (item) {
          await renditionRef.current.display(item.href);
        }
      }

      if (!isDragging) {
        setNavigatingToPercent(null);
      }
    } catch (err) {
      console.warn("Failed to navigate to percentage:", err);
      if (!isDragging) {
        setNavigatingToPercent(null);
      }
    }
  }

  async function goToTocItem(href) {
    if (!renditionRef.current || !epubBookRef.current) return;

    try {
      setTocOpen(false);

      // Remove fragment identifier if present (e.g., "chapter1.xhtml#section1" -> "chapter1.xhtml")
      const hrefWithoutFragment = href.split('#')[0];
      const fragment = href.includes('#') ? href.split('#')[1] : null;

      // Wait for book to be ready
      await epubBookRef.current.ready;

      // Method 1: Find the spine item that matches the href
      const spine = epubBookRef.current.spine;
      if (spine) {
        // Try to find spine item by href
        let spineItem = null;
        let spineIndex = -1;

        // Normalize href for comparison (handle relative paths)
        const normalizeHref = (h) => {
          // Remove leading slash and normalize
          return h.replace(/^\/+/, '').split('#')[0];
        };

        const normalizedTarget = normalizeHref(hrefWithoutFragment);

        // Search through spine items
        for (let i = 0; i < spine.length; i++) {
          const item = spine.get(i);
          if (item) {
            const itemHref = item.href || item.url || '';
            const normalizedItemHref = normalizeHref(itemHref);

            // Check if hrefs match (exact or ends with)
            if (normalizedItemHref === normalizedTarget ||
              normalizedItemHref.endsWith(normalizedTarget) ||
              normalizedTarget.endsWith(normalizedItemHref)) {
              spineItem = item;
              spineIndex = i;
              break;
            }
          }
        }

        // If found in spine, navigate using the spine item
        if (spineItem && spineIndex >= 0) {
          try {
            // Try using the spine item's href
            const itemHref = spineItem.href || spineItem.url;
            if (fragment) {
              await renditionRef.current.display(itemHref + '#' + fragment);
            } else {
              await renditionRef.current.display(itemHref);
            }
            return;
          } catch (spineErr) {
            // If that fails, try using the spine index
            try {
              await renditionRef.current.display(spineIndex);
              return;
            } catch (indexErr) {
              console.log('Spine index navigation failed:', indexErr);
            }
          }
        }
      }

      // Method 2: Try the href directly (epub.js can handle many href formats)
      try {
        if (fragment) {
          await renditionRef.current.display(hrefWithoutFragment + '#' + fragment);
        } else {
          await renditionRef.current.display(hrefWithoutFragment);
        }
        return;
      } catch (directErr) {
        console.log('Direct href failed, trying original href:', directErr);
      }

      // Method 3: Try the original href with fragment
      try {
        await renditionRef.current.display(href);
        return;
      } catch (originalErr) {
        console.log('Original href also failed:', originalErr);
      }

      // If all methods fail, show error
      throw new Error('All navigation methods failed');

    } catch (err) {
      console.warn("Failed to navigate to TOC item:", err);
      onToast?.("Failed to navigate to chapter");
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

  // Text-to-speech functions
  function extractTextFromCurrentPage() {
    try {
      const iframe = hostRef.current?.querySelector('iframe');
      if (!iframe || !iframe.contentDocument || !iframe.contentWindow) {
        return null;
      }

      const doc = iframe.contentDocument;
      const win = iframe.contentWindow;
      const body = doc.body;
      if (!body) {
        return null;
      }

      // Get viewport using elementFromPoint to sample visible content
      const iframeRect = iframe.getBoundingClientRect();
      const centerX = iframeRect.left + iframeRect.width / 2;
      const centerY = iframeRect.top + iframeRect.height / 2;

      // Sample multiple points across the viewport
      const samplePoints = [];
      const viewportWidth = iframeRect.width;
      const viewportHeight = iframeRect.height;

      // Sample grid of points across visible area
      for (let y = 0; y < viewportHeight; y += Math.max(50, viewportHeight / 10)) {
        for (let x = 0; x < viewportWidth; x += Math.max(50, viewportWidth / 10)) {
          samplePoints.push({
            x: iframeRect.left + x,
            y: iframeRect.top + y
          });
        }
      }

      // Collect unique visible elements using elementFromPoint
      const visibleElements = new Set();
      samplePoints.forEach(point => {
        try {
          const element = doc.elementFromPoint(point.x - iframeRect.left, point.y - iframeRect.top);
          if (element) {
            // Walk up to find the text-containing parent
            let parent = element;
            while (parent && parent !== body) {
              const tagName = parent.tagName?.toUpperCase();
              if (tagName && ['P', 'DIV', 'SPAN', 'LI', 'TD', 'TH', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'SECTION', 'ARTICLE'].includes(tagName)) {
                visibleElements.add(parent);
                break;
              }
              parent = parent.parentElement;
            }
          }
        } catch (e) {
          // Ignore cross-origin or other errors
        }
      });

      // If no elements found, use fallback: check all text elements with getBoundingClientRect
      if (visibleElements.size === 0) {
        const allTextElements = body.querySelectorAll('p, div, span, li, td, th, h1, h2, h3, h4, h5, h6, blockquote, section, article');
        allTextElements.forEach(el => {
          try {
            const rect = el.getBoundingClientRect();
            const iframeRect = iframe.getBoundingClientRect();

            // Check if element is visible and overlaps with iframe viewport
            if (rect.width > 0 && rect.height > 0 &&
              rect.bottom > iframeRect.top &&
              rect.top < iframeRect.bottom &&
              rect.right > iframeRect.left &&
              rect.left < iframeRect.right) {
              visibleElements.add(el);
            }
          } catch (e) {
            // Ignore errors
          }
        });
      }

      // Extract text from visible elements, maintaining order
      // Only get elements that are actually in the current viewport (not the whole chapter)
      const visibleTextParts = [];
      const processedElements = new Set();

      // Get current scroll position to determine what's actually visible
      const scrollTop = win.scrollY || doc.documentElement.scrollTop || 0;
      const scrollLeft = win.scrollX || doc.documentElement.scrollLeft || 0;
      const viewportTop = scrollTop;
      const viewportBottom = scrollTop + viewportHeight;
      const viewportLeft = scrollLeft;
      const viewportRight = scrollLeft + viewportWidth;

      // Walk through document to maintain reading order, but only include visible ones
      const walker = doc.createTreeWalker(
        body,
        NodeFilter.SHOW_ELEMENT,
        {
          acceptNode: (node) => {
            if (!visibleElements.has(node) || processedElements.has(node)) {
              return NodeFilter.FILTER_SKIP;
            }

            // Double-check visibility using getBoundingClientRect to ensure only current page
            try {
              const rect = node.getBoundingClientRect();
              const iframeRect = iframe.getBoundingClientRect();

              // Calculate position relative to document (not viewport)
              const elementTop = rect.top - iframeRect.top + scrollTop;
              const elementBottom = rect.bottom - iframeRect.top + scrollTop;
              const elementLeft = rect.left - iframeRect.left + scrollLeft;
              const elementRight = rect.right - iframeRect.left + scrollLeft;

              // Only include if element overlaps with current viewport (current page)
              const inViewport = (
                elementBottom > viewportTop &&
                elementTop < viewportBottom &&
                elementRight > viewportLeft &&
                elementLeft < viewportRight
              );

              if (inViewport) {
                processedElements.add(node);
                return NodeFilter.FILTER_ACCEPT;
              }
            } catch (e) {
              // If we can't determine position, skip it
            }

            return NodeFilter.FILTER_SKIP;
          }
        }
      );

      let element;
      while ((element = walker.nextNode())) {
        // Clone element to avoid modifying original
        const clone = element.cloneNode(true);
        const scripts = clone.querySelectorAll('script, style');
        scripts.forEach(s => s.remove());

        const text = clone.textContent?.trim();
        if (text && text.length > 0) {
          visibleTextParts.push(text);
        }
      }

      // Combine text parts
      let text = visibleTextParts.join(' ').trim();

      // Clean up whitespace
      text = text
        .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
        .replace(/\n\s*\n/g, ' ')  // Replace multiple newlines with space
        .trim();

      return text || null;
    } catch (err) {
      console.error('Failed to extract text from current page:', err);
      return null;
    }
  }

  function getVoiceForGender(gender) {
    if (!('speechSynthesis' in window)) {
      return null;
    }

    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) {
      return null;
    }

    // Filter voices by gender preference
    // Note: Voice gender property is not standard, so we'll look for common patterns
    const preferredGender = gender === 'male' ? 'male' : 'female';

    // Browser-specific voice patterns
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    const isChrome = /chrome/i.test(navigator.userAgent) && !/edge/i.test(navigator.userAgent);

    const femaleVoicePatterns = [
      'female', 'woman', 'karen', 'samantha', 'victoria', 'zira', 'susan', 'hazel',
      'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer',
      'google uk english female', 'microsoft zira', 'microsoft hazel',
      // Safari voices
      'samantha', 'karen', 'moira', 'tessa', 'veena', 'fiona', 'kate', 'norah'
    ];

    const maleVoicePatterns = [
      'male', 'man', 'david', 'mark', 'alex', 'tom', 'daniel', 'john',
      'google us english', 'microsoft david', 'microsoft mark',
      'google uk english male',
      // Safari male voices
      'alex', 'daniel', 'fred', 'lee', 'oliver', 'reed', 'robin', 'rishi', 'tom', 'will'
    ];

    // Try to find voices that match the preference
    let matchingVoices = voices.filter(voice => {
      const name = voice.name.toLowerCase();
      const lang = voice.lang.toLowerCase();
      const voiceIndex = voices.indexOf(voice);

      if (preferredGender === 'female') {
        return femaleVoicePatterns.some(pattern => name.includes(pattern));
      } else {
        // For male, check multiple patterns
        const hasMalePattern = maleVoicePatterns.some(pattern => name.includes(pattern));

        // Also check if it's NOT a known female voice (fallback)
        const isNotFemale = !femaleVoicePatterns.some(pattern => name.includes(pattern));

        // Safari-specific: Male voices often come after female voices in the list
        if (isSafari) {
          // In Safari, count how many voices there are and pick from the latter half
          const totalVoices = voices.length;
          const isLikelyMale = isNotFemale && voiceIndex >= Math.floor(totalVoices * 0.4);
          return hasMalePattern || isLikelyMale;
        }

        // Chrome-specific: Male voices often appear later in the list
        if (isChrome) {
          const isEnUs = lang.startsWith('en-us') || lang.startsWith('en-gb');
          // Chrome typically has female voices first, male voices later
          const isLikelyMale = isEnUs && isNotFemale && voiceIndex > Math.floor(voices.length * 0.3);
          return hasMalePattern || isLikelyMale;
        }

        // Fallback for other browsers
        const isEnUs = lang.startsWith('en-us') || lang.startsWith('en-gb');
        return hasMalePattern || (isEnUs && isNotFemale && voiceIndex > voices.length / 2);
      }
    });

    // If no matches, try using the voice list order and language hints
    if (matchingVoices.length === 0) {
      // Filter English voices first
      const englishVoices = voices.filter(v => v.lang.toLowerCase().startsWith('en'));

      if (englishVoices.length > 0) {
        if (preferredGender === 'female') {
          // Female voices often come first
          matchingVoices = [englishVoices[0]];
        } else {
          // Male voices often come later - try middle to end of list
          const maleIndex = Math.floor(englishVoices.length * 0.6);
          matchingVoices = [englishVoices[maleIndex] || englishVoices[englishVoices.length - 1]];
        }
      } else {
        // No English voices, use general list position
        if (preferredGender === 'female') {
          matchingVoices = [voices[0]];
        } else {
          const maleIndex = Math.floor(voices.length * 0.6);
          matchingVoices = [voices[maleIndex] || voices[voices.length - 1]];
        }
      }
    }

    // Prefer English voices if available
    const englishMatching = matchingVoices.filter(v => v.lang.toLowerCase().startsWith('en'));
    if (englishMatching.length > 0) {
      return englishMatching[0];
    }

    return matchingVoices[0] || voices[0];
  }

  function toggleTTS() {
    if (isSpeaking) {
      // Stop speaking
      stopTTS();
    } else {
      // Start speaking
      startTTS();
    }
  }

  async function startTTS() {
    try {
      const text = extractTextFromCurrentPage();
      if (!text) {
        onToast?.('No text found on current page');
        return;
      }

      // Store text first (before stopping, so we can save progress with correct text)
      ttsTextRef.current = text;

      // Save current position if there's existing audio before stopping
      if (audioRef.current && audioRef.current.currentTime > 0) {
        try {
          await apiSaveTTSProgress(book.id, {
            currentTime: audioRef.current.currentTime,
            textHash: ttsTextRef.current.length.toString(),
            chapterName: currentChapterName
          });
        } catch (err) {
          console.warn('Failed to save TTS progress before restart:', err);
        }
      }

      // Stop any ongoing TTS (but don't clear text ref or saved position)
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        const audio = audioRef.current;
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.onerror = null;
        audioRef.current = null;
      }
      if (audioSourceRef.current) {
        URL.revokeObjectURL(audioSourceRef.current);
        audioSourceRef.current = null;
      }
      setIsSpeaking(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      setTtsLoading(false);

      // Get chapter name from current location FIRST (before checking saved progress)
      let detectedChapterName = currentChapterName; // Use current state as fallback
      if (renditionRef.current && toc.length > 0) {
        try {
          // Try to get location from rendition object
          let currentHref = null;

          // Method 1: Use rendition.location (most reliable)
          if (renditionRef.current.location) {
            currentHref = renditionRef.current.location.start?.href ||
              renditionRef.current.location.href;
          }

          // Method 2: Try currentLocation() if available
          if (!currentHref) {
            try {
              const location = renditionRef.current.currentLocation();
              if (location) {
                currentHref = location.start?.href || location.href;
              }
            } catch (e) {
              // currentLocation() not available
            }
          }

          if (currentHref) {
            const normalizeHref = (href) => {
              if (!href) return '';
              let normalized = href.split('#')[0].split('?')[0];
              const parts = normalized.split('/');
              return parts[parts.length - 1] || normalized;
            };

            const currentHrefNormalized = normalizeHref(currentHref);

            // Find matching chapter - try multiple matching strategies
            let matchingChapter = toc.find(item => {
              const itemHrefNormalized = normalizeHref(item.href);
              // Exact match
              if (itemHrefNormalized === currentHrefNormalized) return true;
              // Case-insensitive match
              if (itemHrefNormalized.toLowerCase() === currentHrefNormalized.toLowerCase()) return true;
              // Partial match
              if (itemHrefNormalized.includes(currentHrefNormalized) ||
                currentHrefNormalized.includes(itemHrefNormalized)) return true;
              return false;
            });

            // Also try matching full href paths
            if (!matchingChapter) {
              const currentFullHref = currentHref.split('#')[0].split('?')[0];
              matchingChapter = toc.find(item => {
                const itemFullHref = item.href.split('#')[0].split('?')[0];
                return currentFullHref === itemFullHref ||
                  currentFullHref.endsWith(itemFullHref) ||
                  itemFullHref.endsWith(currentFullHref);
              });
            }

            if (matchingChapter) {
              detectedChapterName = matchingChapter.label;
              setCurrentChapterName(matchingChapter.label);
              console.log('[TTS] Chapter name set to:', matchingChapter.label, 'from href:', currentHref);
            }
          }
        } catch (err) {
          console.warn('Failed to get chapter name on TTS start:', err);
        }
      }

      // Now try to load saved TTS progress for this chapter (using detected chapter name)
      let resumeFromTime = 0;
      try {
        const savedProgress = await apiGetTTSProgress(book.id);
        if (savedProgress && savedProgress.currentTime > 0) {
          // Create a simple hash of the text to verify it's the same text
          const textHash = text.length.toString(); // Simple hash based on length
          const savedTextHash = savedProgress.textHash || '0';
          const currentTextHash = textHash;

          // Check if it's the same chapter/text
          const textHashMatches = savedTextHash === currentTextHash;

          // Chapter name matching - be lenient with comparison
          const savedChapter = savedProgress.chapterName || '';
          const currentChapter = detectedChapterName || '';
          const chapterMatches = savedChapter && currentChapter &&
            savedChapter === currentChapter;

          // Text hash similarity check - allow small differences (within 10%)
          const savedHashNum = parseInt(savedTextHash) || 0;
          const currentHashNum = parseInt(currentTextHash) || 0;
          const hashDiff = Math.abs(savedHashNum - currentHashNum);
          const hashSimilar = hashDiff <= Math.max(savedHashNum * 0.1, 50); // 10% or 50 chars tolerance

          // Resume if:
          // 1. Chapter names match (most reliable)
          // 2. Text hashes match exactly
          // 3. Text hashes are similar AND we don't have conflicting chapter names
          const shouldResume = chapterMatches ||
            textHashMatches ||
            (hashSimilar && (!savedChapter || !currentChapter || savedChapter === currentChapter));

          if (shouldResume) {
            resumeFromTime = savedProgress.currentTime;
            savedAudioPositionRef.current = resumeFromTime;
            console.log('[TTS] Resuming from saved position:', resumeFromTime, 'seconds');
            console.log('[TTS] Match - Chapter:', chapterMatches ? '✓' : '✗',
              'TextHash:', textHashMatches ? '✓' : (hashSimilar ? '≈' : '✗'));
            if (!chapterMatches && !textHashMatches) {
              console.log('[TTS] Using similar text hash (difference:', hashDiff, 'chars)');
            }
          } else {
            console.log('[TTS] Saved progress exists but chapter/text changed - starting fresh');
            console.log('[TTS] Saved chapter:', savedChapter, 'Current:', currentChapter);
            console.log('[TTS] Saved hash:', savedTextHash, 'Current:', currentTextHash, 'Diff:', hashDiff);
          }
        } else {
          console.log('[TTS] No saved progress found - starting from beginning');
        }
      } catch (err) {
        console.warn('Failed to load TTS progress:', err);
      }

      // Generate TTS audio from server
      try {
        setTtsLoading(true);
        setIsSpeaking(true);
        setShowAudioPlayer(true); // Show modal when starting
        setAudioCurrentTime(resumeFromTime);
        setAudioDuration(0);

        const audioBlob = await apiGenerateTTS(text, {
          voice: prefs.voiceName || null,
          rate: prefs.readingSpeed || 1.0,
          pitch: 1.0,
          lang: 'en-US'
        });

        // Create audio element and play
        const audioUrl = URL.createObjectURL(audioBlob);
        audioSourceRef.current = audioUrl;

        // Clean up old audio if exists
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }

        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Update audio time and duration
        const updateTime = () => {
          const currentTime = audio.currentTime;
          setAudioCurrentTime(currentTime);
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioDuration(audio.duration);
          }
        };

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioDuration(audio.duration);
            setShowAudioPlayer(true);
            // Resume from saved position if available
            if (resumeFromTime > 0 && resumeFromTime < audio.duration) {
              audio.currentTime = resumeFromTime;
              setAudioCurrentTime(resumeFromTime);
            }
          }
        });

        // Save progress periodically (every 2 seconds)
        let startTTSProgressInterval = null;
        const saveProgress = async () => {
          if (audio.currentTime > 0 && audio.duration > 0) {
            try {
              await apiSaveTTSProgress(book.id, {
                currentTime: audio.currentTime,
                textHash: text.length.toString(),
                chapterName: currentChapterName
              });
            } catch (err) {
              console.warn('Failed to save TTS progress:', err);
            }
          }
        };

        startTTSProgressInterval = setInterval(saveProgress, 2000);

        audio.onplay = () => {
          setIsSpeaking(true);
          setTtsLoading(false);
          setShowAudioPlayer(true);
        };

        audio.onpause = () => {
          setIsSpeaking(false);
        };

        audio.onended = () => {
          setIsSpeaking(false);
          setAudioCurrentTime(0);
          setTtsLoading(false);
          setShowAudioPlayer(false);
          if (startTTSProgressInterval) {
            clearInterval(startTTSProgressInterval);
          }
          // Delete saved progress when finished
          apiDeleteTTSProgress(book.id).catch(err => console.warn('Failed to delete TTS progress:', err));
          // Clean up
          if (audioSourceRef.current) {
            URL.revokeObjectURL(audioSourceRef.current);
            audioSourceRef.current = null;
          }
          audioRef.current = null;
          console.log('[TTS] Speech ended');
        };

        audio.onerror = (event) => {
          console.error('[TTS] Audio playback error:', event);
          setIsSpeaking(false);
          setAudioCurrentTime(0);
          setAudioDuration(0);
          setTtsLoading(false);
          if (startTTSProgressInterval) {
            clearInterval(startTTSProgressInterval);
          }
          onToast?.('Error playing audio');
        };

        // Start playing
        await audio.play();
        console.log('[TTS] Speech started');

      } catch (err) {
        console.error('[TTS] Error generating or playing TTS:', err);
        setIsSpeaking(false);
        setAudioCurrentTime(0);
        setAudioDuration(0);
        setTtsLoading(false);
        onToast?.('Failed to start text-to-speech: ' + (err.message || 'Unknown error'));
      }
    } catch (err) {
      console.error('Failed to start text-to-speech:', err);
      onToast?.('Failed to start text-to-speech');
      setIsSpeaking(false);
    }
  }

  function stopTTS() {
    try {
      // Save current position before stopping so user can resume later
      if (audioRef.current && audioRef.current.currentTime > 0 && ttsTextRef.current) {
        apiSaveTTSProgress(book.id, {
          currentTime: audioRef.current.currentTime,
          textHash: ttsTextRef.current.length.toString(),
          chapterName: currentChapterName
        }).catch(err => console.warn('Failed to save TTS progress on stop:', err));
      }

      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        // Remove all event listeners by creating a new audio object reference
        const audio = audioRef.current;
        audio.onplay = null;
        audio.onpause = null;
        audio.onended = null;
        audio.onerror = null;
        audioRef.current = null;
      }
      if (audioSourceRef.current) {
        URL.revokeObjectURL(audioSourceRef.current);
        audioSourceRef.current = null;
      }
      setIsSpeaking(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      setTtsLoading(false);
      setShowAudioPlayer(false); // Close modal immediately
      // Keep ttsTextRef and savedAudioPositionRef so we can resume later
    } catch (err) {
      console.error('Failed to stop text-to-speech:', err);
    }
  }

  // Seek functions for audio player
  function seekAudio(seconds) {
    if (audioRef.current && audioDuration > 0) {
      const newTime = Math.max(0, Math.min(audioDuration, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setAudioCurrentTime(newTime);
    }
  }

  function seekTo(time) {
    if (audioRef.current && audioDuration > 0) {
      const newTime = Math.max(0, Math.min(audioDuration, time));
      audioRef.current.currentTime = newTime;
      setAudioCurrentTime(newTime);
    }
  }

  function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function pausePlayAudio() {
    if (audioRef.current) {
      if (audioRef.current.paused) {
        audioRef.current.play();
      } else {
        audioRef.current.pause();
      }
    }
  }

  // Load TTS voices
  async function loadTTSVoices() {
    try {
      const data = await apiGetTTSVoices();
      const availableVoices = data.voices || [];
      setTtsVoices(availableVoices);
    } catch (err) {
      console.error("Failed to load TTS voices:", err);
      setTtsVoices([]);
    }
  }

  // Handle voice change - restart TTS with new voice
  async function handleVoiceChange(newVoice) {
    const newPrefs = { ...prefs, voiceName: newVoice || null };
    onPrefsChange(newPrefs);

    // If TTS is currently playing or loaded, regenerate with new voice
    if ((audioRef.current || audioDuration > 0) && ttsTextRef.current) {
      const wasPlaying = audioRef.current && !audioRef.current.paused && !audioRef.current.ended;
      const currentTime = audioRef.current ? audioRef.current.currentTime : audioCurrentTime;
      savedAudioPositionRef.current = currentTime;

      // Save current position
      if (currentTime > 0) {
        try {
          await apiSaveTTSProgress(book.id, {
            currentTime: currentTime,
            textHash: ttsTextRef.current.length.toString(),
            chapterName: currentChapterName
          });
        } catch (err) {
          console.warn('Failed to save TTS progress on voice change:', err);
        }
      }

      // Clean up old audio but keep modal open (preserve duration)
      const currentDuration = audioDuration; // Preserve duration to keep modal visible
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioSourceRef.current) {
          URL.revokeObjectURL(audioSourceRef.current);
        }
        audioRef.current = null;
        audioSourceRef.current = null;
      }
      // Keep duration set so modal stays visible
      setAudioDuration(currentDuration);

      // Regenerate audio with new voice
      setTtsLoading(true);
      setShowAudioPlayer(true); // Keep modal visible
      try {
        const audioBlob = await apiGenerateTTS(ttsTextRef.current, {
          voice: newVoice || null,
          rate: prefs.readingSpeed || 1.0,
          pitch: 1.0,
          lang: 'en-US'
        });

        const audioUrl = URL.createObjectURL(audioBlob);
        audioSourceRef.current = audioUrl;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Set up event handlers
        const updateTime = () => {
          setAudioCurrentTime(audio.currentTime);
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioDuration(audio.duration);
          }
        };

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioDuration(audio.duration);
            setShowAudioPlayer(true);
            // Resume from saved position
            if (savedAudioPositionRef.current > 0 && savedAudioPositionRef.current < audio.duration) {
              audio.currentTime = savedAudioPositionRef.current;
              setAudioCurrentTime(savedAudioPositionRef.current);
            }
          }
        });

        // Save progress periodically
        let voiceChangeProgressInterval = null;
        const saveProgressVoice = async () => {
          if (audio.currentTime > 0 && audio.duration > 0) {
            try {
              await apiSaveTTSProgress(book.id, {
                currentTime: audio.currentTime,
                textHash: ttsTextRef.current.length.toString(),
                chapterName: currentChapterName
              });
            } catch (err) {
              console.warn('Failed to save TTS progress:', err);
            }
          }
        };
        voiceChangeProgressInterval = setInterval(saveProgressVoice, 2000);

        audio.onplay = () => {
          setIsSpeaking(true);
          setTtsLoading(false);
          setShowAudioPlayer(true);
        };

        audio.onpause = () => {
          setIsSpeaking(false);
        };

        audio.onended = () => {
          setIsSpeaking(false);
          setTtsLoading(false);
          setShowAudioPlayer(false);
          if (voiceChangeProgressInterval) {
            clearInterval(voiceChangeProgressInterval);
          }
          apiDeleteTTSProgress(book.id).catch(() => { });
          if (audioSourceRef.current) {
            URL.revokeObjectURL(audioSourceRef.current);
            audioSourceRef.current = null;
          }
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setTtsLoading(false);
          if (voiceChangeProgressInterval) {
            clearInterval(voiceChangeProgressInterval);
          }
          onToast?.('Error playing audio');
        };

        // Start playing if it was playing before
        if (wasPlaying) {
          await audio.play();
        }
      } catch (err) {
        console.error('Failed to regenerate TTS:', err);
        setTtsLoading(false);
        onToast?.('Failed to regenerate audio: ' + (err.message || 'Unknown error'));
      }
    }
  }

  // Handle reading speed change - restart TTS with new speed
  async function handleSpeedChange(newSpeed) {
    const newPrefs = { ...prefs, readingSpeed: newSpeed };
    onPrefsChange(newPrefs);

    // If TTS is currently playing or loaded, regenerate with new speed
    if ((audioRef.current || audioDuration > 0) && ttsTextRef.current) {
      const wasPlaying = audioRef.current && !audioRef.current.paused && !audioRef.current.ended;
      const currentTime = audioRef.current ? audioRef.current.currentTime : audioCurrentTime;
      savedAudioPositionRef.current = currentTime;

      // Save current position
      if (currentTime > 0) {
        try {
          await apiSaveTTSProgress(book.id, {
            currentTime: currentTime,
            textHash: ttsTextRef.current.length.toString(),
            chapterName: currentChapterName
          });
        } catch (err) {
          console.warn('Failed to save TTS progress on speed change:', err);
        }
      }

      // Clean up old audio but keep modal open (preserve duration)
      const currentDuration = audioDuration; // Preserve duration to keep modal visible
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioSourceRef.current) {
          URL.revokeObjectURL(audioSourceRef.current);
        }
        audioRef.current = null;
        audioSourceRef.current = null;
      }
      // Keep duration set so modal stays visible
      setAudioDuration(currentDuration);

      // Regenerate audio with new speed
      setTtsLoading(true);
      setShowAudioPlayer(true); // Keep modal visible
      try {
        const audioBlob = await apiGenerateTTS(ttsTextRef.current, {
          voice: prefs.voiceName || null,
          rate: newSpeed,
          pitch: 1.0,
          lang: 'en-US'
        });

        const audioUrl = URL.createObjectURL(audioBlob);
        audioSourceRef.current = audioUrl;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        // Set up event handlers (same as voice change)
        const updateTime = () => {
          setAudioCurrentTime(audio.currentTime);
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioDuration(audio.duration);
          }
        };

        audio.addEventListener('timeupdate', updateTime);
        audio.addEventListener('loadedmetadata', () => {
          if (audio.duration && !isNaN(audio.duration)) {
            setAudioDuration(audio.duration);
            setShowAudioPlayer(true);
            // Resume from saved position
            if (savedAudioPositionRef.current > 0 && savedAudioPositionRef.current < audio.duration) {
              audio.currentTime = savedAudioPositionRef.current;
              setAudioCurrentTime(savedAudioPositionRef.current);
            }
          }
        });

        // Save progress periodically
        let speedChangeProgressInterval = null;
        const saveProgressSpeed = async () => {
          if (audio.currentTime > 0 && audio.duration > 0) {
            try {
              await apiSaveTTSProgress(book.id, {
                currentTime: audio.currentTime,
                textHash: ttsTextRef.current.length.toString(),
                chapterName: currentChapterName
              });
            } catch (err) {
              console.warn('Failed to save TTS progress:', err);
            }
          }
        };
        speedChangeProgressInterval = setInterval(saveProgressSpeed, 2000);

        audio.onplay = () => {
          setIsSpeaking(true);
          setTtsLoading(false);
          setShowAudioPlayer(true);
        };

        audio.onpause = () => {
          setIsSpeaking(false);
        };

        audio.onended = () => {
          setIsSpeaking(false);
          setTtsLoading(false);
          setShowAudioPlayer(false);
          if (speedChangeProgressInterval) {
            clearInterval(speedChangeProgressInterval);
          }
          apiDeleteTTSProgress(book.id).catch(() => { });
          if (audioSourceRef.current) {
            URL.revokeObjectURL(audioSourceRef.current);
            audioSourceRef.current = null;
          }
          audioRef.current = null;
        };

        audio.onerror = () => {
          setIsSpeaking(false);
          setTtsLoading(false);
          if (speedChangeProgressInterval) {
            clearInterval(speedChangeProgressInterval);
          }
          onToast?.('Error playing audio');
        };

        // Start playing if it was playing before
        if (wasPlaying) {
          await audio.play();
        }
      } catch (err) {
        console.error('Failed to regenerate TTS:', err);
        setTtsLoading(false);
        onToast?.('Failed to regenerate audio: ' + (err.message || 'Unknown error'));
      }
    }
  }

  // Load voices when audio player is shown
  useEffect(() => {
    if (audioDuration > 0 && ttsVoices.length === 0) {
      loadTTSVoices();
    }
  }, [audioDuration]);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => {
      stopTTS();
    };
  }, []);


  const pct = Math.round((percent || 0) * 100);

  const verticalMargin = clamp(prefs.verticalMargin || 30, 1, 180);
  const horizontalMargin = clamp(prefs.horizontalMargin || 46, 1, 180);

  return (
    <div className="readerShell">
      <div className={`readerTop ${!uiVisible ? 'hidden' : ''}`}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button className="pill" onClick={onBack}>← Library</button>
          <button
            className="pill"
            onClick={addBookmark}
            title="Add bookmark"
            style={{ opacity: hasBookmark ? 0.8 : 1, padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 2C3 1.44772 3.44772 1 4 1H12C12.5523 1 13 1.44772 13 2V13C13 13.2652 12.8946 13.5196 12.7071 13.7071C12.5196 13.8946 12.2652 14 12 14C11.7348 14 11.4804 13.8946 11.2929 13.7071L8 10.4142L4.70711 13.7071C4.51957 13.8946 4.26522 14 4 14C3.73478 14 3.48043 13.8946 3.29289 13.7071C3.10536 13.5196 3 13.2652 3 13V2Z" fill="currentColor" stroke="currentColor" strokeWidth="0.5" />
            </svg>
          </button>
        </div>
        <div className="readerTitle" title={book.title}>{book.title}</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {book.type === "pdf" ? (
            // PDF-specific controls: Scroll mode toggle
            <>
              <button
                className="pill"
                onClick={async () => {
                  const newMode = pdfScrollMode === 'vertical' ? 'horizontal' : 'vertical';
                  setPdfScrollMode(newMode);
                  // Re-render PDF with new mode - wait for DOM to update
                  if (pdfDocRef.current && hostRef.current) {
                    setIsLoading(true);
                    pdfZoomRef.current = 1.0; // Reset zoom when switching modes
                    try {
                      // Wait for React to update the DOM (padding changes)
                      await new Promise(resolve => requestAnimationFrame(() => {
                        setTimeout(resolve, 50);
                      }));

                      if (newMode === 'vertical') {
                        await renderPDFVertical(pdfDocRef.current, hostRef.current, pdfPageNumRef.current);
                      } else {
                        await renderPDFPage(pdfPageNumRef.current, hostRef.current, 1.0);
                      }
                    } catch (err) {
                      console.error('Error switching scroll mode:', err);
                      onToast?.("Failed to switch scroll mode. Please try again.");
                    }
                  }
                }}
                title={pdfScrollMode === 'vertical' ? 'Switch to Horizontal Scroll (Tap Left/Right)' : 'Switch to Vertical Scroll (Continuous)'}
                style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', opacity: pdfScrollMode === 'vertical' ? 1 : 0.7 }}
              >
                {pdfScrollMode === 'vertical' ? '↕' : '↔'}
              </button>
              {!isIOS() && (
                <button
                  className="pill"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  style={isFullscreen ? { opacity: 0.8 } : {}}
                >
                  ⛶
                </button>
              )}
            </>
          ) : (
            // EPUB-specific controls: TTS, TOC, Settings
            <>
              <button
                className="pill"
                onClick={toggleTTS}
                title={isSpeaking ? "Stop reading" : "Read Chapter"}
                style={{
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: isSpeaking ? 0.8 : 1
                }}
              >
                {isSpeaking ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="5" y="4" width="2" height="8" rx="1" fill="currentColor" />
                    <rect x="9" y="4" width="2" height="8" rx="1" fill="currentColor" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 9V15H7L12 20V4L7 9H3Z" fill="currentColor" />
                    <path d="M14 11C14 10.45 14.45 10 15 10C15.55 10 16 10.45 16 11V13C16 13.55 15.55 14 15 14C14.45 14 14 13.55 14 13V11Z" fill="currentColor" />
                    <path d="M17.5 9C17.5 8.45 17.95 8 18.5 8C19.05 8 19.5 8.45 19.5 9V15C19.5 15.55 19.05 16 18.5 16C17.95 16 17.5 15.55 17.5 15V9Z" fill="currentColor" />
                    <path d="M20.5 7C20.5 6.45 20.95 6 21.5 6C22.05 6 22.5 6.45 22.5 7V17C22.5 17.55 22.05 18 21.5 18C20.95 18 20.5 17.55 20.5 17V7Z" fill="currentColor" />
                  </svg>
                )}
              </button>
              <button
                className="pill"
                onClick={() => setTocOpen(true)}
                title="Table of Contents"
                style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2 3C2 2.44772 2.44772 2 3 2H13C13.5523 2 14 2.44772 14 3C14 3.55228 13.5523 4 13 4H3C2.44772 4 2 3.55228 2 3Z" fill="currentColor" />
                  <path d="M2 7C2 6.44772 2.44772 6 3 6H13C13.5523 6 14 6.44772 14 7C14 7.55228 13.5523 8 13 8H3C2.44772 8 2 7.55228 2 7Z" fill="currentColor" />
                  <path d="M3 10C2.44772 10 2 10.4477 2 11C2 11.5523 2.44772 12 3 12H13C13.5523 12 14 11.5523 14 11C14 10.4477 13.5523 10 13 10H3Z" fill="currentColor" />
                </svg>
              </button>
              {!isIOS() && (
                <button
                  className="pill"
                  onClick={toggleFullscreen}
                  title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  style={isFullscreen ? { opacity: 0.8 } : {}}
                >
                  ⛶
                </button>
              )}
              <button className="pill" onClick={() => setDrawerOpen(true)}>Aa</button>
            </>
          )}
        </div>
      </div>

      <div className="readerStage">
        {/* Bookmark overlay in top-left corner, below toolbar */}
        {hasBookmark && (
          <div
            style={{
              position: 'absolute',
              top: '50px',
              left: '10px',
              zIndex: 8,
              pointerEvents: 'none',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }}
            title="Bookmarked"
          >
            <svg width="24" height="24" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 2C3 1.44772 3.44772 1 4 1H12C12.5523 1 13 1.44772 13 2V13C13 13.2652 12.8946 13.5196 12.7071 13.7071C12.5196 13.8946 12.2652 14 12 14C11.7348 14 11.4804 13.8946 11.2929 13.7071L8 10.4142L4.70711 13.7071C4.51957 13.8946 4.26522 14 4 14C3.73478 14 3.48043 13.8946 3.29289 13.7071C3.10536 13.5196 3 13.2652 3 13V2Z" fill="#dc2626" stroke="#dc2626" strokeWidth="0.5" />
            </svg>
          </div>
        )}
        {/* tap zones - disabled for PDF vertical scroll mode */}
        <div
          className="navZone navLeft"
          onClick={book.type === "pdf" && pdfScrollMode === "vertical" ? undefined : goPrev}
          aria-label="Previous page"
          style={book.type === "pdf" && pdfScrollMode === "vertical" ? {
            pointerEvents: 'none',
            touchAction: 'none',
            zIndex: -1
          } : {}}
        />
        <div
          className="navZone navRight"
          onClick={book.type === "pdf" && pdfScrollMode === "vertical" ? undefined : goNext}
          aria-label="Next page"
          style={book.type === "pdf" && pdfScrollMode === "vertical" ? {
            pointerEvents: 'none',
            touchAction: 'none',
            zIndex: -1
          } : {}}
        />
        <div
          className="navZone navMid"
          onClick={book.type === "pdf" && pdfScrollMode === "vertical" ? undefined : toggleUI}
          aria-label="Toggle UI"
          style={book.type === "pdf" && pdfScrollMode === "vertical" ? {
            pointerEvents: 'none',
            touchAction: 'pan-y',
            zIndex: -1
          } : {}}
        />

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
            paddingLeft: book.type === 'pdf' && pdfScrollMode === 'vertical' ? '0px' : `${horizontalMargin}px`,
            paddingRight: book.type === 'pdf' && pdfScrollMode === 'vertical' ? '0px' : `${horizontalMargin}px`,
            paddingTop: book.type === 'pdf' && pdfScrollMode === 'vertical' ? '0px' : `${verticalMargin}px`,
            paddingBottom: book.type === 'pdf' && pdfScrollMode === 'vertical' ? '0px' : `${verticalMargin}px`,
            opacity: isLoading ? 0 : 1,
            transition: 'opacity 0.2s ease',
          }}
        />
      </div>

      <div className={`bottomBar ${!uiVisible ? 'hidden' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px', width: '120px' }}>
          <span style={{ fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{locationText || " "}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, justifyContent: 'center', padding: '0 20px' }}>
          <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center' }}>
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

        <div style={{ fontSize: '11px', minWidth: '40px', width: '40px', textAlign: 'right' }}>
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

      {book.type !== "pdf" && (
        <SettingsDrawer
          open={drawerOpen}
          prefs={prefs}
          onChange={onPrefsChange}
          onClose={() => setDrawerOpen(false)}
        />
      )}

      {/* TOC Sidebar - only for EPUB */}
      {tocOpen && book.type !== "pdf" && (
        <div className="drawerBackdrop" onClick={() => setTocOpen(false)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3>Table of Contents</h3>
              <button
                className="pill"
                onClick={() => setTocOpen(false)}
                style={{ padding: '6px 10px', fontSize: '14px' }}
              >
                ✕
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
              {toc.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: '12px', padding: '20px 0', textAlign: 'center' }}>
                  No table of contents available
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {toc.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => goToTocItem(item.href)}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        border: '1px solid var(--row-border)',
                        borderRadius: '10px',
                        background: 'var(--row-bg)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        transition: 'all 0.15s ease',
                        paddingLeft: `${12 + (item.level || 0) * 16}px`,
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.borderColor = 'rgba(124,92,255,.55)';
                        e.target.style.background = 'var(--card-bg)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.borderColor = 'var(--row-border)';
                        e.target.style.background = 'var(--row-bg)';
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {dictionaryPopup && (
        <DictionaryPopup
          word={dictionaryPopup.word}
          definition={dictionaryPopup.definition}
          position={dictionaryPopup.position}
          onClose={() => setDictionaryPopup(null)}
        />
      )}

      {/* Audio Player Modal - show when audio exists or loading */}
      {showAudioPlayer && (
        <div
          style={{
            position: 'fixed',
            top: uiVisible ? '60px' : '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1000,
            background: 'var(--drawer-bg)',
            backdropFilter: 'blur(20px)',
            borderRadius: '16px',
            padding: '16px 20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            border: '1px solid var(--border)',
            minWidth: '280px',
            maxWidth: '90vw',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            transition: 'top 0.3s ease',
            position: 'relative'
          }}
        >
          {/* Close Button (X) */}
          <button
            className="pill"
            onClick={stopTTS}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              padding: '4px 8px',
              fontSize: '14px',
              minWidth: 'auto',
              width: '24px',
              height: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid var(--border)'
            }}
            title="Stop and close"
          >
            ✕
          </button>

          {/* Loading Overlay */}
          {ttsLoading && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'var(--drawer-bg)',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10,
                backdropFilter: 'blur(20px)'
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    border: '3px solid rgba(255,255,255,0.2)',
                    borderTopColor: 'var(--accent)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}
                />
                <div style={{ fontSize: '12px', color: 'var(--text)' }}>Loading audio...</div>
              </div>
            </div>
          )}

          {/* Chapter Name */}
          <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', textAlign: 'center', marginBottom: '4px', paddingRight: '30px' }}>
            {currentChapterName || 'Reading'}
          </div>

          {/* Voice and Speed Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            {/* Voice Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)', minWidth: '50px' }}>Voice:</label>
              <select
                value={prefs.voiceName || ''}
                onChange={(e) => handleVoiceChange(e.target.value || null)}
                disabled={ttsLoading}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  fontSize: '12px',
                  background: 'var(--input-bg)',
                  border: '1px solid var(--input-border)',
                  borderRadius: '6px',
                  color: 'var(--text)',
                  cursor: ttsLoading ? 'not-allowed' : 'pointer',
                  opacity: ttsLoading ? 0.6 : 1
                }}
              >
                <option value="">Default (server will choose)</option>
                {ttsVoices.map((voiceInfo, index) => (
                  <option key={index} value={voiceInfo.name}>
                    {voiceInfo.name} {voiceInfo.langName ? `(${voiceInfo.langName})` : voiceInfo.lang ? `(${formatLanguageName(voiceInfo.lang)})` : ''}
                  </option>
                ))}
                {prefs.voiceName && !ttsVoices.some(v => v.name === prefs.voiceName) && (
                  <option value={prefs.voiceName} disabled>
                    {prefs.voiceName} (not available)
                  </option>
                )}
              </select>
            </div>

            {/* Reading Speed */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)', minWidth: '50px' }}>Speed:</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={prefs.readingSpeed || 1.0}
                onChange={(e) => handleSpeedChange(Number(e.target.value))}
                disabled={ttsLoading}
                style={{
                  flex: 1,
                  height: '4px',
                  cursor: ttsLoading ? 'not-allowed' : 'pointer',
                  opacity: ttsLoading ? 0.6 : 1
                }}
              />
              <div style={{ width: '38px', textAlign: 'right', fontSize: '11px', color: 'var(--muted)' }}>
                {(prefs.readingSpeed || 1.0).toFixed(1)}x
              </div>
            </div>
          </div>

          {/* Seekbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <input
              type="range"
              min={0}
              max={audioDuration || 0}
              value={audioCurrentTime || 0}
              onChange={(e) => seekTo(parseFloat(e.target.value))}
              step={0.1}
              disabled={ttsLoading}
              style={{
                flex: 1,
                height: '6px',
                cursor: ttsLoading ? 'not-allowed' : 'pointer',
                background: audioDuration > 0 ? `linear-gradient(to right, var(--accent) 0%, var(--accent) ${((audioCurrentTime || 0) / audioDuration) * 100}%, rgba(255,255,255,0.2) ${((audioCurrentTime || 0) / audioDuration) * 100}%, rgba(255,255,255,0.2) 100%)` : 'rgba(255,255,255,0.2)',
                borderRadius: '3px',
                border: 'none',
                outline: 'none',
                opacity: ttsLoading ? 0.6 : 1
              }}
            />
          </div>

          {/* Time and Controls */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            {/* Time Display */}
            <div style={{ fontSize: '12px', color: 'var(--muted)', minWidth: '80px' }}>
              {formatTime(audioCurrentTime)} / {formatTime(audioDuration)}
            </div>

            {/* Control Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Backward 10s */}
              <button
                className="pill"
                onClick={() => seekAudio(-10)}
                disabled={ttsLoading}
                style={{
                  padding: '6px 10px',
                  fontSize: '14px',
                  minWidth: '40px',
                  opacity: ttsLoading ? 0.6 : 1,
                  cursor: ttsLoading ? 'not-allowed' : 'pointer'
                }}
                title="Rewind 10 seconds"
              >
                ⏪
              </button>

              {/* Play/Pause */}
              <button
                className="pill"
                onClick={pausePlayAudio}
                disabled={ttsLoading || !audioRef.current}
                style={{
                  padding: '8px 12px',
                  fontSize: '16px',
                  minWidth: '48px',
                  opacity: (ttsLoading || !audioRef.current) ? 0.6 : 1,
                  cursor: (ttsLoading || !audioRef.current) ? 'not-allowed' : 'pointer'
                }}
                title={audioRef.current && !audioRef.current.paused ? "Pause" : "Play"}
              >
                {audioRef.current && !audioRef.current.paused ? '⏸' : '▶'}
              </button>

              {/* Forward 10s */}
              <button
                className="pill"
                onClick={() => seekAudio(10)}
                disabled={ttsLoading}
                style={{
                  padding: '6px 10px',
                  fontSize: '14px',
                  minWidth: '40px',
                  opacity: ttsLoading ? 0.6 : 1,
                  cursor: ttsLoading ? 'not-allowed' : 'pointer'
                }}
                title="Forward 10 seconds"
              >
                ⏩
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
