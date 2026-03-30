import { useState, useRef } from 'react';

// BUG ORIGINAL: calibração sem nenhuma validação.
// Passada podia ficar 0 (se steps = 0) ou absurda (se GPS errado).
const MIN_DIST_M = 200;     // distância mínima para calibrar
const MIN_STEPS = 50;       // passos mínimos
const MIN_STRIDE_M = 0.5;   // passada humana mínima
const MAX_STRIDE_M = 2.5;   // passada humana máxima

export function useCalibration() {
  const [data, setData] = useState({
    status: 'idle' as 'idle' | 'running' | 'done' | 'error',
    strideM: 1.12,           // valor padrão mais próximo da realidade (antes era 1.1)
    sessionCount: 0,
    error: null as string | null,
  });

  const startSteps = useRef(0);
  const startDist = useRef(0);

  // Histórico para média ponderada entre sessões
  const historyRef = useRef<number[]>([1.12]);

  const startCalibration = (steps: number, dist: number) => {
    startSteps.current = steps;
    startDist.current = dist;
    setData((d) => ({ ...d, status: 'running', error: null }));
  };

  const finishCalibration = (steps: number, dist: number) => {
    const deltaSteps = steps - startSteps.current;
    const deltaDist = dist - startDist.current;

    // BUG ORIGINAL: sem validação — aceitar deltaSteps > 0 era suficiente,
    // o que produzia passadas impossíveis com GPS ruim ou calibração curta.
    if (deltaDist < MIN_DIST_M) {
      setData((d) => ({
        ...d,
        status: 'error',
        error: `Distância curta demais: ${Math.round(deltaDist)}m. Mínimo: ${MIN_DIST_M}m.`,
      }));
      return;
    }

    if (deltaSteps < MIN_STEPS) {
      setData((d) => ({
        ...d,
        status: 'error',
        error: `Passos insuficientes: ${deltaSteps}. Continue por mais tempo.`,
      }));
      return;
    }

    const rawStride = deltaDist / deltaSteps;

    if (rawStride < MIN_STRIDE_M || rawStride > MAX_STRIDE_M) {
      setData((d) => ({
        ...d,
        status: 'error',
        error: `Passada fora do esperado: ${rawStride.toFixed(3)}m. Verifique os sensores.`,
      }));
      return;
    }

    // Média ponderada: sessões mais recentes têm peso maior
    historyRef.current.push(rawStride);
    if (historyRef.current.length > 5) historyRef.current.shift();

    const weights = historyRef.current.map((_, i) => i + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    const weighted =
      historyRef.current.reduce((sum, s, i) => sum + s * weights[i], 0) / total;

    setData((d) => ({
      ...d,
      status: 'done',
      strideM: +weighted.toFixed(4),
      sessionCount: d.sessionCount + 1,
      error: null,
    }));
  };

  const reset = () => {
    historyRef.current = [1.12];
    setData({ status: 'idle', strideM: 1.12, sessionCount: 0, error: null });
  };

  return { data, startCalibration, finishCalibration, reset };
}
