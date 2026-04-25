import { useState } from 'react';
import { GPSMap } from '../GPSMap';
import { formatPace, useGPS } from '../../hooks/useGPS';
import './TreinoScreen.css';

type ScreenKey = 'treino' | 'musica' | 'tiro' | 'historico';

type TreinoScreenProps = {
  onNavigate?: (screen: ScreenKey) => void;
};

export default function TreinoScreen({ onNavigate }: TreinoScreenProps) {
  const gps = useGPS();
  const tracks = [
    { name: 'Given Up', artist: 'Linkin Park' },
    { name: 'Numb', artist: 'Linkin Park' },
    { name: 'Can t Hold Us', artist: 'Macklemore' },
  ];

  const [bpm, setBpm] = useState(186);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatOn, setRepeatOn] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);

  const isRunning = gps.data.status === 'active' || gps.data.status === 'starting';
  const isGpsTracking = gps.data.status === 'active' || gps.data.status === 'paused';
  const paceAtual = gps.data.averagePace > 0 ? formatPace(gps.data.averagePace) : '5:05';
  const tempoAtividade = formatDuration(gps.data.elapsedSeconds) || '00:09:00';
  const distanciaKm = gps.data.smoothedDistance > 0
    ? (gps.data.smoothedDistance / 1000).toFixed(2).replace('.', ',')
    : '1,24';
  const cadenceValue = gps.data.speedMs > 0 ? Math.round(150 + gps.data.speedMs * 8) : 162;
  const strideValue = gps.data.speedMs > 0
    ? (1000 / Math.max(cadenceValue, 1) * 1.15).toFixed(2).replace('.', ',')
    : '0,99';

  function nextTrack() {
    setTrackIndex((prev) => (prev + 1) % tracks.length);
  }

  function prevTrack() {
    setTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
  }

  function changeBpm(delta: number) {
    setBpm((prev) => Math.max(90, Math.min(220, prev + delta)));
  }

  function formatDuration(totalSeconds: number) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);

    if (hours > 0) {
      return [hours, minutes, seconds]
        .map((part) => String(part).padStart(2, '0'))
        .join(':');
    }

    return [minutes, seconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }

  async function toggleRun() {
    if (isRunning) {
      await gps.pause();
      return;
    }

    if (gps.data.status === 'paused') {
      await gps.resume();
    } else {
      await gps.start();
    }
  }

  async function stopRun() {
    await gps.stop();
    setIsPlaying(false);
  }

  return (
    <div className="treino-screen">
      <div className="phone">
        <div className="header">
          <button className="menu-btn" aria-label="Abrir menu" type="button">
            <span />
            <span />
            <span />
          </button>

          <div className="app-logo">PACE UP</div>

          <div className="header-right" />
        </div>

        <div className="tabs">
          <button className="tab active" type="button" onClick={() => onNavigate?.('treino')}>
            Treino
          </button>
          <button className="tab" type="button" onClick={() => onNavigate?.('musica')}>
            Música
          </button>
          <button className="tab" type="button" onClick={() => onNavigate?.('tiro')}>
            Tiro
          </button>
          <button className="tab" type="button" onClick={() => onNavigate?.('historico')}>
            Histórico
          </button>
        </div>

        <div className="content">
          <div className="status-row">
            <div className={`status-pill ${isRunning ? 'is-running' : ''}`}>
              <div className="status-dot" />
              {isRunning ? 'Correndo' : 'Pausado'}
            </div>

            <div className={`gps-chip ${isGpsTracking ? 'is-active' : ''}`}>
              <div className="gps-dot" />
              {gps.data.status === 'paused' ? 'GPS Pausado' : gps.data.status === 'active' ? 'GPS Ao Vivo' : 'GPS Pronto'}
            </div>
          </div>

          <div className="map-wrap">
            <div className="map-badge">Trajeto ao Vivo</div>
            <GPSMap
              routePoints={gps.data.routePoints}
              currentLat={gps.data.lat}
              currentLng={gps.data.lng}
              isActive={gps.data.status === 'active'}
            />
          </div>

          <div className="pace-hero">
            <div className="pace-hero-main">
              <div className="pace-hero-lbl">Pace Atual</div>
              <div className="pace-hero-val">{paceAtual}</div>
              <div className="pace-hero-unit">min/km</div>
            </div>

            <div className="pace-divider" />

            <div className="pace-hero-side">
              <div className="pace-music-lbl">Pace da Música</div>
              <div className="pace-music-val">4:49</div>
              <div className="pace-music-sub">min/km</div>
            </div>
          </div>

          <div className="metrics-grid">
            <div className="metric-card">
              <div className="mc-lbl">Distância</div>
              <div className="mc-val accent">
                {distanciaKm}
                <span className="mc-unit">km</span>
              </div>
            </div>

            <div className="metric-card blue">
              <div className="mc-lbl">Tempo Atividade</div>
              <div className="mc-val blue mc-tempo">{tempoAtividade}</div>
            </div>

            <div className="metric-card orange">
              <div className="mc-lbl">Cadência</div>
              <div className="mc-val mc-orange">
                {cadenceValue}
                <span className="mc-unit">spm</span>
              </div>
            </div>

            <div className="metric-card purple">
              <div className="mc-lbl">Passada</div>
              <div className="mc-val mc-purple">
                {strideValue}
                <span className="mc-unit">m</span>
              </div>
            </div>
          </div>

          <div className="bpm-block">
            <div className="bpm-block-title">Controle de BPM</div>

            <div className="bpm-row">
              <button className="bpm-btn" aria-label="Diminuir BPM" type="button" onClick={() => changeBpm(-1)}>
                −
              </button>

              <div className="bpm-display">
                {bpm}
                <span className="bpm-unit">BPM</span>
              </div>

              <button className="bpm-btn" aria-label="Aumentar BPM" type="button" onClick={() => changeBpm(1)}>
                +
              </button>
            </div>
          </div>

          <div className="track-row">
            <div className="track-icon">🎵</div>

            <div className="track-info">
              <div className="track-name">{tracks[trackIndex].name}</div>
              <div className="track-meta">{tracks[trackIndex].artist} · {bpm} BPM</div>
            </div>

            <button className="add-btn" type="button" onClick={nextTrack}>
              ♪ +
            </button>
          </div>

          <div className="player-block">
            <div className="player-row">
              <button className={`pc-btn small ${repeatOn ? 'is-active' : ''}`} title="Repetir" type="button" onClick={() => setRepeatOn((prev) => !prev)}>
                🔁
              </button>
              <button className="pc-btn" title="Voltar" type="button" onClick={prevTrack}>
                ⏮
              </button>
              <button className="pc-btn play" title="Play/Pause" type="button" onClick={() => setIsPlaying((prev) => !prev)}>
                {isPlaying ? '❚❚' : '▶'}
              </button>
              <button className="pc-btn" title="Próxima" type="button" onClick={nextTrack}>
                ⏭
              </button>
              <button className={`pc-btn small ${queueOpen ? 'is-active' : ''}`} title="Lista" type="button" onClick={() => setQueueOpen((prev) => !prev)}>
                ≡
              </button>
            </div>

            <div className="player-labels">
              <span className="pl-lbl">
                Repetir
                <br />
                Música
              </span>
              <span className="pl-lbl">
                Voltar
                <br />
                Música
              </span>
              <span className="pl-lbl">
                Play /
                <br />
                Pause
              </span>
              <span className="pl-lbl">
                Passar
                <br />
                Música
              </span>
              <span className="pl-lbl">
                Lista de
                <br />
                Música
              </span>
            </div>

            {queueOpen && (
              <div className="queue-panel">
                {tracks.map((track, idx) => (
                  <button
                    key={`${track.name}-${idx}`}
                    type="button"
                    className={`queue-item ${idx === trackIndex ? 'active' : ''}`}
                    onClick={() => setTrackIndex(idx)}
                  >
                    {track.name} · {track.artist}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="start-row">
            <button className="btn-start" type="button" onClick={() => { void toggleRun(); }}>
              {isRunning ? '❚❚  PAUSAR CORRIDA' : '▶  INICIAR CORRIDA'}
            </button>
            <button className="btn-stop" type="button" onClick={() => { void stopRun(); }}>
              ■
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
