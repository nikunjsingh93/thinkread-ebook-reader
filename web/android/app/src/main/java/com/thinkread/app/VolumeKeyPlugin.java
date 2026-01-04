package com.thinkread.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VolumeKey")
public class VolumeKeyPlugin extends Plugin {
    
    private static VolumeKeyPlugin instance;
    private static final String PREFS_NAME = "ThinkReadPrefs";
    private static final String KEY_VOLUME_BEHAVIOR = "volumeKeyBehavior";
    
    public VolumeKeyPlugin() {
        instance = this;
    }
    
    @Override
    public void load() {
        super.load();
        android.util.Log.d("VolumeKeyPlugin", "Plugin loaded");
    }
    
    public static VolumeKeyPlugin getInstance() {
        return instance;
    }
    
    @PluginMethod
    public void setBehavior(PluginCall call) {
        String behaviorMode = call.getString("behavior", "media");
        android.util.Log.d("VolumeKeyPlugin", "setBehavior called with: " + behaviorMode);
        
        // Store in SharedPreferences
        Context context = getContext();
        if (context != null) {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_VOLUME_BEHAVIOR, behaviorMode).apply();
            android.util.Log.d("VolumeKeyPlugin", "Saved behavior to SharedPreferences: " + behaviorMode);
        }
        
        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
    
    public void notifyVolumeKeyPressed(String key) {
        // Notify JavaScript about volume key press
        JSObject data = new JSObject();
        data.put("key", key);
        notifyListeners("volumeKeyPressed", data);
    }
}

