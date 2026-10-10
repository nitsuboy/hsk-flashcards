/* HSK1 flashcards — repeticao espacada (SM-2) + audio TTS + pratica de escrita.
   Dados vem de ../data/hsk1.js (window.HSK1_DATA). */

(function () {
  "use strict";

  var DATA = window.HSK1_DATA;
  if (!DATA) {
    document.getElementById("card").textContent =
      "Nao foi possivel carregar data/hsk1.js. Rode: node scripts/build-data.mjs";
    return;
  }

  var ITENS = DATA.itens;
  var KEY = "hsk1.progress.v1";
  var POR_FASE = 25; // 300 palavras / 12 fases de 25

  /* ---------------- estado ---------------- */

  var state = load();
  var queue = [];
  var pos = 0;
  var revealed = false;
  var current = null;
  var skipped = [];

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignora storage corrompido */ }
    return { cards: {}, doneToday: 0, lastDay: "", history: {} };
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* cota cheia */ }
  }

  function cardOf(id) {
    if (!state.cards[id]) {
      state.cards[id] = { reps: 0, ease: 2.5, interval: 0, due: 0, lapses: 0, seen: 0 };
    }
    return state.cards[id];
  }

  function faseOf(id) { return Math.ceil(id / POR_FASE); }

  /* ---------------- SM-2 ---------------- */

  var QUALITY = [1, 3, 4, 5];
  var MIN_EASE = 1.3;

  function schedule(id, grade) {
    var c = cardOf(id);
    var q = QUALITY[grade];
    c.seen++;

    if (q < 3) {
      c.reps = 0;
      c.lapses++;
      c.ease = Math.max(MIN_EASE, c.ease - 0.2);
      c.interval = 0;
      c.due = Date.now() + 10 * 60 * 1000; // relearning: 10 min
      return;
    }

    if (c.reps === 0) c.interval = 1;
    else if (c.reps === 1) c.interval = 6;
    else c.interval = Math.max(1, Math.round(c.interval * c.ease));

    c.ease = Math.max(
      MIN_EASE,
      c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    );
    c.reps++;
    c.due = Date.now() + c.interval * 86400000;
  }

  /* ---------------- selecao da fila ---------------- */

  function isNew(id) { return !state.cards[id] || state.cards[id].seen === 0; }

  function buildQueue() {
    var mode = el("mode").value;
    var topic = el("topic").value;
    var fase = el("fase").value;
    var filter = el("filter").value;
    var limit = Math.max(1, Math.min(100, parseInt(el("limit").value, 10) || 20));
    var now = Date.now();

    var pool = ITENS.filter(function (it) {
      if (topic && it.topico !== topic) return false;
      if (fase && faseOf(it.id) !== parseInt(fase, 10)) return false;
      return true;
    });

    var novos = [], devidos = [];
    pool.forEach(function (it) {
      if (isNew(it.id)) { novos.push(it); return; }
      if (filter === "new") return;
      if (filter === "dueOnly" || filter === "due" || filter === "all") {
        if (filter === "all" || cardOf(it.id).due <= now) devidos.push(it);
      }
    });

    // embaralha os dois grupos, mas mantem os novos no inicio (curva de entrada)
    shuffle(novos);
    shuffle(devidos);
    queue = novos.concat(devidos).slice(0, limit);
    pos = 0;
    skipped = [];
    revealed = false;
    current = null;
    return queue.length;
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  /* ---------------- audio (TTS) ----------------
   * Duas fontes, nesta ordem:
   *  1. voz Mandarin do sistema (speechSynthesis) — offline, melhor latencia
   *  2. Google Translate TTS (web) — funciona sem instalar nada
   * Se nenhuma das duas estiver disponivel, avisamos em vez de falhar em silencio.
   */

  var voice = null;
  var vozDisponivel = false;   // existe zh no speechSynthesis
  var webTtsOk = true;         // usuario pode desligar o fallback web
  var audioEl = null;
  var STATUS_AUDIO = "";

  function isZh(v) { return /^zh/i.test(v.lang || ""); }

  function pickVoice() {
    if (!("speechSynthesis" in window)) { vozDisponivel = false; return; }
    var vs = speechSynthesis.getVoices();
    if (!vs || !vs.length) return;
    voice =
      vs.find(function (v) { return /^zh[-_]?(CN|Hans)/i.test(v.lang); }) ||
      vs.find(isZh) ||
      null;
    vozDisponivel = !!voice;
    renderAudioStatus();
  }

  if ("speechSynthesis" in window) {
    pickVoice();
    speechSynthesis.addEventListener("voiceschanged", pickVoice);
    // Alguns navegadores (Edge no Windows) só populam getVoices() depois,
    // sem disparar voiceschanged. Poll curto resolve.
    var polls = 0;
    var pollId = setInterval(function () {
      if (vozDisponivel || ++polls > 20) { clearInterval(pollId); return; }
      pickVoice();
    }, 250);
  } else {
    renderAudioStatus();
  }

  // Google Translate TTS. Sem chave, sem conta. Devolve mp3.
  function webTtsUrl(text, rate) {
    var ttsspeed = Math.max(0.1, Math.min(1, rate || 0.9));
    return "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob" +
      "&tl=zh-CN&ttsspeed=" + ttsspeed.toFixed(2) +
      "&q=" + encodeURIComponent(text);
  }

  function speakWeb(text, rate) {
    if (!webTtsOk) { STATUS_AUDIO = "fallback web desligado"; renderAudioStatus(); return; }
    try {
      if (!audioEl) { audioEl = new Audio(); audioEl.referrerPolicy = "no-referrer"; }
      audioEl.pause();
      audioEl.src = webTtsUrl(text, rate);
      audioEl.onerror = function () {
        STATUS_AUDIO = "falha ao baixar o audio (offline?)";
        renderAudioStatus();
      };
      audioEl.play().catch(function () {
        STATUS_AUDIO = "o navegador bloqueou o audio — clique em Iniciar";
        renderAudioStatus();
      });
    } catch (e) {
      STATUS_AUDIO = "erro no player: " + e.message;
      renderAudioStatus();
    }
  }

  function speak(text, rate) {
    text = String(text || "").trim();
    if (!text) return;

    if (audioEl) { audioEl.pause(); }

    if (vozDisponivel && "speechSynthesis" in window) {
      // cancel() seguido de speak() no mesmo tick e engolido por alguns
      // navegadores. Adia o speak.
      speechSynthesis.cancel();
      setTimeout(function () {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = voice.lang || "zh-CN";
        u.voice = voice;
        u.rate = rate || 0.9;
        u.onerror = function (ev) {
          STATUS_AUDIO = "voz do sistema falhou (" + (ev.error || "?") + ")";
          renderAudioStatus();
        };
        speechSynthesis.speak(u);
      }, 60);
      STATUS_AUDIO = "voz do sistema: " + voice.name;
      renderAudioStatus();
      return;
    }

    speakWeb(text, rate);
    STATUS_AUDIO = "voz web (sem Mandarin instalado)";
    renderAudioStatus();
  }

  function renderAudioStatus() {
    var box = el("audioStatus");
    if (!box) return;
    if (vozDisponivel) {
      box.textContent = "Som: voz do sistema (" + voice.name + ")";
      box.className = "audio-status ok";
    } else if (webTtsOk) {
      box.textContent = "Som: voz web do Google Translate — nenhuma Mandarin instalada no Windows.";
      box.className = "audio-status warn";
    } else {
      box.textContent = "Som: desligado — instale uma voz Mandarin ou reative a voz web.";
      box.className = "audio-status warn";
    }
  }

  /* ---------------- helpers DOM ---------------- */

  function el(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function stats() {
    var n = 0, apr = 0, rev = 0, due = 0, now = Date.now();
    ITENS.forEach(function (it) {
      var c = state.cards[it.id];
      if (!c || c.seen === 0) { n++; return; }
      apr++;
      if (c.interval >= 21) rev++;
      if (c.due <= now) due++;
    });
    return { n: n, apr: apr, rev: rev, due: due };
  }

  function renderStats() {
    var s = stats();
    el("stats").innerHTML =
      '<span class="pill new"><b>' + s.n + "</b> novas</span>" +
      '<span class="pill learn"><b>' + s.apr + "</b> em dia</span>" +
      '<span class="pill rev"><b>' + s.rev + "</b> consolidadas</span>" +
      '<span class="pill"><b>' + s.due + "</b> para revisar hoje</span>";
    el("metaLine").textContent =
      DATA._meta.total + " palavras · " + DATA._meta.caracteres_unicos +
      " caracteres · HSK 3.0 Band 1";
  }

  function renderBar() {
    var pct = queue.length ? Math.round((pos / queue.length) * 100) : 0;
    el("bar").style.width = pct + "%";
  }

  /* ---------------- renderizacao do card ---------------- */

  var GRADES = [
    ["nao sabia", 0, "g0"],
    ["quase", 1, "g1"],
    ["bom", 2, "g2"],
    ["fácil", 3, "g3"]
  ];

  function promptHtml(it) {
    var mode = el("mode").value;
    var out = "";

    if (mode === "recognize" || mode === "audio") {
      if (mode === "audio") {
        return '<div class="prompt"><button class="audio-btn" id="playBtn" ' +
          'title="Tocar novamente (R)">&#128266;</button>' +
          '<div class="pinyin" style="margin-top:10px">?</div></div>';
      }
      out = '<div class="hanzi">' + esc(it.hanzi) + "</div>";
      out += '<div class="pinyin">' + esc(it.pinyin) + "</div>";
    } else if (mode === "produce") {
      out = '<div class="prompt-pt">' + esc(it.gloss_pt) + "</div>";
      out += '<div class="pinyin" style="margin-top:8px">' +
        esc(it.pos) + " · " + esc(it.topico) + "</div>";
      out += '<div class="prompt-hidden" style="margin-top:12px">? ? ?</div>';
    } else {
      // comp
      it.componentes.forEach(function (c) {
        var parts = c.partes.length
          ? c.partes.map(function (p) {
              return '<span class="tag"><b>' + esc(p.radical) + "</b> " + esc(p.nome) + "</span>";
            }).join(" ")
          : '<span class="tag">ideograma simples</span>';
        out += '<div class="comp-char">' + esc(c.char) + "? " + parts + "</div>";
      });
      out = '<div class="prompt" style="margin:10px 0 18px">' + out + "</div>";
    }
    return out;
  }

  function revealHtml(it) {
    var mode = el("mode").value;
    var out = '<div class="reveal">';

    out += '<div class="row spread"><div><span class="hanzi small">' +
      esc(it.hanzi) + "</span> " +
      '<span class="pinyin">' + esc(it.pinyin) + "</span></div>" +
      '<div><button id="speakBtn" class="ghost">&#128266; Ouvir</button></div></div>';

    out += '<div class="blk"><div class="gloss">' + esc(it.gloss_pt) +
      '</div><div style="font-size:12px;color:var(--muted);margin-top:3px">' +
      esc(it.pos) + " · " + esc(it.topico) + "</div></div>";

    if (it.conceito) {
      out += '<div class="blk"><h4>Conceito</h4><p>' + esc(it.conceito) + "</p></div>";
    }

    var comp = it.componentes.map(function (c) {
      var parts = c.partes.length
        ? c.partes.map(function (p) {
            return '<span class="tag"><b>' + esc(p.radical) + "</b> " + esc(p.nome) + " — " +
              esc(p.papel) + "</span>";
          }).join(" ")
        : '<span class="tag">ideograma simples, sem parte separável</span>';
      return '<div class="comp-char">' + esc(c.char) + '<div class="parts">' + parts + "</div></div>" +
        (c.ideia ? '<p style="margin:6px 0 0 36px;font-size:13px;color:var(--muted)">' +
          esc(c.ideia) + "</p>" : "");
    }).join("");
    out += '<div class="blk"><h4>Componentes e radicais</h4><div class="comp">' + comp + "</div></div>";

    var ex = it.exemplos.map(function (e) {
      return '<div class="ex"><div class="zh">' + esc(e.zh) + "</div>" +
        '<div class="py">' + esc(e.py) + "</div>" +
        '<div class="pt">' + esc(e.pt) + "</div></div>";
    }).join("");
    out += '<div class="blk"><h4>Exemplos</h4>' + ex + "</div>";

    if (it.notas) {
      out += '<div class="note">' + esc(it.notas) + "</div>";
    }

    out += "</div>";
    out += '<div class="grades">' + GRADES.map(function (g) {
      return '<button class="' + g[2] + '" data-g="' + g[1] + '">' + g[0] + "</button>";
    }).join("") + "</div>";

    return out;
  }

  function render() {
    var card = el("card");

    if (!queue.length) {
      revealed = false;
      card.innerHTML = '<div class="end"><h2>Nada na fila</h2>' +
        "<p>Tente outro filtro, aumente o limite, ou aperte <kbd>Iniciar</kbd>.</p></div>";
      renderBar();
      return;
    }

    if (pos >= queue.length) {
      revealed = false;
      var s = stats();
      card.innerHTML = '<div class="end"><h2>Sessao concluida</h2>' +
        "<p>Voce revisou <b>" + queue.length + "</b> cartoes.</p>" +
        "<p>Restam <b>" + s.n + "</b> palavras novas e <b>" + s.due + "</b> para revisar hoje.</p>" +
        '<div class="row" style="justify-content:center;margin-top:16px">' +
        '<button class="primary" id="again">Outra sessao</button>' +
        '<button id="exportBtn" class="ghost">Exportar progresso</button></div></div>';
      wireEnd();
      renderBar();
      renderStats();
      return;
    }

    current = queue[pos];

    var it = current;
    var mode = el("mode").value;
    card.innerHTML =
      '<div class="card-top"><span class="badge">#' + it.id + " · fase " + faseOf(it.id) + "</span>" +
      '<span class="badge">' + (pos + 1) + " / " + queue.length + "</span></div>" +
      '<div class="q">' + esc(qLabel(mode)) + "</div>" +
      promptHtml(it) +
      (revealed ? revealHtml(it) :
        '<div class="grades"><button class="primary" id="revealBtn" style="flex:1">' +
        "Revelar resposta <span style=\"opacity:.6\">(espaço)</span></button></div>");

    if (mode === "audio") {
      var b = el("playBtn");
      if (b) b.onclick = function () { speak(it.hanzi, 0.75); };
      setTimeout(function () { speak(it.hanzi, 0.75); }, 120);
    }

    wire(revealed);
    renderBar();
    renderStats();
  }

  function qLabel(mode) {
    return {
      recognize: "O que significa?",
      produce: "Como se escreve?",
      audio: "Que palavra é essa?",
      comp: "Quais caracteres formam isso?"
    }[mode] || "";
  }

  function wire(isRevealed) {
    var rb = el("revealBtn");
    if (rb) rb.onclick = function () { revealed = true; render(); };

    var sb = el("speakBtn");
    if (sb) sb.onclick = function () { speak(current.hanzi, 0.75); };

    Array.prototype.forEach.call(
      card_el().querySelectorAll("[data-g]"),
      function (b) {
        b.onclick = function () { grade(parseInt(b.dataset.g, 10)); };
      }
    );
  }

  function card_el() { return el("card"); }

  function wireEnd() {
    var a = el("again");
    if (a) a.onclick = function () { start(); };
    var e = el("exportBtn");
    if (e) e.onclick = exportProgress;
  }

  function grade(g) {
    if (!current || !revealed) return;
    schedule(current.id, g);
    save();
    markDone();
    pos++;
    if (skipped.indexOf(current.id) !== -1) skipped.splice(skipped.indexOf(current.id), 1);
    revealed = false;
    render();
  }

  function skip() {
    if (!current) return;
    if (skipped.indexOf(current.id) === -1) skipped.push(current.id);
    pos++;
    revealed = false;
    render();
  }

  function markDone() {
    var today = new Date().toISOString().slice(0, 10);
    if (state.lastDay !== today) {
      state.lastDay = today;
      state.doneToday = 0;
    }
    state.doneToday++;
    state.history[today] = state.doneToday;
    save();
  }

  function start() {
    var n = buildQueue();
    render();
    if (n) el("card").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ---------------- export / import ---------------- */

  function exportProgress() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hsk1-progresso.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function reset() {
    if (!confirm("Apagar todo o progresso de repeticao espacada?")) return;
    state = { cards: {}, doneToday: 0, lastDay: "", history: {} };
    save();
    renderStats();
    start();
  }

  /* ---------------- pratica de escrita ---------------- */

  var canvasOpen = false;

  function toggleWrite() {
    if (!current) return;
    var host = el("writeHost") || el("card");
    var box = el("writeBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "writeBox";
      box.className = "reveal canvas-wrap";
      box.innerHTML =
        '<div class="blk" style="width:100%"><h4>Pratica de escrita</h4>' +
        '<p style="margin-bottom:10px">Trace o caractere. Depois compare com o modelo.</p></div>' +
        '<div class="canvas-stack"><div class="ghost-char" id="ghost">' + esc(current.hanzi) + "</div>" +
        '<canvas id="pad" width="260" height="260"></canvas></div>' +
        '<div class="stack-tools">' +
        '<button id="clearPad">Limpar</button>' +
        '<button id="toggleGhost">Ocultar modelo</button>' +
        '<button id="speakWrite">Ouvir</button></div>';
      host.appendChild(box);
      initPad();
      canvasOpen = true;
    } else {
      canvasOpen = !canvasOpen;
    }
    box.classList.toggle("hidden", !canvasOpen);
  }

  function initPad() {
    var c = el("pad");
    var ctx = c.getContext("2d");
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#e8ecf4";

    function pos(e) {
      var r = c.getBoundingClientRect();
      var p = e.touches ? e.touches[0] : e;
      return {
        x: ((p.clientX - r.left) / r.width) * c.width,
        y: ((p.clientY - r.top) / r.height) * c.height
      };
    }
    function down(e) { drawing = true; var q = pos(e); ctx.beginPath(); ctx.moveTo(q.x, q.y); e.preventDefault(); }
    function move(e) { if (!drawing) return; var q = pos(e); ctx.lineTo(q.x, q.y); ctx.stroke(); e.preventDefault(); }
    function up() { drawing = false; }

    var drawing = false;
    c.addEventListener("mousedown", down);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    c.addEventListener("touchstart", down, { passive: false });
    c.addEventListener("touchmove", move, { passive: false });
    c.addEventListener("touchend", up);

    el("clearPad").onclick = function () { ctx.clearRect(0, 0, c.width, c.height); };
    el("toggleGhost").onclick = function () { el("ghost").classList.toggle("hidden"); };
    el("speakWrite").onclick = function () { speak(current.hanzi, 0.75); };
  }

  /* ---------------- init ---------------- */

  (function init() {
    var topics = {};
    ITENS.forEach(function (it) { topics[it.topico] = 1; });
    var ts = Object.keys(topics).sort();
    ts.forEach(function (t) {
      var o = document.createElement("option");
      o.value = t; o.textContent = t;
      el("topic").appendChild(o);
    });

    var fases = Math.ceil(ITENS.length / POR_FASE);
    for (var f = 1; f <= fases; f++) {
      var of = document.createElement("option");
      of.value = String(f);
      of.textContent = "Fase " + f + " (palavras " + ((f - 1) * POR_FASE + 1) + "-" + (f * POR_FASE) + ")";
      el("fase").appendChild(of);
    }

    el("start").onclick = start;
    el("reset").onclick = reset;
    el("testAudio").onclick = function () {
      pickVoice();
      speak("你好", 0.8);
    };

    document.addEventListener("keydown", function (e) {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (!current) return;

      if (e.key === " ") {
        e.preventDefault();
        if (!revealed) { revealed = true; render(); }
        return;
      }
      if (e.key === "p" || e.key === "P") { e.preventDefault(); skip(); return; }
      if (e.key === "u" || e.key === "U") { e.preventDefault(); toggleWrite(); return; }
      if (e.key === "r" || e.key === "R") { speak(current.hanzi, 0.75); return; }
      if (revealed && e.key >= "1" && e.key <= "4") { grade(parseInt(e.key, 10) - 1); }
    });

    renderStats();
    start();
  })();

  /* Gancho de teste (nao usado pela interface): permite validar o SM-2 de fora. */
  window.HSK1_TEST = {
    schedule: schedule,
    stats: stats,
    faseOf: faseOf,
    state: function () { return state; }
  };
})();
