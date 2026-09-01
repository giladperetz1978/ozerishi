package com.ozerishi.app;

import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.util.ArrayList;
import java.util.Locale;

public class MainActivity extends Activity {
    private static final int RECORD_AUDIO_REQUEST = 41;
    private static final int APP_PERMISSIONS_REQUEST = 42;
    private WebView webView;
    private SpeechRecognizer speechRecognizer;
    private String partialSpeech = "";

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        webView.setWebViewClient(new WebViewClient());
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        webView.addJavascriptInterface(new SpeechBridge(), "AndroidSpeech");
        webView.loadUrl("file:///android_asset/index.html");
        setContentView(webView);
        requestAppPermissions();
    }

    private void requestAppPermissions() {
        java.util.ArrayList<String> permissions = new java.util.ArrayList<>();
        if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS);
        if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
        else if (Build.VERSION.SDK_INT >= 23) permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        if (Build.VERSION.SDK_INT >= 23) permissions.add(Manifest.permission.RECORD_AUDIO);
        if (!permissions.isEmpty()) requestPermissions(permissions.toArray(new String[0]), APP_PERMISSIONS_REQUEST);
        else openExactAlarmSettings();
    }

    private void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT >= 31 && !getSystemService(android.app.AlarmManager.class).canScheduleExactAlarms()) {
            startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getPackageName())));
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == APP_PERMISSIONS_REQUEST) openExactAlarmSettings();
        if (requestCode == RECORD_AUDIO_REQUEST && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) startNativeSpeech();
    }

    private class SpeechBridge {
        @JavascriptInterface public boolean hasMailAccess() {
            String enabled = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
            return enabled != null && enabled.contains(getPackageName());
        }

        @JavascriptInterface public void requestMailAccess() {
            runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)));
        }

        @JavascriptInterface public String getMailNotifications() {
            MailNotificationListener.refreshActiveNotifications();
            return getSharedPreferences(MailNotificationListener.PREFS, MODE_PRIVATE).getString(MailNotificationListener.KEY_ITEMS, "[]");
        }

        @JavascriptInterface public void start() {
            runOnUiThread(() -> {
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    sendSpeechError("יש לאשר ל־OZERISHI שימוש במיקרופון");
                    requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO_REQUEST);
                    return;
                }
                startNativeSpeech();
            });
        }

        @JavascriptInterface public void stop() {
            runOnUiThread(() -> {
                if (speechRecognizer != null) speechRecognizer.stopListening();
            });
        }

        @JavascriptInterface public void scheduleReminder(String title, long triggerAtMillis) {
            android.app.AlarmManager alarmManager = getSystemService(android.app.AlarmManager.class);
            if (alarmManager == null || triggerAtMillis <= System.currentTimeMillis()) return;
            Intent intent = new Intent(MainActivity.this, AlarmReceiver.class);
            intent.putExtra("title", title);
            int requestCode = (int) (triggerAtMillis ^ title.hashCode());
            android.app.PendingIntent pendingIntent = android.app.PendingIntent.getBroadcast(MainActivity.this, requestCode, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);
            if (Build.VERSION.SDK_INT >= 31) {
                if (!alarmManager.canScheduleExactAlarms()) return;
                alarmManager.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            } else if (Build.VERSION.SDK_INT >= 23) {
                alarmManager.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            } else {
                alarmManager.setExact(android.app.AlarmManager.RTC_WAKEUP, triggerAtMillis, pendingIntent);
            }
        }

        @JavascriptInterface public void openWaze(String destination) {
            String query = destination == null ? "" : destination.trim();
            if (query.isEmpty()) return;
            runOnUiThread(() -> {
                try {
                    Intent wazeIntent = new Intent(Intent.ACTION_VIEW, Uri.parse("waze://?q=" + Uri.encode(query) + "&navigate=yes"));
                    startActivity(wazeIntent);
                } catch (Exception ignored) {
                    startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://waze.com/ul?q=" + Uri.encode(query) + "&navigate=yes")));
                }
            });
        }
    }

    private void startNativeSpeech() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            sendSpeechError("מנוע זיהוי קולי אינו זמין במכשיר");
            return;
        }
        if (speechRecognizer != null) speechRecognizer.destroy();
        partialSpeech = "";
        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { sendSpeechState("listening"); }
            @Override public void onBeginningOfSpeech() { sendSpeechState("listening"); }
            @Override public void onEndOfSpeech() { sendSpeechState("ended"); }
            @Override public void onError(int error) {
                sendSpeechState("ended");
                if (error == SpeechRecognizer.ERROR_NO_MATCH && !partialSpeech.isEmpty()) {
                    String result = partialSpeech;
                    partialSpeech = "";
                    sendSpeechResult(result);
                    return;
                }
                sendSpeechError(speechErrorMessage(error));
            }
            @Override public void onResults(Bundle results) {
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                sendSpeechState("ended");
                if (matches != null && !matches.isEmpty()) sendSpeechResult(matches.get(0));
            }
            @Override public void onPartialResults(Bundle partialResults) {
                ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (matches != null && !matches.isEmpty()) partialSpeech = matches.get(0);
            }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEvent(int eventType, Bundle params) { }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "he-IL");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "he-IL");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        speechRecognizer.startListening(intent);
    }

    private void sendSpeechState(String state) { webView.post(() -> webView.evaluateJavascript("window.receiveNativeSpeechState(" + quote(state) + ")", null)); }
    private void sendSpeechResult(String text) { webView.post(() -> webView.evaluateJavascript("window.receiveNativeSpeech(" + quote(text) + ")", null)); }
    private void sendSpeechError(String text) { webView.post(() -> webView.evaluateJavascript("window.receiveNativeSpeechError(" + quote(text) + ")", null)); }
    private String speechErrorMessage(int error) {
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return "יש לאשר ל־OZERISHI שימוש במיקרופון";
        if (error == SpeechRecognizer.ERROR_NETWORK || error == SpeechRecognizer.ERROR_NETWORK_TIMEOUT) return "שירות זיהוי הדיבור לא זמין. בדוק חיבור לאינטרנט";
        if (error == SpeechRecognizer.ERROR_AUDIO) return "לא ניתן להפעיל את המיקרופון. בדוק שאפליקציה אחרת אינה משתמשת בו";
        if (error == SpeechRecognizer.ERROR_CLIENT || error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) return "שירות זיהוי הדיבור תפוס. נסה שוב";
        if (error == SpeechRecognizer.ERROR_NO_MATCH) return "לא זוהו מילים. דבר קרוב יותר למכשיר ונסה שוב";
        return "לא הצלחתי לשמוע. בדוק הרשאת מיקרופון ושירות זיהוי קולי";
    }
    private String quote(String value) { return org.json.JSONObject.quote(value); }

    @Override protected void onDestroy() {
        if (speechRecognizer != null) speechRecognizer.destroy();
        super.onDestroy();
    }
}
