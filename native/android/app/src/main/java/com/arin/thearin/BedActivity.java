package com.arin.thearin;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.provider.AlarmClock;
import android.widget.Toast;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * v9.3 "Going to bed": a no-UI activity behind the Bed widget and the Now widget's BED button. It sets a real Clock
 * alarm (08:00 when the alarm day is a class day, otherwise now + 7 h 30 rounded up to 5 min), shows a toast, and logs
 * the bedtime for the web app to pick up (Widget.bed). The class days come from the widget snapshot ("bed").
 */
public class BedActivity extends Activity {

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        JSONObject cfg = NowWidget.snapshot(this).optJSONObject("bed");
        JSONArray days = cfg != null ? cfg.optJSONArray("classDays") : null;
        int sleepMin = cfg != null ? cfg.optInt("sleepMin", 450) : 450, classAt = cfg != null ? cfg.optInt("classAt", 480) : 480;

        Calendar now = Calendar.getInstance(), ring = (Calendar) now.clone();
        int nowMin = now.get(Calendar.HOUR_OF_DAY) * 60 + now.get(Calendar.MINUTE);
        // The day the alarm rings: today if it's still before the class alarm time, else tomorrow.
        Calendar day = (Calendar) now.clone();
        if (nowMin >= classAt) day.add(Calendar.DAY_OF_MONTH, 1);
        int dow = day.get(Calendar.DAY_OF_WEEK) - 1; // 0 = Sunday, as in the web app
        boolean cls = false;
        if (days == null) cls = dow == 1 || dow == 3;
        else for (int i = 0; i < days.length(); i++) if (days.optInt(i, -1) == dow) cls = true;

        if (cls) {
            ring = day;
            ring.set(Calendar.HOUR_OF_DAY, classAt / 60);
            ring.set(Calendar.MINUTE, classAt % 60);
        } else {
            ring.add(Calendar.MINUTE, sleepMin);
            int m = ring.get(Calendar.MINUTE);
            ring.add(Calendar.MINUTE, (5 - m % 5) % 5);
        }
        ring.set(Calendar.SECOND, 0);
        ring.set(Calendar.MILLISECOND, 0);
        int h = ring.get(Calendar.HOUR_OF_DAY), mi = ring.get(Calendar.MINUTE);
        long sleep = (ring.getTimeInMillis() - now.getTimeInMillis()) / 60000;

        Intent a = new Intent(AlarmClock.ACTION_SET_ALARM)
            .putExtra(AlarmClock.EXTRA_HOUR, h)
            .putExtra(AlarmClock.EXTRA_MINUTES, mi)
            .putExtra(AlarmClock.EXTRA_MESSAGE, "The Arin")
            .putExtra(AlarmClock.EXTRA_VIBRATE, true)
            .putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        String hm = String.format(Locale.US, "%02d:%02d", h, mi), msg;
        try {
            startActivity(a);
            String len = (sleep / 60) + " h " + String.format(Locale.US, "%02d", sleep % 60);
            msg = "Alarm " + hm + " · " + (cls ? (sleep < 360 ? "only " + len + " sleep" : "class day") : len);
            log(now.getTimeInMillis(), ring.getTimeInMillis(), cls, hm);
        } catch (Exception e) {
            msg = "No Clock app found to set the alarm";
        }
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
        NowWidget.refreshAll(this);
        finish();
    }

    private void log(long bed, long alarm, boolean cls, String hm) {
        SharedPreferences p = getSharedPreferences(NowWidget.PREFS, 0);
        JSONArray L;
        try {
            L = new JSONArray(p.getString("bedLog", "[]"));
        } catch (JSONException e) {
            L = new JSONArray();
        }
        try {
            L.put(new JSONObject().put("bed", bed).put("alarm", alarm).put("cls", cls));
        } catch (JSONException e) {
            return;
        }
        while (L.length() > 10) L.remove(0);
        p.edit().putString("bedLog", L.toString()).putString("lastAlarm", hm).putLong("lastAlarmAt", alarm).apply();
    }
}
