import { useState, useRef, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';

type Point = { lat: number; lon: number; t: number };

const MAX_ACCURACY_M = 25;
const MAX_SPEED_MS   = 12;  // > 43 km/h = salto absurdo

function haversine(a: Point, b: Point): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function formatPace(p: number): string {
  if (!p || !Number.isFinite(p) || p <= 0 || p > 30) return '--:--';
  let m = Math.floor(p);
  let s = Math.round((p - m) * 60);
  if (s === 60) { m += 1; s = 0; }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function useGPS() {
  const [data, setData] = useState({
    status: 'idle',
    smoothedDistance: 0,
    averagePace: 0,
    speedMs: 0,
    accuracy: 0,
    error: null as string | null,
  });

  // BUG CORRIGIDO: o ponto anterior agora guarda também o timestamp (campo .t)
  // para que dtSec seja calculado como (t_atual - t_anterior), não (t - t).
  const lastRef        = useRef<Point | null>(null);
  const firstTimeRef   = useRef<number | null>(null);
  const distRef        = useRef(0);
  const watchIdRef     = useRef<string | null>(null);

  const start = useCallback(async () => {
    try {
      if (watchIdRef.current) return;

      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        setData((d) => ({ ...d, status: 'idle', error: 'Permissão de localização negada' }));
        return;
      }

      setData((d) => ({ ...d, status: 'starting', error: null }));

      distRef.current      = 0;
      lastRef.current      = null;
      firstTimeRef.current = null;

      const watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
        (pos, err) => {
          if (err) {
            setData((d) => ({ ...d, status: 'idle', error: err.message ?? 'Erro GPS' }));
            return;
          }
          if (!pos?.coords) return;

          const acc = pos.coords.accuracy ?? 999;
          if (acc > MAX_ACCURACY_M) {
            setData((d) => ({ ...d, accuracy: Math.round(acc) }));
            return;
          }

          const now: number = pos.timestamp ?? Date.now();

          const current: Point = {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            t:   now,
          };

          if (!firstTimeRef.current) firstTimeRef.current = now;

          if (lastRef.current) {
            const dist = haversine(lastRef.current, current);

            // BUG ORIGINAL: dtSec = (now - (pos.timestamp ?? Date.now())) / 1000
            // Isso calculava (now - now) = 0 porque 'now' JA era pos.timestamp.
            // Com dtSec = 0, speed = Infinity e o filtro MAX_SPEED_MS nunca barrava nada.
            //
            // CORRECAO: usar lastRef.current.t (timestamp do ponto anterior).
            const dtSec = (current.t - lastRef.current.t) / 1_000;

            if (dtSec > 0) {
              const speed = dist / dtSec;
              if (speed <= MAX_SPEED_MS) {
                distRef.current += dist;
              }
            }
          }

          const totalSec  = (now - firstTimeRef.current!) / 1_000;
          const avgSpeed  = totalSec > 0 ? distRef.current / totalSec : 0;
          const pace      = avgSpeed > 0 ? 1000 / (avgSpeed * 60) : 0;

          const gpsSpeed     = pos.coords.speed ?? 0;
          const effectiveSpd = gpsSpeed > 0 && gpsSpeed <= MAX_SPEED_MS
            ? gpsSpeed
            : avgSpeed;

          setData({
            status:           'active',
            smoothedDistance: Math.round(distRef.current),
            averagePace:      pace,
            speedMs:          +effectiveSpd.toFixed(2),
            accuracy:         Math.round(acc),
            error:            null,
          });

          lastRef.current = current;
        }
      );

      watchIdRef.current = watchId;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setData((d) => ({ ...d, status: 'idle', error: msg }));
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      if (watchIdRef.current) {
        await Geolocation.clearWatch({ id: watchIdRef.current });
        watchIdRef.current = null;
      }
    } catch {
    } finally {
      setData((d) => ({ ...d, status: 'idle' }));
    }
  }, []);

  const resetSession = useCallback(() => {
    distRef.current      = 0;
    lastRef.current      = null;
    firstTimeRef.current = null;
    setData((d) => ({
      ...d,
      smoothedDistance: 0,
      averagePace:      0,
      speedMs:          0,
      accuracy:         0,
      error:            null,
    }));
  }, []);

  return { data, start, stop, resetSession };
}
