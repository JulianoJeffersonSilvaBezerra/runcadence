package com.paceup.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

public class RunningForegroundService extends Service {
  public static final String CHANNEL_ID = "paceup_tracking";
  public static final int NOTIFICATION_ID = 2201;
  public static final String ACTION_START_OR_UPDATE = "com.paceup.app.ACTION_START_OR_UPDATE";
  public static final String ACTION_STOP = "com.paceup.app.ACTION_STOP";
  public static final String EXTRA_DISTANCE_M = "distanceM";
  public static final String EXTRA_ELAPSED_SEC = "elapsedSec";

  @Override
  public void onCreate() {
    super.onCreate();
    createChannel();
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    final String action = intent != null ? intent.getAction() : ACTION_START_OR_UPDATE;

    if (ACTION_STOP.equals(action)) {
      stopSelf();
      return START_NOT_STICKY;
    }

    final double distanceM = intent != null ? intent.getDoubleExtra(EXTRA_DISTANCE_M, 0.0) : 0.0;
    final long elapsedSec = intent != null ? intent.getLongExtra(EXTRA_ELAPSED_SEC, 0L) : 0L;
    final Notification notification = buildNotification(distanceM, elapsedSec);

    startForeground(NOTIFICATION_ID, notification);

    updateNotification(notification);
    return START_STICKY;
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  @Override
  public void onDestroy() {
    stopForeground(STOP_FOREGROUND_REMOVE);
    super.onDestroy();
  }

  private Notification buildNotification(double distanceM, long elapsedSec) {
    final String distanceKm = String.format(java.util.Locale.US, "%.2f", (distanceM / 1000.0));
    final long min = elapsedSec / 60;
    final long sec = elapsedSec % 60;
    final String elapsed = String.format(java.util.Locale.US, "%d:%02d", min, sec);

    return new NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentTitle("PaceUp")
      .setContentText("Corrida em andamento")
      .setStyle(new NotificationCompat.BigTextStyle().bigText("Distancia: " + distanceKm + " km | Tempo: " + elapsed))
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .build();
  }

  private void updateNotification(Notification notification) {
    final NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      manager.notify(NOTIFICATION_ID, notification);
    }
  }

  private void createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

    NotificationChannel channel = new NotificationChannel(
      CHANNEL_ID,
      "PaceUp Tracking",
      NotificationManager.IMPORTANCE_LOW
    );

    NotificationManager manager = getSystemService(NotificationManager.class);
    if (manager != null) {
      manager.createNotificationChannel(channel);
    }
  }
}
