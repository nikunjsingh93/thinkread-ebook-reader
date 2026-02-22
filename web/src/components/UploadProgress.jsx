import React, { useEffect } from 'react';

export default function UploadProgress({ isVisible, progress, onCancel }) {
  useEffect(() => {
    // Add CSS animation for indeterminate progress
    const style = document.createElement('style');
    style.textContent = `
      @keyframes progress-slide {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(400%); }
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  if (!isVisible) return null;

  const { percentage = 0, files = 0, uploaded = 0, remaining = files, phase = 'uploading' } = progress || {};

  // Determine current phase
  const isUploading = phase === 'uploading';
  const isProcessing = phase === 'processing';
  const isComplete = phase === 'complete';

  let statusText = '';
  let subText = '';

  if (isUploading) {
    statusText = `Uploading ${files} book${files !== 1 ? 's' : ''}`;
    subText = `${percentage}% uploaded`;
  } else if (isProcessing) {
    statusText = `Processing ${files} book${files !== 1 ? 's' : ''}`;
    subText = 'Please wait...';
  } else if (isComplete) {
    statusText = 'Upload Complete!';
    subText = `${files} book${files !== 1 ? 's' : ''} ready`;
  } else {
    statusText = 'Preparing upload...';
    subText = 'Getting ready';
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(2px)'
    }}>
      <div style={{
        background: 'var(--panel)',
        borderRadius: '12px',
        padding: '24px',
        width: '90%',
        maxWidth: '400px',
        border: '1px solid var(--border)',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px'
        }}>
          <h3 style={{
            margin: 0,
            color: 'var(--text)',
            fontSize: '18px',
            fontWeight: '600'
          }}>
            {statusText}
          </h3>
          {onCancel && isUploading && (
            <button
              onClick={onCancel}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'var(--row-bg)';
                e.target.style.color = 'var(--text)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'transparent';
                e.target.style.color = 'var(--muted)';
              }}
            >
              ✕
            </button>
          )}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '8px'
          }}>
            <span style={{
              color: 'var(--text)',
              fontSize: '14px'
            }}>
              {files} file{files !== 1 ? 's' : ''}
            </span>
            <span style={{
              color: 'var(--muted)',
              fontSize: '14px'
            }}>
              {isComplete ? '✓' : isProcessing ? '⚙️' : '📤'}
            </span>
          </div>

          <div style={{
            width: '100%',
            height: '8px',
            background: 'var(--row-bg)',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative'
          }}>
            {isProcessing ? (
              // Indeterminate progress bar for processing
              <div style={{
                height: '100%',
                background: '#ffc107',
                borderRadius: '4px',
                width: '30%',
                position: 'absolute',
                animation: 'progress-slide 1.5s ease-in-out infinite'
              }} />
            ) : (
              <div style={{
                height: '100%',
                background: isComplete ? '#28a745' : 'var(--accent)',
                borderRadius: '4px',
                width: isComplete ? '100%' : `${percentage}%`,
                transition: 'width 0.3s ease'
              }} />
            )}
          </div>

        </div>

        <div style={{
          textAlign: 'center',
          fontSize: '12px',
          color: 'var(--muted)'
        }}>
          {subText}
        </div>
      </div>
    </div>
  );
}
