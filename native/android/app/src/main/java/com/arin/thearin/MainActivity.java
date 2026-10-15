package com.arin.thearin;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    static final String ROUTE = "route";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The app's own native plugins register before the bridge starts.
        registerPlugin(UsagePlugin.class);
        registerPlugin(WidgetPlugin.class);
        registerPlugin(UpdaterPlugin.class);
        super.onCreate(savedInstanceState);
        keepRoute(getIntent());
        NudgeReceiver.arm(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keepRoute(intent);
    }

    // v8.3: a widget button or a nudge opens the app on a screen. The route waits here until the web app asks (Widget.pending).
    private void keepRoute(Intent i) {
        String r = i != null ? i.getStringExtra(ROUTE) : null;
        if (r != null) getSharedPreferences(NowWidget.PREFS, 0).edit().putString("pendingRoute", r).apply();
    }

    static PendingIntent route(Context c, String route, int code) {
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.putExtra(ROUTE, route);
        return PendingIntent.getActivity(c, 100 + code, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
