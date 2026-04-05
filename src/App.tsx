// src/App.tsx — SUBSTITUI O ARQUIVO ANTERIOR INTEIRO
// Mudanças: nome PaceUp, mapa integrado, editor de BPM, useRunningPlugin removido

import { useEffect, useMemo, useRef, useState } from 'react';
import { useGPS, formatPace } from './hooks/useGPS';
import { useCalibration } from './hooks/useCalibration';
import { useMusicEngine } from './hooks/useMusicEngine';
import { useCadence } from './hooks/useCadence';
import { useWorkoutHistory } from './hooks/useWorkoutHistory';
import type { WorkoutSession } from './hooks/useWorkoutHistory';
import { GPSMap } from './components/GPSMap';
import type { MusicMode } from './hooks/useMusicEngine';
import './App.css';

export default function App() {
  const gps   = useGPS();
  const cal   = useCalibration();
  const music = useMusicEngine();
  const history = useWorkoutHistory();

  const rawStride     = cal.data.strideM * (1 + (gps.data.speedMs - 3) * 0.05);
  const dynamicStride = Math.min(
    cal.data.strideM * 1.12,
    Math.max(cal.data.strideM * 0.88, rawStride)
  );

  const cadence = useCadence(gps.data.speedMs, gps.data.smoothedDistance, dynamicStride);
  const [lastSummary, setLastSummary] = useState<WorkoutSession | null>(null);

  const [targetPaceInput, setTargetPaceInput] = useState('5.30');
  const importHistoryInputRef = useRef<HTMLInputElement>(null);

  // ── BPM manual ──────────────────────────────────────────────────────────────
  const [bpmInput, setBpmInput] = useState('');

  useEffect(() => {
    if (music.data.bpm > 0) {
      setBpmInput((prev) => prev || String(music.data.bpm));
    }
  }, [music.data.bpm]);

  function handleBpmChange(val: string) {
    setBpmInput(val);
    const n = parseInt(val, 10);
    if (!isNaN(n) && n >= 60 && n <= 200) {
      music.setManualBPM(n);
    }
  }

  function adjustBpm(delta: number) {
    const current = parseInt(bpmInput || String(music.data.bpm || 120), 10);
    const next    = Math.min(200, Math.max(60, current + delta));
    setBpmInput(String(next));
    music.setManualBPM(next);
  }

  // ── Refs para o tick de música ───────────────────────────────────────────────
  const tickRef    = useRef(music.tick);
  const spmRef     = useRef(cadence.data.stepsPerMinute);
  const strideRef  = useRef(dynamicStride);
  const modeRef    = useRef(music.data.mode);
  const tpInputRef = useRef(targetPaceInput);

  useEffect(() => { tickRef.current   = music.tick;                   }, [music.tick]);
  useEffect(() => { spmRef.current    = cadence.data.stepsPerMinute;  }, [cadence.data.stepsPerMinute]);
  useEffect(() => { strideRef.current = dynamicStride;                }, [dynamicStride]);
  useEffect(() => { modeRef.current   = music.data.mode;              }, [music.data.mode]);
  useEffect(() => { tpInputRef.current = targetPaceInput;             }, [targetPaceInput]);

  useEffect(() => {
    const id = setInterval(() => {
      const tp = modeRef.current === 'target_pace'
        ? parseFloat(tpInputRef.current) || 0
        : undefined;
      tickRef.current(spmRef.current, strideRef.current, tp);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // ── Derivados ────────────────────────────────────────────────────────────────
  const gpsActive   = gps.data.status === 'active';
  const gpsPaused   = gps.data.status === 'paused';
  const calRunning  = cal.data.status === 'running';
  const musicPlaying = music.data.status === 'playing';

  const paceBySPM   = cadence.data.stepsPerMinute > 0
    ? 1000 / (cadence.data.stepsPerMinute * dynamicStride)
    : 0;

  const paceError   = gps.data.averagePace > 0 && paceBySPM > 0
    ? Math.abs(gps.data.averagePace - paceBySPM)
    : 0;

  const paceErrorLabel = paceError === 0 ? '--'
    : paceError < 0.2   ? 'Perfeito'
    : paceError < 0.4   ? 'Aceitavel'
    : 'Verificar';

  const targetPaceNumber = parseFloat(targetPaceInput) || 0;
  const heroPace         = gps.data.averagePace > 0 ? gps.data.averagePace : 0;
  const heroPaceText     = heroPace > 0 ? formatPace(heroPace) : '--:--';

  const paceDiff = useMemo(() => {
    if (!heroPace || !targetPaceNumber) return null;
    return heroPace - targetPaceNumber;
  }, [heroPace, targetPaceNumber]);

  const distanceGapM = Math.max(0, gps.data.rawDistance - gps.data.smoothedDistance);
  const distanceGapPct = gps.data.rawDistance > 0
    ? (distanceGapM / gps.data.rawDistance) * 100
    : 0;

  const goalStatus = useMemo(() => {
    if (paceDiff === null) return 'Sem meta ativa';
    if (Math.abs(paceDiff) <= 0.15) return 'Dentro da meta';
    return paceDiff < 0 ? 'Abaixo da meta' : 'Acima da meta';
  }, [paceDiff]);

  const targetSource = music.data.mode === 'target_pace'
    ? 'Fonte: pace manual'
    : 'Fonte: BPM da musica';

  const levelProgress = Math.min(100, Math.round((gps.data.smoothedDistance / 5000) * 100));
  const fallbackRoute = lastSummary?.routePoints ?? history.latestSession?.routePoints ?? [];
  const mapRoute = gps.data.routePoints.length > 0 ? gps.data.routePoints : fallbackRoute;
  const fallbackLast = fallbackRoute.length > 0 ? fallbackRoute[fallbackRoute.length - 1] : null;

  // ── Handlers ─────────────────────────────────────────────────────────────────
  async function handleStart() {
    if (gpsPaused) {
      await gps.resume();
      return;
    }
    await gps.start();
  }

  async function handlePause() {
    await gps.pause();
    music.pause();
  }

  async function handleStop() {
    const snapshotDistance = gps.data.smoothedDistance;
    const snapshotElapsed = Math.max(gps.data.elapsedSeconds, cadence.data.elapsedSeconds);
    const snapshotPace = snapshotDistance > 0
      ? (gps.data.averagePace > 0 ? gps.data.averagePace : snapshotElapsed > 0 ? (snapshotElapsed / 60) / (snapshotDistance / 1000) : 0)
      : 0;

    const snapshotRoute = [...gps.data.routePoints];

    await gps.stop();

    if (snapshotDistance > 30 && snapshotElapsed > 20 && snapshotRoute.length > 0) {
      const summary: WorkoutSession = {
        id: `summary-${Date.now()}`,
        startedAt: new Date(Date.now() - snapshotElapsed * 1000).toISOString(),
        endedAt: new Date().toISOString(),
        distanceM: snapshotDistance,
        elapsedSeconds: snapshotElapsed,
        averagePace: snapshotPace,
        routePoints: snapshotRoute,
        musicFileName: music.data.fileName,
        musicMode: music.data.mode,
      };

      history.appendSession({
        startedAt: summary.startedAt,
        distanceM: summary.distanceM,
        elapsedSeconds: summary.elapsedSeconds,
        averagePace: summary.averagePace,
        routePoints: summary.routePoints,
        musicFileName: summary.musicFileName,
        musicMode: summary.musicMode,
      });

      setLastSummary(summary);
    }

    music.stop();
    cadence.reset();
  }

  function handleReset() {
    gps.resetSession();
    cadence.reset();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) { music.loadFile(file); setBpmInput(''); }
  }

  function exportHistory() {
    const payload = JSON.stringify(history.sessions, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `paceup-historico-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportHistory(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        throw new Error('Arquivo invalido: esperado array de treinos.');
      }

      const imported = history.importSessions(parsed);
      if (imported === 0) {
        throw new Error('Nenhum treino valido foi importado.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Falha ao importar historico.';
      window.alert(msg);
    } finally {
      e.target.value = '';
    }
  }

  const error = gps.data.error || cal.data.error || music.data.error;

  const achievementItems = [
    { icon: '🔥', label: 'Sequencia',  active: cadence.data.elapsedSeconds > 0 },
    { icon: '⚡', label: 'Ritmo',      active: gps.data.speedMs > 1.8 },
    { icon: '🎵', label: 'Musica',     active: music.data.hasAudioBuffer },
    { icon: '📍', label: 'GPS',        active: gpsActive },
  ];

  return (
    <div className="app-shell">
      <div className="app-bg-glow app-bg-glow-1" />
      <div className="app-bg-glow app-bg-glow-2" />

      <main className="app-screen">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="topbar">
          <div className="brand">
            <div className="brand-icon">🏃</div>
            <div>
              <h1>PaceUp</h1>
              <p>corrida com musica no ritmo certo</p>
            </div>
          </div>
          <div className={`gps-pill ${gpsActive ? 'gps-on' : 'gps-off'}`}>
            <span className="gps-dot" />
            {gpsActive ? 'GPS ativo' : gpsPaused ? 'GPS pausado' : 'GPS pronto'}
          </div>
        </header>

        {error && <div className="alert-box">⚠️ {error}</div>}

        {gpsPaused && (
          <div className="alert-box">
            ⏸ Sessao pausada restaurada. Toque em Retomar corrida para continuar sem perder progresso.
          </div>
        )}

        {lastSummary && (
          <section className="details-card">
            <div className="section-head">
              <h2>Resumo do ultimo treino</h2>
              <span className="mini-badge">
                {new Date(lastSummary.endedAt).toLocaleTimeString('pt-BR')}
              </span>
            </div>

            <div className="details-grid">
              <InfoLine label="Distancia" value={`${(lastSummary.distanceM / 1000).toFixed(2)} km`} />
              <InfoLine label="Tempo" value={formatElapsed(lastSummary.elapsedSeconds)} />
              <InfoLine label="Pace medio" value={formatPace(lastSummary.averagePace)} />
              <InfoLine label="Pontos de rota" value={String(lastSummary.routePoints.length)} />
            </div>

            <div className="calibration-actions">
              <button className="secondary-btn" onClick={() => setLastSummary(null)}>
                Fechar resumo
              </button>
            </div>
          </section>
        )}

        {/* ── Hero pace ──────────────────────────────────────────────────── */}
        <section className="hero-card">
          <div className="hero-top">
            <div>
              <span className="eyebrow">Pace atual</span>
              <div className="hero-pace">{heroPaceText}</div>
              <div className="hero-unit">min/km</div>
            </div>
            <div className="hero-target">
              <div className="target-ring">
                <div className="target-ring-inner">
                  <strong>
                    {music.data.targetPace > 0
                      ? formatPace(music.data.targetPace)
                      : formatPace(targetPaceNumber)}
                  </strong>
                  <span>alvo</span>
                </div>
              </div>
            </div>
          </div>
          <div className="hero-diff-row">
            <div className="hero-diff-badge">
              {paceDiff === null
                ? 'Sem comparacao'
                : paceDiff < 0
                ? `▲ ${Math.abs(paceDiff).toFixed(2)} abaixo do alvo`
                : `▼ ${paceDiff.toFixed(2)} acima do alvo`}
            </div>
            <div className="hero-diff-badge">{goalStatus}</div>
            <div className="hero-diff-badge">{targetSource}</div>
          </div>
        </section>

        {/* ── Metrics ────────────────────────────────────────────────────── */}
        <section className="metrics-grid">
          <MetricCard color="green"  label="Cadencia" value={cadence.data.stepsPerMinute || 0} unit="spm" />
          <MetricCard color="blue"   label="Distancia" value={(gps.data.smoothedDistance / 1000).toFixed(2)} unit="km" />
          <MetricCard color="orange" label="Tempo"     value={formatElapsed(cadence.data.elapsedSeconds)} />
        </section>

        {/* ── Pace comparison ────────────────────────────────────────────── */}
        <section className="pace-bars-card">
          <div className="section-head">
            <h2>Pace e comparacao</h2>
            <span className="mini-badge">
              {gps.data.averagePace > 0 ? 'ao vivo' : 'aguardando'}
            </span>
          </div>
          <div className="comparison-grid">
            <InfoLine label="Pace instantaneo"   value={formatPace(gps.data.instantPace)} />
            <InfoLine label="Pace medio GPS"    value={formatPace(gps.data.averagePace)} />
            <InfoLine label="Pace por formula"  value={formatPace(paceBySPM)} />
            <InfoLine
              label="Pace-alvo"
              value={music.data.targetPace > 0
                ? formatPace(music.data.targetPace)
                : formatPace(targetPaceNumber)}
            />
            <InfoLine
              label="Erro GPS x formula"
              value={paceError > 0 ? `${paceError.toFixed(2)} min/km` : '--'}
              sub={paceError > 0 ? paceErrorLabel : undefined}
            />
            <InfoLine label="Status da meta" value={goalStatus} />
          </div>
        </section>

        {/* ── MAPA ───────────────────────────────────────────────────────── */}
        <GPSMap
          routePoints={mapRoute}
          currentLat={gps.data.lat || fallbackLast?.lat || 0}
          currentLng={gps.data.lng || fallbackLast?.lng || 0}
          isActive={gpsActive}
        />

        {/* ── Musica ─────────────────────────────────────────────────────── */}
        <section className="player-card">
          <div className="section-head">
            <h2>Musica</h2>
            <span className="mini-badge">
              {musicPlaying ? 'tocando' : music.data.hasAudioBuffer ? 'pronta' : 'sem musica'}
            </span>
          </div>

          <div className="player-track">
            <div className="track-art">🎵</div>
            <div className="track-meta">
              <div className="track-title">
                {music.data.fileName || 'Nenhuma musica carregada'}
              </div>
              <div className="track-subtitle">
                {music.data.fileName ? 'arquivo carregado para o treino' : 'adicione uma faixa para sincronizar'}
              </div>
              <div className="track-tags">
                <span className="track-tag track-tag-blue">{music.data.playbackRate.toFixed(2)}x</span>
                <span className="track-tag track-tag-purple">passada {dynamicStride.toFixed(2)}m</span>
              </div>
            </div>
          </div>

          {/* BPM Editor */}
          <div className="bpm-editor">
            <span className="bpm-editor-label">BPM da musica</span>
            <div className="bpm-editor-row">
              <button className="step-btn" onClick={() => adjustBpm(-1)} disabled={!music.data.hasAudioBuffer}>−</button>
              <input
                className="bpm-input"
                type="number"
                min="60"
                max="200"
                value={bpmInput}
                onChange={(e) => handleBpmChange(e.target.value)}
                disabled={!music.data.hasAudioBuffer}
              />
              <button className="step-btn" onClick={() => adjustBpm(1)} disabled={!music.data.hasAudioBuffer}>+</button>
            </div>
            {music.data.bpm > 0 && (
              <div className="bpm-detected">BPM detectado automaticamente: {music.data.bpm}</div>
            )}
          </div>

          <div className="waveform">
            {Array.from({ length: 36 }).map((_, i) => (
              <span
                key={i}
                className={`wave-bar ${i < 16 ? 'wave-played' : i === 16 ? 'wave-current' : ''}`}
                style={{ height: `${30 + ((i * 13) % 55)}%` }}
              />
            ))}
          </div>
          <div className="time-row"><span>0:00</span><span>--:--</span></div>

          <div className="mode-switch">
            {(['follow_music', 'target_pace'] as MusicMode[]).map((m) => (
              <button
                key={m}
                className={`mode-btn ${music.data.mode === m ? 'mode-btn-active' : ''}`}
                onClick={() => music.setMode(m)}
              >
                {m === 'follow_music' ? 'Seguir musica' : 'Pace-alvo'}
              </button>
            ))}
          </div>

          <div className="time-row" style={{ marginBottom: 8 }}>
            <span>
              {music.data.mode === 'follow_music'
                ? 'Modo ativo: BPM da musica define o alvo'
                : 'Modo ativo: pace manual define o alvo'}
            </span>
            <span>{music.data.mode === 'follow_music' ? 'BPM→Pace' : 'Pace→Cadencia'}</span>
          </div>

          {music.data.mode === 'target_pace' && (
            <div className="target-input-card">
              <label htmlFor="targetPace">Pace-alvo (min/km)</label>
              <input
                id="targetPace"
                type="number"
                step="0.05"
                min="3"
                max="15"
                value={targetPaceInput}
                onChange={(e) => setTargetPaceInput(e.target.value)}
              />
            </div>
          )}

          <div className="upload-row">
            <label className="upload-btn">
              Carregar musica
              <input type="file" accept="audio/*" onChange={handleFileChange} />
            </label>
            <div className="player-controls">
              <button className="icon-btn" onClick={music.stop}>■</button>
              <button
                className="play-btn"
                onClick={musicPlaying ? music.pause : music.play}
                disabled={!music.data.hasAudioBuffer}
              >
                {musicPlaying ? 'Pausar' : 'Play'}
              </button>
            </div>
          </div>
        </section>

        {/* ── Controle de pace ───────────────────────────────────────────── */}
        <section className="control-card">
          <div className="section-head">
            <h2>Controle de pace</h2>
            <span className="mini-badge">
              {music.data.mode === 'target_pace' ? 'auto ativo' : 'manual'}
            </span>
          </div>
          <div className="pace-control-box">
            <button
              className="step-btn"
              disabled={music.data.mode !== 'target_pace'}
              onClick={() =>
                setTargetPaceInput((prev) =>
                  Math.max(3, parseFloat(prev || '5.30') - 0.05).toFixed(2)
                )
              }
            >
              −
            </button>
            <div className="pace-display-box">
              <div className="pace-display-value">{targetPaceNumber.toFixed(2)}</div>
              <div className="pace-display-unit">min/km</div>
            </div>
            <button
              className="step-btn"
              disabled={music.data.mode !== 'target_pace'}
              onClick={() =>
                setTargetPaceInput((prev) =>
                  Math.min(15, parseFloat(prev || '5.30') + 0.05).toFixed(2)
                )
              }
            >
              +
            </button>
          </div>
          {music.data.mode !== 'target_pace' && (
            <div className="time-row" style={{ marginTop: 8 }}>
              <span>Ajuste de pace bloqueado no modo seguir musica</span>
              <span>Troque para Pace-alvo</span>
            </div>
          )}
        </section>

        {/* ── Progresso ──────────────────────────────────────────────────── */}
        <section className="progress-card">
          <div className="section-head">
            <h2>Progresso</h2>
            <span className="mini-badge">{levelProgress}% da meta de 5 km</span>
          </div>
          <div className="xp-row">
            <div>
              <div className="xp-title">Meta da sessao</div>
              <div className="xp-sub">
                {(gps.data.smoothedDistance / 1000).toFixed(2)} km de 5.00 km
              </div>
            </div>
            <div className="xp-value">{Math.round(gps.data.smoothedDistance)} XP</div>
          </div>
          <div className="xp-bar">
            <div className="xp-fill" style={{ width: `${levelProgress}%` }} />
          </div>
          <div className="achievement-grid">
            {achievementItems.map((item) => (
              <div key={item.label} className={`achievement ${item.active ? 'active' : ''}`}>
                <div className="achievement-icon">{item.icon}</div>
                <div className="achievement-label">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Detalhes tecnicos ──────────────────────────────────────────── */}
        <section className="details-card">
          <div className="section-head">
            <h2>Detalhes tecnicos</h2>
            <span className="mini-badge">debug leve</span>
          </div>
          <div className="details-grid">
            <InfoLine label="Precisao GPS"      value={`${gps.data.accuracy} m`} />
            <InfoLine label="Velocidade"         value={`${gps.data.speedMs} m/s`} />
            <InfoLine label="Distancia bruta"    value={`${(gps.data.rawDistance / 1000).toFixed(2)} km`} />
            <InfoLine
              label="Qualidade de pontos"
              value={`${gps.data.acceptedPoints} ok / ${gps.data.rejectedPoints} rejeitados`}
            />
            <InfoLine
              label="Gap bruta x filtrada"
              value={`${distanceGapM.toFixed(0)} m`}
              sub={gps.data.rawDistance > 0 ? `${distanceGapPct.toFixed(1)}% da bruta` : undefined}
            />
            <InfoLine label="Passos estimados"   value={String(cadence.data.sessionSteps)} />
            <InfoLine label="Buffer carregado"   value={music.data.hasAudioBuffer ? 'Sim' : 'Nao'} />
            <InfoLine label="Status calibracao"  value={cal.data.status} />
            <InfoLine label="Passada calibrada"  value={`${cal.data.strideM.toFixed(4)} m`} />
          </div>
          <div className="calibration-actions">
            {!calRunning ? (
              <button
                className="secondary-btn"
                onClick={() => cal.startCalibration(cadence.data.sessionSteps, gps.data.smoothedDistance)}
                disabled={!gpsActive}
              >
                Iniciar calibracao
              </button>
            ) : (
              <button
                className="secondary-btn secondary-btn-green"
                onClick={() => cal.finishCalibration(cadence.data.sessionSteps, gps.data.smoothedDistance)}
              >
                Finalizar calibracao
              </button>
            )}
            <button className="secondary-btn" onClick={cal.reset}>Reset calibracao</button>
          </div>
        </section>

        {/* ── Historico recente ───────────────────────────────────────────── */}
        <section className="details-card">
          <div className="section-head">
            <h2>Treinos recentes</h2>
            <span className="mini-badge">{history.sessions.length}</span>
          </div>

          {history.sessions.length === 0 ? (
            <div className="map-placeholder" style={{ height: 90 }}>
              <span>Nenhum treino salvo ainda</span>
            </div>
          ) : (
            <div className="details-grid">
              {history.sessions.slice(0, 3).map((session) => (
                <div key={session.id}>
                  <InfoLine
                    label={new Date(session.endedAt).toLocaleString('pt-BR')}
                    value={`${(session.distanceM / 1000).toFixed(2)} km • ${formatElapsed(session.elapsedSeconds)}`}
                    sub={`Pace medio ${formatPace(session.averagePace)} • ${session.musicFileName || 'sem musica'}`}
                  />
                  <div className="calibration-actions" style={{ paddingTop: 6 }}>
                    <button className="secondary-btn" onClick={() => history.removeSession(session.id)}>
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {history.sessions.length > 0 && (
            <div className="calibration-actions">
              <button className="secondary-btn" onClick={exportHistory}>Exportar JSON</button>
              <button className="secondary-btn" onClick={() => importHistoryInputRef.current?.click()}>
                Importar JSON
              </button>
              <button className="secondary-btn" onClick={history.clearAll}>Limpar historico</button>
              <input
                ref={importHistoryInputRef}
                type="file"
                accept="application/json"
                onChange={handleImportHistory}
                style={{ display: 'none' }}
              />
            </div>
          )}
        </section>

        {/* ── Botoes fixos ───────────────────────────────────────────────── */}
        <footer className="bottom-actions">
          {!gpsActive && !gpsPaused ? (
            <button className="run-btn-main" onClick={handleStart}>▶ Iniciar corrida</button>
          ) : gpsActive ? (
            <button className="run-btn-main" onClick={handlePause}>⏸ Pausar corrida</button>
          ) : (
            <button className="run-btn-main" onClick={handleStart}>▶ Retomar corrida</button>
          )}
          {gpsActive || gpsPaused ? (
            <button className="reset-btn-main" onClick={handleStop}>■</button>
          ) : (
            <button className="reset-btn-main" onClick={handleReset}>↺</button>
          )}
        </footer>

      </main>
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function MetricCard({ color, label, value, unit }: {
  color: 'green' | 'blue' | 'orange';
  label: string;
  value: string | number;
  unit?: string;
}) {
  return (
    <div className={`metric-card-ui metric-${color}`}>
      <div className="metric-card-value">
        {value}{unit ? <span>{unit}</span> : null}
      </div>
      <div className="metric-card-label">{label}</div>
    </div>
  );
}

function InfoLine({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="info-line">
      <div>
        <div className="info-label">{label}</div>
        {sub ? <div className="info-sub">{sub}</div> : null}
      </div>
      <div className="info-value">{value}</div>
    </div>
  );
}

function formatElapsed(s: number): string {
  const m   = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
