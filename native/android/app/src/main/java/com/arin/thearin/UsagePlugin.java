package com.arin.thearin;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Phone-usage minutes for the watched apps (v5.2), read from Android's UsageStatsManager.
 * Android only allows this after the user turns on "Usage access" for The Arin in Settings.
 */
@CapacitorPlugin(name = "Usage")
public class UsagePlugin extends Plugin {

    private boolean granted() {
        AppOpsManager ops = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    @PluginMethod
    public void status(PluginCall call) {
        JSObject r = new JSObject();
        r.put("granted", granted());
        call.resolve(r);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    /** Foreground minutes per package between start and end (epoch ms). */
    @PluginMethod
    public void minutes(PluginCall call) {
        if (!granted()) {
            call.reject("Usage access is off", "DENIED");
            return;
        }
        // Epoch ms arrive as Long from JSON, which getDouble() ignores, so read them as numbers directly.
        long now = System.currentTimeMillis();
        long start = call.getData().optLong("start", 0L);
        long end = Math.min(call.getData().optLong("end", now), now);
        Set<String> watch = new HashSet<>();
        try {
            JSArray arr = call.getArray("packages", new JSArray());
            for (int i = 0; i < arr.length(); i++) watch.add(arr.getString(i));
        } catch (Exception e) {
            call.reject("Bad package list");
            return;
        }
        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        // Start an hour early to catch an app that was already open at `start`; time is clipped to the range.
        UsageEvents events = usm.queryEvents(start - 3600000L, end);
        Map<String, Long> since = new HashMap<>();
        Map<String, Long> total = new HashMap<>();
        UsageEvents.Event ev = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(ev);
            String pkg = ev.getPackageName();
            if (!watch.contains(pkg)) continue;
            int t = ev.getEventType();
            if (t == UsageEvents.Event.ACTIVITY_RESUMED) {
                if (!since.containsKey(pkg)) since.put(pkg, ev.getTimeStamp());
            } else if (t == UsageEvents.Event.ACTIVITY_PAUSED || t == UsageEvents.Event.ACTIVITY_STOPPED) {
                Long s = since.remove(pkg);
                if (s != null) add(total, pkg, Math.max(s, start), Math.min(ev.getTimeStamp(), end));
            }
        }
        for (Map.Entry<String, Long> open : since.entrySet()) add(total, open.getKey(), Math.max(open.getValue(), start), end);
        JSObject per = new JSObject();
        long sum = 0;
        for (Map.Entry<String, Long> e : total.entrySet()) {
            per.put(e.getKey(), Math.round(e.getValue() / 60000.0));
            sum += e.getValue();
        }
        JSObject r = new JSObject();
        r.put("total", Math.round(sum / 60000.0));
        r.put("apps", per);
        call.resolve(r);
    }

    private static void add(Map<String, Long> total, String pkg, long a, long b) {
        if (b > a) total.put(pkg, (total.containsKey(pkg) ? total.get(pkg) : 0L) + (b - a));
    }
}
