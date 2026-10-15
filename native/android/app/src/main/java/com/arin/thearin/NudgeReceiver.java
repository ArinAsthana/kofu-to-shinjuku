package com.arin.thearin;

import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * v8.3 watched-app nudge. Every ~15 min (inexact, battery-friendly) this checks whether a watched app (Instagram etc.)
 * was opened since the last check. If Japanese reviews are due, it sends one nudge, at most once a day, never in the
 * quiet stretches (sleep and class) the web app pushed in the widget snapshot. The web app's gap nudges cap at 2 a day,
 * so together it is never more than 3.
 */
public class NudgeReceiver extends BroadcastReceiver {

    static final long EVERY = AlarmManager.INTERVAL_FIFTEEN_MINUTES;

    static void arm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, NudgeReceiver.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setInexactRepeating(AlarmManager.ELAPSED_REALTIME, SystemClock.elapsedRealtime() + EVERY, EVERY, pi);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) { arm(c); return; }
        try { check(c); } catch (Exception e) { /* never crash in the background */ }
    }

    private void check(Context c) throws Exception {
        SharedPreferences p = c.getSharedPreferences(NowWidget.PREFS, 0);
        long now = System.currentTimeMillis(), last = p.getLong("nudgeChecked", now - EVERY);
        p.edit().putLong("nudgeChecked", now).apply();
        JSONObject jp = NowWidget.snapshot(c).optJSONObject("jp");
        if (jp == null || !jp.optBoolean("nudge") || jp.optInt("due") <= 0) return;
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(now));
        if (today.equals(p.getString("nudgeDay", ""))) return; // one app-open nudge a day
        JSONArray quiet = jp.optJSONArray("quiet");
        if (quiet != null) for (int i = 0; i < quiet.length(); i++) {
            JSONArray q = quiet.optJSONArray(i);
            if (q != null && now >= q.optLong(0) && now < q.optLong(1)) return;
        }
        Set<String> watch = new HashSet<>();
        JSONArray apps = jp.optJSONArray("apps");
        if (apps != null) for (int i = 0; i < apps.length(); i++) watch.add(apps.optString(i));
        if (watch.isEmpty()) return;
        UsageStatsManager usm = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
        if (usm == null) return;
        UsageEvents ev = usm.queryEvents(Math.max(last, now - 2 * EVERY), now); // empty without Usage access
        UsageEvents.Event e = new UsageEvents.Event();
        boolean opened = false;
        while (ev.hasNextEvent()) {
            ev.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED && watch.contains(e.getPackageName())) { opened = true; break; }
        }
        if (!opened) return;
        p.edit().putString("nudgeDay", today).apply();
        int due = jp.optInt("due");
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, "system")
            .setSmallIcon(R.drawable.ic_stat_eye)
            .setColor(0xFFE0211F)
            .setContentTitle("[SYSTEM] " + due + " Japanese review" + (due == 1 ? "" : "s") + " due")
            .setContentText("Scrolling? Clear them instead. 5 min is one tap.")
            .setAutoCancel(true)
            .setContentIntent(MainActivity.route(c, "jpgo/5", 1));
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.notify(4242, b.build());
    }
}
