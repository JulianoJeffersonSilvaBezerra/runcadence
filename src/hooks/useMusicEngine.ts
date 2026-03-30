import { useState, useRef, useCallback } from 'react';

export type MusicStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type MusicMode = 'follow_music' | 'target_pace';

export interface MusicData {
  status: MusicStatus;
  mode: MusicMode;
  hasAudioBuffer: boolean;
  bpm: number;
  targetCadence: number;
  targetPace: number;
  playbackRate: number;
  fileName: string;
  error: string | null;
}

const MIN_RATE = 0.7;
const MAX_RATE = 1.4;
const CADENCE_DEAD_ZONE = 3; // spm — não ajusta se desvio for pequeno

// ─── Detecção de BPM por onset detection ─────────────────────────────────────
async function detectBPM(audioBuffer: AudioBuffer): Promise<number> {
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0);
  const windowSize = Math.min(data.length, sampleRate * 30);
  const slice = data.slice(0, windowSize);
  const frameSize = Math.floor(sampleRate * 0.011);
  const energies: number[] = [];

  for (let i = 0; i < slice.length - frameSize; i += frameSize) {
    let sum = 0;
    for (let j = 0; j < frameSize; j++) sum += slice[i + j] ** 2;
    energies.push(sum / frameSize);
  }

  const onsets: number[] = [];
  const lookback = 20;

  for (let i = lookback; i < energies.length; i++) {
    const localMean =
      energies.slice(i - lookback, i).reduce((a, b) => a + b, 0) / lookback;
    if (energies[i] > localMean * 1.5 && energies[i] > (energies[i - 1] ?? 0)) {
      onsets.push(i);
    }
  }

  if (onsets.length < 4) return 0;

  const intervals: number[] = [];
  for (let i = 1; i < onsets.length; i++) {
    const sec = ((onsets[i] - onsets[i - 1]) * frameSize) / sampleRate;
    if (sec > 0.25 && sec < 2.0) intervals.push(sec);
  }

  if (intervals.length === 0) return 0;

  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  let bpm = 60 / avg;
  while (bpm < 60) bpm *= 2;
  while (bpm > 200) bpm /= 2;
  return Math.round(bpm);
}

export function useMusicEngine() {
  const [data, setData] = useState<MusicData>({
    status: 'idle',
    mode: 'follow_music',
    hasAudioBuffer: false,
    bpm: 0,
    targetCadence: 0,
    targetPace: 0,
    playbackRate: 1.0,
    fileName: '',
    error: null,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const currentRateRef = useRef<number>(1.0);
  const manualBPMRef = useRef<number | null>(null);

  // ─── Carregar arquivo e detectar BPM ───────────────────────────────────────
  // BUG ORIGINAL: não existia esta função — o hook era um stub sem áudio real.
  const loadFile = useCallback(async (file: File) => {
    setData((d) => ({
      ...d,
      status: 'loading',
      hasAudioBuffer: false,
      error: null,
      fileName: file.name,
    }));

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = audioBuffer;
      const bpm = await detectBPM(audioBuffer);

      setData((d) => ({
        ...d,
        status: 'idle',
        hasAudioBuffer: true,
        bpm,
        error: bpm === 0 ? 'BPM não detectado — defina manualmente.' : null,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setData((d) => ({ ...d, status: 'error', hasAudioBuffer: false, error: msg }));
    }
  }, []);

  // ─── BPM manual ────────────────────────────────────────────────────────────
  const setManualBPM = useCallback((bpm: number) => {
    manualBPMRef.current = bpm;
    setData((d) => ({ ...d, bpm }));
  }, []);

  // ─── Modo ──────────────────────────────────────────────────────────────────
  const setMode = useCallback((mode: MusicMode) => {
    setData((d) => ({ ...d, mode }));
  }, []);

  // ─── Playback ──────────────────────────────────────────────────────────────
  // BUG ORIGINAL: play/pause/stop não existiam — sem áudio real.
  const play = useCallback(() => {
    const ctx = audioCtxRef.current;
    const buffer = audioBufferRef.current;
    if (!ctx || !buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = currentRateRef.current;
    source.connect(ctx.destination);
    source.start(0, pauseOffsetRef.current);

    sourceRef.current = source;
    startTimeRef.current = ctx.currentTime - pauseOffsetRef.current;
    setData((d) => ({ ...d, status: 'playing' }));
  }, []);

  const pause = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !sourceRef.current) return;
    pauseOffsetRef.current = ctx.currentTime - startTimeRef.current;
    sourceRef.current.stop();
    sourceRef.current = null;
    setData((d) => ({ ...d, status: 'paused' }));
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    pauseOffsetRef.current = 0;
    currentRateRef.current = 1.0;
    setData((d) => ({ ...d, status: 'idle', playbackRate: 1.0 }));
  }, []);

  // ─── Motor de controle ─────────────────────────────────────────────────────
  // BUG ORIGINAL: tick não era useCallback → referência mudava todo render →
  // o useEffect do App.tsx recriava o setInterval constantemente.
  const tick = useCallback(
    (currentSPM: number, strideM: number, targetPaceMinKm?: number) => {
      const bpm = manualBPMRef.current ?? data.bpm;
      if (bpm <= 0 || currentSPM <= 0) return;

      let targetCadence: number;
      let effectiveTargetPace: number;

      if (data.mode === 'target_pace' && targetPaceMinKm && targetPaceMinKm > 0) {
        // Modo B: pace-alvo → cadência necessária → rate
        const speedMmin = 1000 / targetPaceMinKm;
        targetCadence = Math.round(speedMmin / strideM);
        effectiveTargetPace = targetPaceMinKm;
      } else {
        // Modo A: música dita a cadência
        targetCadence = bpm;
        const speedMmin = targetCadence * strideM;
        effectiveTargetPace = speedMmin > 0 ? 1000 / speedMmin : 0;
      }

      const cadenceError = targetCadence - currentSPM;

      // Zona morta: não ajusta se desvio for pequeno
      if (Math.abs(cadenceError) < CADENCE_DEAD_ZONE) {
        setData((d) => ({ ...d, targetCadence, targetPace: effectiveTargetPace }));
        return;
      }

      const desiredRate =
        data.mode === 'target_pace'
          ? targetCadence / bpm
          : targetCadence / currentSPM;

      // Interpolação linear — converge, não deriva
      const newRate =
        currentRateRef.current +
        (desiredRate - currentRateRef.current) * 0.3;

      const clampedRate = Math.min(MAX_RATE, Math.max(MIN_RATE, +newRate.toFixed(3)));

      if (sourceRef.current && audioCtxRef.current) {
        sourceRef.current.playbackRate.setTargetAtTime(
          clampedRate,
          audioCtxRef.current.currentTime,
          1.0
        );
      }

      currentRateRef.current = clampedRate;

      setData((d) => ({
        ...d,
        targetCadence,
        targetPace: effectiveTargetPace,
        playbackRate: clampedRate,
      }));
    },
    [data.bpm, data.mode]
  );

  return { data, loadFile, setManualBPM, setMode, play, pause, stop, tick };
}
