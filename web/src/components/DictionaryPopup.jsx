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

  return (
    <>
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
          backgroundColor: '#ffffff',
          border: '1px solid #d1d5db',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          padding: '12px 16px',
          maxWidth: '300px',
          zIndex: 9999,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ 
            fontSize: '16px', 
            fontWeight: '600', 
            color: '#1f2937',
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
              color: '#6b7280',
              padding: '0',
              lineHeight: '1',
              flexShrink: 0,
            }}
            title="Close"
          >
            ×
          </button>
        </div>
        <div style={{ 
          fontSize: '14px', 
          color: '#4b5563', 
          lineHeight: '1.5',
        }}>
          {definition}
        </div>
      </div>
    </>
  );
}

