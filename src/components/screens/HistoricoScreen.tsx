import { useMemo, useState } from 'react';
import './HistoricoScreen.css';

const periodData = {
  '7 dias': { totalKm: '35km', tempo: '3h26m', corridas: '7', media: '5:52', chart: [5, 5, 5, 5, 5, 5, 5, 7] },
  '30 dias': { totalKm: '148km', tempo: '14h58m', corridas: '28', media: '5:44', chart: [30, 32, 28, 25, 31, 27, 29, 34] },
  '100 dias': { totalKm: '574km', tempo: '53h48m', corridas: '100', media: '5:36', chart: [35, 35, 35, 35, 35, 35, 35, 40.2] },
  '365 dias': { totalKm: '1825km', tempo: '171h12m', corridas: '312', media: '5:29', chart: [150, 168, 142, 170, 160, 146, 180, 189] },
} as const;

type ScreenKey = 'treino' | 'musica' | 'tiro' | 'historico';

type HistoricoScreenProps = {
  onNavigate?: (screen: ScreenKey) => void;
};

export default function HistoricoScreen({ onNavigate }: HistoricoScreenProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<keyof typeof periodData>('100 dias');
  const [selectedSplit, setSelectedSplit] = useState(0);

  const currentPeriod = periodData[selectedPeriod];
  const weekData = currentPeriod.chart;
  const max = Math.max(...weekData);

  const splits = useMemo(() => {
    if (selectedPeriod === '7 dias') return ['4:52', '5:10', '4:58', '5:12', '5:06', '4:48'];
    if (selectedPeriod === '30 dias') return ['4:41', '5:24', '5:02', '5:17', '5:08', '4:39'];
    if (selectedPeriod === '365 dias') return ['4:28', '5:31', '4:56', '5:18', '5:09', '4:24'];
    return ['4:36', '5:36', '4:58', '5:24', '5:12', '4:28'];
  }, [selectedPeriod]);

  const splitsAvg = useMemo(() => {
    const toSeconds = (value: string) => {
      const [m, s] = value.split(':').map(Number);
      return m * 60 + s;
    };
    const avg = Math.round(splits.reduce((sum, value) => sum + toSeconds(value), 0) / splits.length);
    const min = Math.floor(avg / 60);
    const sec = String(avg % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }, [splits]);

  return (
    <div className="mock-phone historico-screen">
      <div className="header">
        <button className="menu-btn" type="button"><span /><span /><span /></button>
        <div className="app-logo">PACE UP</div>
        <div className="header-right" />
      </div>

      <div className="tabs">
        <button className="tab" type="button" onClick={() => onNavigate?.('treino')}>Treino</button>
        <button className="tab" type="button" onClick={() => onNavigate?.('musica')}>Música</button>
        <button className="tab" type="button" onClick={() => onNavigate?.('tiro')}>Tiro</button>
        <button className="tab active" type="button" onClick={() => onNavigate?.('historico')}>Histórico</button>
      </div>

      <div className="content">
        <div className="period-row">
          {(Object.keys(periodData) as Array<keyof typeof periodData>).map((period) => (
            <button key={period} className={`period-chip ${selectedPeriod === period ? 'active' : ''}`} type="button" onClick={() => setSelectedPeriod(period)}>{period}</button>
          ))}
        </div>

        <div className="challenge-banner">
          <div className="challenge-icon">🏆</div>
          <div className="challenge-text"><div className="challenge-name">Desafio 365</div><div className="challenge-sub">5 km por dia durante 1 ano</div></div>
          <div className="challenge-count">100<span>/365</span></div>
        </div>

        <div className="stats-grid">
          <div className="stat-box"><div className="sb-val accent">{currentPeriod.totalKm}</div><div className="sb-lbl">Total</div></div>
          <div className="stat-box"><div className="sb-val blue">{currentPeriod.tempo}</div><div className="sb-lbl">Tempo</div></div>
          <div className="stat-box"><div className="sb-val orange">{currentPeriod.corridas}</div><div className="sb-lbl">Corridas</div></div>
        </div>

        <div className="records-row">
          <div className="record-card"><div className="rc-lbl">Melhor Pace</div><div className="rc-val">4:36</div><div className="rc-date">Km 1 · 10 abr</div></div>
          <div className="record-card"><div className="rc-lbl">Pace Médio Geral</div><div className="rc-val">5:36</div><div className="rc-date">100 atividades</div></div>
        </div>

        <div className="chart-block">
          <div className="chart-header"><div className="chart-title">Km por Semana</div><div className="chart-total">↗ {weekData[weekData.length - 1]} km esta semana</div></div>
          <div className="chart-bars">
            {weekData.map((km, idx) => {
              const h = Math.max(8, (km / max) * 52);
              const today = idx === weekData.length - 1;
              return (
                <div className={`bar-wrap ${today ? 'today' : ''}`} key={`wk-${idx + 1}`}>
                  <div className={`bar ${today ? 'today' : 'active'}`} style={{ height: `${h}px` }} />
                  <div className="bar-lbl">S{idx + 1}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="section-label">Atividade Recente</div>
        <div className="activity-card">
          <div className="activity-header"><div><div className="activity-date">10 ABR 2026</div><div className="activity-type">Dia 100/365 · Redbull BR 17/21</div></div><div className="activity-badge">Corrida</div></div>
          <div className="activity-metrics">
            <div className="am-cell"><div className="am-val accent">5,74</div><div className="am-lbl">km</div></div>
            <div className="am-cell"><div className="am-val">32:14</div><div className="am-lbl">tempo</div></div>
            <div className="am-cell"><div className="am-val">5:36</div><div className="am-lbl">pace médio</div></div>
          </div>

          <div className="activity-details">
            <div className="ad-item"><div className="ad-val blue">162</div><div className="ad-lbl">cad. spm</div></div>
            <div className="ad-item"><div className="ad-val orange">45 m</div><div className="ad-lbl">ganho ele.</div></div>
            <div className="ad-item"><div className="ad-val purple">04:01</div><div className="ad-lbl">horário</div></div>
          </div>

          <div className="activity-map">
            <svg viewBox="0 0 340 90" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
              <rect width="340" height="90" fill="#111620" />
              <g stroke="#1a2030" strokeWidth="0.6" fill="none">
                <line x1="0" y1="22" x2="340" y2="22" />
                <line x1="0" y1="45" x2="340" y2="45" />
                <line x1="0" y1="67" x2="340" y2="67" />
                <line x1="68" y1="0" x2="68" y2="90" />
                <line x1="136" y1="0" x2="136" y2="90" />
                <line x1="204" y1="0" x2="204" y2="90" />
                <line x1="272" y1="0" x2="272" y2="90" />
              </g>

              <polyline
                points="197.0,28.0 230.5,42.2 288.1,37.3 292.5,23.8 243.2,9.6 190.3,16.7 130.8,30.3 66.5,44.1 43.8,59.7 88.7,71.9 148.5,69.2 199.8,56.9 258.2,44.9 311.7,31.7 270.5,17.8 229.3,7.1 183.1,15.8 133.2,27.1 86.4,38.0 38.3,49.3 44.3,60.8 87.0,71.3 136.2,71.8 180.8,62.1 223.7,51.4 272.9,41.7 313.7,32.0 276.6,19.6 234.7,7.1 187.9,15.0 140.4,23.6 96.2,34.7 50.7,46.7 36.7,58.1 85.0,70.6 145.3,76.9 188.4,59.5 246.6,46.6 299.0,35.4 284.4,23.0 245.5,10.4 192.0,14.6 141.1,24.8 95.2,35.8 44.7,47.4 40.6,59.5 84.4,70.9 137.9,72.4 184.9,61.6 227.0,51.1 274.6,40.7 316.7,29.4 271.4,18.3 223.1,6.9 180.0,17.5 129.2,28.1 73.6,40.0 28.7,50.9 52.2,63.4 97.8,73.7 149.6,69.5 194.0,58.4 245.2,47.5 288.1,37.6 303.1,27.3 264.0,15.2 221.4,6.6 169.5,20.3"
                fill="none"
                stroke="#00e5a0"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.8"
              />
              <circle cx="197.0" cy="28.0" r="4" fill="#4d9fff" stroke="#0d0f14" strokeWidth="1.5" />
              <circle cx="169.5" cy="20.3" r="5" fill="#4d9fff" stroke="white" strokeWidth="1.5" />
              <circle cx="169.5" cy="20.3" r="9" fill="none" stroke="#4d9fff" strokeWidth="0.8" opacity="0.4" />
            </svg>
          </div>
        </div>

        <div className="splits-block">
          <div className="splits-header">
            <div className="splits-title">Splits por Km</div>
            <div className="splits-avg">Média {splitsAvg}</div>
          </div>

          <div className={`split-row ${selectedSplit === 0 ? 'is-selected' : ''}`} onClick={() => setSelectedSplit(0)}>
            <div className="split-km">Km 1</div>
            <div className="split-bar-wrap"><div className="split-bar-bg" /><div className="split-bar-fill" style={{ width: '62%', background: 'var(--accent)' }} /></div>
            <div className="split-pace best">{splits[0]}</div>
          </div>
          <div className={`split-row ${selectedSplit === 1 ? 'is-selected' : ''}`} onClick={() => setSelectedSplit(1)}>
            <div className="split-km">Km 2</div>
            <div className="split-bar-wrap"><div className="split-bar-bg" /><div className="split-bar-fill" style={{ width: '90%', background: '#4d9fff' }} /></div>
            <div className="split-pace slow">{splits[1]}</div>
          </div>
          <div className={`split-row ${selectedSplit === 2 ? 'is-selected' : ''}`} onClick={() => setSelectedSplit(2)}>
            <div className="split-km">Km 3</div>
            <div className="split-bar-wrap"><div className="split-bar-bg" /><div className="split-bar-fill" style={{ width: '78%', background: 'var(--accent)', opacity: 0.7 }} /></div>
            <div className="split-pace">{splits[2]}</div>
          </div>
          <div className={`split-row ${selectedSplit === 3 ? 'is-selected' : ''}`} onClick={() => setSelectedSplit(3)}>
            <div className="split-km">Km 4</div>
            <div className="split-bar-wrap"><div className="split-bar-bg" /><div className="split-bar-fill" style={{ width: '85%', background: '#4d9fff', opacity: 0.7 }} /></div>
            <div className="split-pace">{splits[3]}</div>
          </div>
          <div className={`split-row ${selectedSplit === 4 ? 'is-selected' : ''}`} onClick={() => setSelectedSplit(4)}>
            <div className="split-km">Km 5</div>
            <div className="split-bar-wrap"><div className="split-bar-bg" /><div className="split-bar-fill" style={{ width: '82%', background: 'var(--accent)', opacity: 0.6 }} /></div>
            <div className="split-pace">{splits[4]}</div>
          </div>
          <div className={`split-row ${selectedSplit === 5 ? 'is-selected' : ''}`} onClick={() => setSelectedSplit(5)}>
            <div className="split-km split-km-partial">+0,74</div>
            <div className="split-bar-wrap"><div className="split-bar-bg" /><div className="split-bar-fill" style={{ width: '55%', background: 'var(--muted)', opacity: 0.5 }} /></div>
            <div className="split-pace split-pace-muted">{splits[5]}</div>
          </div>
        </div>

        <div className="elev-block">
          <div className="elev-header">
            <div className="elev-title">Perfil de Elevação</div>
            <div className="elev-stats">
              <div className="elev-stat"><div className="ev up">+45 m</div><div className="el">ganho</div></div>
              <div className="elev-stat"><div className="ev dn">−40 m</div><div className="el">perda</div></div>
              <div className="elev-stat"><div className="ev">381 m</div><div className="el">máximo</div></div>
            </div>
          </div>
          <div className="elev-chart">
            <svg viewBox="0 0 310 50" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00e5a0" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#00e5a0" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d="M0,25 C15,20 25,18 40,22 S60,30 80,28 S110,18 130,20 S160,26 180,22 S205,15 225,18 S255,24 270,20 S290,16 310,18 L310,50 L0,50 Z" fill="url(#elevGrad)" />
              <path d="M0,25 C15,20 25,18 40,22 S60,30 80,28 S110,18 130,20 S160,26 180,22 S205,15 225,18 S255,24 270,20 S290,16 310,18" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
              <text x="0" y="48" fill="#6b7490" fontSize="7" fontFamily="monospace">376m</text>
              <text x="270" y="13" fill="#6b7490" fontSize="7" fontFamily="monospace">381m</text>
            </svg>
          </div>
        </div>

        <div className="cadence-card-extended">
          <div className="cadence-title">Cadência</div>
          <div className="cadence-body">
            <div className="cadence-left">
              <div className="cadence-value">162</div>
              <div className="cadence-sub">passos/min · esta corrida</div>
            </div>
            <div className="cadence-right">
              <div className="cadence-right-label">Ideal corrida</div>
              <div className="cadence-right-value">170–180</div>
              <div className="cadence-right-sub">spm recomendado</div>
            </div>
          </div>
          <div className="cadence-range">
            <div className="cadence-range-fill" style={{ width: '54%' }} />
          </div>
          <div className="cadence-scale">
            <span>140</span>
            <span className="current">↑ 162</span>
            <span>200</span>
          </div>
        </div>
      </div>

    </div>
  );
}
