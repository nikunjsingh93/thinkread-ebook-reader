import React from 'react';

/**
 * A popup component that displays word definitions
 * @param {Object} props
 * @param {string} props.word - The word to display
 * @param {string} props.definition - The definition to display
 * @param {Object} props.position - {x, y} position for the popup
 * @param {Function} props.onClose - Callback when popup should close
 */
export default function DictionaryPopup({ word, definition, position, onClose }) {
  if (!word || !definition) return null;

  // Detect current theme from CSS variables
  const isDarkTheme = () => {
    const root = document.documentElement;
    const bgColor = getComputedStyle(root).getPropertyValue('--bg').trim();
    // Check if background is dark (not white or very light)
    return bgColor !== '#ffffff' && bgColor !== '#fafafa';
  };

  const theme = isDarkTheme() ? 'dark' : 'light';

  // Calculate popup position to avoid going off-screen
  const popupRef = React.useRef(null);
  const [adjustedPosition, setAdjustedPosition] = React.useState(position);

  React.useEffect(() => {
    if (!popupRef.current) return;

    const popup = popupRef.current;
    const rect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let { x, y } = position;

    // Adjust horizontal position if popup goes off-screen
    if (x + rect.width > viewportWidth - 20) {
      x = viewportWidth - rect.width - 20;
    }
    if (x < 20) {
      x = 20;
    }

    // Adjust vertical position if popup goes off-screen
    if (y + rect.height > viewportHeight - 20) {
      // Position above the cursor instead
      y = position.y - rect.height - 10;
    }
    if (y < 20) {
      y = 20;
    }

    setAdjustedPosition({ x, y });
  }, [position]);

  // Unique ID for scrollbar styling
  const scrollbarId = React.useId();

  return (
    <>
      <style>
        {`
          .dictionary-popup-content-${scrollbarId}::-webkit-scrollbar {
            width: 6px;
          }
          .dictionary-popup-content-${scrollbarId}::-webkit-scrollbar-track {
            background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)'};
            border-radius: 3px;
          }
          .dictionary-popup-content-${scrollbarId}::-webkit-scrollbar-thumb {
            background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'};
            border-radius: 3px;
          }
          .dictionary-popup-content-${scrollbarId}::-webkit-scrollbar-thumb:hover {
            background: ${theme === 'dark' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.3)'};
          }
        `}
      </style>
      {/* Overlay to detect clicks outside */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9998,
        }}
        onClick={onClose}
      />
      
      {/* The popup itself */}
      <div
        ref={popupRef}
        style={{
          position: 'fixed',
          left: `${adjustedPosition.x}px`,
          top: `${adjustedPosition.y}px`,
          backgroundColor: theme === 'dark' ? 'var(--panel)' : '#ffffff',
          border: `1px solid ${theme === 'dark' ? 'var(--border)' : '#d1d5db'}`,
          borderRadius: '8px',
          boxShadow: theme === 'dark' ? '0 4px 12px rgba(0, 0, 0, 0.4)' : '0 4px 12px rgba(0, 0, 0, 0.15)',
          padding: '12px 16px',
          maxWidth: '320px',
          maxHeight: '400px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 9999,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          WebkitUserSelect: 'none', // Prevent text selection on iOS
          WebkitTouchCallout: 'none', // Prevent iOS callout menu
          userSelect: 'none', // Prevent text selection
        }}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }} // Prevent context menu
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px', flexShrink: 0 }}>
          <div style={{
            fontSize: '16px',
            fontWeight: '600',
            color: theme === 'dark' ? 'var(--text)' : '#1f2937',
            marginRight: '12px',
            wordBreak: 'break-word'
          }}>
            {word}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: theme === 'dark' ? 'var(--muted)' : '#6b7280',
              padding: '0',
              lineHeight: '1',
              flexShrink: 0,
            }}
            title="Close"
          >
            ×
          </button>
        </div>
        <div
          className={`dictionary-popup-content-${scrollbarId}`}
          style={{
            fontSize: '14px',
            color: theme === 'dark' ? 'var(--muted)' : '#4b5563',
            lineHeight: '1.5',
            overflowY: 'auto',
            overflowX: 'hidden',
            paddingRight: '4px',
            flex: 1,
          }}
        >
          {definition}
        </div>
      </div>
    </>
  );
}

