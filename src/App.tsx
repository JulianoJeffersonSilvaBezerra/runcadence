// ============================================================
// ARQUIVO DE TESTE — DIAGNÓSTICO DE CRASH
// 
// PASSO 1: Este arquivo testa SÓ O GPS.
// Se o app NÃO fechar → problema está no pedômetro.
// Se o app FECHAR     → problema está no GPS.
//
// Após o teste, troque para App_teste_pedometro.tsx (renomeie para App.tsx)
// ============================================================

import { useGPS, formatPace } from './hooks/useGPS';
import './App.css';

export default function App() {
  const gps = useGPS();

  return (
    <div className="debug-screen">
      <h1>🔍 Teste GPS</h1>

      {gps.data.error && (
        <div className="error-box">⚠️ {gps.data.error}</div>
      )}

      <section className="block">
        <h2>Status GPS</h2>
        <Row label="Status"       value={gps.data.status} />
        <Row label="Precisão"     value={gps.data.accuracy} unit="m" />
        <Row label="Velocidade"   value={gps.data.speedMs} unit="m/s" />
        <Row label="Distância"    value={gps.data.smoothedDistance} unit="m" />
        <Row label="Pace médio"   value={formatPace(gps.data.averagePace)} unit="min/km" />
      </section>

      <div className="btn-row">
        {gps.data.status !== 'active' ? (
          <button className="btn btn-start" onClick={() => gps.start()}>
            ▶ Iniciar GPS
          </button>
        ) : (
          <button className="btn btn-stop" onClick={() => gps.stop()}>
            ■ Parar GPS
          </button>
        )}
      </div>

      <p style={{ marginTop: 20, color: '#666', fontSize: 12 }}>
        Se o app não fechar aqui → problema está no pedômetro.{'\n'}
        Se fechar → problema está no GPS.
      </p>
    </div>
  );
}

function Row({ label, value, unit = '' }: {
  label: string; value: string | number; unit?: string;
}) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span className="value">{value}{unit ? ` ${unit}` : ''}</span>
    </div>
  );
}
