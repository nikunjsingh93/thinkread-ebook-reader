package com.thinkread.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

public class MainActivity extends BridgeActivity {
    private String currentOrientationMode = "portrait"; // Default to portrait
    private int currentOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
    private static final String PREFS_NAME = "ThinkReadPrefs";
    private static final String KEY_VOLUME_BEHAVIOR = "volumeKeyBehavior";
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Set orientation to portrait immediately to prevent any flash
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        
        // Enable immersive fullscreen mode
        enableFullscreen();
        
        // Try to add JavaScript interface early (will also be tried in onStart)
        Handler handler = new Handler(Looper.getMainLooper());
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                addVolumeKeyInterface();
            }
        }, 1000);
    }
    
    @Override
    public void onStart() {
        super.onStart();
        
        // Add JavaScript interface for volume key behavior when WebView is ready
        // Use multiple attempts with increasing delays to ensure WebView is initialized
        Handler handler = new Handler(Looper.getMainLooper());
        
        // Try immediately
        handler.post(new Runnable() {
            @Override
            public void run() {
                addVolumeKeyInterface();
            }
        });
        
        // Try after 500ms
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                addVolumeKeyInterface();
            }
        }, 500);
        
        // Try after 1 second
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                addVolumeKeyInterface();
            }
        }, 1000);
        
        // Try after 2 seconds
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                addVolumeKeyInterface();
            }
        }, 2000);
    }
    
    private void addVolumeKeyInterface() {
        com.getcapacitor.Bridge bridge = getBridge();
        if (bridge != null) {
            android.webkit.WebView webView = bridge.getWebView();
            if (webView != null) {
                try {
                    // Enable JavaScript (should already be enabled, but ensure it)
                    android.webkit.WebSettings settings = webView.getSettings();
                    settings.setJavaScriptEnabled(true);
                    
                    // Remove existing interface if any (Android API 17+)
                    try {
                        android.webkit.WebView.class.getMethod("removeJavascriptInterface", String.class).invoke(webView, "VolumeKeyNative");
                    } catch (Exception e) {
                        // Ignore if method doesn't exist or interface wasn't added
                    }
                    
                    // Add the interface
                    webView.addJavascriptInterface(new VolumeKeyJSInterface(), "VolumeKeyNative");
                    android.util.Log.d("MainActivity", "VolumeKeyNative JavaScript interface added successfully");
                    
                    // Inject a global function as backup and also sync any existing behavior
                    String currentBehavior = getVolumeKeyBehavior();
                    String js = "window.setVolumeKeyBehavior = function(behavior) { " +
                                "if (window.VolumeKeyNative && window.VolumeKeyNative.setBehavior) { " +
                                "window.VolumeKeyNative.setBehavior(behavior); " +
                                "} else { " +
                                "window.__volumeKeyBehavior = behavior; " +
                                "console.warn('VolumeKeyNative not available, using global variable'); " +
                                "} " +
                                "}; " +
                                "if (window.__volumeKeyBehavior) { " +
                                "window.setVolumeKeyBehavior(window.__volumeKeyBehavior); " +
                                "}";
                    webView.evaluateJavascript(js, null);
                    
                    // Also set the current behavior from SharedPreferences
                    if (!"media".equals(currentBehavior)) {
                        String setJs = "if (window.VolumeKeyNative && window.VolumeKeyNative.setBehavior) { window.VolumeKeyNative.setBehavior('" + currentBehavior + "'); }";
                        webView.evaluateJavascript(setJs, null);
                    }
                } catch (Exception e) {
                    android.util.Log.e("MainActivity", "Failed to add JavaScript interface: " + e.getMessage(), e);
                }
            } else {
                android.util.Log.w("MainActivity", "WebView is null, cannot add interface");
            }
        } else {
            android.util.Log.w("MainActivity", "Bridge is null, cannot add interface");
        }
    }
    
    // JavaScript interface for setting volume key behavior
    public class VolumeKeyJSInterface {
        @JavascriptInterface
        public void setBehavior(String behavior) {
            android.util.Log.d("MainActivity", "setBehavior called from JS: " + behavior);
            setVolumeKeyBehavior(behavior);
        }
    }
    
    @Override
    public void onResume() {
        super.onResume();
        // Re-apply orientation lock
        setRequestedOrientation(currentOrientation);
    }
    
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableFullscreen();
            // Re-apply orientation lock
            setRequestedOrientation(currentOrientation);
        }
    }
    
    @Override
    public void onConfigurationChanged(android.content.res.Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // Re-apply orientation lock immediately to prevent rotation
        setRequestedOrientation(currentOrientation);
    }
    
    private void enableFullscreen() {
        View decorView = getWindow().getDecorView();
        
        // Hide system UI (status bar and navigation bar)
        int uiOptions = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        
        decorView.setSystemUiVisibility(uiOptions);
        
        // Also hide action bar if present
        if (getSupportActionBar() != null) {
            getSupportActionBar().hide();
        }
        
        // Keep screen on
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        
        // Use edge-to-edge display
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        
        // Hide status bar and navigation bar
        WindowInsetsControllerCompat windowInsetsController = WindowCompat.getInsetsController(getWindow(), decorView);
        if (windowInsetsController != null) {
            windowInsetsController.hide(androidx.core.view.WindowInsetsCompat.Type.statusBars());
            windowInsetsController.hide(androidx.core.view.WindowInsetsCompat.Type.navigationBars());
            windowInsetsController.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }
    
    public void setOrientation(String orientationMode) {
        android.util.Log.d("MainActivity", "setOrientation called with: " + orientationMode);
        currentOrientationMode = orientationMode;
        
        int newOrientation;
        if ("portrait".equals(orientationMode)) {
            newOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
        } else if ("landscape".equals(orientationMode)) {
            newOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE;
        } else if ("reverse-landscape".equals(orientationMode)) {
            newOrientation = ActivityInfo.SCREEN_ORIENTATION_REVERSE_LANDSCAPE;
        } else {
            // Default to portrait
            newOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
            currentOrientationMode = "portrait";
        }
        
        android.util.Log.d("MainActivity", "Setting orientation to: " + newOrientation + " (current: " + currentOrientation + ")");
        
        // Always apply the orientation change
        currentOrientation = newOrientation;
        
        // Force rotation by temporarily unlocking, then locking to new orientation
        // Use Handler to ensure proper timing
        Handler handler = new Handler(Looper.getMainLooper());
        
        // First, unlock the orientation to allow rotation
        android.util.Log.d("MainActivity", "Unlocking orientation...");
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        
        // Then, after a short delay, set the new orientation
        // This forces Android to actually rotate the activity
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                android.util.Log.d("MainActivity", "Locking orientation to: " + currentOrientation);
                setRequestedOrientation(currentOrientation);
            }
        }, 150); // 150ms delay to ensure unlock takes effect
    }
    
    public void setVolumeKeyBehavior(String behavior) {
        android.util.Log.d("MainActivity", "setVolumeKeyBehavior called with: " + behavior);
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_VOLUME_BEHAVIOR, behavior).apply();
    }
    
    private String getVolumeKeyBehavior() {
        // Try to read from the preferences JSON file (where JavaScript saves it)
        // This is the source of truth since JavaScript saves preferences there
        try {
            File dataDir = getFilesDir();
            File prefsFile = new File(dataDir, "data/prefs.json");
            if (prefsFile.exists() && prefsFile.length() > 0) {
                BufferedReader reader = new BufferedReader(new FileReader(prefsFile));
                StringBuilder json = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    json.append(line);
                }
                reader.close();
                
                if (json.length() > 0) {
                    // Parse JSON to get volumeKeyBehavior
                    JSONObject prefsJson = new JSONObject(json.toString());
                    if (prefsJson.has("volumeKeyBehavior")) {
                        String volBehavior = prefsJson.getString("volumeKeyBehavior");
                        if (volBehavior != null && !volBehavior.isEmpty()) {
                            android.util.Log.d("MainActivity", "Read volumeKeyBehavior from prefs.json: " + volBehavior);
                            // Cache it in SharedPreferences for faster access next time
                            SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
                            prefs.edit().putString(KEY_VOLUME_BEHAVIOR, volBehavior).apply();
                            return volBehavior;
                        }
                    }
                }
            }
        } catch (Exception e) {
            android.util.Log.w("MainActivity", "Failed to read volumeKeyBehavior from prefs.json: " + e.getMessage());
        }
        
        // Fallback: Try SharedPreferences (set by JavaScript interface)
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String behavior = prefs.getString(KEY_VOLUME_BEHAVIOR, null);
        if (behavior != null && !behavior.isEmpty()) {
            return behavior;
        }
        
        return "media"; // Default
    }
    
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Handle volume keys
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            String behavior = getVolumeKeyBehavior();
            android.util.Log.d("MainActivity", "Volume key pressed (keyCode: " + keyCode + "), behavior: " + behavior);
            
            // Check if behavior is one of the page turn modes
            if ("volumeDownNext".equals(behavior) || "volumeUpNext".equals(behavior)) {
                try {
                    // Notify JavaScript directly through WebView
                    com.getcapacitor.Bridge bridge = getBridge();
                    if (bridge != null) {
                        android.webkit.WebView webView = bridge.getWebView();
                        if (webView != null) {
                            String key = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "volumeUp" : "volumeDown";
                            android.util.Log.d("MainActivity", "Notifying volume key via WebView: " + key + " with behavior: " + behavior);
                            String js = "if (window.dispatchEvent) { window.dispatchEvent(new CustomEvent('volumeKeyPressed', {detail: {key: '" + key + "', behavior: '" + behavior + "'}})); }";
                            webView.post(() -> webView.evaluateJavascript(js, null));
                            // Consume the event to prevent media control
                            return true;
                        }
                    }
                    // Fallback: try plugin if available
                    VolumeKeyPlugin plugin = VolumeKeyPlugin.getInstance();
                    if (plugin != null) {
                        String key = (keyCode == KeyEvent.KEYCODE_VOLUME_UP) ? "volumeUp" : "volumeDown";
                        plugin.notifyVolumeKeyPressed(key);
                        return true;
                    }
                } catch (Exception e) {
                    android.util.Log.e("MainActivity", "Error notifying volume key: " + e.getMessage(), e);
                }
            } else {
                android.util.Log.d("MainActivity", "Volume key behavior is not page turn, allowing default");
            }
            // Otherwise, let the system handle it (media controls)
        }
        return super.onKeyDown(keyCode, event);
    }
    
    @Override
    public boolean onKeyUp(int keyCode, KeyEvent event) {
        // Also handle volume keys on key up to ensure we catch them
        if (keyCode == KeyEvent.KEYCODE_VOLUME_UP || keyCode == KeyEvent.KEYCODE_VOLUME_DOWN) {
            String behavior = getVolumeKeyBehavior();
            if ("volumeDownNext".equals(behavior) || "volumeUpNext".equals(behavior)) {
                // Consume the event to prevent media control
                return true;
            }
        }
        return super.onKeyUp(keyCode, event);
    }
}
