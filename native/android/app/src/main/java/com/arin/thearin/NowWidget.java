package com.arin.thearin;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** The 4×2 System widget: the current or next block, today's 3 quests, level and the phone line. */
public class NowWidget extends AppWidgetProvider {

    static final String PREFS = "thearin_widget";

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c, false));
    }

    static JSONObject snapshot(Context c) {
        try {
            return new JSONObject(c.getSharedPreferences(PREFS, 0).getString("snapshot", "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static RemoteViews views(Context c, boolean small) {
        JSONObject s = snapshot(c);
        RemoteViews v = new RemoteViews(c.getPackageName(), small ? R.layout.widget_small : R.layout.widget_now);
        JSONObject now = s.optJSONObject("now");
        v.setTextViewText(R.id.w_label, now != null ? now.optString("label", "SYSTEM") : "SYSTEM");
        v.setTextViewText(R.id.w_title, now != null ? now.optString("title", "Open The Arin") : "Open The Arin");
        v.setTextViewText(R.id.w_time, now != null ? now.optString("time", "") : "");
        if (!small) {
            JSONArray q = s.optJSONArray("quests");
            int[] rows = { R.id.w_q1, R.id.w_q2, R.id.w_q3 };
            // v8.3: two quests, so the Japanese row fits in 4×2.
            for (int i = 0; i < rows.length; i++) {
                JSONObject x = q != null && i < 2 ? q.optJSONObject(i) : null;
                if (x == null) {
                    v.setViewVisibility(rows[i], View.GONE);
                    continue;
                }
                v.setViewVisibility(rows[i], View.VISIBLE);
                v.setTextViewText(rows[i], (x.optBoolean("done") ? "✓  " : "■  ") + x.optString("t"));
            }
            v.setTextViewText(R.id.w_level, s.optString("level", ""));
            JSONObject jp = s.optJSONObject("jp");
            v.setTextViewText(R.id.w_jp, jp != null && jp.optInt("due") > 0 ? "日本語 " + jp.optInt("due") : "日本語");
            int[] btn = { R.id.w_jp5, R.id.w_jp15, R.id.w_jp30 };
            int[] min = { 5, 15, 30 };
            for (int i = 0; i < btn.length; i++) v.setOnClickPendingIntent(btn[i], MainActivity.route(c, "jpgo/" + min[i], min[i]));
            v.setTextViewText(R.id.w_usage, s.optString("usage", ""));
            v.setOnClickPendingIntent(R.id.w_bed, BedWidget.bed(c)); // v9.3
        }
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        if (open != null) {
            PendingIntent pi = PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            v.setOnClickPendingIntent(R.id.w_root, pi);
        }
        return v;
    }

    static void refreshAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, NowWidget.class))) m.updateAppWidget(id, views(c, false));
        for (int id : m.getAppWidgetIds(new ComponentName(c, NowSmallWidget.class))) m.updateAppWidget(id, views(c, true));
        for (int id : m.getAppWidgetIds(new ComponentName(c, BedWidget.class))) m.updateAppWidget(id, BedWidget.views(c));
    }
}
