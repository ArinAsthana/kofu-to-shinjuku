package com.arin.thearin;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * v6.3 self-update. The web layer checks GitHub's latest Release; this downloads the APK and opens
 * Android's installer. Android always asks for one confirmation tap outside the Play Store.
 */
@CapacitorPlugin(name = "Updater")
public class UpdaterPlugin extends Plugin {

    /** The installed build number (CI sets versionCode to the run number, the same N as the apk-N tag). */
    @PluginMethod
    public void version(PluginCall call) {
        try {
            PackageInfo p = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? p.getLongVersionCode() : p.versionCode;
            JSObject r = new JSObject();
            r.put("code", code);
            r.put("name", p.versionName);
            call.resolve(r);
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    /** Downloads the APK at url, then opens the installer. Rejects with NEEDS_PERMISSION after opening the setting. */
    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://github.com/")) {
            call.reject("Bad url");
            return;
        }
        if (!canInstall()) {
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.reject("Allow installs from The Arin first", "NEEDS_PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "update");
                dir.mkdirs();
                File apk = new File(dir, "The-Arin.apk");
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setInstanceFollowRedirects(true);
                c.setConnectTimeout(20000);
                c.setReadTimeout(60000);
                // GitHub redirects release downloads to another https host; follow it by hand if needed.
                int code = c.getResponseCode();
                for (int hop = 0; hop < 5 && code >= 300 && code < 400; hop++) {
                    String next = c.getHeaderField("Location");
                    c.disconnect();
                    c = (HttpURLConnection) new URL(next).openConnection();
                    c.setConnectTimeout(20000);
                    c.setReadTimeout(60000);
                    code = c.getResponseCode();
                }
                if (code != 200) throw new Exception("Download failed: HTTP " + code);
                try (InputStream in = c.getInputStream(); OutputStream out = new FileOutputStream(apk)) {
                    byte[] buf = new byte[65536];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                }
                c.disconnect();
                Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW);
                i.setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Download failed" : e.getMessage());
            }
        }).start();
    }
}
