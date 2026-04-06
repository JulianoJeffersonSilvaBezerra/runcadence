const PERFIL_DEFAULT = {
  passada: 1.25,
  variacao: 0.05,
  cadenciaBase: 170,
  modo: "1:1",
  paceLeve: "6:30",
  paceForte: "4:30"
};

let perfil = { ...PERFIL_DEFAULT };
let BPM_ORIGINAL = 120;
let ultimoAutoAjuste = null;

let zonas = [
  { id: 1, nome: "Zona 1 — Leve", paceMin: "6:01", paceMax: "9:00", musicas: [] },
  { id: 2, nome: "Zona 2 — Confortável", paceMin: "5:31", paceMax: "6:00", musicas: [] },
  { id: 3, nome: "Zona 3 — Progressivo", paceMin: "5:01", paceMax: "5:30", musicas: [] },
  { id: 4, nome: "Zona 4 — Forte", paceMin: "4:31", paceMax: "5:00", musicas: [] },
  { id: 5, nome: "Zona 5 — Agressivo", paceMin: "0:00", paceMax: "4:30", musicas: [] }
];

let zonaIdCounter = 6;
let zonasAbertas = {};

let audioCtx = null;
let sourceNode = null;
let audioBuffer = null;
let gainNode = null;
let startedAt = 0;
let pausedAt = 0;
let isPlaying = false;
let playbackRate = 1.0;
let rafId = null;
let currentFileName = "";

function el(id) {
  return document.getElementById(id);
}

function normalizePerfil(raw) {
  const p = { ...PERFIL_DEFAULT, ...(raw || {}) };

  p.passada = Number(p.passada);
  if (!Number.isFinite(p.passada) || p.passada <= 0) {
    p.passada = PERFIL_DEFAULT.passada;
  }

  p.variacao = Number(p.variacao);
  if (!Number.isFinite(p.variacao) || p.variacao <= 0) {
    p.variacao = PERFIL_DEFAULT.variacao;
  }

  p.cadenciaBase = Number(p.cadenciaBase);
  if (!Number.isFinite(p.cadenciaBase) || p.cadenciaBase <= 0) {
    p.cadenciaBase = PERFIL_DEFAULT.cadenciaBase;
  }

  p.modo = ["1:1", "2:1"].includes(String(p.modo)) ? String(p.modo) : "1:1";
  p.paceLeve = p.paceLeve || PERFIL_DEFAULT.paceLeve;
  p.paceForte = p.paceForte || PERFIL_DEFAULT.paceForte;

  return p;
}

function carregarPerfil() {
  const salvo = localStorage.getItem("pacemusic_perfil");
  if (!salvo) {
    perfil = { ...PERFIL_DEFAULT };
    return;
  }

  try {
    perfil = normalizePerfil(JSON.parse(salvo));
  } catch {
    perfil = { ...PERFIL_DEFAULT };
  }
}

function salvarPerfilStorage() {
  localStorage.setItem("pacemusic_perfil", JSON.stringify(perfil));
}

function carregarZonas() {
  const salvo = localStorage.getItem("pacemusic_zonas");
  if (!salvo) return;

  try {
    const parsed = JSON.parse(salvo);
    if (Array.isArray(parsed)) {
      zonas = parsed;
      zonaIdCounter = Math.max(...zonas.map(z => z.id), 0) + 1;
    }
  } catch {
    // mantém padrão
  }
}

function salvarZonas() {
  localStorage.setItem("pacemusic_zonas", JSON.stringify(zonas));
}

function paceToSeconds(str) {
  if (!str) return null;

  const parts = String(str).trim().replace(",", ":").split(":");
  if (parts.length !== 2) return null;

  const min = parseInt(parts[0], 10);
  const sec = parseInt(parts[1], 10);

  if (!Number.isFinite(min) || !Number.isFinite(sec) || sec < 0 || sec > 59) {
    return null;
  }

  return min * 60 + sec;
}

function secondsToPace(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "—";

  const rounded = Math.round(totalSeconds);
  const min = Math.floor(rounded / 60);
  const sec = rounded % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function formatTime(secs) {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const min = Math.floor(secs / 60);
  const sec = Math.floor(secs % 60);
  return `${min}:${String(sec).padStart(2, "0")}`;
}

function getTipoPorPace(pace) {
  const s = typeof pace === "string" ? paceToSeconds(pace) : pace;
  if (!s) return ["—", "badge-moderado"];
  if (s > 360) return ["leve", "badge-leve"];
  if (s > 330) return ["confortável", "badge-moderado"];
  if (s > 300) return ["progressivo", "badge-forte"];
  return ["agressivo", "badge-agressivo"];
}

function paceSecondsFromCadenceStride(cadencia, passada) {
  if (!Number.isFinite(cadencia) || cadencia <= 0) return null;
  if (!Number.isFinite(passada) || passada <= 0) return null;

  const metrosPorMinuto = cadencia * passada;
  const segundosPorKm = 60000 / metrosPorMinuto;
  return segundosPorKm;
}

function resolverCadencia(bpm, preferCadencia = null) {
  const alvoCadencia = preferCadencia || perfil.cadenciaBase;

  const candidatos = [
    { modo: "1:1", multiplicador: 1, cadencia: bpm, label: "1 passo por batida" },
    { modo: "2:1", multiplicador: 2, cadencia: bpm * 2, label: "2 passos por batida" }
  ];

  if (perfil.modo === "1:1" || perfil.modo === "2:1") {
    return candidatos.find(c => c.modo === perfil.modo);
  }

  return candidatos.reduce((melhor, atual) => {
    const dAtual = Math.abs(atual.cadencia - alvoCadencia);
    const dMelhor = Math.abs(melhor.cadencia - alvoCadencia);
    return dAtual < dMelhor ? atual : melhor;
  });
}

function computeMetricsFromBpm(bpm, preferCadencia = null) {
  const sync = resolverCadencia(bpm, preferCadencia);

  const passadaMin = Math.max(0.2, perfil.passada - perfil.variacao);
  const passadaMax = perfil.passada + perfil.variacao;

  const paceCentroSec = paceSecondsFromCadenceStride(sync.cadencia, perfil.passada);
  const paceLentoSec = paceSecondsFromCadenceStride(sync.cadencia, passadaMin);
  const paceRapidoSec = paceSecondsFromCadenceStride(sync.cadencia, passadaMax);

  return {
    bpm: Math.round(bpm),
    cadencia: Math.round(sync.cadencia),
    paceCenterSec: paceCentroSec,
    paceCenter: secondsToPace(paceCentroSec),
    paceFast: secondsToPace(paceRapidoSec),
    paceSlow: secondsToPace(paceLentoSec),
    paceRange: `${secondsToPace(paceRapidoSec)} – ${secondsToPace(paceLentoSec)}`,
    syncLabel: sync.label,
    syncMultiplier: sync.multiplicador
  };
}

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

  let bpm = Math.round((200 / median) * 60);

  if (bpm < 80) bpm *= 2;
  if (bpm > 200) bpm = Math.round(bpm / 2);

  return bpm;
}

function play() {
  if (!audioBuffer || isPlaying) return;

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.playbackRate.value = playbackRate;
  sourceNode.connect(gainNode);
  sourceNode.start(0, pausedAt);

  startedAt = audioCtx.currentTime - pausedAt;
  isPlaying = true;

  el("play-icon").innerHTML =
    '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';

  updateProgress();

  sourceNode.onended = () => {
    if (!isPlaying) return;

    isPlaying = false;
    pausedAt = 0;
    cancelAnimationFrame(rafId);

    el("play-icon").innerHTML =
      '<polygon points="5 3 19 12 5 21 5 3"/>';

    el("prog").style.width = "0%";
    el("time-cur").textContent = "0:00";
  };
}

function pause() {
  if (!isPlaying) return;

  pausedAt = audioCtx.currentTime - startedAt;
  sourceNode.onended = null;
  sourceNode.stop();
  isPlaying = false;

  cancelAnimationFrame(rafId);

  el("play-icon").innerHTML =
    '<polygon points="5 3 19 12 5 21 5 3"/>';
}

function seek(toSec) {
  if (!audioBuffer) return;

  const wasPlaying = isPlaying;

  if (isPlaying) {
    sourceNode.onended = null;
    sourceNode.stop();
    isPlaying = false;
    cancelAnimationFrame(rafId);
  }

  pausedAt = Math.max(0, Math.min(toSec, audioBuffer.duration));

  if (wasPlaying) play();
}

function updateProgress() {
  if (!isPlaying || !audioBuffer) return;

  const elapsed = audioCtx.currentTime - startedAt;
  const pct = Math.min((elapsed / audioBuffer.duration) * 100, 100);

  el("prog").style.width = `${pct.toFixed(2)}%`;
  el("time-cur").textContent = formatTime(elapsed);

  rafId = requestAnimationFrame(updateProgress);
}

function loadAudioFile(file) {
  const reader = new FileReader();
  currentFileName = file.name.replace(/\.[^.]+$/, "");

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
        ultimoAutoAjuste = null;

        el("song-title").textContent = currentFileName;
        el("upload-area").style.display = "none";
        el("song-row").style.display = "flex";
        el("player-body").style.display = "block";
        el("time-dur").textContent = formatTime(buffer.duration);

        pausedAt = 0;
        applySpeed(parseInt(el("speed").value, 10));
        updateAnalise();
        play();
      },
      () => {
        alert("Não foi possível decodificar este arquivo de áudio.");
      }
    );
  };

  reader.readAsArrayBuffer(file);
}

function updateStats(speedPct) {
  const bpmAtual = Math.round(BPM_ORIGINAL * speedPct / 100);
  const preferCadencia = ultimoAutoAjuste?.targetCadencia || perfil.cadenciaBase;
  const metrics = computeMetricsFromBpm(bpmAtual, preferCadencia);

  el("speed-out").textContent = `${speedPct}%`;
  el("stat-bpm").textContent = metrics.bpm;
  el("stat-cad").textContent = metrics.cadencia;
  el("stat-pace").textContent = metrics.paceCenter;
  el("stat-faixa").textContent = `faixa provável: ${metrics.paceRange}`;

  el("stat-sub").textContent =
    `passada ${perfil.passada.toFixed(2)} m • variação ±${perfil.variacao.toFixed(2)} m • modo ${metrics.syncLabel}`;

  el("warn").style.display = speedPct >= 120 ? "block" : "none";

  const [tipo, classe] = getTipoPorPace(metrics.paceCenterSec);
  const badge = el("badge-tipo");
  badge.textContent = tipo;
  badge.className = `badge ${classe}`;
}

function applySpeed(speedPct) {
  playbackRate = speedPct / 100;

  if (isPlaying && sourceNode) {
    sourceNode.playbackRate.value = playbackRate;
  }

  updateStats(speedPct);

  if (audioBuffer) {
    updateAnalise();
  }
}

function updateAnalise() {
  if (!audioBuffer) return;

  el("analise-empty").style.display = "none";
  el("analise-content").style.display = "block";

  el("analise-bpm").textContent = BPM_ORIGINAL;
  el("analise-passada").textContent = perfil.passada.toFixed(2);

  const velocidades = [75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130];
  const tbody = el("pace-tbody");
  tbody.innerHTML = "";

  const speedAtual = parseInt(el("speed").value, 10);
  const preferCadencia = ultimoAutoAjuste?.targetCadencia || perfil.cadenciaBase;

  velocidades.forEach((v) => {
    const bpm = Math.round(BPM_ORIGINAL * v / 100);
    const metrics = computeMetricsFromBpm(bpm, preferCadencia);

    const tr = document.createElement("tr");
    if (v === speedAtual) tr.classList.add("active");

    tr.innerHTML = `
      <td>${v}%</td>
      <td>${metrics.bpm} / ${metrics.cadencia}</td>
      <td>${metrics.paceCenter}</td>
    `;

    tbody.appendChild(tr);
  });

  const currentBpm = Math.round(BPM_ORIGINAL * speedAtual / 100);
  const currentMetrics = computeMetricsFromBpm(currentBpm, preferCadencia);
  const [tipo, classe] = getTipoPorPace(currentMetrics.paceCenterSec);

  const badge = el("analise-badge");
  badge.textContent = tipo;
  badge.className = `badge ${classe}`;
}

function renderZonaBody(zona) {
  const musicasHtml =
    zona.musicas.length === 0
      ? '<div class="zona-empty">nenhuma música ainda</div>'
      : `
        <div class="zona-musicas">
          ${zona.musicas
            .map(
              (m, i) => `
                <div class="zona-musica-item">
                  <span class="zona-musica-nome">🎵 ${m.nome}</span>
                  <span class="zona-musica-pace">${m.pace} min/km</span>
                  <button class="btn-remove-musica" data-zona="${zona.id}" data-musica="${i}" title="remover">✕</button>
                </div>
              `
            )
            .join("")}
        </div>
      `;

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

function renderZonas() {
  const container = el("zonas-lista");
  container.innerHTML = "";

  zonas.forEach((zona) => {
    const aberta = zonasAbertas[zona.id];
    const [, badgeCls] = getTipoPorPace(zona.paceMin);

    const div = document.createElement("div");
    div.className = "zona-card";
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
          <span class="zona-count">${zona.musicas.length} música${zona.musicas.length !== 1 ? "s" : ""}</span>
          <span class="zona-toggle">${aberta ? "▲" : "▼"}</span>
        </div>
      </div>
      ${aberta ? renderZonaBody(zona) : ""}
    `;

    div.querySelector(".zona-header").addEventListener("click", () => {
      zonasAbertas[zona.id] = !zonasAbertas[zona.id];
      renderZonas();
    });

    container.appendChild(div);

    if (!aberta) return;

    const btnSalvar = div.querySelector(".btn-zona-salvar");
    if (btnSalvar) {
      btnSalvar.addEventListener("click", (e) => {
        e.stopPropagation();

        const id = parseInt(btnSalvar.dataset.id, 10);
        const nome = div.querySelector(".input-zona-nome").value.trim();
        const paceMin = div.querySelector(".input-zona-pmin").value.trim();
        const paceMax = div.querySelector(".input-zona-pmax").value.trim();

        const z = zonas.find((item) => item.id === id);
        if (!z || !nome) return;

        z.nome = nome;
        z.paceMin = paceMin;
        z.paceMax = paceMax;
        salvarZonas();
        renderZonas();
      });
    }

    const btnApagar = div.querySelector(".btn-zona-apagar");
    if (btnApagar) {
      btnApagar.addEventListener("click", (e) => {
        e.stopPropagation();

        const id = parseInt(btnApagar.dataset.id, 10);
        if (!confirm("Apagar esta zona?")) return;

        zonas = zonas.filter((z) => z.id !== id);
        salvarZonas();
        renderZonas();
      });
    }

    div.querySelectorAll(".btn-remove-musica").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();

        const zonaId = parseInt(btn.dataset.zona, 10);
        const musicaId = parseInt(btn.dataset.musica, 10);

        const z = zonas.find((item) => item.id === zonaId);
        if (!z) return;

        z.musicas = z.musicas.filter((_, i) => i !== musicaId);
        salvarZonas();
        renderZonas();
      });
    });
  });
}

function abrirSaveModal() {
  if (!audioBuffer) {
    alert("Carregue uma música primeiro.");
    return;
  }

  const speedPct = parseInt(el("speed").value, 10);
  const bpm = Math.round(BPM_ORIGINAL * speedPct / 100);
  const pace = computeMetricsFromBpm(
    bpm,
    ultimoAutoAjuste?.targetCadencia || perfil.cadenciaBase
  ).paceCenter;

  el("save-music-name").textContent = currentFileName || "música";

  const opts = el("save-zona-opts");
  opts.innerHTML = "";

  zonas.forEach((zona) => {
    const btn = document.createElement("button");
    btn.className = "save-zona-btn";
    btn.textContent = `${zona.nome} (${zona.paceMin}–${zona.paceMax})`;

    btn.addEventListener("click", () => {
      zona.musicas.push({
        nome: currentFileName || "música",
        pace
      });

      salvarZonas();
      renderZonas();
      el("save-modal").style.display = "none";

      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelector('[data-tab="2"]').classList.add("active");
      document.querySelectorAll('[id^="panel-"]').forEach((p) => {
        p.style.display = "none";
      });
      el("panel-2").style.display = "block";

      zonasAbertas[zona.id] = true;
      renderZonas();
    });

    opts.appendChild(btn);
  });

  el("save-modal").style.display = "block";
}

function preencherModalPerfil() {
  el("input-passada").value = perfil.passada;
  el("input-cadencia").value = perfil.cadenciaBase;
  el("input-variacao").value = perfil.variacao;
  el("input-modo").value = perfil.modo;
  el("input-pace-leve").value = perfil.paceLeve;
  el("input-pace-forte").value = perfil.paceForte;
}

function salvarPerfilDoFormulario() {
  const passada = parseFloat(el("input-passada").value);
  const cadencia = parseInt(el("input-cadencia").value, 10);
  const variacao = parseFloat(el("input-variacao").value);
  const modo = el("input-modo").value;
  const paceLeve = el("input-pace-leve").value.trim();
  const paceForte = el("input-pace-forte").value.trim();

  if (!Number.isFinite(passada) || passada <= 0) {
    alert("Passada inválida.");
    return;
  }

  if (!Number.isFinite(cadencia) || cadencia <= 0) {
    alert("Cadência base inválida.");
    return;
  }

  if (!Number.isFinite(variacao) || variacao <= 0) {
    alert("Variação da passada inválida.");
    return;
  }

  if (!paceToSeconds(paceLeve)) {
    alert("Pace leve inválido. Use o formato 6:30");
    return;
  }

  if (!paceToSeconds(paceForte)) {
    alert("Pace forte inválido. Use o formato 4:30");
    return;
  }

  perfil = normalizePerfil({
    ...perfil,
    passada,
    cadenciaBase: cadencia,
    variacao,
    modo,
    paceLeve,
    paceForte
  });

  salvarPerfilStorage();
  el("modal-perfil").style.display = "none";

  updateStats(parseInt(el("speed").value, 10));

  if (audioBuffer) {
    updateAnalise();
  }
}

function autoAjustarMusica() {
  if (!audioBuffer) {
    alert("Carregue uma música primeiro.");
    return;
  }

  const raw = el("pace-target").value;
  const targetSec = paceToSeconds(raw);

  if (!targetSec) {
    alert("Digite o pace no formato correto. Exemplo: 5:45");
    return;
  }

  const targetCadencia = 60000 / (targetSec * perfil.passada);

  const multiplicadores = perfil.modo === "2:1" ? [2] : [1];

  const candidatos = multiplicadores
    .map((mult) => {
      const bpmNecessario = targetCadencia / mult;
      const speedRaw = (bpmNecessario / BPM_ORIGINAL) * 100;
      const speedClamped = Math.max(75, Math.min(130, Math.round(speedRaw)));
      const bpmFinal = Math.round(BPM_ORIGINAL * speedClamped / 100);
      const metrics = computeMetricsFromBpm(bpmFinal, targetCadencia);

      return {
        mult,
        speedRaw,
        speedClamped,
        metrics,
        diff: Math.abs(metrics.paceCenterSec - targetSec),
        clamped: Math.round(speedRaw) !== speedClamped
      };
    })
    .sort((a, b) => a.diff - b.diff);

  const best = candidatos[0];

  ultimoAutoAjuste = {
    targetSec,
    targetCadencia,
    multiplicador: best.mult
  };

  el("speed").value = best.speedClamped;
  applySpeed(best.speedClamped);
}

function trocarMusica() {
  if (isPlaying) pause();

  pausedAt = 0;
  audioBuffer = null;
  ultimoAutoAjuste = null;
  currentFileName = "";

  el("upload-area").style.display = "block";
  el("song-row").style.display = "none";
  el("player-body").style.display = "none";
  el("file-input").value = "";

  el("analise-empty").style.display = "block";
  el("analise-content").style.display = "none";

  el("prog").style.width = "0%";
  el("time-cur").textContent = "0:00";
  el("time-dur").textContent = "0:00";
}

el("upload-trigger").addEventListener("click", () => {
  el("file-input").click();
});

el("file-input").addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    loadAudioFile(e.target.files[0]);
  }
});

const uploadArea = el("upload-area");

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");

  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("audio/")) {
    loadAudioFile(file);
  }
});

el("btn-play").addEventListener("click", () => {
  if (isPlaying) pause();
  else play();
});

el("btn-back").addEventListener("click", () => {
  if (!audioBuffer) return;
  const atual = isPlaying ? audioCtx.currentTime - startedAt : pausedAt;
  seek(atual - 10);
});

el("btn-fwd").addEventListener("click", () => {
  if (!audioBuffer) return;
  const atual = isPlaying ? audioCtx.currentTime - startedAt : pausedAt;
  seek(atual + 10);
});

el("progress-wrap").addEventListener("click", (e) => {
  if (!audioBuffer) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = (e.clientX - rect.left) / rect.width;
  seek(ratio * audioBuffer.duration);
});

el("speed").addEventListener("input", (e) => {
  applySpeed(parseInt(e.target.value, 10));
});

el("btn-auto").addEventListener("click", autoAjustarMusica);
el("btn-trocar").addEventListener("click", trocarMusica);
el("btn-save-playlist").addEventListener("click", abrirSaveModal);

el("btn-cancel-save").addEventListener("click", () => {
  el("save-modal").style.display = "none";
});

el("btn-add-zona").addEventListener("click", () => {
  zonas.push({
    id: zonaIdCounter++,
    nome: "Nova zona",
    paceMin: "0:00",
    paceMax: "9:59",
    musicas: []
  });

  salvarZonas();
  zonasAbertas[zonas[zonas.length - 1].id] = true;
  renderZonas();
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");

    document.querySelectorAll('[id^="panel-"]').forEach((p) => {
      p.style.display = "none";
    });

    el(`panel-${tab.dataset.tab}`).style.display = "block";
  });
});

el("btn-open-perfil").addEventListener("click", () => {
  preencherModalPerfil();
  el("modal-perfil").style.display = "flex";
});

el("btn-close-perfil").addEventListener("click", () => {
  el("modal-perfil").style.display = "none";
});

el("modal-perfil").addEventListener("click", (e) => {
  if (e.target === el("modal-perfil")) {
    el("modal-perfil").style.display = "none";
  }
});

el("btn-salvar-perfil").addEventListener("click", salvarPerfilDoFormulario);

carregarPerfil();
carregarZonas();
renderZonas();
preencherModalPerfil();
updateStats(parseInt(el("speed").value, 10));