import gpxData from '../data/gpx-metrics.json';

type GpxRun = {
  runKey: string;
  runName: string;
  date: string | null;
  startedAt: string | null;
  distanceKm: number;
  durationSeconds: number;
  averagePaceMinKm: number;
  elevationGainM: number;
  avgCadenceSpm: number | null;
  pointCount: number;
};

type WeeklyMetric = {
  week: string;
  runs: number;
  distanceKm: number;
};

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatPace(minKm: number): string {
  if (!Number.isFinite(minKm) || minKm <= 0) return '--:--';
  const minutes = Math.floor(minKm);
  const seconds = Math.round((minKm - minutes) * 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function GpxDashboard() {
  const metadata = gpxData.metadata;
  const runs = [...(gpxData.runs as GpxRun[])].sort((a, b) => {
    if (!a.startedAt && !b.startedAt) return 0;
    if (!a.startedAt) return 1;
    if (!b.startedAt) return -1;
    return b.startedAt.localeCompare(a.startedAt);
  });

  const lastRuns = runs.slice(0, 8);
  const weekly = (metadata.weekly as WeeklyMetric[]).slice(-10);
  const weeklyMax = Math.max(...weekly.map((item) => item.distanceKm), 1);

  return (
    <section className="details-card gpx-dashboard-card">
      <div className="section-head">
        <h2>Dashboard GPX</h2>
        <span className="mini-badge">{metadata.totalRuns} arquivos</span>
      </div>

      <p className="gpx-dashboard-subtitle">
        Visao consolidada dos treinos importados dos seus arquivos GPX.
      </p>

      <div className="gpx-kpi-grid">
        <div className="gpx-kpi-box">
          <span>Total percorrido</span>
          <strong>{metadata.totalDistanceKm.toFixed(2)} km</strong>
        </div>
        <div className="gpx-kpi-box">
          <span>Tempo total</span>
          <strong>{formatDuration(metadata.totalDurationSeconds)}</strong>
        </div>
        <div className="gpx-kpi-box">
          <span>Pace medio geral</span>
          <strong>{formatPace(metadata.averagePaceMinKm)} /km</strong>
        </div>
        <div className="gpx-kpi-box">
          <span>Elevacao positiva</span>
          <strong>{metadata.totalElevationGainM.toFixed(0)} m</strong>
        </div>
      </div>

      <div className="gpx-highlight-grid">
        <div className="gpx-highlight-box">
          <span>Melhor pace</span>
          <strong>{formatPace(metadata.fastestRun?.averagePaceMinKm || 0)} /km</strong>
          <small>{metadata.fastestRun?.runName || 'sem dados'}</small>
        </div>
        <div className="gpx-highlight-box">
          <span>Maior distancia</span>
          <strong>{(metadata.longestRun?.distanceKm || 0).toFixed(2)} km</strong>
          <small>{metadata.longestRun?.runName || 'sem dados'}</small>
        </div>
      </div>

      {weekly.length > 0 && (
        <div className="gpx-weekly-card">
          <div className="data-chart-label">Volume semanal (km)</div>
          <div className="gpx-weekly-bars">
            {weekly.map((item) => (
              <div key={item.week} className="gpx-weekly-item" title={`${item.week} - ${item.distanceKm.toFixed(2)} km`}>
                <div className="gpx-weekly-bar-wrap">
                  <div
                    className="gpx-weekly-bar"
                    style={{ height: `${Math.max(8, (item.distanceKm / weeklyMax) * 100)}%` }}
                  />
                </div>
                <span>{item.week.slice(-2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="gpx-table-wrap">
        <table className="gpx-table">
          <thead>
            <tr>
              <th>Data</th>
              <th>Distancia</th>
              <th>Pace</th>
              <th>Tempo</th>
              <th>Alt+</th>
              <th>Cadencia</th>
            </tr>
          </thead>
          <tbody>
            {lastRuns.map((run) => (
              <tr key={run.runKey}>
                <td>{run.date || '--'}</td>
                <td>{run.distanceKm.toFixed(2)} km</td>
                <td>{formatPace(run.averagePaceMinKm)}</td>
                <td>{formatDuration(run.durationSeconds)}</td>
                <td>{run.elevationGainM.toFixed(0)} m</td>
                <td>{run.avgCadenceSpm ? `${Math.round(run.avgCadenceSpm)} spm` : '--'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gpx-footnote">
        Ultima atualizacao do dataset: {new Date(metadata.generatedAt).toLocaleString('pt-BR')}
      </div>
    </section>
  );
}
