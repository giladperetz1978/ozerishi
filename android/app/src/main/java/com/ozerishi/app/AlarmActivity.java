package com.ozerishi.app;

import android.app.Activity;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class AlarmActivity extends Activity {
    private MediaPlayer player;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (android.os.Build.VERSION.SDK_INT >= 27) setShowWhenLocked(true);
        if (android.os.Build.VERSION.SDK_INT >= 27) setTurnScreenOn(true);

        String title = getIntent().getStringExtra("title");
        if (title == null || title.trim().isEmpty()) title = "תזכורת מ־OZERISHI";
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(android.view.Gravity.CENTER);
        layout.setPadding(48, 48, 48, 48);
        TextView heading = new TextView(this);
        heading.setText("זמן התזכורת");
        heading.setTextSize(30);
        heading.setGravity(android.view.Gravity.CENTER);
        TextView reminder = new TextView(this);
        reminder.setText(title);
        reminder.setTextSize(24);
        reminder.setGravity(android.view.Gravity.CENTER);
        reminder.setPadding(0, 32, 0, 48);
        Button stop = new Button(this);
        stop.setText("עצור התראה");
        stop.setOnClickListener(view -> finishAlarm());
        layout.addView(heading);
        layout.addView(reminder);
        layout.addView(stop);
        setContentView(layout);

        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        player = MediaPlayer.create(this, sound);
        if (player != null) {
            player.setLooping(true);
            player.start();
        }
    }

    private void finishAlarm() {
        if (player != null) {
            if (player.isPlaying()) player.stop();
            player.release();
            player = null;
        }
        finishAndRemoveTask();
    }

    @Override protected void onDestroy() {
        if (player != null) {
            if (player.isPlaying()) player.stop();
            player.release();
            player = null;
        }
        super.onDestroy();
    }
}