// ═══════════════════════════════════════════════════════════════
// PERFIL DO CORREDOR
// ═══════════════════════════════════════════════════════════════

let perfil = {
  passada: 1.25,    // metros por passo
  paceLeve: '6:30',
  paceFort: '4:30'
};

// Carrega perfil salvo no localStorage (se existir)
function carregarPerfil() {
  const salvo = localStorage.getItem('pacemusic_perfil');
  if (salvo) perfil = JSON.parse(salvo);
}

function salvarPerfil() {
  localStorage.setItem('pacemusic_perfil', JSON.stringify(perfil));
}

// ═══════════════════════════════════════════════════════════════
// ZONAS / PLAYLISTS
// ═══════════════════════════════════════════════════════════════

let zonas = [
  { id: 1, nome: 'Zona 1 — Leve',        paceMin: '6:01', paceMax: '9:00', musicas: [] },
  { id: 2, nome: 'Zona 2 — Confortável', paceMin: '5:31', paceMax: '6:00', musicas: [] },
  { id: 3, nome: 'Zona 3 — Progressivo', paceMin: '5:01', paceMax: '5:30', musicas: [] },
  { id: 4, nome: 'Zona 4 — Forte',       paceMin: '4:31', paceMax: '5:00', musicas: [] },
  { id: 5, nome: 'Zona 5 — Agressivo',   paceMin: '0:00', paceMax: '4:30', musicas: [] },
];
let zonaIdCounter = 6;
let zonasAbertas = {};

function carregarZonas() {
  const salvo = localStorage.getItem('pacemusic_zonas');
  if (salvo) {
    zonas = JSON.parse(salvo);
    zonaIdCounter = Math.max(...zonas.map(z => z.id)) + 1;
  }
}

function salvarZonas() {
  localStorage.setItem('pacemusic_zonas', JSON.stringify(zonas));
}

// ═══════════════════════════════════════════════════════════════
// CÁLCULOS
// ═══════════════════════════════════════════════════════════════

let BPM_ORIGINAL = 128;

function bpmToPace(bpm) {
  const mpm = bpm * perfil.passada;
  const secPerKm = 60000 / mpm;
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return min + ':' + (sec < 10 ? '0' : '') + sec;
}

function paceToSeconds(str) {
  if (!str) return null;
  const parts = str.trim().split(':');
  if (parts.length !== 2) return null;
  const m = parseInt(parts[0]);
  const s = parseInt(parts[1]);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

function getTipo(pace) {
  const s = paceToSeconds(pace);
  if (!s) return ['—', 'badge-moderado'];
  if (s > 360) return ['leve',       'badge-leve'];
  if (s > 330) return ['confortável', 'badge-moderado'];
  if (s > 300) return ['progressivo', 'badge-forte'];
  return            ['agressivo',    'badge-agressivo'];
}

function formatTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// ═══════════════════════════════════════════════════════════════
// ESTIMATIVA DE BPM
// ═══════════════════════════════════════════════════════════════

function estimateBPM(buffer) {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const step = Math.floor(sampleRate / 200);
  const energies = [];

  for (let i = 0; i < data.length - step; i += step) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i + j] * data[i + j];
    energies.push(sum / step);
  }

  const avg = energies.reduce((a, b) => a + b, 0) / energies.length;
  const threshold = avg * 1.4;
  const peaks = [];
  let lastPeak = -10;

  for (let i = 1; i < energies.length - 1; i++) {
    if (
      energies[i] > threshold &&
      energies[i] > energies[i - 1] &&
      energies[i] > energies[i + 1] &&
      i - lastPeak > 10
    ) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  if (peaks.length < 4) return 120;

  const intervals = [];
  for (let i = 1; i < Math.min(peaks.length, 60); i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  let bpm = Math.round((200 / median) * 60);

  if (bpm < 80)  bpm = bpm * 2;
  if (bpm > 200) bpm = Math.round(bpm / 2);
  return bpm;
}

// ═══════════════════════════════════════════════════════════════
// ÁUDIO
// ═══════════════════════════════════════════════════════════════

let audioCtx    = null;
let sourceNode  = null;
let audioBuffer = null;
let gainNode    = null;
let startedAt   = 0;
let pausedAt    = 0;
let isPlaying   = false;
let playbackRate = 1.0;
let rafId       = null;
let currentFileName = '';

function play() {
  if (!audioBuffer || isPlaying) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.playbackRate.value = playbackRate;
  sourceNode.connect(gainNode);
  sourceNode.start(0, pausedAt);

  startedAt = audioCtx.currentTime - pausedAt;
  isPlaying = true;

  document.getElementById('play-icon').innerHTML =
    '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

  updateProgress();

  sourceNode.onended = () => {
    if (isPlaying) {
      isPlaying = false;
      pausedAt  = 0;
      cancelAnimationFrame(rafId);
      document.getElementById('play-icon').innerHTML =
        '<polygon points="5 3 19 12 5 21 5 3"/>';
      document.getElementById('prog').style.width = '0%';
      document.getElementById('time-cur').textContent = '0:00';
    }
  };
}

function pause() {
  if (!isPlaying) return;
  pausedAt = audioCtx.currentTime - startedAt;
  sourceNode.onended = null;
  sourceNode.stop();
  isPlaying = false;
  cancelAnimationFrame(rafId);
  document.getElementById('play-icon').innerHTML =
    '<polygon points="5 3 19 12 5 21 5 3"/>';
}

function seek(toSec) {
  const wasPlaying = isPlaying;
  if (isPlaying) { sourceNode.onended = null; sourceNode.stop(); isPlaying = false; cancelAnimationFrame(rafId); }
  pausedAt = Math.max(0, Math.min(toSec, audioBuffer.duration));
  if (wasPlaying) play();
}

function updateProgress() {
  if (!isPlaying || !audioBuffer) return;
  const elapsed  = audioCtx.currentTime - startedAt;
  const pct      = Math.min((elapsed / audioBuffer.duration) * 100, 100);
  document.getElementById('prog').style.width     = pct.toFixed(2) + '%';
  document.getElementById('time-cur').textContent = formatTime(elapsed);
  rafId = requestAnimationFrame(updateProgress);
}

function loadAudioFile(file) {
  const reader = new FileReader();
  currentFileName = file.name.replace(/\.[^.]+$/, '');

  reader.onload = (e) => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      gainNode = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }

    audioCtx.decodeAudioData(e.target.result, (buffer) => {
      audioBuffer    = buffer;
      BPM_ORIGINAL   = estimateBPM(buffer);

      document.getElementById('song-title').textContent = currentFileName;
      document.getElementById('upload-area').style.display  = 'none';
      document.getElementById('song-row').style.display     = 'flex';
      document.getElementById('player-body').style.display  = 'block';
      document.getElementById('time-dur').textContent = formatTime(buffer.duration);

      updateStats(parseInt(document.getElementById('speed').value));
      updateAnalise();

      pausedAt = 0;
      play();
    }, () => alert('Não foi possível decodificar este arquivo de áudio.'));
  };

  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════════
// INTERFACE — STATS
// ═══════════════════════════════════════════════════════════════

function updateStats(speedPct) {
  const bpm  = Math.round(BPM_ORIGINAL * speedPct / 100);
  const pace = bpmToPace(bpm);

  document.getElementById('speed-out').textContent = speedPct + '%';
  document.getElementById('stat-bpm').textContent  = bpm;
  document.getElementById('stat-cad').textContent  = bpm;
  document.getElementById('stat-pace').textContent = pace;
  document.getElementById('warn').style.display    = speedPct >= 120 ? 'block' : 'none';

  const [tipo, cls] = getTipo(pace);
  const badge = document.getElementById('badge-tipo');
  badge.textContent = tipo;
  badge.className   = 'badge ' + cls;
}

function applySpeed(speedPct) {
  playbackRate = speedPct / 100;
  if (isPlaying && sourceNode) sourceNode.playbackRate.value = playbackRate;
  updateStats(speedPct);
}

// ═══════════════════════════════════════════════════════════════
// INTERFACE — ANÁLISE
// ═══════════════════════════════════════════════════════════════

function updateAnalise() {
  document.getElementById('analise-empty').style.display   = 'none';
  document.getElementById('analise-content').style.display = 'block';
  document.getElementById('analise-bpm').textContent       = BPM_ORIGINAL;
  document.getElementById('analise-passada').textContent   = perfil.passada.toFixed(2);

  const velocidades = [85, 90, 95, 100, 105, 110, 115];
  const tbody = document.getElementById('pace-tbody');
  tbody.innerHTML = '';

  const speedAtual = parseInt(document.getElementById('speed').value);

  velocidades.forEach(v => {
    const bpm  = Math.round(BPM_ORIGINAL * v / 100);
    const pace = bpmToPace(bpm);
    const tr   = document.createElement('tr');
    if (v === speedAtual) tr.classList.add('active');
    tr.innerHTML = `<td>${v}%</td><td>${bpm}</td><td>${pace} min/km</td>`;
    tbody.appendChild(tr);
  });

  const pace100     = bpmToPace(BPM_ORIGINAL);
  const [tipo, cls] = getTipo(pace100);
  const ab          = document.getElementById('analise-badge');
  ab.textContent    = tipo;
  ab.className      = 'badge ' + cls;
}

// ═══════════════════════════════════════════════════════════════
// INTERFACE — ZONAS / PLAYLISTS
// ═══════════════════════════════════════════════════════════════

function renderZonas() {
  const container = document.getElementById('zonas-lista');
  container.innerHTML = '';

  zonas.forEach(zona => {
    const aberta = zonasAbertas[zona.id];

    const div = document.createElement('div');
    div.className = 'zona-card';

    // Badge de cor da zona
    const [, badgeCls] = getTipoPorPace(zona.paceMin, zona.paceMax);

    div.innerHTML = `
      <div class="zona-header" data-id="${zona.id}">
        <div class="zona-left">
          <span class="badge ${badgeCls}" style="font-size:9px;">Z${zona.id}</span>
          <div>
            <div class="zona-name">${zona.nome}</div>
            <div class="zona-range">${zona.paceMin} – ${zona.paceMax} min/km</div>
          </div>
        </div>
        <div class="zona-right">
          <span class="zona-count">${zona.musicas.length} música${zona.musicas.length !== 1 ? 's' : ''}</span>
          <span class="zona-toggle">${aberta ? '▲' : '▼'}</span>
        </div>
      </div>
      ${aberta ? renderZonaBody(zona) : ''}
    `;

    div.querySelector('.zona-header').addEventListener('click', () => {
      zonasAbertas[zona.id] = !zonasAbertas[zona.id];
      renderZonas();
    });

    container.appendChild(div);

    // Eventos dos botões internos (apenas se aberta)
    if (aberta) {
      const btnSalvar = div.querySelector('.btn-zona-salvar');
      if (btnSalvar) {
        btnSalvar.addEventListener('click', (e) => {
          e.stopPropagation();
          const id    = parseInt(btnSalvar.dataset.id);
          const nome  = div.querySelector('.input-zona-nome').value.trim();
          const pMin  = div.querySelector('.input-zona-pmin').value.trim();
          const pMax  = div.querySelector('.input-zona-pmax').value.trim();
          const z     = zonas.find(z => z.id === id);
          if (z && nome) { z.nome = nome; z.paceMin = pMin; z.paceMax = pMax; }
          salvarZonas();
          renderZonas();
        });
      }

      const btnApagar = div.querySelector('.btn-zona-apagar');
      if (btnApagar) {
        btnApagar.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = parseInt(btnApagar.dataset.id);
          if (confirm('Apagar esta zona?')) {
            zonas = zonas.filter(z => z.id !== id);
            salvarZonas();
            renderZonas();
          }
        });
      }

      div.querySelectorAll('.btn-remove-musica').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const zid = parseInt(btn.dataset.zona);
          const mid = parseInt(btn.dataset.musica);
          const z   = zonas.find(z => z.id === zid);
          if (z) z.musicas = z.musicas.filter((_, i) => i !== mid);
          salvarZonas();
          renderZonas();
        });
      });
    }
  });
}

function renderZonaBody(zona) {
  const musicasHtml = zona.musicas.length === 0
    ? `<div class="zona-empty">nenhuma música ainda</div>`
    : `<div class="zona-musicas">
        ${zona.musicas.map((m, i) => `
          <div class="zona-musica-item">
            <span class="zona-musica-nome">🎵 ${m.nome}</span>
            <span class="zona-musica-pace">${m.pace} min/km</span>
            <button class="btn-remove-musica" data-zona="${zona.id}" data-musica="${i}" title="remover">✕</button>
          </div>
        `).join('')}
      </div>`;

  return `
    <div class="zona-body" onclick="event.stopPropagation()">
      ${musicasHtml}
      <div class="zona-edit-row">
        <input class="input-zona-nome" type="text" placeholder="nome da zona" value="${zona.nome}">
        <input class="input-zona-pmin" type="text" placeholder="pace mín" value="${zona.paceMin}" style="width:72px;">
        <input class="input-zona-pmax" type="text" placeholder="pace máx" value="${zona.paceMax}" style="width:72px;">
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn-zona-salvar" data-id="${zona.id}">salvar</button>
        <button class="btn-zona-apagar" data-id="${zona.id}">apagar zona</button>
      </div>
    </div>
  `;
}

function getTipoPorPace(paceMin, paceMax) {
  const s = paceToSeconds(paceMin);
  if (!s) return ['—', 'badge-moderado'];
  if (s > 360) return ['leve',       'badge-leve'];
  if (s > 330) return ['confortável', 'badge-moderado'];
  if (s > 300) return ['progressivo', 'badge-forte'];
  return            ['agressivo',    'badge-agressivo'];
}

// ── Salvar música na zona ──────────────────────────────────────
function abrirSaveModal() {
  if (!audioBuffer) { alert('Carregue uma música primeiro.'); return; }

  const speedPct = parseInt(document.getElementById('speed').value);
  const pace     = bpmToPace(Math.round(BPM_ORIGINAL * speedPct / 100));

  document.getElementById('save-music-name').textContent = currentFileName || 'música';

  const opts = document.getElementById('save-zona-opts');
  opts.innerHTML = '';

  zonas.forEach(zona => {
    const btn = document.createElement('button');
    btn.className   = 'save-zona-btn';
    btn.textContent = `${zona.nome}  (${zona.paceMin}–${zona.paceMax})`;
    btn.addEventListener('click', () => {
      zona.musicas.push({ nome: currentFileName || 'música', pace });
      salvarZonas();
      renderZonas();
      document.getElementById('save-modal').style.display = 'none';

      // Troca para aba playlists para mostrar resultado
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelector('[data-tab="2"]').classList.add('active');
      document.querySelectorAll('[id^="panel-"]').forEach(p => p.style.display = 'none');
      document.getElementById('panel-2').style.display = 'block';
      zonasAbertas[zona.id] = true;
      renderZonas();
    });
    opts.appendChild(btn);
  });

  document.getElementById('save-modal').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════════

// Upload
document.getElementById('upload-trigger').addEventListener('click', () => {
  document.getElementById('file-input').click();
});
document.getElementById('file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) loadAudioFile(e.target.files[0]);
});
const uploadArea = document.getElementById('upload-area');
uploadArea.addEventListener('dragover',  (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('audio/')) loadAudioFile(file);
});

// Player
document.getElementById('btn-play').addEventListener('click', () => isPlaying ? pause() : play());
document.getElementById('btn-back').addEventListener('click', () => {
  if (!audioBuffer) return;
  seek((isPlaying ? audioCtx.currentTime - startedAt : pausedAt) - 10);
});
document.getElementById('btn-fwd').addEventListener('click', () => {
  if (!audioBuffer) return;
  seek((isPlaying ? audioCtx.currentTime - startedAt : pausedAt) + 10);
});
document.getElementById('progress-wrap').addEventListener('click', (e) => {
  if (!audioBuffer) return;
  const rect = e.currentTarget.getBoundingClientRect();
  seek((e.clientX - rect.left) / rect.width * audioBuffer.duration);
});

// Velocidade
document.getElementById('speed').addEventListener('input', (e) => {
  applySpeed(parseInt(e.target.value));
});

// Ajuste automático por pace alvo
document.getElementById('btn-auto').addEventListener('click', () => {
  const raw = document.getElementById('pace-target').value;
  const targetSec = paceToSeconds(raw);
  if (!targetSec) { alert('Digite o pace no formato correto. Exemplo: 5:45'); return; }

  // Calcula quantos BPM são necessários para aquele pace com a passada do corredor
  // pace (seg/km) = 60.000 / (BPM × passada)  →  BPM_necessário = 60.000 / (pace × passada)
  const bpmNecessario = 60000 / (targetSec * perfil.passada);
  const speed = Math.round((bpmNecessario / BPM_ORIGINAL) * 100);
  const clamped = Math.max(75, Math.min(130, speed));

  document.getElementById('speed').value = clamped;
  applySpeed(clamped);
});

// Trocar música
document.getElementById('btn-trocar').addEventListener('click', () => {
  if (isPlaying) pause();
  pausedAt = 0;
  audioBuffer = null;
  document.getElementById('upload-area').style.display  = 'block';
  document.getElementById('song-row').style.display     = 'none';
  document.getElementById('player-body').style.display  = 'none';
  document.getElementById('file-input').value           = '';
  document.getElementById('analise-empty').style.display   = 'block';
  document.getElementById('analise-content').style.display = 'none';
});

// Salvar na playlist
document.getElementById('btn-save-playlist').addEventListener('click', abrirSaveModal);
document.getElementById('btn-cancel-save').addEventListener('click', () => {
  document.getElementById('save-modal').style.display = 'none';
});

// Adicionar zona
document.getElementById('btn-add-zona').addEventListener('click', () => {
  zonas.push({ id: zonaIdCounter++, nome: 'Nova zona', paceMin: '0:00', paceMax: '9:59', musicas: [] });
  salvarZonas();
  zonasAbertas[zonas[zonas.length - 1].id] = true;
  renderZonas();
});

// Abas
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('[id^="panel-"]').forEach(p => p.style.display = 'none');
    document.getElementById('panel-' + tab.dataset.tab).style.display = 'block';
  });
});

// Perfil — abrir/fechar modal
document.getElementById('btn-open-perfil').addEventListener('click', () => {
  document.getElementById('input-passada').value    = perfil.passada;
  document.getElementById('input-pace-leve').value  = perfil.paceLeve;
  document.getElementById('input-pace-forte').value = perfil.paceFort;
  document.getElementById('modal-perfil').style.display = 'flex';
});
document.getElementById('btn-close-perfil').addEventListener('click', () => {
  document.getElementById('modal-perfil').style.display = 'none';
});
document.getElementById('modal-perfil').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-perfil'))
    document.getElementById('modal-perfil').style.display = 'none';
});

// Perfil — salvar
document.getElementById('btn-salvar-perfil').addEventListener('click', () => {
  const passada = parseFloat(document.getElementById('input-passada').value);
  const leve    = document.getElementById('input-pace-leve').value.trim();
  const forte   = document.getElementById('input-pace-forte').value.trim();

  if (isNaN(passada) || passada <= 0) { alert('Passada inválida.'); return; }
  if (!paceToSeconds(leve))           { alert('Pace leve inválido. Use formato 6:30'); return; }
  if (!paceToSeconds(forte))          { alert('Pace forte inválido. Use formato 4:30'); return; }

  perfil.passada  = passada;
  perfil.paceLeve = leve;
  perfil.paceFort = forte;
  salvarPerfil();

  document.getElementById('modal-perfil').style.display = 'none';

  // Recalcula tudo com nova passada
  if (audioBuffer) {
    updateStats(parseInt(document.getElementById('speed').value));
    updateAnalise();
  }
});

// ═══════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════
carregarPerfil();
carregarZonas();
renderZonas();
