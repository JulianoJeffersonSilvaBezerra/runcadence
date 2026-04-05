import { useMemo, useState } from 'react';
import type { RoutePoint } from './useGPS';

const HISTORY_KEY = 'paceup:workouts:v1';

export interface WorkoutSession {
  id: string;
  startedAt: string;
  endedAt: string;
  distanceM: number;
  elapsedSeconds: number;
  averagePace: number;
  routePoints: RoutePoint[];
  musicFileName: string;
  musicMode: 'follow_music' | 'target_pace';
}

function loadHistory(): WorkoutSession[] {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as WorkoutSession[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item) => Array.isArray(item.routePoints));
  } catch {
    return [];
  }
}

function saveHistory(history: WorkoutSession[]): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // Ignore storage errors to avoid blocking workout flow.
  }
}

function normalizeSessions(input: WorkoutSession[]): WorkoutSession[] {
  return input
    .filter((item) => item && Array.isArray(item.routePoints))
    .map((item) => ({
      id: item.id || `${Date.now()}-${Math.round(Math.random() * 10000)}`,
      startedAt: item.startedAt || new Date().toISOString(),
      endedAt: item.endedAt || new Date().toISOString(),
      distanceM: Number.isFinite(item.distanceM) ? item.distanceM : 0,
      elapsedSeconds: Number.isFinite(item.elapsedSeconds) ? item.elapsedSeconds : 0,
      averagePace: Number.isFinite(item.averagePace) ? item.averagePace : 0,
      routePoints: item.routePoints,
      musicFileName: item.musicFileName || '',
      musicMode: item.musicMode === 'target_pace' ? 'target_pace' : 'follow_music',
    }));
}

export function useWorkoutHistory() {
  const [sessions, setSessions] = useState<WorkoutSession[]>(() => loadHistory());

  const latestSession = useMemo(() => sessions[0] ?? null, [sessions]);

  function appendSession(session: Omit<WorkoutSession, 'id' | 'endedAt'>): void {
    const next: WorkoutSession = {
      ...session,
      id: `${Date.now()}-${Math.round(Math.random() * 10000)}`,
      endedAt: new Date().toISOString(),
    };

    setSessions((prev) => {
      const updated = [next, ...prev].slice(0, 30);
      saveHistory(updated);
      return updated;
    });
  }

  function removeSession(id: string): void {
    setSessions((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveHistory(updated);
      return updated;
    });
  }

  function clearAll(): void {
    setSessions(() => {
      saveHistory([]);
      return [];
    });
  }

  function importSessions(incoming: WorkoutSession[]): number {
    const normalized = normalizeSessions(incoming);
    if (normalized.length === 0) return 0;

    setSessions((prev) => {
      const merged = [...normalized, ...prev]
        .sort((a, b) => +new Date(b.endedAt) - +new Date(a.endedAt));

      const dedup = merged.filter((item, index, arr) =>
        arr.findIndex((x) => x.id === item.id) === index
      ).slice(0, 50);

      saveHistory(dedup);
      return dedup;
    });

    return normalized.length;
  }

  return {
    sessions,
    latestSession,
    appendSession,
    removeSession,
    clearAll,
    importSessions,
  };
}
