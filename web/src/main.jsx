import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';

// Initialize Capacitor plugins
if (Capacitor.isNativePlatform()) {
  // Hide status bar for fullscreen experience
  StatusBar.hide().catch(() => {
    // StatusBar plugin might not be available on all platforms
  });
}

// Error boundary for better error handling
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

// Check runtime environment
if (typeof window !== 'undefined' && window.electronAPI) {
  console.log('Electron API is available');
} else if (Capacitor.isNativePlatform()) {
  console.log('Running on native platform (Capacitor)');
} else {
  console.log('Running in web mode');
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
