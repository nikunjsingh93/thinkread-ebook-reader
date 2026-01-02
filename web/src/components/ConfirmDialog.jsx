import React from "react";

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div 
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--backdrop-bg)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px"
      }}
      onClick={onCancel}
      role="dialog" 
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <div 
        onClick={(e) => e.stopPropagation()} 
        style={{
          background: "var(--drawer-bg)",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "400px",
          width: "100%",
          border: "1px solid var(--border)",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          gap: "20px"
        }}
      >
        <div>
          <h3 
            id="confirm-title" 
            style={{ 
              margin: 0, 
              marginBottom: "8px",
              fontSize: "18px",
              fontWeight: 600,
              letterSpacing: "0.2px"
            }}
          >
            {title || "Confirm"}
          </h3>
          {message && (
            <div style={{ color: "var(--muted)", fontSize: "14px", whiteSpace: "pre-line", lineHeight: "1.5" }}>
              {message}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button 
            className="pill" 
            onClick={onCancel} 
            style={{ opacity: 0.8 }}
          >
            Cancel
          </button>
          <button 
            className="pill" 
            onClick={onConfirm} 
            style={{ background: "var(--accent)", color: "white" }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

