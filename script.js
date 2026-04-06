// ═══════════════════════════════════════════════════════════════
// SPLASH → APP
// ═══════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (!splash) {
      const app = document.getElementById('app');
      if (app) app.style.display = 'flex';
      return;
    }

    splash.style.opacity = '0';

    setTimeout(() => {
      splash.style.display = 'none';
      const app = document.getElementById('app');
      if (app) app.style.display = 'flex';
    }, 500);
  }, 2200);
});

// ═══════════════════════════════════════════════════════════════
// PERFIL
// ═══════════════════════════════════════════════════════════════
let perfil = {
  passada: 1.25,
  passosPorBatida: 1,
  paceLeve: '6:30',
  paceForte: '4:30'
};

function carregarPerfil() {
  const salvo = localStorage.getItem('paceup_perfil');
  if (!salvo) return;

  try {
    const obj = JSON.parse(salvo);
    perfil = {
      passada: Number(obj.passada) || 1.25,
      passosPorBatida: Number(obj.passosPorBatida) || 1,
      paceLeve: obj.paceLeve || '6:30',
      paceForte: obj.paceForte || obj.paceFort || '4:30'
    };
  } catch (err) {
    console.error('Erro ao carregar perfil:', err);
  }
}

function salvarPerfil() {
  localStorage.setItem('paceup_perfil', JSON.stringify(perfil));
}

// ═══════════════════════════════════════════════════════════════
// ZONAS
// ═══════════════════════════════════════════════════════════════
let zonas = [
  { id: 1, nome: 'Zona 1 — Leve',        paceMin: '6:01', paceMax: '9:00', musicas: [] },
  { id: 2, nome: 'Zona 2 — Confortável', paceMin: '5:31', paceMax: '6:00', musicas: [] },
  { id: 3, nome: 'Zona 3 — Progressivo', paceMin: '5:01', paceMax: '5:30', musicas: [] },
  { id: 4, nome: 'Zona 4 — Forte',       paceMin: '4:31', paceMax: '5:00', musicas: [] },
  { id: 5, nome: 'Zona 5 — Agressivo',   paceMin: '0:00', paceMax: '4:30', musicas: [] }
];

let zonaIdCounter = 6;
let zonasAbertas = {};

function carregarZonas() {
  const salvo = localStorage.getItem('paceup_zonas');
  if (!salvo) return;

  try {
    zonas = JSON.parse(salvo);
    zonaIdCounter = Math.max(...zonas.map(z => z.id), 0) + 1;
  } catch (err) {
    console.error('Erro ao carregar zonas:', err);
  }
}

function salvarZonas() {
  localStorage.setItem('paceup_zonas', JSON.stringify(zonas));
}

// ═══════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ═══════════════════════════════════════════════════════════════
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function paceToSeconds(str) {
  if (!str || typeof str !== 'string') return null;
  const parts = str.trim().split(':');
  if (parts.length !== 2) return null;

  const m = parseInt(parts[0], 10);
  const s = parseInt(parts[1], 10);

  if (Number.isNaN(m) || Number.isNaN(s) || s < 0 || s > 59 || m < 0) {
    return null;
  }

  return (m * 60) + s;
}

function secondsToPace(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);

  if (s === 60) {
    return `${m + 1}:00`;
  }

  return `${m}:${String(s).padStart(2, '0')}`;
}

function paceToKmh(paceStr) {
  const sec = paceToSeconds(paceStr);
  if (!sec || sec <= 0) return '—';
  return (3600 / sec).toFixed(1);
}

function getTipo(paceStr) {
  const sec = paceToSeconds(paceStr);
  if (!sec) return ['—', 'badge-moderado'];

  if (sec > 360) return ['leve', 'badge-leve'];
  if (sec > 330) return ['confortável', 'badge-moderado'];
  if (sec > 300) return ['progressivo', 'badge-forte'];
  return ['agressivo', 'badge-forte'];
}

function getTipoPorPaceRange(paceMin) {
  return getTipo(paceMin);
}

// ═══════════════════════════════════════════════════════════════
// CÁLCULO DE PACE
// REGRA CORRETA:
// 1) batida da música -> cadência estimada
// 2) cadência × passada -> metros/minuto
// 3) converter para pace em segundos por km
// pace_segundos = 60000 / (cadencia * passada)
// ═══════════════════════════════════════════════════════════════
let BPM_ORIGINAL = 128;

function getBpmAtual(rate = 1) {
  return BPM_ORIGINAL * rate;
}

function getCadenciaEstimada(bpm, passosPorBatida = perfil.passosPorBatida) {
  return bpm * passosPorBatida;
}

function calcularPaceSegundos({ bpm, passada, passosPorBatida }) {
  if (!isFinite(bpm) || bpm <= 0) return null;
  if (!isFinite(passada) || passada <= 0) return null;
  if (!isFinite(passosPorBatida) || passosPorBatida <= 0) return null;

  const cadencia = getCadenciaEstimada(bpm, passosPorBatida); // passos/min
  const metrosPorMinuto = cadencia * passada;

  if (!isFinite(metrosPorMinuto) || metrosPorMinuto <= 0) return null;

  return 60000 / metrosPorMinuto;
}

function calcularPaceFormatado({ bpm, passada, passosPorBatida }) {
  const sec = calcularPaceSegundos({ bpm, passada, passosPorBatida });
  return secondsToPace(sec);
}

function speedToPace(rate) {
  const bpmAtual = getBpmAtual(rate);

  return calcularPaceFormatado({
    bpm: bpmAtual,
    passada: perfil.passada,
    passosPorBatida: perfil.passosPorBatida
  });
}

function paceToSpeed(paceStr) {
  const paceSec = paceToSeconds(paceStr);
  if (!paceSec || !BPM_ORIGINAL || BPM_ORIGINAL <= 0) return 1;

  // paceSeg = 60000 / (cadencia * passada)
  // cadencia = bpm * passosPorBatida
  // bpm = 60000 / (paceSeg * passada * passosPorBatida)
  const bpmNecessario = 60000 / (
    paceSec *
    perfil.passada *
    perfil.passosPorBatida
  );

  return bpmNecessario / BPM_ORIGINAL;
}

function paceComPassada(rate, passadaCustom) {
  const bpmAtual = getBpmAtual(rate);

  return calcularPaceFormatado({
    bpm: bpmAtual,
    passada: passadaCustom,
    passosPorBatida: perfil.passosPorBatida
  });
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
    for (let j = 0; j < step; j++) {
      sum += data[i + j] * data[i + j];
    }
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
  if (!median || !isFinite(median)) return 120;

  let bpm = Math.round((200 / median) * 60);

  if (bpm < 80) bpm *= 2;
  if (bpm > 200) bpm = Math.round(bpm / 2);

  return clamp(bpm, 60, 200);
}

// ═══════════════════════════════════════════════════════════════
// ÁUDIO — SoundTouchJS + fallback
// ═══════════════════════════════════════════════════════════════
let audioCtx = null;
let audioBuffer = null;
let gainNode = null;
let startedAt = 0;
let pausedAt = 0;
let isPlaying = false;
let rafId = null;
let currentFileName = '';

let stNode = null;
let sourceNode = null;

let currentRate = 1.0;
const RATE_MIN = 0.75;
const RATE_MAX = 1.30;
const RATE_STEP = 0.02;
let loopEnabled = false;

function hasSoundTouch() {
  return typeof SoundTouchNode !== 'undefined';
}

function resetPlayIcon() {
  const icon = document.getElementById('play-icon');
  if (!icon) return;
  icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
}

function setPauseIcon() {
  const icon = document.getElementById('play-icon');
  if (!icon) return;
  icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

function stopCurrentSource() {
  if (stNode) {
    try {
      stNode.onended = null;
      stNode.stop();
      stNode.disconnect();
    } catch (_) {}
    stNode = null;
  }

  if (sourceNode) {
    try {
      sourceNode.onended = null;
      sourceNode.stop();
      sourceNode.disconnect();
    } catch (_) {}
    sourceNode = null;
  }
}

function play() {
  if (!audioBuffer || isPlaying) return;

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  stopCurrentSource();

  if (hasSoundTouch()) {
    stNode = new SoundTouchNode(audioCtx, audioBuffer, {
      tempo: currentRate,
      pitch: 1.0
    });

    stNode.offset = pausedAt;
    stNode.connect(gainNode);
    stNode.start();

    startedAt = audioCtx.currentTime - pausedAt;
    isPlaying = true;

    stNode.onended = () => {
      if (!isPlaying) return;

      isPlaying = false;
      pausedAt = 0;
      cancelAnimationFrame(rafId);

      if (loopEnabled) {
        play();
        return;
      }

      resetPlayIcon();
      const prog = document.getElementById('prog');
      const timeCur = document.getElementById('time-cur');
      if (prog) prog.style.width = '0%';
      if (timeCur) timeCur.textContent = '0:00';
    };
  } else {
    sourceNode = audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.playbackRate.value = currentRate;
    sourceNode.connect(gainNode);
    sourceNode.start(0, pausedAt);

    startedAt = audioCtx.currentTime - pausedAt;
    isPlaying = true;

    sourceNode.onended = () => {
      if (!isPlaying) return;

      isPlaying = false;
      pausedAt = 0;
      cancelAnimationFrame(rafId);

      if (loopEnabled) {
        play();
        return;
      }

      resetPlayIcon();
      const prog = document.getElementById('prog');
      const timeCur = document.getElementById('time-cur');
      if (prog) prog.style.width = '0%';
      if (timeCur) timeCur.textContent = '0:00';
    };
  }

  setPauseIcon();
  updateProgress();
}

function pause() {
  if (!isPlaying) return;

  pausedAt = audioCtx.currentTime - startedAt;
  stopCurrentSource();
  isPlaying = false;
  cancelAnimationFrame(rafId);
  resetPlayIcon();
}

function seek(toSec) {
  if (!audioBuffer) return;

  const wasPlaying = isPlaying;

  if (isPlaying) {
    stopCurrentSource();
    isPlaying = false;
    cancelAnimationFrame(rafId);
  }

  pausedAt = clamp(toSec, 0, audioBuffer.duration);

  if (wasPlaying) {
    play();
  } else {
    const timeCur = document.getElementById('time-cur');
    const prog = document.getElementById('prog');

    if (timeCur) timeCur.textContent = formatTime(pausedAt);
    if (prog) prog.style.width = `${(pausedAt / audioBuffer.duration) * 100}%`;
  }
}

function updateProgress() {
  if (!isPlaying || !audioBuffer) return;

  const elapsed = audioCtx.currentTime - startedAt;
  const pct = Math.min((elapsed / audioBuffer.duration) * 100, 100);

  const prog = document.getElementById('prog');
  const timeCur = document.getElementById('time-cur');

  if (prog) prog.style.width = `${pct.toFixed(2)}%`;
  if (timeCur) timeCur.textContent = formatTime(elapsed);

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

    audioCtx.decodeAudioData(
      e.target.result,
      (buffer) => {
        audioBuffer = buffer;
        BPM_ORIGINAL = estimateBPM(buffer);
        currentRate = 1.0;
        pausedAt = 0;

        const songTitle = document.getElementById('song-title');
        const uploadArea = document.getElementById('upload-area');
        const songRow = document.getElementById('song-row');
        const playerBody = document.getElementById('player-body');
        const timeDur = document.getElementById('time-dur');

        if (songTitle) songTitle.textContent = currentFileName;
        if (uploadArea) uploadArea.style.display = 'none';
        if (songRow) songRow.style.display = 'flex';
        if (playerBody) playerBody.style.display = 'block';
        if (timeDur) timeDur.textContent = formatTime(buffer.duration);

        updateUI(currentRate);
        updateAnalise();
        play();
      },
      () => {
        alert('Não foi possível decodificar este arquivo de áudio.');
      }
    );
  };

  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════════
// UPDATE UI
// ═══════════════════════════════════════════════════════════════
function updateUI(rate) {
  currentRate = clamp(rate, RATE_MIN, RATE_MAX);

  if (isPlaying) {
    if (hasSoundTouch() && stNode) {
      stNode.tempo = currentRate;
    } else if (sourceNode) {
      sourceNode.playbackRate.value = currentRate;
    }
  }

  const pace = speedToPace(currentRate);
  const paceSec = paceToSeconds(pace);

  const passadaMin = Math.max(0.5, perfil.passada - 0.05);
  const passadaMax = perfil.passada + 0.05;

  // passada maior = km em menos tempo = pace menor
  const paceMinStr = paceComPassada(currentRate, passadaMax);
  const paceMaxStr = paceComPassada(currentRate, passadaMin);

  const [tipo, cls] = getTipo(pace);

  const paceMain = document.getElementById('pace-main');
  const paceMinVal = document.getElementById('pace-min-val');
  const paceMaxVal = document.getElementById('pace-max-val');
  const statKmh = document.getElementById('stat-kmh');
  const statZona = document.getElementById('stat-zona');
  const badge = document.getElementById('badge-tipo');
  const speedThumb = document.getElementById('speed-thumb');
  const speedPct = document.getElementById('speed-pct');
  const warn = document.getElementById('warn');

  if (paceMain) paceMain.textContent = pace;
  if (paceMinVal) paceMinVal.textContent = paceMinStr;
  if (paceMaxVal) paceMaxVal.textContent = paceMaxStr;
  if (statKmh) statKmh.textContent = paceToKmh(pace);
  if (statZona) statZona.textContent = tipo;

  if (badge) {
    badge.textContent = tipo;
    badge.className = `badge ${cls}`;
  }

  if (speedThumb) {
    const trackPct = ((currentRate - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 100;
    speedThumb.style.left = `${trackPct.toFixed(1)}%`;
  }

  if (speedPct) {
    speedPct.textContent = `${Math.round(currentRate * 100)}%`;
  }

  if (warn) {
    warn.style.display = (!hasSoundTouch() && currentRate >= 1.20) ? 'block' : 'none';
  }

  if (paceMain && paceSec) {
    if (paceSec > 360)      paceMain.style.color = 'var(--leve)';
    else if (paceSec > 330) paceMain.style.color = 'var(--moderado)';
    else if (paceSec > 300) paceMain.style.color = 'var(--forte)';
    else                    paceMain.style.color = 'var(--agressivo)';
  }
}

// ═══════════════════════════════════════════════════════════════
// ANÁLISE
// ═══════════════════════════════════════════════════════════════
function updateAnalise() {
  const analiseEmpty = document.getElementById('analise-empty');
  const analiseContent = document.getElementById('analise-content');
  const analisePace100 = document.getElementById('analise-pace100');
  const analisePassada = document.getElementById('analise-passada');
  const tbody = document.getElementById('pace-tbody');
  const analiseBadge = document.getElementById('analise-badge');

  if (!audioBuffer) {
    if (analiseEmpty) analiseEmpty.style.display = 'block';
    if (analiseContent) analiseContent.style.display = 'none';
    return;
  }

  if (analiseEmpty) analiseEmpty.style.display = 'none';
  if (analiseContent) analiseContent.style.display = 'block';

  if (analisePace100) analisePace100.textContent = speedToPace(1.0);
  if (analisePassada) analisePassada.textContent = perfil.passada.toFixed(2);

  if (tbody) {
    tbody.innerHTML = '';

    const velocidades = [80, 85, 90, 95, 100, 105, 110, 115, 120];
    const pctAtual = Math.round(currentRate * 100);

    velocidades.forEach((v) => {
      const rate = v / 100;
      const pace = speedToPace(rate);
      const kmh = paceToKmh(pace);

      const tr = document.createElement('tr');

      if (v === pctAtual) {
        tr.style.background = 'rgba(155,226,45,.06)';
      }

      tr.innerHTML = `
        <td>${v}%</td>
        <td>${pace} min/km</td>
        <td>${kmh}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  const pace100 = speedToPace(1);
  const [tipo, cls] = getTipo(pace100);

  if (analiseBadge) {
    analiseBadge.textContent = tipo;
    analiseBadge.className = `badge ${cls}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// ZONAS / PLAYLISTS
// ═══════════════════════════════════════════════════════════════
function renderZonaBody(zona) {
  const musicasHtml = zona.musicas.length === 0
    ? `<div class="zona-empty">nenhuma música ainda</div>`
    : `<div class="zona-musicas">${zona.musicas.map((m, i) => `
        <div class="zona-musica-item">
          <span class="zona-musica-nome">🎵 ${m.nome}</span>
          <span class="zona-musica-pace">${m.pace} min/km</span>
          <button class="btn-remove-musica" data-zona="${zona.id}" data-musica="${i}">✕</button>
        </div>
      `).join('')}</div>`;

  return `
    <div class="zona-body" onclick="event.stopPropagation()">
      ${musicasHtml}
      <div class="zona-edit-row">
        <input class="input-zona-nome" type="text" placeholder="nome" value="${zona.nome}">
        <input class="input-zona-pmin" type="text" placeholder="pace mín" value="${zona.paceMin}">
        <input class="input-zona-pmax" type="text" placeholder="pace máx" value="${zona.paceMax}">
      </div>
      <div class="zona-btns">
        <button class="btn-zona-salvar" data-id="${zona.id}">salvar</button>
        <button class="btn-zona-apagar" data-id="${zona.id}">apagar zona</button>
      </div>
    </div>
  `;
}

function renderZonas() {
  const container = document.getElementById('zonas-lista');
  if (!container) return;

  container.innerHTML = '';

  zonas.forEach((zona) => {
    const aberta = zonasAbertas[zona.id];
    const [, badgeCls] = getTipoPorPaceRange(zona.paceMin);

    const div = document.createElement('div');
    div.className = 'zona-card';
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
          <span style="color:var(--muted);font-size:10px;">${aberta ? '▲' : '▼'}</span>
        </div>
      </div>
      ${aberta ? renderZonaBody(zona) : ''}
    `;

    const header = div.querySelector('.zona-header');
    if (header) {
      header.addEventListener('click', () => {
        zonasAbertas[zona.id] = !zonasAbertas[zona.id];
        renderZonas();
      });
    }

    container.appendChild(div);

    if (aberta) {
      const btnSalvar = div.querySelector('.btn-zona-salvar');
      if (btnSalvar) {
        btnSalvar.addEventListener('click', (e) => {
          e.stopPropagation();

          const id = parseInt(btnSalvar.dataset.id, 10);
          const nome = div.querySelector('.input-zona-nome').value.trim();
          const pMin = div.querySelector('.input-zona-pmin').value.trim();
          const pMax = div.querySelector('.input-zona-pmax').value.trim();

          const zonaRef = zonas.find(z => z.id === id);
          if (zonaRef && nome) {
            zonaRef.nome = nome;
            zonaRef.paceMin = pMin;
            zonaRef.paceMax = pMax;
            salvarZonas();
            renderZonas();
          }
        });
      }

      const btnApagar = div.querySelector('.btn-zona-apagar');
      if (btnApagar) {
        btnApagar.addEventListener('click', (e) => {
          e.stopPropagation();

          if (confirm('Apagar esta zona?')) {
            zonas = zonas.filter(z => z.id !== parseInt(btnApagar.dataset.id, 10));
            salvarZonas();
            renderZonas();
          }
        });
      }

      div.querySelectorAll('.btn-remove-musica').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();

          const zonaRef = zonas.find(z => z.id === parseInt(btn.dataset.zona, 10));
          if (!zonaRef) return;

          zonaRef.musicas.splice(parseInt(btn.dataset.musica, 10), 1);
          salvarZonas();
          renderZonas();
        });
      });
    }
  });
}

function abrirSaveModal() {
  if (!audioBuffer) {
    alert('Carregue uma música primeiro.');
    return;
  }

  const pace = speedToPace(currentRate);
  const saveMusicName = document.getElementById('save-music-name');
  const opts = document.getElementById('save-zona-opts');
  const saveModal = document.getElementById('save-modal');

  if (saveMusicName) saveMusicName.textContent = currentFileName || 'música';
  if (!opts || !saveModal) return;

  opts.innerHTML = '';

  zonas.forEach((zona) => {
    const btn = document.createElement('button');
    btn.className = 'save-opt';
    btn.textContent = `${zona.nome} (${zona.paceMin} – ${zona.paceMax})`;

    btn.addEventListener('click', () => {
      zona.musicas.push({
        nome: currentFileName || 'música',
        pace
      });

      salvarZonas();
      renderZonas();
      saveModal.style.display = 'none';

      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      const tabPlaylists = document.querySelector('[data-tab="2"]');
      if (tabPlaylists) tabPlaylists.classList.add('active');

      document.querySelectorAll('[id^="panel-"]').forEach(p => {
        p.style.display = 'none';
      });

      const panel2 = document.getElementById('panel-2');
      if (panel2) panel2.style.display = 'block';

      zonasAbertas[zona.id] = true;
      renderZonas();
    });

    opts.appendChild(btn);
  });

  saveModal.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════════
function bindEvents() {
  // Upload
  const uploadTrigger = document.getElementById('upload-trigger');
  const fileInput = document.getElementById('file-input');
  const uploadArea = document.getElementById('upload-area');

  if (uploadTrigger && fileInput) {
    uploadTrigger.addEventListener('click', () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        loadAudioFile(e.target.files[0]);
      }
    });
  }

  if (uploadArea) {
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');

      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        loadAudioFile(file);
      }
    });
  }

  // Player
  const btnPlay = document.getElementById('btn-play');
  const btnBack = document.getElementById('btn-back');
  const btnFwd = document.getElementById('btn-fwd');
  const progressWrap = document.getElementById('progress-wrap');

  if (btnPlay) {
    btnPlay.addEventListener('click', () => {
      if (isPlaying) pause();
      else play();
    });
  }

  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (!audioBuffer) return;
      const current = isPlaying ? (audioCtx.currentTime - startedAt) : pausedAt;
      seek(current - 10);
    });
  }

  if (btnFwd) {
    btnFwd.addEventListener('click', () => {
      if (!audioBuffer) return;
      const current = isPlaying ? (audioCtx.currentTime - startedAt) : pausedAt;
      seek(current + 10);
    });
  }

  if (progressWrap) {
    progressWrap.addEventListener('click', (e) => {
      if (!audioBuffer) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      seek(pct * audioBuffer.duration);
    });
  }

  // Botões de pace
  const btnPacePlus = document.getElementById('btn-pace-plus');
  const btnPaceMinus = document.getElementById('btn-pace-minus');

  if (btnPacePlus) {
    btnPacePlus.addEventListener('click', () => {
      updateUI(currentRate + RATE_STEP);
      updateAnalise();
    });
  }

  if (btnPaceMinus) {
    btnPaceMinus.addEventListener('click', () => {
      updateUI(currentRate - RATE_STEP);
      updateAnalise();
    });
  }

  // Pace alvo
  const btnAuto = document.getElementById('btn-auto');
  const paceTarget = document.getElementById('pace-target');

  if (btnAuto && paceTarget) {
    btnAuto.addEventListener('click', () => {
      const raw = paceTarget.value.trim();

      if (!paceToSeconds(raw)) {
        alert('Digite o pace no formato correto. Exemplo: 5:45');
        return;
      }

      const rate = paceToSpeed(raw);
      updateUI(rate);
      updateAnalise();
    });
  }

  // Repetir música
  const btnRepeat = document.getElementById('btn-repeat');
  if (btnRepeat) {
    btnRepeat.addEventListener('click', () => {
      loopEnabled = !loopEnabled;
      btnRepeat.classList.toggle('active', loopEnabled);
      btnRepeat.style.color = loopEnabled ? 'var(--accent)' : '';
    });
  }

  // Trocar música
  const btnTrocar = document.getElementById('btn-trocar');
  if (btnTrocar) {
    btnTrocar.addEventListener('click', () => {
      if (isPlaying) pause();

      stopCurrentSource();
      pausedAt = 0;
      audioBuffer = null;
      currentRate = 1;

      const uploadAreaRef = document.getElementById('upload-area');
      const songRow = document.getElementById('song-row');
      const playerBody = document.getElementById('player-body');
      const analiseEmpty = document.getElementById('analise-empty');
      const analiseContent = document.getElementById('analise-content');
      const fileInputRef = document.getElementById('file-input');

      if (uploadAreaRef) uploadAreaRef.style.display = 'block';
      if (songRow) songRow.style.display = 'none';
      if (playerBody) playerBody.style.display = 'none';
      if (analiseEmpty) analiseEmpty.style.display = 'block';
      if (analiseContent) analiseContent.style.display = 'none';
      if (fileInputRef) fileInputRef.value = '';
    });
  }

  // Playlists
  const btnSavePlaylist = document.getElementById('btn-save-playlist');
  const btnCancelSave = document.getElementById('btn-cancel-save');
  const btnAddZona = document.getElementById('btn-add-zona');

  if (btnSavePlaylist) {
    btnSavePlaylist.addEventListener('click', abrirSaveModal);
  }

  if (btnCancelSave) {
    btnCancelSave.addEventListener('click', () => {
      const saveModal = document.getElementById('save-modal');
      if (saveModal) saveModal.style.display = 'none';
    });
  }

  if (btnAddZona) {
    btnAddZona.addEventListener('click', () => {
      const nova = {
        id: zonaIdCounter++,
        nome: 'Nova zona',
        paceMin: '0:00',
        paceMax: '9:59',
        musicas: []
      };

      zonas.push(nova);
      salvarZonas();
      zonasAbertas[nova.id] = true;
      renderZonas();
    });
  }

  // Abas
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('[id^="panel-"]').forEach((panel) => {
        panel.style.display = 'none';
      });

      const target = document.getElementById(`panel-${tab.dataset.tab}`);
      if (target) target.style.display = 'block';
    });
  });

  // Perfil
  const btnOpenPerfil = document.getElementById('btn-open-perfil');
  const btnClosePerfil = document.getElementById('btn-close-perfil');
  const modalPerfil = document.getElementById('modal-perfil');
  const btnSalvarPerfil = document.getElementById('btn-salvar-perfil');

  if (btnOpenPerfil) {
    btnOpenPerfil.addEventListener('click', () => {
      const inputPassada = document.getElementById('input-passada');
      const inputPassosBatida = document.getElementById('input-passos-batida');
      const inputPaceLeve = document.getElementById('input-pace-leve');
      const inputPaceForte = document.getElementById('input-pace-forte');

      if (inputPassada) inputPassada.value = perfil.passada;
      if (inputPassosBatida) inputPassosBatida.value = String(perfil.passosPorBatida);
      if (inputPaceLeve) inputPaceLeve.value = perfil.paceLeve;
      if (inputPaceForte) inputPaceForte.value = perfil.paceForte;

      if (modalPerfil) modalPerfil.style.display = 'flex';
    });
  }

  if (btnClosePerfil && modalPerfil) {
    btnClosePerfil.addEventListener('click', () => {
      modalPerfil.style.display = 'none';
    });

    modalPerfil.addEventListener('click', (e) => {
      if (e.target === modalPerfil) {
        modalPerfil.style.display = 'none';
      }
    });
  }

  if (btnSalvarPerfil) {
    btnSalvarPerfil.addEventListener('click', () => {
      const inputPassada = document.getElementById('input-passada');
      const inputPassosBatida = document.getElementById('input-passos-batida');
      const inputPaceLeve = document.getElementById('input-pace-leve');
      const inputPaceForte = document.getElementById('input-pace-forte');

      const novaPassada = Number(inputPassada?.value);
      const novosPassosPorBatida = Number(inputPassosBatida?.value);
      const novoPaceLeve = inputPaceLeve?.value.trim() || '';
      const novoPaceForte = inputPaceForte?.value.trim() || '';

      if (!isFinite(novaPassada) || novaPassada <= 0) {
        alert('Passada inválida.');
        return;
      }

      if (!isFinite(novosPassosPorBatida) || novosPassosPorBatida <= 0) {
        alert('Passos por batida inválido.');
        return;
      }

      if (!paceToSeconds(novoPaceLeve)) {
        alert('Pace leve inválido. Use formato 6:30');
        return;
      }

      if (!paceToSeconds(novoPaceForte)) {
        alert('Pace forte inválido. Use formato 4:30');
        return;
      }

      perfil.passada = novaPassada;
      perfil.passosPorBatida = novosPassosPorBatida;
      perfil.paceLeve = novoPaceLeve;
      perfil.paceForte = novoPaceForte;

      salvarPerfil();

      if (modalPerfil) modalPerfil.style.display = 'none';

      if (audioBuffer) {
        updateUI(currentRate);
        updateAnalise();
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
carregarPerfil();
carregarZonas();
renderZonas();
bindEvents();