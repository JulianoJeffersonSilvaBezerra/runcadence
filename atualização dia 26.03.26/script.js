// ═══════════════════════════════════════════════════════════════
// SPLASH → APP
// ═══════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  setTimeout(() => {
    const splash = document.getElementById('splash');
    splash.style.opacity = '0';
    setTimeout(() => {
      splash.style.display = 'none';
      document.getElementById('app').style.display = 'flex';
    }, 500);
  }, 2200);
});

// ═══════════════════════════════════════════════════════════════
// PERFIL
// ═══════════════════════════════════════════════════════════════
let perfil = { passada: 1.25, paceLeve: '6:30', paceFort: '4:30' };

function carregarPerfil() {
  const s = localStorage.getItem('paceup_perfil');
  if (s) perfil = JSON.parse(s);
}
function salvarPerfil() {
  localStorage.setItem('paceup_perfil', JSON.stringify(perfil));
}

// ═══════════════════════════════════════════════════════════════
// ZONAS
// ═══════════════════════════════════════════════════════════════
let zonas = [
  { id:1, nome:'Zona 1 — Leve',        paceMin:'6:01', paceMax:'9:00', musicas:[] },
  { id:2, nome:'Zona 2 — Confortável', paceMin:'5:31', paceMax:'6:00', musicas:[] },
  { id:3, nome:'Zona 3 — Progressivo', paceMin:'5:01', paceMax:'5:30', musicas:[] },
  { id:4, nome:'Zona 4 — Forte',       paceMin:'4:31', paceMax:'5:00', musicas:[] },
  { id:5, nome:'Zona 5 — Agressivo',   paceMin:'0:00', paceMax:'4:30', musicas:[] },
];
let zonaIdCounter = 6;
let zonasAbertas  = {};

function carregarZonas() {
  const s = localStorage.getItem('paceup_zonas');
  if (s) {
    zonas = JSON.parse(s);
    zonaIdCounter = Math.max(...zonas.map(z => z.id)) + 1;
  }
}
function salvarZonas() {
  localStorage.setItem('paceup_zonas', JSON.stringify(zonas));
}

// ═══════════════════════════════════════════════════════════════
// CÁLCULOS
// ═══════════════════════════════════════════════════════════════
let BPM_ORIGINAL = 128;

function bpmToPace(bpm) {
  const mpm = bpm * perfil.passada;
  const spk = 60000 / mpm;
  const m   = Math.floor(spk / 60);
  const s   = Math.round(spk % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function paceToSeconds(str) {
  if (!str) return null;
  const p = str.trim().split(':');
  if (p.length !== 2) return null;
  const m = parseInt(p[0]), s = parseInt(p[1]);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

function getTipo(pace) {
  const s = paceToSeconds(pace);
  if (!s) return ['—', 'badge-moderado'];
  if (s > 360) return ['leve',        'badge-leve'];
  if (s > 330) return ['confortável',  'badge-moderado'];
  if (s > 300) return ['progressivo',  'badge-forte'];
  return             ['agressivo',     'badge-agressivo'];
}

function formatTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// velocidade (0.75–1.30) → pace em formato "5:18"
function speedToPace(rate) {
  const bpm = BPM_ORIGINAL * rate;
  return bpmToPace(bpm);
}

// pace "5:45" → velocidade ideal
function paceToSpeed(paceStr) {
  const sec = paceToSeconds(paceStr);
  if (!sec) return 1.0;
  const bpmNecessario = 60000 / (sec * perfil.passada);
  return bpmNecessario / BPM_ORIGINAL;
}

// velocidade em km/h a partir de pace
function paceToKmh(paceStr) {
  const sec = paceToSeconds(paceStr);
  if (!sec) return '—';
  return (3600 / sec).toFixed(1) + ' km/h';
}

// ═══════════════════════════════════════════════════════════════
// ESTIMATIVA DE BPM
// ═══════════════════════════════════════════════════════════════
function estimateBPM(buffer) {
  const data       = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const step       = Math.floor(sampleRate / 200);
  const energies   = [];

  for (let i = 0; i < data.length - step; i += step) {
    let sum = 0;
    for (let j = 0; j < step; j++) sum += data[i+j] * data[i+j];
    energies.push(sum / step);
  }

  const avg       = energies.reduce((a,b) => a+b, 0) / energies.length;
  const threshold = avg * 1.4;
  const peaks     = [];
  let lastPeak    = -10;

  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold &&
        energies[i] > energies[i-1] &&
        energies[i] > energies[i+1] &&
        i - lastPeak > 10) {
      peaks.push(i);
      lastPeak = i;
    }
  }

  if (peaks.length < 4) return 120;

  const intervals = [];
  for (let i = 1; i < Math.min(peaks.length, 60); i++) intervals.push(peaks[i] - peaks[i-1]);
  intervals.sort((a,b) => a-b);
  const median = intervals[Math.floor(intervals.length / 2)];
  let bpm = Math.round((200 / median) * 60);
  if (bpm < 80)  bpm *= 2;
  if (bpm > 200) bpm  = Math.round(bpm / 2);
  return bpm;
}

// ═══════════════════════════════════════════════════════════════
// ÁUDIO — Web Audio API
// Usa playbackRate nativo (mais fluido) com aviso de distorção
// SoundTouch pode ser integrado aqui na fase 2
// ═══════════════════════════════════════════════════════════════
let audioCtx    = null;
let sourceNode  = null;
let audioBuffer = null;
let gainNode    = null;
let startedAt   = 0;
let pausedAt    = 0;
let isPlaying   = false;
let rafId       = null;
let currentFileName = '';

// playbackRate: 0.75 a 1.30  (75% a 130%)
// step dos botões +/-: 0.02 (2%)
let currentRate = 1.0;
const RATE_MIN  = 0.75;
const RATE_MAX  = 1.30;
const RATE_STEP = 0.02;

function play() {
  if (!audioBuffer || isPlaying) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.playbackRate.value = currentRate;
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
  const was = isPlaying;
  if (isPlaying) { sourceNode.onended = null; sourceNode.stop(); isPlaying = false; cancelAnimationFrame(rafId); }
  pausedAt = Math.max(0, Math.min(toSec, audioBuffer.duration));
  if (was) play();
}

function updateProgress() {
  if (!isPlaying || !audioBuffer) return;
  const elapsed = audioCtx.currentTime - startedAt;
  const pct     = Math.min((elapsed / audioBuffer.duration) * 100, 100);
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
      gainNode  = audioCtx.createGain();
      gainNode.connect(audioCtx.destination);
    }

    audioCtx.decodeAudioData(e.target.result, (buffer) => {
      audioBuffer  = buffer;
      BPM_ORIGINAL = estimateBPM(buffer);
      currentRate  = 1.0;

      document.getElementById('song-title').textContent = currentFileName;
      document.getElementById('upload-area').style.display  = 'none';
      document.getElementById('song-row').style.display     = 'flex';
      document.getElementById('player-body').style.display  = 'block';
      document.getElementById('time-dur').textContent = formatTime(buffer.duration);

      updateUI(currentRate);
      updateAnalise();

      pausedAt = 0;
      play();
    }, () => alert('Não foi possível decodificar este arquivo de áudio.'));
  };

  reader.readAsArrayBuffer(file);
}

// ═══════════════════════════════════════════════════════════════
// UPDATE UI
// ═══════════════════════════════════════════════════════════════
function updateUI(rate) {
  rate = Math.max(RATE_MIN, Math.min(RATE_MAX, rate));
  currentRate = rate;

  // Aplica ao player se estiver tocando
  if (isPlaying && sourceNode) sourceNode.playbackRate.value = rate;

  const pct     = Math.round(rate * 100);
  const bpm     = Math.round(BPM_ORIGINAL * rate);
  const pace    = speedToPace(rate);

  // Faixa de pace (±variação de passada de 0.05m)
  const passadaMin = Math.max(0.5, perfil.passada - 0.05);
  const passadaMax = perfil.passada + 0.05;
  const paceMinStr = bpmToPaceComPassada(bpm, passadaMax); // passada maior → pace menor
  const paceMaxStr = bpmToPaceComPassada(bpm, passadaMin); // passada menor → pace maior

  // Pace principal
  document.getElementById('pace-main').textContent = pace;
  document.getElementById('pace-min-val').textContent = paceMinStr;
  document.getElementById('pace-max-val').textContent = paceMaxStr;

  // Stats inline
  document.getElementById('stat-bpm').textContent = bpm;
  document.getElementById('stat-cad').textContent = bpm;
  document.getElementById('stat-vel').textContent = paceToKmh(pace);

  // Badge
  const [tipo, cls] = getTipo(pace);
  const badge = document.getElementById('badge-tipo');
  badge.textContent = tipo;
  badge.className   = 'badge ' + cls;

  // Speed feedback bar
  const trackPct = ((rate - RATE_MIN) / (RATE_MAX - RATE_MIN)) * 100;
  document.getElementById('speed-thumb').style.left = trackPct.toFixed(1) + '%';
  document.getElementById('speed-pct').textContent  = pct + '%';

  // Warning
  document.getElementById('warn').style.display = rate >= 1.20 ? 'block' : 'none';

  // Cor do pace muda por zona
  const paceEl = document.getElementById('pace-main');
  const sec    = paceToSeconds(pace);
  if      (sec > 360) paceEl.style.color = 'var(--leve)';
  else if (sec > 330) paceEl.style.color = 'var(--moderado)';
  else if (sec > 300) paceEl.style.color = 'var(--forte)';
  else                paceEl.style.color = 'var(--agressivo)';
}

function bpmToPaceComPassada(bpm, passada) {
  const mpm = bpm * passada;
  const spk = 60000 / mpm;
  const m   = Math.floor(spk / 60);
  const s   = Math.round(spk % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// ═══════════════════════════════════════════════════════════════
// ANÁLISE
// ═══════════════════════════════════════════════════════════════
function updateAnalise() {
  document.getElementById('analise-empty').style.display   = 'none';
  document.getElementById('analise-content').style.display = 'block';
  document.getElementById('analise-bpm').textContent       = BPM_ORIGINAL;
  document.getElementById('analise-passada').textContent   = perfil.passada.toFixed(2);

  const velocidades = [80, 85, 90, 95, 100, 105, 110, 115, 120];
  const tbody = document.getElementById('pace-tbody');
  tbody.innerHTML = '';

  const pctAtual = Math.round(currentRate * 100);

  velocidades.forEach(v => {
    const bpm  = Math.round(BPM_ORIGINAL * v / 100);
    const pace = bpmToPace(bpm);
    const tr   = document.createElement('tr');
    if (v === pctAtual || Math.abs(v - pctAtual) === Math.min(...velocidades.map(x => Math.abs(x - pctAtual)))) {
      tr.classList.add('active');
    }
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
// ZONAS / PLAYLISTS
// ═══════════════════════════════════════════════════════════════
function renderZonas() {
  const container = document.getElementById('zonas-lista');
  container.innerHTML = '';

  zonas.forEach(zona => {
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

    div.querySelector('.zona-header').addEventListener('click', () => {
      zonasAbertas[zona.id] = !zonasAbertas[zona.id];
      renderZonas();
    });

    container.appendChild(div);

    if (aberta) {
      const btnS = div.querySelector('.btn-zona-salvar');
      if (btnS) btnS.addEventListener('click', (e) => {
        e.stopPropagation();
        const id   = parseInt(btnS.dataset.id);
        const nome = div.querySelector('.input-zona-nome').value.trim();
        const pMin = div.querySelector('.input-zona-pmin').value.trim();
        const pMax = div.querySelector('.input-zona-pmax').value.trim();
        const z    = zonas.find(z => z.id === id);
        if (z && nome) { z.nome = nome; z.paceMin = pMin; z.paceMax = pMax; }
        salvarZonas(); renderZonas();
      });

      const btnA = div.querySelector('.btn-zona-apagar');
      if (btnA) btnA.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Apagar esta zona?')) {
          zonas = zonas.filter(z => z.id !== parseInt(btnA.dataset.id));
          salvarZonas(); renderZonas();
        }
      });

      div.querySelectorAll('.btn-remove-musica').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const z = zonas.find(z => z.id === parseInt(btn.dataset.zona));
          if (z) z.musicas.splice(parseInt(btn.dataset.musica), 1);
          salvarZonas(); renderZonas();
        });
      });
    }
  });
}

function renderZonaBody(zona) {
  const musicasHtml = zona.musicas.length === 0
    ? `<div class="zona-empty">nenhuma música ainda</div>`
    : `<div class="zona-musicas">${zona.musicas.map((m, i) => `
        <div class="zona-musica-item">
          <span class="zona-musica-nome">🎵 ${m.nome}</span>
          <span class="zona-musica-pace">${m.pace} min/km</span>
          <button class="btn-remove-musica" data-zona="${zona.id}" data-musica="${i}">✕</button>
        </div>`).join('')}
      </div>`;

  return `<div class="zona-body" onclick="event.stopPropagation()">
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
  </div>`;
}

function getTipoPorPaceRange(paceMin) {
  const s = paceToSeconds(paceMin);
  if (!s) return ['—', 'badge-moderado'];
  if (s > 360) return ['leve',       'badge-leve'];
  if (s > 330) return ['confortável', 'badge-moderado'];
  if (s > 300) return ['progressivo', 'badge-forte'];
  return            ['agressivo',    'badge-agressivo'];
}

function abrirSaveModal() {
  if (!audioBuffer) { alert('Carregue uma música primeiro.'); return; }

  const pace = speedToPace(currentRate);
  document.getElementById('save-music-name').textContent = currentFileName || 'música';

  const opts = document.getElementById('save-zona-opts');
  opts.innerHTML = '';

  zonas.forEach(zona => {
    const btn = document.createElement('button');
    btn.className   = 'save-zona-btn';
    btn.textContent = `${zona.nome}  (${zona.paceMin} – ${zona.paceMax})`;
    btn.addEventListener('click', () => {
      zona.musicas.push({ nome: currentFileName || 'música', pace });
      salvarZonas();
      renderZonas();
      document.getElementById('save-modal').style.display = 'none';
      // Vai para aba playlists
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
document.getElementById('upload-trigger').addEventListener('click', () => document.getElementById('file-input').click());
document.getElementById('file-input').addEventListener('change', (e) => { if (e.target.files[0]) loadAudioFile(e.target.files[0]); });
const uploadArea = document.getElementById('upload-area');
uploadArea.addEventListener('dragover',  (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
uploadArea.addEventListener('dragleave', ()  => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault(); uploadArea.classList.remove('dragover');
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith('audio/')) loadAudioFile(f);
});

// Player
document.getElementById('btn-play').addEventListener('click', () => isPlaying ? pause() : play());
document.getElementById('btn-back').addEventListener('click', () => { if (audioBuffer) seek((isPlaying ? audioCtx.currentTime - startedAt : pausedAt) - 10); });
document.getElementById('btn-fwd').addEventListener('click',  () => { if (audioBuffer) seek((isPlaying ? audioCtx.currentTime - startedAt : pausedAt) + 10); });
document.getElementById('progress-wrap').addEventListener('click', (e) => {
  if (!audioBuffer) return;
  const r = e.currentTarget.getBoundingClientRect();
  seek(((e.clientX - r.left) / r.width) * audioBuffer.duration);
});

// ── BOTÕES + e − de pace ──────────────────────────────────────
document.getElementById('btn-pace-plus').addEventListener('click', () => {
  // + acelera a música → pace menor (mais rápido)
  updateUI(Math.min(RATE_MAX, currentRate + RATE_STEP));
});

document.getElementById('btn-pace-minus').addEventListener('click', () => {
  // − desacelera a música → pace maior (mais lento)
  updateUI(Math.max(RATE_MIN, currentRate - RATE_STEP));
});

// Pace alvo direto (input)
document.getElementById('btn-auto').addEventListener('click', () => {
  const raw = document.getElementById('pace-target').value;
  if (!paceToSeconds(raw)) { alert('Digite o pace no formato correto. Exemplo: 5:45'); return; }
  const rate = paceToSpeed(raw);
  updateUI(Math.max(RATE_MIN, Math.min(RATE_MAX, rate)));
});

// Trocar música
document.getElementById('btn-trocar').addEventListener('click', () => {
  if (isPlaying) pause();
  pausedAt = 0; audioBuffer = null; currentRate = 1.0;
  document.getElementById('upload-area').style.display   = 'block';
  document.getElementById('song-row').style.display      = 'none';
  document.getElementById('player-body').style.display   = 'none';
  document.getElementById('file-input').value            = '';
  document.getElementById('analise-empty').style.display = 'block';
  document.getElementById('analise-content').style.display = 'none';
});

// Salvar na playlist
document.getElementById('btn-save-playlist').addEventListener('click', abrirSaveModal);
document.getElementById('btn-cancel-save').addEventListener('click', () => { document.getElementById('save-modal').style.display = 'none'; });

// Adicionar zona
document.getElementById('btn-add-zona').addEventListener('click', () => {
  const nova = { id: zonaIdCounter++, nome: 'Nova zona', paceMin: '0:00', paceMax: '9:59', musicas: [] };
  zonas.push(nova);
  salvarZonas();
  zonasAbertas[nova.id] = true;
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

// Perfil
document.getElementById('btn-open-perfil').addEventListener('click', () => {
  document.getElementById('input-passada').value    = perfil.passada;
  document.getElementById('input-pace-leve').value  = perfil.paceLeve;
  document.getElementById('input-pace-forte').value = perfil.paceFort;
  document.getElementById('modal-perfil').style.display = 'flex';
});
document.getElementById('btn-close-perfil').addEventListener('click', () => { document.getElementById('modal-perfil').style.display = 'none'; });
document.getElementById('modal-perfil').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal-perfil')) document.getElementById('modal-perfil').style.display = 'none';
});
document.getElementById('btn-salvar-perfil').addEventListener('click', () => {
  const p = parseFloat(document.getElementById('input-passada').value);
  const l = document.getElementById('input-pace-leve').value.trim();
  const f = document.getElementById('input-pace-forte').value.trim();
  if (isNaN(p) || p <= 0)     { alert('Passada inválida.'); return; }
  if (!paceToSeconds(l))      { alert('Pace leve inválido. Use formato 6:30'); return; }
  if (!paceToSeconds(f))      { alert('Pace forte inválido. Use formato 4:30'); return; }
  perfil.passada = p; perfil.paceLeve = l; perfil.paceFort = f;
  salvarPerfil();
  document.getElementById('modal-perfil').style.display = 'none';
  if (audioBuffer) { updateUI(currentRate); updateAnalise(); }
});

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
carregarPerfil();
carregarZonas();
renderZonas();
