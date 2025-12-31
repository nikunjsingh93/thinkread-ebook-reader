import React from "react";

export default function Toast({ text }) {
  if (!text) return null;
  return <div className="toast" role="status" aria-live="polite">{text}</div>;
}
