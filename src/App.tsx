import { useState } from 'react';
import { HistoricoScreen, MusicScreen, TiroScreen, TreinoScreen } from './components/screens';
import './App.css';

type ScreenKey = 'treino' | 'musica' | 'tiro' | 'historico';

export default function App() {
  const [screen, setScreen] = useState<ScreenKey>('treino');

  return (
    <div className="new-app-shell">
      <main className="new-app-content">
        <div className={`screen-pane ${screen === 'treino' ? 'active' : ''}`}>
          <TreinoScreen onNavigate={setScreen} />
        </div>
        <div className={`screen-pane ${screen === 'musica' ? 'active' : ''}`}>
          <MusicScreen onNavigate={setScreen} />
        </div>
        <div className={`screen-pane ${screen === 'tiro' ? 'active' : ''}`}>
          <TiroScreen onNavigate={setScreen} />
        </div>
        <div className={`screen-pane ${screen === 'historico' ? 'active' : ''}`}>
          <HistoricoScreen onNavigate={setScreen} />
        </div>
      </main>
    </div>
  );
}
