package com.thinkread.app;

import android.content.pm.ActivityInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private String currentOrientationMode = "portrait"; // Default to portrait
    private int currentOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT;
    
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Set orientation to portrait immediately to prevent any flash
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        
        // Enable immersive fullscreen mode
        enableFullscreen();
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
}
