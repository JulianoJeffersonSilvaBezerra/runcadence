// src/hooks/useGPS.ts  — SUBSTITUI O ARQUIVO ANTERIOR INTEIRO
// APAGUE também src/hooks/useRunningPlugin.ts — este arquivo já faz tudo.

import { useState, useRef, useCallback } from 'react';
import { registerPlugin } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';

interface RunningPluginInterface {
  startTracking(options?: { resume?: boolean }): Promise<void>;
  pauseTracking(): Promise<void>;
  stopTracking(options?: { preserveSession?: boolean }): Promise<void>;
  addListener(
    event: 'gpsUpdate',
    handler: (data: GPSRawUpdate) => void
  ): Promise<{ remove: () => Promise<void> }>;
}

interface GPSRawUpdate {
  distance:       number;
  speedMs:        number;
  accuracy:       number;
  elapsedSeconds: number;
  averagePace:    number;
  lat:            number;
  lng:            number;
}

export interface RoutePoint {
  lat:       number;
  lng:       number;
  timestamp: number;
}

type GPSStatus = 'idle' | 'starting' | 'active' | 'paused' | 'error';

interface GPSState {
  status: GPSStatus;
  smoothedDistance: number;
  rawDistance: number;
  averagePace: number;
  instantPace: number;
  speedMs: number;
  accuracy: number;
  elapsedSeconds: number;
  lat: number;
  lng: number;
  routePoints: RoutePoint[];
  acceptedPoints: number;
  rejectedPoints: number;
  error: string | null;
}

const SESSION_KEY = 'paceup:gps:active-session';
const MAX_ACCURACY_M = 35;
const MAX_SPEED_MS = 8.5;
const MIN_POINT_DELTA_M = 2;
const MAX_BASE_JUMP_M = 60;
const INSTANT_PACE_ALPHA = 0.28;

const RunningPlugin = registerPlugin<RunningPluginInterface>('RunningPlugin');

export function formatPace(p: number): string {
  if (!p || !Number.isFinite(p) || p <= 0 || p > 30) return '--:--';
  let m = Math.floor(p);
  let s = Math.round((p - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function calculateAveragePace(distanceM: number, elapsedSeconds: number): number {
  if (!Number.isFinite(distanceM) || !Number.isFinite(elapsedSeconds)) return 0;
  if (distanceM <= 0 || elapsedSeconds <= 0) return 0;

  const distanceKm = distanceM / 1000;
  const elapsedMinutes = elapsedSeconds / 60;
  if (distanceKm <= 0) return 0;

  return elapsedMinutes / distanceKm;
}

function defaultGPSState(): GPSState {
  return {
    status: 'idle',
    smoothedDistance: 0,
    rawDistance: 0,
    averagePace: 0,
    instantPace: 0,
    speedMs: 0,
    accuracy: 0,
    elapsedSeconds: 0,
    lat: 0,
    lng: 0,
    routePoints: [],
    acceptedPoints: 0,
    rejectedPoints: 0,
    error: null,
  };
}

function paceFromSpeed(speedMs: number): number {
  if (!Number.isFinite(speedMs) || speedMs <= 0.3) return 0;
  return 1000 / (speedMs * 60);
}

function loadPersistedSession(): GPSState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as GPSState;
    if (!parsed || !Array.isArray(parsed.routePoints)) return null;

    const safeStatus: GPSStatus = (parsed.status === 'paused' || parsed.status === 'active')
      ? 'paused'
      : 'idle';

    return {
      ...defaultGPSState(),
      ...parsed,
      status: safeStatus,
      error: null,
    };
  } catch {
    return null;
  }
}

function persistSession(state: GPSState): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors to avoid interrupting tracking.
  }
}

function clearPersistedSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore removal failures.
  }
}

export function useGPS() {
  const initialState = loadPersistedSession() ?? defaultGPSState();
  const [data, setData] = useState<GPSState>(initialState);

  const listenerRef = useRef<{ remove: () => Promise<void> } | null>(null);
  const routeRef = useRef<RoutePoint[]>(initialState.routePoints);
  const acceptedDistanceRef = useRef<number>(initialState.smoothedDistance);
  const lastAcceptedRef = useRef<RoutePoint | null>(initialState.routePoints[initialState.routePoints.length - 1] ?? null);
  const lastElapsedRef = useRef<number>(initialState.elapsedSeconds);
  const instantPaceEmaRef = useRef<number>(initialState.instantPace);
  const rejectedPointsRef = useRef<number>(initialState.rejectedPoints);
  const webWatchIdRef = useRef<number | null>(null);
  const nativeModeRef = useRef<boolean>(false);
  const lastRawPointRef = useRef<RoutePoint | null>(initialState.routePoints[initialState.routePoints.length - 1] ?? null);
  const rawDistanceRef = useRef<number>(initialState.rawDistance);

  const processIncomingUpdate = useCallback((update: GPSRawUpdate) => {
    if (update.lat !== 0 && update.lng !== 0 && Number.isFinite(update.lat) && Number.isFinite(update.lng)) {
      const point: RoutePoint = { lat: update.lat, lng: update.lng, timestamp: Date.now() };
      const hasGoodAccuracy = update.accuracy > 0 && update.accuracy <= MAX_ACCURACY_M;
      const hasValidSpeed = update.speedMs >= 0 && update.speedMs <= MAX_SPEED_MS;

      if (hasGoodAccuracy && hasValidSpeed) {
        if (!lastAcceptedRef.current) {
          routeRef.current = [point];
          lastAcceptedRef.current = point;
        } else {
          const deltaM = haversineM(
            lastAcceptedRef.current.lat,
            lastAcceptedRef.current.lng,
            point.lat,
            point.lng
          );

          const deltaSec = Math.max(1, update.elapsedSeconds - lastElapsedRef.current);
          const dynamicJumpLimit = Math.max(MAX_BASE_JUMP_M, MAX_SPEED_MS * deltaSec * 1.8);
          const isJump = deltaM > dynamicJumpLimit;
          const segmentSpeedMs = deltaM / deltaSec;
          const invalidSegmentSpeed = segmentSpeedMs > MAX_SPEED_MS * 1.2;

          if (!isJump && !invalidSegmentSpeed && deltaM >= MIN_POINT_DELTA_M) {
            routeRef.current = [...routeRef.current, point];
            acceptedDistanceRef.current += deltaM;
            lastAcceptedRef.current = point;
          } else if (isJump || invalidSegmentSpeed) {
            rejectedPointsRef.current += 1;
          }
        }
      } else {
        rejectedPointsRef.current += 1;
      }

      lastRawPointRef.current = point;
    }

    const rawDistance = Number.isFinite(update.distance) && update.distance > 0
      ? Math.round(update.distance)
      : 0;

    const filteredDistance = Math.round(acceptedDistanceRef.current);
    const computedPace = calculateAveragePace(filteredDistance, update.elapsedSeconds);
    const safeAveragePace = computedPace > 0 ? computedPace : update.averagePace;

    const instantPaceRaw = paceFromSpeed(update.speedMs);
    if (instantPaceRaw > 0) {
      const prev = instantPaceEmaRef.current;
      instantPaceEmaRef.current = prev > 0
        ? prev * (1 - INSTANT_PACE_ALPHA) + instantPaceRaw * INSTANT_PACE_ALPHA
        : instantPaceRaw;
    }

    const currentLat = lastAcceptedRef.current?.lat ?? 0;
    const currentLng = lastAcceptedRef.current?.lng ?? 0;

    lastElapsedRef.current = update.elapsedSeconds;
    rawDistanceRef.current = rawDistance;

    const nextState: GPSState = {
      status: 'active',
      smoothedDistance: filteredDistance,
      rawDistance,
      averagePace: safeAveragePace,
      instantPace: instantPaceEmaRef.current,
      speedMs: +update.speedMs.toFixed(2),
      accuracy: Math.round(update.accuracy),
      elapsedSeconds: update.elapsedSeconds,
      lat: currentLat,
      lng: currentLng,
      routePoints: routeRef.current,
      acceptedPoints: routeRef.current.length,
      rejectedPoints: rejectedPointsRef.current,
      error: null,
    };

    persistSession(nextState);
    setData({
      ...nextState,
    });
  }, []);

  const detachListener = useCallback(async () => {
    if (!listenerRef.current) return;
    await listenerRef.current.remove();
    listenerRef.current = null;
  }, []);

  const stopWebTracking = useCallback(() => {
    if (webWatchIdRef.current === null || typeof navigator === 'undefined' || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.clearWatch(webWatchIdRef.current);
    webWatchIdRef.current = null;
  }, []);

  const startWebTracking = useCallback((resume: boolean) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      throw new Error('Geolocalizacao nao suportada neste navegador.');
    }

    nativeModeRef.current = false;
    stopWebTracking();

    const baselineElapsed = resume ? lastElapsedRef.current : 0;
    const startMs = Date.now();

    if (!resume) {
      rawDistanceRef.current = 0;
      lastRawPointRef.current = null;
    }

    webWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const coords = position.coords;
        const nowElapsed = baselineElapsed + Math.max(0, Math.floor((Date.now() - startMs) / 1000));
        const lat = coords.latitude;
        const lng = coords.longitude;
        const accuracy = Number.isFinite(coords.accuracy) ? coords.accuracy : 999;

        if (lastRawPointRef.current) {
          rawDistanceRef.current += haversineM(lastRawPointRef.current.lat, lastRawPointRef.current.lng, lat, lng);
        }

        const speedFromCoords = Number.isFinite(coords.speed ?? NaN) && (coords.speed ?? 0) >= 0
          ? (coords.speed as number)
          : 0;
        const speedFallback = lastRawPointRef.current && nowElapsed > lastElapsedRef.current
          ? haversineM(lastRawPointRef.current.lat, lastRawPointRef.current.lng, lat, lng) / Math.max(1, nowElapsed - lastElapsedRef.current)
          : 0;
        const speedMs = speedFromCoords > 0 ? speedFromCoords : speedFallback;

        const update: GPSRawUpdate = {
          distance: rawDistanceRef.current,
          speedMs,
          accuracy,
          elapsedSeconds: nowElapsed,
          averagePace: calculateAveragePace(rawDistanceRef.current, nowElapsed),
          lat,
          lng,
        };

        processIncomingUpdate(update);
      },
      (err) => {
        setData((d) => ({ ...d, status: 'error', error: err.message || 'Falha no GPS do navegador.' }));
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 1000,
      }
    );

    if (webWatchIdRef.current === null) {
      throw new Error('Nao foi possivel iniciar rastreamento de GPS no navegador.');
    }
  }, [processIncomingUpdate, stopWebTracking]);

  const attachListener = useCallback(async () => {
    await detachListener();

    listenerRef.current = await RunningPlugin.addListener('gpsUpdate', (update) => {
      processIncomingUpdate(update);
    });
  }, [detachListener, processIncomingUpdate]);

  const ensureLocationPermission = useCallback(async () => {
    try {
      const current = await Geolocation.checkPermissions();
      if (current.location !== 'granted') {
        await Geolocation.requestPermissions();
      }
    } catch {
      // Web fallback may still prompt via browser geolocation API.
    }
  }, []);

  const start = useCallback(async () => {
    try {
      setData((d) => ({ ...d, status: 'starting', error: null }));
      await ensureLocationPermission();
      routeRef.current = [];
      acceptedDistanceRef.current = 0;
      lastAcceptedRef.current = null;
      lastElapsedRef.current = 0;
      instantPaceEmaRef.current = 0;
      rejectedPointsRef.current = 0;
      rawDistanceRef.current = 0;
      lastRawPointRef.current = null;

      try {
        nativeModeRef.current = true;
        await attachListener();
        await RunningPlugin.startTracking({ resume: false });
      } catch {
        await detachListener();
        startWebTracking(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setData((d) => ({ ...d, status: 'error', error: msg }));
    }
  }, [attachListener, detachListener, ensureLocationPermission, startWebTracking]);

  const pause = useCallback(async () => {
    try {
      if (nativeModeRef.current) {
        await RunningPlugin.pauseTracking();
        await detachListener();
      } else {
        stopWebTracking();
      }

      setData((d) => {
        const pausedState: GPSState = {
          ...d,
          status: 'paused',
          speedMs: 0,
        };
        persistSession(pausedState);
        return pausedState;
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setData((d) => ({ ...d, status: 'error', error: msg }));
    }
  }, [detachListener, stopWebTracking]);

  const resume = useCallback(async () => {
    try {
      setData((d) => ({ ...d, status: 'starting', error: null }));
      await ensureLocationPermission();

      if (nativeModeRef.current) {
        await attachListener();
        await RunningPlugin.startTracking({ resume: true });
      } else {
        startWebTracking(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setData((d) => ({ ...d, status: 'error', error: msg }));
    }
  }, [attachListener, ensureLocationPermission, startWebTracking]);

  const stop = useCallback(async () => {
    try {
      if (nativeModeRef.current) {
        await RunningPlugin.stopTracking({ preserveSession: false });
        await detachListener();
      } else {
        stopWebTracking();
      }

      clearPersistedSession();
    } catch { /* silencioso */ } finally {
      setData((d) => ({ ...d, status: 'idle' }));
    }
  }, [detachListener, stopWebTracking]);

  const resetSession = useCallback(() => {
    stopWebTracking();
    routeRef.current = [];
    acceptedDistanceRef.current = 0;
    lastAcceptedRef.current = null;
    lastElapsedRef.current = 0;
    instantPaceEmaRef.current = 0;
    rejectedPointsRef.current = 0;
    rawDistanceRef.current = 0;
    lastRawPointRef.current = null;
    clearPersistedSession();
    setData((d) => ({
      ...d,
      smoothedDistance: 0, rawDistance: 0, averagePace: 0, instantPace: 0, speedMs: 0,
      accuracy: 0, elapsedSeconds: 0, lat: 0, lng: 0,
      routePoints: [], acceptedPoints: 0, rejectedPoints: 0, error: null,
    }));
  }, [stopWebTracking]);

  return { data, start, pause, resume, stop, resetSession };
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180, dl = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
