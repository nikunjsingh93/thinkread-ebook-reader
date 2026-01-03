package com.thinkread.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "OrientationLock")
public class OrientationLockPlugin extends Plugin {
    
    @PluginMethod
    public void setOrientation(PluginCall call) {
        String orientationMode = call.getString("orientation", "portrait");
        MainActivity activity = (MainActivity) getActivity();
        if (activity != null) {
            // Ensure we're on the UI thread
            getActivity().runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    activity.setOrientation(orientationMode);
                    JSObject ret = new JSObject();
                    ret.put("success", true);
                    call.resolve(ret);
                }
            });
        } else {
            call.reject("Activity not available");
        }
    }
}

