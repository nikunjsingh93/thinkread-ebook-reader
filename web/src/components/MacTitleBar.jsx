import React from 'react';

export default function MacTitleBar({ hidden = false }) {
  const isElectron = () => typeof window !== 'undefined' && window.electronAPI;
  
  // Check if we're on macOS - in Electron, we can check via userAgent or platform
  const isMac = typeof navigator !== 'undefined' && 
    (navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
     navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
  
  if (!isElectron() || !isMac) {
    return null; // Only show on macOS in Electron
  }

  const handleClose = () => {
    if (window.electronAPI?.closeWindow) {
      window.electronAPI.closeWindow();
    }
  };

  const handleMinimize = () => {
    if (window.electronAPI?.minimizeWindow) {
      window.electronAPI.minimizeWindow();
    }
  };

  const handleMaximize = () => {
    if (window.electronAPI?.maximizeWindow) {
      window.electronAPI.maximizeWindow();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: hidden ? '-28px' : '0',
        left: 0,
        right: 0,
        height: '28px',
        zIndex: 10000,
        WebkitAppRegion: hidden ? 'no-drag' : 'drag',
        appRegion: hidden ? 'no-drag' : 'drag',
        backgroundColor: 'var(--bg)',
        pointerEvents: hidden ? 'none' : 'auto', // Disable pointer events when hidden
        transition: 'top 0.2s ease, opacity 0.2s ease',
        cursor: 'default',
        opacity: hidden ? 0 : 1, // Fade out for complete hiding
      }}
    >
      {/* Traffic light buttons */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '12px',
          display: 'flex',
          gap: '8px',
          WebkitAppRegion: 'no-drag',
          appRegion: 'no-drag',
          pointerEvents: 'auto',
          zIndex: 10001,
        }}
      >
        <button
          onClick={handleClose}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ff5f57',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#ff3b30';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#ff5f57';
          }}
        />
        <button
          onClick={handleMinimize}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#ffbd2e',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#ff9500';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#ffbd2e';
          }}
        />
        <button
          onClick={handleMaximize}
          style={{
            width: '12px',
            height: '12px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#28c940',
            cursor: 'pointer',
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#34c759';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#28c940';
          }}
        />
      </div>
    </div>
  );
}

