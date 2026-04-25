import { useState } from 'react';
import './MusicScreen.css';

type ScreenKey = 'treino' | 'musica' | 'tiro' | 'historico';

type MusicScreenProps = {
  onNavigate?: (screen: ScreenKey) => void;
};

export default function MusicScreen({ onNavigate }: MusicScreenProps) {
  const tracks = [
    { name: 'Given Up', artist: 'Linkin Park' },
    { name: 'Don t Stop Me Now', artist: 'Queen' },
    { name: 'Titanium', artist: 'David Guetta' },
  ];

  const [autoAdjust, setAutoAdjust] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [repeatOne, setRepeatOne] = useState(false);
  const [repeatAll, setRepeatAll] = useState(true);
  const [shuffleOn, setShuffleOn] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [bpm, setBpm] = useState(180);
  const [manualBpm, setManualBpm] = useState(176);
  const [progressPct, setProgressPct] = useState(38);
  const [trackIndex, setTrackIndex] = useState(0);

  function changeBpm(delta: number) {
    setBpm((prev) => Math.max(80, Math.min(220, prev + delta)));
  }

  function changeManualBpm(delta: number) {
    setManualBpm((prev) => Math.max(80, Math.min(220, prev + delta)));
  }

  function changeProgress(delta: number) {
    setProgressPct((prev) => Math.max(0, Math.min(100, prev + delta)));
  }

  function nextTrack() {
    setTrackIndex((prev) => (prev + 1) % tracks.length);
    setProgressPct(0);
  }

  function prevTrack() {
    setTrackIndex((prev) => (prev - 1 + tracks.length) % tracks.length);
    setProgressPct(0);
  }

  const totalSeconds = 170;
  const currentSeconds = Math.round((progressPct / 100) * totalSeconds);
  const leftMin = Math.floor(currentSeconds / 60);
  const leftSec = String(currentSeconds % 60).padStart(2, '0');
  const rightSeconds = Math.max(0, totalSeconds - currentSeconds);
  const rightMin = Math.floor(rightSeconds / 60);
  const rightSec = String(rightSeconds % 60).padStart(2, '0');

  return (
    <div className="mock-phone music-screen">
      <div className="header">
        <button className="menu-btn" type="button"><span /><span /><span /></button>
        <div className="app-logo">PACE UP</div>
        <div className="header-right" />
      </div>

      <div className="tabs">
        <button className="tab" type="button" onClick={() => onNavigate?.('treino')}>Treino</button>
        <button className="tab active" type="button" onClick={() => onNavigate?.('musica')}>Música</button>
        <button className="tab" type="button" onClick={() => onNavigate?.('tiro')}>Tiro</button>
        <button className="tab" type="button" onClick={() => onNavigate?.('historico')}>Histórico</button>
      </div>

      <div className="content">
        <div className="pace-grid">
          <div className="pace-card"><div className="label">Pace Atual</div><div className="value">5:53<span className="unit">min/km</span></div></div>
          <div className="pace-card"><div className="label">Pace da Música</div><div className="value accent">6:00<span className="unit">min/km</span></div></div>
        </div>

        <div className="info-row">
          <div className="info-item"><div className="lbl">BPM Música</div><div className="val">180</div></div>
          <div className="info-item"><div className="lbl">Cadência/min</div><div className="val">180</div></div>
          <div className="info-item"><div className="lbl">Passada</div><div className="val">0,99m</div></div>
        </div>

        <div className="toggle-row">
          <div><div className="toggle-label">Ajuste Automático</div><div className="toggle-sub">De acordo com a velocidade do corredor</div></div>
          <button className={`toggle ${autoAdjust ? 'is-on' : 'is-off'}`} type="button" onClick={() => setAutoAdjust((prev) => !prev)} aria-label="Ativar ajuste automático" />
        </div>

        <div className="metronome-block">
          <div className="blk-title">Metrônomo</div>
          <div className="bpm-row"><button className="bpm-btn" type="button" onClick={() => changeBpm(-1)}>-</button><div className="bpm-display">{bpm} <span className="bpm-unit">BPM</span></div><button className="bpm-btn" type="button" onClick={() => changeBpm(1)}>+</button></div>
          <div className="vel-manual-label">Velocidade Manual</div>
          <div className="bpm-row compact"><button className="bpm-btn" type="button" onClick={() => changeManualBpm(-1)}>-</button><div className="bpm-display small">{manualBpm} BPM</div><button className="bpm-btn" type="button" onClick={() => changeManualBpm(1)}>+</button></div>
        </div>

        <div className="track-progress">
          <div className="time-row"><span>{leftMin}:{leftSec}</span><span className={`live ${isPlaying ? 'is-on' : ''}`}>● AO VIVO</span><span>{rightMin}:{rightSec}</span></div>
          <div className="waveform" />
          <div className="progress-bar"><div className="progress-fill" style={{ width: `${progressPct}%` }} /><div className="progress-dot" style={{ left: `${progressPct}%` }} /></div>
        </div>

        <div className="track-info">
          <div className="track-text"><div className="track-name">{tracks[trackIndex].name}</div><div className="track-meta">{tracks[trackIndex].artist}</div></div>
          <button className="add-music-btn" type="button" onClick={nextTrack}>♪ +</button>
        </div>

        <div className="player-controls">
          <div className="controls-top">
            <button className={`ctrl-btn small ${repeatOne ? 'is-active' : ''}`} type="button" onClick={() => setRepeatOne((prev) => !prev)}>🔂</button><button className={`ctrl-btn small ${repeatAll ? 'is-active' : ''}`} type="button" onClick={() => setRepeatAll((prev) => !prev)}>🔁</button>
            <button className="ctrl-btn" type="button" onClick={prevTrack}>⏮</button><button className="ctrl-btn play-btn" type="button" onClick={() => setIsPlaying((prev) => !prev)}>{isPlaying ? '❚❚' : '▶'}</button>
            <button className="ctrl-btn" type="button" onClick={nextTrack}>⏭</button><button className={`ctrl-btn small ${shuffleOn ? 'is-active' : ''}`} type="button" onClick={() => setShuffleOn((prev) => !prev)}>🔀</button>
          </div>
          <div className="controls-bottom">
            <button className="skip-btn" type="button" onClick={() => changeProgress(-6)}><span className="sec">10s</span>Voltar</button>
            <button className="pause-center" type="button" onClick={() => setIsPlaying((prev) => !prev)}>{isPlaying ? '⏸' : '▶'}</button>
            <button className="skip-btn" type="button" onClick={() => changeProgress(6)}><span className="sec">10s</span>Avançar</button>
            <button className={`queue-btn ${queueOpen ? 'is-active' : ''}`} type="button" onClick={() => setQueueOpen((prev) => !prev)}>≡</button>
          </div>

          {queueOpen && (
            <div className="queue-panel">
              {tracks.map((track, idx) => (
                <button
                  type="button"
                  key={`${track.name}-${idx}`}
                  className={`queue-item ${idx === trackIndex ? 'active' : ''}`}
                  onClick={() => setTrackIndex(idx)}
                >
                  {track.name} · {track.artist}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
