package com.arin.thearin;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

/** v9.3: the 1×1 "Going to bed" widget. One tap sets the alarm (BedActivity). */
public class BedWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    static PendingIntent bed(Context c) {
        Intent i = new Intent(c, BedActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_NO_HISTORY);
        return PendingIntent.getActivity(c, 200, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static RemoteViews views(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_bed);
        SharedPreferences p = c.getSharedPreferences(NowWidget.PREFS, 0);
        boolean set = p.getLong("lastAlarmAt", 0) > System.currentTimeMillis();
        v.setTextViewText(R.id.w_bed_sub, set ? "ALARM " + p.getString("lastAlarm", "") : "TAP AT BED");
        v.setOnClickPendingIntent(R.id.w_root, bed(c));
        return v;
    }
}
