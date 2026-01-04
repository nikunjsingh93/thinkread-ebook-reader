import React from "react";

export default function PrivacyPolicy({ open, onClose }) {
  if (!open) return null;

  // Check if we're in Electron on macOS to add top padding for title bar
  const isElectron = typeof window !== 'undefined' && window.electronAPI;
  const isMac = typeof navigator !== 'undefined' && 
    (navigator.platform.toUpperCase().indexOf('MAC') >= 0 || 
     navigator.userAgent.toUpperCase().indexOf('MAC') >= 0);
  const needsTitleBarPadding = isElectron && isMac;
  
  const topPadding = needsTitleBarPadding 
    ? '42px' 
    : `max(12px, env(safe-area-inset-top, 12px))`;

  return (
    <div className="drawerBackdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div 
        className="drawer" 
        onClick={(e) => e.stopPropagation()}
        style={{ paddingTop: topPadding, maxWidth: '600px', margin: '0 auto' }}
      >
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink: 0, marginBottom: "16px"}}>
          <h3>Privacy Policy</h3>
          <button className="pill" onClick={onClose}>Done</button>
        </div>

        <div style={{overflowY: "auto", overflowX: "hidden", flex: 1, paddingRight: "4px", paddingBottom: "20px"}}>
          <div style={{fontSize: '14px', lineHeight: '1.6', color: 'var(--text)'}}>
            <p style={{marginBottom: '16px'}}>
              <strong>Last updated:</strong> {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Introduction</h4>
            <p style={{marginBottom: '16px'}}>
              ThinkRead ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our ebook reader application.
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Information We Collect</h4>
            <p style={{marginBottom: '12px'}}>
              <strong>Local Data Only:</strong> ThinkRead is designed with privacy in mind. All data is stored locally on your device:
            </p>
            <ul style={{marginBottom: '16px', paddingLeft: '20px'}}>
              <li style={{marginBottom: '8px'}}>Ebook files (EPUB format) that you upload</li>
              <li style={{marginBottom: '8px'}}>Reading preferences (font size, margins, theme, etc.)</li>
              <li style={{marginBottom: '8px'}}>Reading progress and bookmarks</li>
              <li style={{marginBottom: '8px'}}>Custom fonts you upload</li>
              <li style={{marginBottom: '8px'}}>Dictionary data (if imported)</li>
            </ul>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>No Data Collection</h4>
            <p style={{marginBottom: '16px'}}>
              We do <strong>not</strong> collect, transmit, or store any of your data on external servers. All information remains on your device and is never sent to us or any third parties.
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Permissions</h4>
            <p style={{marginBottom: '12px'}}>
              The app requires the following permissions:
            </p>
            <ul style={{marginBottom: '16px', paddingLeft: '20px'}}>
              <li style={{marginBottom: '8px'}}>
                <strong>Storage permissions:</strong> To read ebook files from your device and save your reading progress locally
              </li>
              <li style={{marginBottom: '8px'}}>
                <strong>Internet permission:</strong> Not actively used - only included for potential future features, but currently no network requests are made
              </li>
            </ul>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Third-Party Services</h4>
            <p style={{marginBottom: '16px'}}>
              ThinkRead does not use any third-party analytics, advertising, or tracking services. We do not integrate with any external data collection services.
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Data Security</h4>
            <p style={{marginBottom: '16px'}}>
              Since all data is stored locally on your device, your data security depends on your device's security measures. We recommend using device encryption and keeping your device updated with the latest security patches.
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Children's Privacy</h4>
            <p style={{marginBottom: '16px'}}>
              ThinkRead is safe for users of all ages. Since we do not collect any data, we do not knowingly collect information from children. All data remains on the user's device.
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Changes to This Privacy Policy</h4>
            <p style={{marginBottom: '16px'}}>
              We may update this Privacy Policy from time to time. We will notify you of any changes by updating the "Last updated" date at the top of this policy. You are advised to review this Privacy Policy periodically for any changes.
            </p>

            <h4 style={{marginTop: '24px', marginBottom: '12px', fontSize: '16px', fontWeight: '600'}}>Contact Us</h4>
            <p style={{marginBottom: '16px'}}>
              If you have any questions about this Privacy Policy, please contact us through the app store listing or project repository.
            </p>

            <p style={{marginTop: '24px', fontSize: '12px', color: 'var(--muted)', fontStyle: 'italic'}}>
              This privacy policy applies to ThinkRead version 1.5 and later.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

