import { useState } from 'react';
import './TiroScreen.css';

type ScreenKey = 'treino' | 'musica' | 'tiro' | 'historico';

type TiroScreenProps = {
  onNavigate?: (screen: ScreenKey) => void;
};

export default function TiroScreen({ onNavigate }: TiroScreenProps) {
  const [coachVoiceOn, setCoachVoiceOn] = useState(true);
  const [autoMode, setAutoMode] = useState(true);
  const [running, setRunning] = useState(false);
  const [intervalIndex, setIntervalIndex] = useState(4);
  const [distancePerTiro, setDistancePerTiro] = useState(1000);
  const [restMin, setRestMin] = useState(1);
  const [repeatCount, setRepeatCount] = useState(10);
  const [remainingDistance, setRemainingDistance] = useState(400);
  const [elapsedSeconds, setElapsedSeconds] = useState(70);

  function advanceInterval() {
    setIntervalIndex((prev) => (prev >= repeatCount ? 1 : prev + 1));
    setRemainingDistance((prev) => Math.max(0, prev - 100));
    setElapsedSeconds((prev) => prev + 8);
  }

  function resetWorkout() {
    setRunning(false);
    setIntervalIndex(1);
    setRemainingDistance(distancePerTiro);
    setElapsedSeconds(0);
  }

  const elapsedMin = Math.floor(elapsedSeconds / 60);
  const elapsedSec = String(elapsedSeconds % 60).padStart(2, '0');

  return (
    <div className="mock-phone tiro-screen">
      <div className="header">
        <button className="menu-btn" type="button"><span /><span /><span /></button>
        <div className="app-logo">PACE UP</div>
        <button className={`coach-btn ${coachVoiceOn ? 'is-on' : ''}`} type="button" onClick={() => setCoachVoiceOn((prev) => !prev)}>{coachVoiceOn ? 'Treinador ON' : 'Treinador OFF'}</button>
      </div>

      <div className="tabs">
        <button className="tab" type="button" onClick={() => onNavigate?.('treino')}>Treino</button>
        <button className="tab" type="button" onClick={() => onNavigate?.('musica')}>Música</button>
        <button className="tab active" type="button" onClick={() => onNavigate?.('tiro')}>Tiro</button>
        <button className="tab" type="button" onClick={() => onNavigate?.('historico')}>Histórico</button>
      </div>

      <div className="content">
        <div className="top-row">
          <div className="pace-now"><div className="lbl">Pace Atual</div><div className="val">4:30</div><div className="unit">min/km</div></div>
          <div className="dist-done"><div className="lbl">Distância Percorrida</div><div className="val">{Math.max(0, distancePerTiro - remainingDistance)}<span className="unit">m</span></div></div>
          <button className="coach-voice-tag" type="button" onClick={advanceInterval}>Próximo</button>
        </div>

        <div className="center-block">
          <div className="side-nums left"><div className="num-label">Inicia</div><div className="num-val">3</div><div className="num-val">2</div><div className="num-val active">{running ? 'GO' : '1'}</div></div>
          <div className="big-circle"><div className="dist-val">{remainingDistance}</div><div className="dist-unit">metros restantes</div><div className="timer">{elapsedMin}:{elapsedSec}</div><div className="timer-sub">tempo decorrido</div></div>
          <div className="side-nums"><div className="num-label">Fim em</div><div className="num-val">3</div><div className="num-val">2</div><div className="num-val active">1</div></div>
        </div>

        <div className="intervals-wrap">
          <div className="intervals-lbl"><span>Intervalos</span><span>Descanso entre intervalos</span></div>
          <div className="dots-row">
            <div className="dot warmup">A</div>
            {Array.from({ length: repeatCount }, (_, idx) => {
              const value = idx + 1;
              const cls = value < intervalIndex ? 'dot done' : value === intervalIndex ? 'dot current' : 'dot';
              return <div key={`dot-${value}`} className={cls}>{value}</div>;
            })}
            <div className="dot cooldown">D</div>
          </div>
        </div>

        <div className="edit-row">
          <button className="edit-card" type="button" onClick={() => setDistancePerTiro((prev) => (prev >= 2000 ? 400 : prev + 200))}><div className="ec-val">{distancePerTiro.toLocaleString('pt-BR')}m</div><div className="ec-lbl">Distância do Tiro</div></button>
          <button className="edit-card" type="button" onClick={() => setRestMin((prev) => (prev >= 5 ? 1 : prev + 1))}><div className="ec-val">{restMin} min</div><div className="ec-lbl">Descanso</div></button>
          <button className="edit-card" type="button" onClick={() => setRepeatCount((prev) => (prev >= 15 ? 4 : prev + 1))}><div className="ec-val">{repeatCount}</div><div className="ec-lbl">Repetição</div></button>
        </div>

        <div className="warmup-row">
          <button className="warmup-card" type="button"><div className="wc-lbl">Aquecimento / Desaquecimento</div><div className="wc-val">Configurar ›</div></button>
          <div className="dist-total-card"><div className="dt-val">7,35km</div><div className="dt-lbl">Distância Total</div></div>
        </div>

        <div className="times-block">
          <div className="t-title">Tempo de Cada Tiro</div>
          <div className="times-grid">
            {['01:10', '00:00', '00:00', '00:00', '00:00', '--:--', '--:--', '--:--', '--:--', '--:--'].map((time, idx) => (
              <div className="time-item" key={`tiro-${idx + 1}`}><span className="ti-num">{idx + 1}</span><span className={`ti-val ${time === '--:--' ? 'pending' : 'done'}`}>{time}</span></div>
            ))}
          </div>
        </div>

        <div className="actions-row"><button className="action-btn secondary" type="button" onClick={() => setRunning(true)}>Início</button><button className={`action-btn ${autoMode ? 'primary' : ''}`} type="button" onClick={() => { setAutoMode((prev) => !prev); if (running) advanceInterval(); }}>{autoMode ? 'Modo Automático' : 'Modo Manual'}</button><button className="action-btn" type="button" onClick={resetWorkout}>Fim</button></div>
      </div>

    </div>
  );
}
