package com.ozerishi.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

public class AlarmReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "ozerishi-alarm-v2";

    @Override public void onReceive(Context context, Intent intent) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        String title = intent.getStringExtra("title");
        if (title == null || title.trim().isEmpty()) title = "תזכורת מ־OZERISHI";
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "תזכורות OZERISHI", NotificationManager.IMPORTANCE_HIGH);
            channel.enableVibration(true);
            channel.setSound(Uri.parse("content://settings/system/alarm_alert"), new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            manager.createNotificationChannel(channel);
        }
        Intent alarmIntent = new Intent(context, AlarmActivity.class).putExtra("title", title).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent fullScreenIntent = PendingIntent.getActivity(context, (int) System.currentTimeMillis(), alarmIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("OZERISHI").setContentText(title).setAutoCancel(true).setPriority(Notification.PRIORITY_MAX).setCategory(Notification.CATEGORY_ALARM).setOngoing(true).setVibrate(new long[]{0, 700, 300, 700}).setFullScreenIntent(fullScreenIntent, true).setContentIntent(fullScreenIntent);
        manager.notify((int) System.currentTimeMillis(), builder.build());
    }
}