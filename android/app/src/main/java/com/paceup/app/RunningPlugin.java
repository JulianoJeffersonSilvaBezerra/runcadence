package com.paceup.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.os.Build;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

@CapacitorPlugin(
  name = "RunningPlugin",
  permissions = {
    @Permission(
      alias = "location",
      strings = {
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION
      }
    ),
    @Permission(
      alias = "notifications",
      strings = { Manifest.permission.POST_NOTIFICATIONS }
    )
  }
)
public class RunningPlugin extends Plugin {
  private FusedLocationProviderClient fusedClient;
  private LocationCallback locationCallback;
  private boolean isTracking = false;
  private Location lastLocation;
  private long startTimeMs = 0L;
  private long accumulatedElapsedSec = 0L;
  private double totalDistanceM = 0.0;

  @Override
  public void load() {
    fusedClient = LocationServices.getFusedLocationProviderClient(getContext());
  }

  @PluginMethod
  public void startTracking(PluginCall call) {
    if (isTracking) {
      call.resolve();
      return;
    }

    if (getPermissionState("location") != PermissionState.GRANTED) {
      requestPermissionForAlias("location", call, "locationPermissionCallback");
      return;
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
      && getPermissionState("notifications") != PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
      return;
    }

    boolean resume = call.getBoolean("resume", false);

    if (!resume) {
      totalDistanceM = 0.0;
      accumulatedElapsedSec = 0L;
      lastLocation = null;
    }

    startTimeMs = System.currentTimeMillis();

    LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 1000)
      .setMinUpdateIntervalMillis(700)
      .setMaxUpdateDelayMillis(2000)
      .build();

    locationCallback = new LocationCallback() {
      @Override
      public void onLocationResult(LocationResult result) {
        for (Location location : result.getLocations()) {
          onLocationUpdate(location);
        }
      }
    };

    try {
      fusedClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
      startForegroundService();
      isTracking = true;
      call.resolve();
    } catch (SecurityException ex) {
      call.reject("Falha ao iniciar rastreamento: " + ex.getMessage());
    }
  }

  @PermissionCallback
  private void locationPermissionCallback(PluginCall call) {
    if (getPermissionState("location") == PermissionState.GRANTED) {
      startTracking(call);
      return;
    }
    call.reject("Permissao de localizacao nao concedida.");
  }

  @PermissionCallback
  private void notificationPermissionCallback(PluginCall call) {
    // Notificacao ajuda no background, mas nao bloqueia inicio da sessao.
    startTracking(call);
  }

  @PluginMethod
  public void pauseTracking(PluginCall call) {
    if (!isTracking) {
      call.resolve();
      return;
    }

    try {
      if (locationCallback != null) {
        fusedClient.removeLocationUpdates(locationCallback);
        locationCallback = null;
      }

      if (startTimeMs > 0L) {
        accumulatedElapsedSec += Math.max(0L, (System.currentTimeMillis() - startTimeMs) / 1000L);
      }

      stopForegroundService();
      isTracking = false;
      call.resolve();
    } catch (Exception ex) {
      call.reject("Falha ao pausar rastreamento: " + ex.getMessage());
    }
  }

  @PluginMethod
  public void stopTracking(PluginCall call) {
    boolean preserveSession = call.getBoolean("preserveSession", false);

    try {
      if (locationCallback != null) {
        fusedClient.removeLocationUpdates(locationCallback);
        locationCallback = null;
      }

      if (isTracking && startTimeMs > 0L) {
        accumulatedElapsedSec += Math.max(0L, (System.currentTimeMillis() - startTimeMs) / 1000L);
      }

      stopForegroundService();
      isTracking = false;

      if (!preserveSession) {
        totalDistanceM = 0.0;
        accumulatedElapsedSec = 0L;
        startTimeMs = 0L;
        lastLocation = null;
      }

      call.resolve();
    } catch (Exception ex) {
      call.reject("Falha ao parar rastreamento: " + ex.getMessage());
    }
  }

  private void onLocationUpdate(Location location) {
    if (location == null) return;

    if (lastLocation != null) {
      float delta = lastLocation.distanceTo(location);
      if (delta > 0.8f && delta < 80f) {
        totalDistanceM += delta;
      }
    }

    long liveElapsedSec = startTimeMs > 0L
      ? Math.max(0L, (System.currentTimeMillis() - startTimeMs) / 1000L)
      : 0L;
    long elapsedSec = accumulatedElapsedSec + liveElapsedSec;
    double averagePace = 0.0;
    if (totalDistanceM > 1) {
      double distanceKm = totalDistanceM / 1000.0;
      double elapsedMin = elapsedSec / 60.0;
      averagePace = elapsedMin / distanceKm;
    }

    double speedMs = location.hasSpeed() ? location.getSpeed() : 0.0;

    JSObject payload = new JSObject();
    payload.put("distance", totalDistanceM);
    payload.put("speedMs", speedMs);
    payload.put("accuracy", location.getAccuracy());
    payload.put("elapsedSeconds", elapsedSec);
    payload.put("averagePace", averagePace);
    payload.put("lat", location.getLatitude());
    payload.put("lng", location.getLongitude());

    notifyListeners("gpsUpdate", payload, true);
    updateForegroundService(totalDistanceM, elapsedSec);
    lastLocation = location;
  }

  private void startForegroundService() {
    Context context = getContext();
    Intent intent = new Intent(context, RunningForegroundService.class);
    intent.setAction(RunningForegroundService.ACTION_START_OR_UPDATE);
    intent.putExtra(RunningForegroundService.EXTRA_DISTANCE_M, totalDistanceM);
    intent.putExtra(RunningForegroundService.EXTRA_ELAPSED_SEC, accumulatedElapsedSec);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent);
    } else {
      context.startService(intent);
    }
  }

  private void stopForegroundService() {
    Context context = getContext();
    Intent intent = new Intent(context, RunningForegroundService.class);
    intent.setAction(RunningForegroundService.ACTION_STOP);
    context.stopService(intent);
  }

  private void updateForegroundService(double distanceM, long elapsedSec) {
    Context context = getContext();
    Intent intent = new Intent(context, RunningForegroundService.class);
    intent.setAction(RunningForegroundService.ACTION_START_OR_UPDATE);
    intent.putExtra(RunningForegroundService.EXTRA_DISTANCE_M, distanceM);
    intent.putExtra(RunningForegroundService.EXTRA_ELAPSED_SEC, elapsedSec);

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      context.startForegroundService(intent);
    } else {
      context.startService(intent);
    }
  }

}
