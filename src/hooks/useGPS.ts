import { useState, useRef, useCallback } from 'react';
import { Geolocation } from '@capacitor/geolocation';

type Point = { lat: number; lon: number };

// BUG ORIGINAL: não existia filtro de accuracy nem de velocidade absurda.
// Qualquer ponto GPS era aceito, acumulando ruído como distância real.
const MAX_ACCURACY_M = 25;   // descarta ponto com precisão ruim
const MAX_SPEED_MS = 12;     // descarta saltos impossíveis (> 43 km/h)

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
  if (!p || !Number.isFinite(p) || p > 30) return '--:--';
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

  const lastRef = useRef<Point | null>(null);
  const firstTimeRef = useRef<number | null>(null); // para pace médio correto
  const distRef = useRef(0);
  const watchIdRef = useRef<string | null>(null);

  const start = useCallback(async () => {
    try {
      if (watchIdRef.current) return;

      const perm = await Geolocation.requestPermissions();
      if (perm.location !== 'granted' && perm.coarseLocation !== 'granted') {
        setData((d) => ({ ...d, status: 'idle', error: 'Permissão de localização negada' }));
        return;
      }

      setData((d) => ({ ...d, status: 'starting', error: null }));

      distRef.current = 0;
      lastRef.current = null;
      firstTimeRef.current = null;

      const watchId = await Geolocation.watchPosition(
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        (pos, err) => {
          if (err) {
            setData((d) => ({ ...d, status: 'idle', error: err.message ?? 'Erro GPS' }));
            return;
          }
          if (!pos?.coords) return;

          const acc = pos.coords.accuracy ?? 999;

          // BUG ORIGINAL: ponto era aceito mesmo com accuracy ruim (ex: 80m em prédios).
          // CORREÇÃO: descartar se accuracy > 25m.
          if (acc > MAX_ACCURACY_M) {
            setData((d) => ({ ...d, accuracy: Math.round(acc) }));
            return;
          }

          const coords: Point = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          const now = pos.timestamp ?? Date.now();

          if (!firstTimeRef.current) firstTimeRef.current = now;

          if (lastRef.current) {
            const dist = haversine(lastRef.current, coords);
            const dtSec = (now - (pos.timestamp ?? Date.now())) / 1000;

            // BUG ORIGINAL: filtro `d < 100` não detectava velocidades absurdas.
            // CORREÇÃO: calcular velocidade e descartar se > 12 m/s.
            const speed = dtSec > 0 ? dist / Math.max(dtSec, 1) : 0;
            if (speed <= MAX_SPEED_MS) {
              distRef.current += dist;
            }
          }

          // Pace médio = distância total / tempo total (estável)
          const totalSec = firstTimeRef.current
            ? (now - firstTimeRef.current) / 1000
            : 0;
          const avgSpeed = totalSec > 0 ? distRef.current / totalSec : 0;
          const pace = avgSpeed > 0 ? 1000 / (avgSpeed * 60) : 0;

          const gpsSpeed = pos.coords.speed ?? 0;
          const effectiveSpeed =
            gpsSpeed > 0 && gpsSpeed <= MAX_SPEED_MS ? gpsSpeed : avgSpeed;

          setData({
            status: 'active',
            smoothedDistance: Math.round(distRef.current),
            averagePace: pace,
            speedMs: +effectiveSpeed.toFixed(2),
            accuracy: Math.round(acc),
            error: null,
          });

          lastRef.current = coords;
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
    distRef.current = 0;
    lastRef.current = null;
    firstTimeRef.current = null;
    setData((d) => ({
      ...d,
      smoothedDistance: 0,
      averagePace: 0,
      speedMs: 0,
      accuracy: 0,
      error: null,
    }));
  }, []);

  return { data, start, stop, resetSession };
}
