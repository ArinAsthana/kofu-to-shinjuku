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
}
