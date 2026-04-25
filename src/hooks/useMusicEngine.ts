import { useState, useRef, useCallback } from 'react';

export type MusicStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type MusicMode = 'follow_music' | 'target_pace';
export type BpmSource = 'none' | 'detected' | 'manual' | 'tap';
export type RateControlMode = 'auto' | 'manual';

export interface MusicData {
  status: MusicStatus;
  mode: MusicMode;
  hasAudioBuffer: boolean;
  bpm: number;
  bpmSource: BpmSource;
  detectedBpm: number;
  manualBpm: number;
  tapBpm: number;
  targetCadence: number;
  targetPace: number;
  playbackRate: number;
  rateControlMode: RateControlMode;
  metronomeOn: boolean;
  metronomeBpm: number;
  repeatTrack: boolean;
  fileName: string;
  error: string | null;
}

const MIN_RATE = 0.7;
const MAX_RATE = 1.25;
const CADENCE_DEAD_ZONE = 3; // spm — não ajusta se desvio for pequeno
const METRONOME_MIN_BPM = 45;
const METRONOME_MAX_BPM = 220;

function normalizeBpm(rawBpm: number): number {
  if (!Number.isFinite(rawBpm) || rawBpm <= 0) return 0;
  let bpm = rawBpm;
  while (bpm < 60) bpm *= 2;
  while (bpm > 200) bpm /= 2;
  return Math.round(bpm);
}

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
    mode: 'target_pace',
    hasAudioBuffer: false,
    bpm: 0,
    bpmSource: 'none',
    detectedBpm: 0,
    manualBpm: 0,
    tapBpm: 0,
    targetCadence: 0,
    targetPace: 0,
    playbackRate: 1.0,
    rateControlMode: 'manual',
    metronomeOn: false,
    metronomeBpm: 0,
    repeatTrack: false,
    fileName: '',
    error: null,
  });

  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const startTimeRef = useRef<number>(0);
  const pauseOffsetRef = useRef<number>(0);
  const currentRateRef = useRef<number>(1.0);
  const detectedBpmRef = useRef<number>(0);
  const manualBPMRef = useRef<number>(0);
  const tapBpmRef = useRef<number>(0);
  const tapTimesRef = useRef<number[]>([]);
  const metronomeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const repeatTrackRef = useRef(false);

  const getEffectiveBpm = useCallback(() => {
    return manualBPMRef.current || tapBpmRef.current || detectedBpmRef.current || 0;
  }, []);

  const playMetronomeClick = useCallback((volume = 0.16) => {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    if (!audioCtxRef.current) {
      audioCtxRef.current = new Ctx();
    }

    const ctx = audioCtxRef.current;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;

    osc.type = 'square';
    osc.frequency.setValueAtTime(1100, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }, []);

  const stopMetronome = useCallback(() => {
    if (metronomeTimerRef.current) {
      clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }

    setData((d) => ({ ...d, metronomeOn: false }));
  }, []);

  const startMetronome = useCallback((bpm: number) => {
    const clamped = Math.max(METRONOME_MIN_BPM, Math.min(METRONOME_MAX_BPM, Math.round(bpm || 0)));
    if (!clamped) return;

    if (metronomeTimerRef.current) {
      clearInterval(metronomeTimerRef.current);
      metronomeTimerRef.current = null;
    }

    playMetronomeClick();
    const periodMs = Math.max(120, Math.round(60000 / clamped));
    metronomeTimerRef.current = setInterval(() => {
      playMetronomeClick();
    }, periodMs);

    setData((d) => ({ ...d, metronomeOn: true, metronomeBpm: clamped }));
  }, [playMetronomeClick]);

  // ─── Carregar arquivo e detectar BPM ───────────────────────────────────────
  // BUG ORIGINAL: não existia esta função — o hook era um stub sem áudio real.
  const loadFile = useCallback(async (file: File) => {
    manualBPMRef.current = 0;
    tapBpmRef.current = 0;
    tapTimesRef.current = [];

    setData((d) => ({
      ...d,
      status: 'loading',
      hasAudioBuffer: false,
      error: null,
      manualBpm: 0,
      tapBpm: 0,
      bpmSource: 'none',
      fileName: file.name,
    }));

    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      audioBufferRef.current = audioBuffer;
      const detected = normalizeBpm(await detectBPM(audioBuffer));
      detectedBpmRef.current = detected;

      const effective = getEffectiveBpm() || detected;
      const source: BpmSource = effective <= 0
        ? 'none'
        : manualBPMRef.current > 0
          ? 'manual'
          : tapBpmRef.current > 0
            ? 'tap'
            : 'detected';

      setData((d) => ({
        ...d,
        status: 'idle',
        hasAudioBuffer: true,
        bpm: effective,
        bpmSource: source,
        detectedBpm: detected,
        manualBpm: manualBPMRef.current,
        tapBpm: tapBpmRef.current,
        error: effective === 0 ? 'BPM não detectado — use manual ou Tap Tempo.' : null,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setData((d) => ({ ...d, status: 'error', hasAudioBuffer: false, error: msg }));
    }
  }, []);

  // ─── BPM manual ────────────────────────────────────────────────────────────
  const setManualBPM = useCallback((bpm: number) => {
    const normalized = normalizeBpm(bpm);
    manualBPMRef.current = normalized;
    if (normalized > 0) {
      tapBpmRef.current = 0;
      tapTimesRef.current = [];
    }

    setData((d) => ({
      ...d,
      bpm: normalized,
      bpmSource: normalized > 0 ? 'manual' : d.detectedBpm > 0 ? 'detected' : 'none',
      manualBpm: normalized,
      tapBpm: normalized > 0 ? 0 : d.tapBpm,
    }));
  }, []);

  const tapTempo = useCallback(() => {
    const now = Date.now();
    tapTimesRef.current = [...tapTimesRef.current, now].slice(-8);

    if (tapTimesRef.current.length < 3) return;

    const intervalsMs: number[] = [];
    for (let i = 1; i < tapTimesRef.current.length; i++) {
      const diff = tapTimesRef.current[i] - tapTimesRef.current[i - 1];
      if (diff >= 250 && diff <= 2000) intervalsMs.push(diff);
    }

    if (intervalsMs.length < 2) return;

    const avgMs = intervalsMs.reduce((a, b) => a + b, 0) / intervalsMs.length;
    const bpm = normalizeBpm(60000 / avgMs);
    if (!bpm) return;

    tapBpmRef.current = bpm;
    manualBPMRef.current = 0;

    setData((d) => ({
      ...d,
      bpm,
      bpmSource: 'tap',
      tapBpm: bpm,
      manualBpm: 0,
      error: null,
    }));
  }, []);

  const resetTapTempo = useCallback(() => {
    tapTimesRef.current = [];
    tapBpmRef.current = 0;

    const fallback = manualBPMRef.current || detectedBpmRef.current || 0;
    const source: BpmSource = manualBPMRef.current > 0
      ? 'manual'
      : detectedBpmRef.current > 0
        ? 'detected'
        : 'none';

    setData((d) => ({
      ...d,
      bpm: fallback,
      tapBpm: 0,
      bpmSource: source,
    }));
  }, []);

  // ─── Modo ──────────────────────────────────────────────────────────────────
  const setMode = useCallback((mode: MusicMode) => {
    setData((d) => ({ ...d, mode }));
  }, []);

  const setRateControlMode = useCallback((mode: RateControlMode) => {
    setData((d) => ({ ...d, rateControlMode: mode }));
  }, []);

  const setManualPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.min(MAX_RATE, Math.max(MIN_RATE, +rate.toFixed(3)));
    currentRateRef.current = clamped;

    if (sourceRef.current && audioCtxRef.current) {
      sourceRef.current.playbackRate.setTargetAtTime(
        clamped,
        audioCtxRef.current.currentTime,
        0.2
      );
    }

    setData((d) => ({ ...d, playbackRate: clamped }));
  }, []);

  const setTrackRepeat = useCallback((enabled: boolean) => {
    repeatTrackRef.current = enabled;
    setData((d) => ({ ...d, repeatTrack: enabled }));
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

    source.onended = () => {
      if (sourceRef.current !== source) return;

      sourceRef.current = null;

      if (repeatTrackRef.current) {
        pauseOffsetRef.current = 0;
        play();
        return;
      }

      pauseOffsetRef.current = 0;
      setData((d) => ({ ...d, status: 'idle' }));
    };

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
    stopMetronome();
    setData((d) => ({ ...d, status: 'idle', playbackRate: 1.0 }));
  }, [stopMetronome]);

  // ─── Motor de controle ─────────────────────────────────────────────────────
  // BUG ORIGINAL: tick não era useCallback → referência mudava todo render →
  // o useEffect do App.tsx recriava o setInterval constantemente.
  const tick = useCallback(
    (
      currentSPM: number,
      strideM: number,
      targetPaceMinKm?: number,
      signalConfidence = 70,
      currentPaceMinKm?: number
    ) => {
      const bpm = getEffectiveBpm();
      if (bpm <= 0 || currentSPM <= 0) return;

      let targetCadence: number;
      let effectiveTargetPace: number;

      if (data.mode === 'target_pace' && targetPaceMinKm && targetPaceMinKm > 0) {
        // Modo B: pace-alvo → cadência necessária → rate
        const speedMmin = 1000 / targetPaceMinKm;
        targetCadence = Math.round(speedMmin / Math.max(0.2, strideM));
        effectiveTargetPace = targetPaceMinKm;
      } else {
        // Modo A: música dita a cadência
        targetCadence = bpm;
        const speedMmin = targetCadence * strideM;
        effectiveTargetPace = speedMmin > 0 ? 1000 / speedMmin : 0;
      }

      const cadenceError = targetCadence - currentSPM;
      const confidence = Math.max(0.2, Math.min(1, signalConfidence / 100));

      // Zona morta: não ajusta se desvio for pequeno
      if (Math.abs(cadenceError) < CADENCE_DEAD_ZONE) {
        setData((d) => ({ ...d, targetCadence, targetPace: effectiveTargetPace }));
        return;
      }

      const desiredRate = data.mode === 'target_pace'
        ? (() => {
            const cadenceRate = targetCadence / bpm;
            if (!currentPaceMinKm || !targetPaceMinKm || targetPaceMinKm <= 0) {
              return cadenceRate;
            }

            // Correção por erro de pace em tempo real (lento => aumenta rate; rápido => reduz)
            const paceErrorRatio = (currentPaceMinKm - targetPaceMinKm) / targetPaceMinKm;
            const paceGain = Math.max(-0.08, Math.min(0.08, paceErrorRatio * 0.35));
            return cadenceRate * (1 + paceGain);
          })()
        : 1 + Math.max(-0.08, Math.min(0.08, cadenceError / 120));

        if (data.rateControlMode === 'manual') {
          setData((d) => ({
            ...d,
            bpm,
            bpmSource: manualBPMRef.current > 0
              ? 'manual'
              : tapBpmRef.current > 0
                ? 'tap'
                : detectedBpmRef.current > 0
                  ? 'detected'
                  : 'none',
            detectedBpm: detectedBpmRef.current,
            manualBpm: manualBPMRef.current,
            tapBpm: tapBpmRef.current,
            targetCadence,
            targetPace: effectiveTargetPace,
            playbackRate: currentRateRef.current,
          }));
          return;
        }

      // Interpolação linear — converge, não deriva
      const alpha = 0.14 + confidence * 0.22;
      const newRate =
        currentRateRef.current +
        (desiredRate - currentRateRef.current) * alpha;

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
        bpm,
        bpmSource: manualBPMRef.current > 0
          ? 'manual'
          : tapBpmRef.current > 0
            ? 'tap'
            : detectedBpmRef.current > 0
              ? 'detected'
              : 'none',
        detectedBpm: detectedBpmRef.current,
        manualBpm: manualBPMRef.current,
        tapBpm: tapBpmRef.current,
        targetCadence,
        targetPace: effectiveTargetPace,
        playbackRate: clampedRate,
      }));
    },
    [data.mode, data.rateControlMode, getEffectiveBpm]
  );

  const setMetronomeBpm = useCallback((bpm: number) => {
    if (!data.metronomeOn) return;
    startMetronome(bpm);
  }, [data.metronomeOn, startMetronome]);

  return {
    data,
    loadFile,
    setManualBPM,
    tapTempo,
    resetTapTempo,
    startMetronome,
    stopMetronome,
    setMetronomeBpm,
    setMode,
    play,
    pause,
    stop,
    tick,
    setRateControlMode,
    setManualPlaybackRate,
    setTrackRepeat,
  };
}
