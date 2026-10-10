// Harness headless: carrega data/hsk1.js + flashcards/app.js num DOM minimo
// e exercita o fluxo real (montar fila -> revelar -> graduar -> persistir).
import fs from "node:fs/promises";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

/* ---------- DOM minimo ---------- */
class ClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  toggle(c, on) { on ? this.set.add(c) : this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}

class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this._html = "";
    this._text = "";
    this.value = "";
    this.dataset = {};
    this.classList = new ClassList();
    this.style = {};
    this.width = 0;
    this.height = 0;
  }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  getContext() { return ctx2d; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 260, height: 260 }; }
  addEventListener() {}
  setAttribute() {}
  scrollIntoView() {}
  removeAttribute() {}
  get className() { return this._cls || ""; }
  set className(v) { this._cls = v; }
}

const ctx2d = new Proxy({}, { get: () => () => {} });

const byId = {};
for (const id of ["stats", "metaLine", "mode", "topic", "fase", "filter", "limit",
                  "start", "reset", "testAudio", "audioStatus", "card", "bar", "writeHost"]) {
  const e = new El(id === "card" ? "div" : (id === "start" || id === "reset" || id === "testAudio" ? "button" : "select"));
  e.id = id;
  if (id === "filter") e.value = "due";
  if (id === "limit") e.value = "20";
  if (id === "mode") e.value = "recognize";
  byId[id] = e;
}

const store = new Map();
const listeners = {};

const document_ = {
  getElementById: (id) => byId[id] || null,
  createElement: (t) => new El(t),
  addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
  body: new El("body"),
};

const sandbox = {
  window: null,
  document: document_,
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k),
  },
  speechSynthesis: {
    getVoices: () => ([{ lang: "zh-CN", name: "Microsoft Tingting" }]),
    addEventListener() {},
    speak(u) { sandbox.__spoken = (sandbox.__spoken || []).concat(u.text); },
    cancel() {},
  },
  SpeechSynthesisUtterance: function (t) { this.text = t; },
  Blob: function (parts) { this.parts = parts; },
  URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
  confirm: () => true,
  Date, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, console,
  setTimeout: (fn) => { fn(); },
  setInterval: () => 0,          // polling de vozes: nao roda no sandbox
  clearInterval: () => {},
  __spoken: [],
};
sandbox.window = sandbox;
const loaderJs = await fs.readFile(ROOT + "data/hsk1.js", "utf8");
sandbox.window.HSK1_DATA = JSON.parse(
  loaderJs.replace(/^[\s\S]*?window\.HSK1_DATA = /, "").replace(/;\s*$/, "")
);

vm.createContext(sandbox);
vm.runInContext(await fs.readFile(ROOT + "flashcards/app.js", "utf8"), sandbox,
  { filename: "app.js" });

/* ---------- asseveracoes ---------- */
const fails = [];
function check(name, cond, extra) {
  if (cond) console.log("  ok   " + name);
  else { console.log("  FAIL " + name + (extra ? " -> " + extra : "")); fails.push(name); }
}

const card = byId.card;
const mode = byId.mode;

console.log("\n== carga inicial ==");
check("hanzi/pinyin carregados", !!sandbox.window.HSK1_DATA.itens.length);
check("300 itens", sandbox.window.HSK1_DATA.itens.length === 300);
check("card inicial tem conteudo", card.innerHTML.length > 50, JSON.stringify(card.innerHTML.slice(0, 80)));
check("stats renderizado", byId.stats.innerHTML.includes("novas"));
check("opcoes de topico populate", byId.topic.children.length >= 20,
  "tópicos=" + byId.topic.children.length);
check("opcoes de fase populate", byId.fase.children.length === 12,
  "fases=" + byId.fase.children.length);

console.log("\n== fluxo: revelar e graduar (modo recognize) ==");
const keys = listeners.keydown || [];
check("keydown registrado", keys.length > 0);

// simula: start -> 3 cards revelados e graduados "bom"
function pressSpaceAndGrade(g) {
  keys.forEach((fn) => fn({ key: " ", target: { tagName: "BODY" }, preventDefault() {} }));
  const revealedHtml = card.innerHTML;
  keys.forEach((fn) => fn({ key: String(g + 1), target: { tagName: "BODY" }, preventDefault() {} }));
  return revealedHtml;
}

for (let i = 0; i < 3; i++) pressSpaceAndGrade(2);

check("revelacao mostra gloss", card.innerHTML.includes("gloss") || card.innerHTML.includes("Conceito") ||
  byId.stats.innerHTML.includes("em dia"), "html=" + card.innerHTML.length);
check("progresso salvo no localStorage", store.has("hsk1.progress.v1"));

const saved = JSON.parse(store.get("hsk1.progress.v1"));
check("3 cartoes agendados", Object.keys(saved.cards).length === 3,
  "n=" + Object.keys(saved.cards).length);
const first = Object.values(saved.cards)[0];
check("intervalo inicial = 1 dia", first.interval === 1, "interval=" + first.interval);
// SM-2 classico: q=4 ("bom") mantem o ease; q=5 ("facil") soma +0.1
check("ease estavel com nota 'bom' (SM-2 q=4)", Math.abs(first.ease - 2.5) < 1e-9,
  "ease=" + first.ease);
check("due no futuro", first.due > Date.now());

// com "facil" (q=5) o ease sobe. Testamos a escada de intervalos num card so.
console.log("\n== escada de intervalos do SM-2 ==");
const T = sandbox.window.HSK1_TEST;
if (!T) { check("gancho de teste exposto", false); }
else {
  const ID = 999;
  // ease sobe +0.1 a cada "facil": 2.5 -> 2.6 -> 2.7 -> 2.8
  // escada: 1, 6, round(6*2.7)=16, round(16*2.8)=45
  T.schedule(ID, 3); // facil
  const c = T.state().cards[ID];
  check("1a repeticao facil = 1 dia", c.interval === 1, "interval=" + c.interval);
  check("ease = 2.6 apos um 'facil'", Math.abs(c.ease - 2.6) < 1e-9, "ease=" + c.ease);
  T.schedule(ID, 3);
  check("2a repeticao = 6 dias", c.interval === 6, "interval=" + c.interval);
  T.schedule(ID, 3);
  check("3a repeticao = 6 * 2.7 = 16", c.interval === 16,
    "interval=" + c.interval);
  T.schedule(ID, 3);
  check("4a repeticao = 16 * 2.8 = 45", c.interval === 45,
    "interval=" + c.interval);
  check("reps = 4", c.reps === 4, "reps=" + c.reps);
  check("ease = 2.9", Math.abs(c.ease - 2.9) < 1e-9, "ease=" + c.ease);

  // erro no meio reseta a escada
  T.schedule(ID, 0);
  check("erro zera reps", c.reps === 0, "reps=" + c.reps);
  check("erro registra lapse", c.lapses === 1, "lapses=" + c.lapses);
  check("erro devolve para 10 min", c.due - Date.now() <= 10 * 60 * 1000,
    "delta=" + (c.due - Date.now()));

  // e contagens
  const st = T.stats();
  check("stats coerentes", typeof st.n === "number" && st.apr >= 1, JSON.stringify(st));
  check("faseOf bate com 25/fase", T.faseOf(1) === 1 && T.faseOf(25) === 1 &&
    T.faseOf(26) === 2 && T.faseOf(300) === 12, "fases ok");
}

console.log("\n== fluxo: errar zera o intervalo ==");
pressSpaceAndGrade(0);
const saved2 = JSON.parse(store.get("hsk1.progress.v1"));
const withLapse = Object.values(saved2.cards).find((c) => c.lapses > 0);
check("houve lapse registrado", !!withLapse, JSON.stringify(Object.values(saved2.cards)));
if (withLapse) {
  check("lapse empurra para 10 min", withLapse.due - Date.now() > 9 * 60 * 1000 &&
    withLapse.due - Date.now() <= 11 * 60 * 1000, "delta=" + (withLapse.due - Date.now()));
  check("ease nao desceu abaixo de 1.3", withLapse.ease >= 1.3);
}

console.log("\n== os 4 modos ==");
for (const m of ["recognize", "produce", "audio", "comp"]) {
  mode.value = m;
  byId.filter.value = "all";
  byId.start.onclick();
  check("modo " + m + " renderiza", card.innerHTML.length > 50,
    m + " len=" + card.innerHTML.length);
  if (m === "audio") {
    check("modo audio tocou TTS", (sandbox.__spoken || []).length > 0,
      "spoken=" + (sandbox.__spoken || []).length);
  }
  if (m === "comp") {
    check("modo comp mostra tags de componente", card.innerHTML.includes("tag") ||
      card.innerHTML.includes("ideograma"), card.innerHTML.slice(0, 200));
  }
}

console.log("\n== filtros ==");
mode.value = "recognize";
byId.filter.value = "all";
byId.limit.value = "7";
byId.start.onclick();
check("limite respeitado", card.innerHTML.includes("1 / 7"), card.innerHTML.slice(0, 200));

byId.topic.value = "Comida";
byId.limit.value = "20";
byId.start.onclick();
const idEmTela = (card.innerHTML.match(/#(\d+) · fase/) || [])[1];
const itemEmTela = idEmTela && sandbox.window.HSK1_DATA.itens.find((x) => x.id === +idEmTela);
check("filtro de topico entrega item do topico pedido",
  !!itemEmTela && itemEmTela.topico === "Comida",
  "id=" + idEmTela + " topico=" + (itemEmTela && itemEmTela.topico));

byId.topic.value = "";
byId.fase.value = "1";
byId.limit.value = "25";
byId.start.onclick();
const idF1 = (card.innerHTML.match(/#(\d+) · fase/) || [])[1];
check("filtro de fase 1 entrega item da fase 1", !!idF1 && +idF1 <= 25, "id=" + idF1);
check("contador respeita o limite da fase", card.innerHTML.includes(" / 25"),
  (card.innerHTML.match(/\/ (\d+)/) || [])[0]);

console.log("\n== persistencia entre sessoes ==");
byId.fase.value = "";
byId.filter.value = "all";
byId.start.onclick();
const before = JSON.parse(store.get("hsk1.progress.v1"));
check("progresso acumulado", Object.keys(before.cards).length > 0);

console.log("\n== reset ==");
byId.reset.onclick();
const after = JSON.parse(store.get("hsk1.progress.v1"));
check("reset zera cartoes", Object.keys(after.cards).length === 0,
  "n=" + Object.keys(after.cards).length);

console.log("\n" + (fails.length ? "FALHAS: " + fails.length : "TODAS AS VERIFICACOES PASSARAM"));
process.exit(fails.length ? 1 : 0);
