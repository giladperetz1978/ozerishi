package com.ozerishi.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "ozerishi-reminders";

    @Override public void onReceive(Context context, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL_ID, "תזכורות OZERISHI", NotificationManager.IMPORTANCE_HIGH));
        String title = intent.getStringExtra("title");
        if (title == null || title.trim().isEmpty()) title = "תזכורת מ־OZERISHI";
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("OZERISHI").setContentText(title).setAutoCancel(true).setPriority(Notification.PRIORITY_HIGH).setVibrate(new long[]{0, 400, 200, 400});
        manager.notify((int) System.currentTimeMillis(), builder.build());
    }
}