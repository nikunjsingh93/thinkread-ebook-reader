package com.thinkread.app;

import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Enable immersive fullscreen mode
        enableFullscreen();
    }
    
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enableFullscreen();
        }
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
}
