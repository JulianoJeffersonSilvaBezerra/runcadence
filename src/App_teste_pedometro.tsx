// ============================================================
// ARQUIVO DE TESTE — SÓ O PEDÔMETRO
//
// PASSO 2: Renomeie este arquivo para App.tsx (substitua o anterior)
// Se o app FECHAR aqui → problema confirmado no pedômetro/permissão.
// ============================================================

import { useStepCounter } from './hooks/useStepCounter';
import './App.css';

export default function App() {
  const steps = useStepCounter();

  return (
    <div className="debug-screen">
      <h1>🔍 Teste Pedômetro</h1>

      {steps.data.error && (
        <div className="error-box">⚠️ {steps.data.error}</div>
      )}

      <section className="block">
        <h2>Status Pedômetro</h2>
        <Row label="Status"         value={steps.data.sensorStatus} />
        <Row label="Total de passos" value={steps.data.totalSteps} />
        <Row label="Passos sessão"  value={steps.data.sessionSteps} />
        <Row label="Passos/min"     value={steps.data.stepsPerMinute} unit="spm" />
        <Row label="Tempo"          value={formatElapsed(steps.data.elapsedSeconds)} />
      </section>

      <div className="btn-row">
        {steps.data.sensorStatus !== 'active' ? (
          <button className="btn btn-start" onClick={() => steps.start()}>
            ▶ Iniciar Pedômetro
          </button>
        ) : (
          <button className="btn btn-stop" onClick={() => steps.stop()}>
            ■ Parar
          </button>
        )}
      </div>

      <p style={{ marginTop: 20, color: '#666', fontSize: 12 }}>
        Se o app fechar aqui → problema confirmado no pedômetro.
        Anote a mensagem de erro se aparecer antes de fechar.
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

function formatElapsed(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}
