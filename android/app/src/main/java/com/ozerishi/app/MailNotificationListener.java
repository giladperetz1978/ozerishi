package com.ozerishi.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONObject;

public class MailNotificationListener extends NotificationListenerService {
    static final String PREFS = "ozerishi-mail-notifications";
    static final String KEY_ITEMS = "items";
    private static final int MAX_ITEMS = 60;
    private static MailNotificationListener instance;

    // Outlook ships under several package ids depending on install channel.
    private static boolean isMailPackage(String packageName) {
        if (packageName == null) return false;
        return packageName.startsWith("com.microsoft.office.outlook")
            || packageName.equals("com.microsoft.outlooklite")
            || packageName.equals("com.microsoft.office.owa");
    }

    @Override public void onNotificationPosted(StatusBarNotification sbn) {
        captureNotification(sbn);
    }

    @Override public void onListenerConnected() {
        instance = this;
        refreshActiveNotifications();
    }

    @Override public void onListenerDisconnected() {
        instance = null;
        super.onListenerDisconnected();
    }

    static void refreshActiveNotifications() {
        if (instance == null) return;
        try {
            StatusBarNotification[] active = instance.getActiveNotifications();
            if (active == null) return;
            for (StatusBarNotification notification : active) instance.captureNotification(notification);
        } catch (Exception ignored) {
            // Notification access can be revoked while the service is refreshing.
        }
    }

    private void captureNotification(StatusBarNotification sbn) {
        if (sbn == null || !isMailPackage(sbn.getPackageName())) return;

        Bundle extras = sbn.getNotification() == null ? null : sbn.getNotification().extras;
        if (extras == null) return;

        String sender = text(extras.getCharSequence("android.title"));
        String subject = text(extras.getCharSequence("android.text"));
        String preview = text(extras.getCharSequence("android.bigText"));
        if (preview.isEmpty()) preview = join(extras.getCharSequenceArrayList("android.textLines"));
        if (sender.isEmpty() && subject.isEmpty()) return;

        try {
            SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray items = new JSONArray(prefs.getString(KEY_ITEMS, "[]"));

            JSONObject item = new JSONObject();
            item.put("sender", sender);
            item.put("subject", subject);
            item.put("preview", preview.isEmpty() ? subject : preview);
            item.put("receivedAt", sbn.getPostTime());

            JSONArray merged = new JSONArray();
            merged.put(item);
            for (int index = 0; index < items.length() && merged.length() < MAX_ITEMS; index += 1) {
                JSONObject existing = items.optJSONObject(index);
                if (existing == null) continue;
                boolean duplicate = sender.equals(existing.optString("sender")) && subject.equals(existing.optString("subject"));
                if (!duplicate) merged.put(existing);
            }

            prefs.edit().putString(KEY_ITEMS, merged.toString()).apply();
        } catch (Exception ignored) {
            // A single unreadable notification must never crash the listener.
        }
    }

    private static String join(java.util.ArrayList<CharSequence> values) {
        if (values == null || values.isEmpty()) return "";
        StringBuilder result = new StringBuilder();
        for (CharSequence value : values) {
            String line = text(value);
            if (line.isEmpty()) continue;
            if (result.length() > 0) result.append(" ");
            result.append(line);
        }
        return result.toString();
    }

    private static String text(CharSequence value) {
        return value == null ? "" : value.toString().trim();
    }
}
