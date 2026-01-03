import React from 'react';

export default function MacTitleBar() {
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
        top: 0,
        left: 0,
        right: 0,
        height: '28px',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '78px', // Space for traffic lights
        paddingRight: '8px',
        zIndex: 10000,
        WebkitAppRegion: 'drag',
        appRegion: 'drag',
        backgroundColor: 'var(--bg)', // Match app background to remove white gap
        borderBottom: '1px solid var(--border)', // Optional: add subtle border
        pointerEvents: 'none',
      }}
    >
      {/* Traffic light buttons */}
      <div
        style={{
          position: 'fixed',
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

      {/* Title area - draggable */}
      <div
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <span
          style={{
            fontSize: '13px',
            color: 'var(--text)',
            opacity: 0.6,
            fontWeight: 500,
          }}
        >
          ThinkRead
        </span>
      </div>
    </div>
  );
}

