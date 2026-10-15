package com.arin.thearin;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** v5.3: the web app pushes a small snapshot here; the home-screen widgets draw it. They never read the database. */
@CapacitorPlugin(name = "Widget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        JSObject snap = call.getObject("snapshot", new JSObject());
        getContext().getSharedPreferences(NowWidget.PREFS, 0).edit().putString("snapshot", snap.toString()).apply();
        NowWidget.refreshAll(getContext());
        call.resolve();
    }

    /** v9.3: the bedtimes the Going to bed widget logged since the last call, as [{bed, alarm, cls}] (then cleared). */
    @PluginMethod
    public void bed(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(NowWidget.PREFS, 0);
        JSObject r = new JSObject();
        try {
            r.put("log", new org.json.JSONArray(p.getString("bedLog", "[]")));
        } catch (org.json.JSONException e) {
            r.put("log", new org.json.JSONArray());
        }
        p.edit().remove("bedLog").apply();
        call.resolve(r);
    }

    /** v9.3: the status bar follows the page (deep navy in workout mode, red otherwise). */
    @PluginMethod
    public void bar(PluginCall call) {
        final int color;
        try {
            color = android.graphics.Color.parseColor(call.getString("color", "#E0211F"));
        } catch (IllegalArgumentException e) {
            call.reject("bad color");
            return;
        }
        getActivity().runOnUiThread(() -> {
            android.view.Window w = getActivity().getWindow();
            w.setStatusBarColor(color); // Android 14 and older; edge-to-edge (15+) shows the window background instead
            w.getDecorView().setBackgroundColor(color);
            new androidx.core.view.WindowInsetsControllerCompat(w, w.getDecorView()).setAppearanceLightStatusBars(false);
        });
        call.resolve();
    }

    /** v8.3: the screen a widget button or nudge asked for, once (then cleared). */
    @PluginMethod
    public void pending(PluginCall call) {
        android.content.SharedPreferences p = getContext().getSharedPreferences(NowWidget.PREFS, 0);
        JSObject r = new JSObject();
        r.put("route", p.getString("pendingRoute", ""));
        p.edit().remove("pendingRoute").apply();
        call.resolve(r);
    }
}
