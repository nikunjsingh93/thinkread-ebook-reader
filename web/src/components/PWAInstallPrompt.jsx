import React, { useState, useEffect } from 'react';
import { showInstallPrompt, canInstallPWA } from '../lib/serviceWorker.js';

export default function PWAInstallPrompt({ onToast }) {
  const [canInstall, setCanInstall] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if PWA can be installed
    const checkInstallability = () => {
      const installable = canInstallPWA();
      setCanInstall(installable);

      // Auto-show prompt after a delay if installable
      if (installable && !localStorage.getItem('pwa-install-dismissed')) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    checkInstallability();

    // Re-check periodically
    const interval = setInterval(checkInstallability, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleInstall = async () => {
    try {
      const result = await showInstallPrompt();
      if (result) {
        const { outcome } = await result;
        if (outcome === 'accepted') {
          onToast('ThinkRead installed successfully!');
          setShowPrompt(false);
        } else {
          onToast('Installation cancelled');
        }
      }
    } catch (error) {
      console.error('Install prompt failed:', error);
      onToast('Installation failed. Please try again.');
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-install-dismissed', 'true');
  };

  if (!canInstall || !showPrompt) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      left: '20px',
      right: '20px',
      background: 'var(--card-bg)',
      border: '1px solid var(--border)',
      borderRadius: '12px',
      padding: '16px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      zIndex: 1000,
      maxWidth: '400px',
      margin: '0 auto'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '12px'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          background: 'var(--accent)',
          borderRadius: '8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: '20px'
        }}>
          📖
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontWeight: 'bold',
            color: 'var(--text)',
            fontSize: '14px'
          }}>
            Install ThinkRead
          </div>
          <div style={{
            color: 'var(--muted)',
            fontSize: '12px',
            lineHeight: '1.4'
          }}>
            Read offline, get notifications, and enjoy a native app experience
          </div>
        </div>
      </div>

      <div style={{
        display: 'flex',
        gap: '8px',
        justifyContent: 'flex-end'
      }}>
        <button
          onClick={handleDismiss}
          style={{
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            color: 'var(--muted)',
            fontSize: '14px',
            cursor: 'pointer',
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
          Not now
        </button>
        <button
          onClick={handleInstall}
          style={{
            padding: '8px 16px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: '6px',
            color: 'white',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.target.style.opacity = '0.9';
          }}
          onMouseLeave={(e) => {
            e.target.style.opacity = '1';
          }}
        >
          Install
        </button>
      </div>
    </div>
  );
}
