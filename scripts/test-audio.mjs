// Testa os dois caminhos de audio do app:
//  1. Mandarin instalado no sistema -> usa speechSynthesis (offline)
//  2. Sem Mandarin (caso real desta maquina) -> cai na voz web do Google
// Cada caso roda o app.js de verdade num sandbox novo.
import fs from "node:fs/promises";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const appJs = await fs.readFile(ROOT + "flashcards/app.js", "utf8");
const loaderJs = await fs.readFile(ROOT + "data/hsk1.js", "utf8");
const DADOS = JSON.parse(
  loaderJs.replace(/^[\s\S]*?window\.HSK1_DATA = /, "").replace(/;\s*$/, "")
);

class El {
  constructor(tag) {
    this.tagName = (tag || "div").toUpperCase();
    this.children = [];
    this._h = "";
    this._cls = "";
    this.style = {};
  }
  set innerHTML(v) { this._h = String(v); }
  get innerHTML() { return this._h; }
  set textContent(v) { this._h = String(v); }
  get textContent() { return this._h; }
  set className(v) { this._cls = String(v); }
  get className() { return this._cls; }
  appendChild(c) { this.children.push(c); return c; }
  querySelectorAll() { return []; }
  addEventListener() {}
  scrollIntoView() {}
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 30 }; }
}

const fails = [];
function check(name, cond, extra) {
  if (cond) console.log("  ok   " + name);
  else { console.log("  FAIL " + name + (extra ? " -> " + extra : "")); fails.push(name); }
}

// voices: lista simulada de getVoices()
function rodar(voices) {
  const byId = {};
  for (const id of ["stats", "metaLine", "mode", "topic", "fase", "filter", "limit",
                    "start", "reset", "testAudio", "audioStatus", "card", "bar", "writeHost"]) {
    const e = new El(id === "card" ? "div"
      : ["start", "reset", "testAudio"].includes(id) ? "button" : "select");
    e.id = id;
    if (id === "filter") e.value = "due";
    if (id === "limit") e.value = "20";
    if (id === "mode") e.value = "audio";
    byId[id] = e;
  }

  const rec = { spoken: [], urls: [], played: [] };
  const store = new Map();

  const document_ = {
    getElementById: (id) => byId[id] || null,
    createElement: (t) => new El(t),
    addEventListener: () => {},
    body: new El("body"),
  };

  function Audio() {
    this.pause = () => {};
    this.play = () => { rec.played.push(this.src); return Promise.resolve(); };
  }

  const sandbox = {
    document: document_,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    },
    speechSynthesis: {
      getVoices: () => voices,
      addEventListener() {},
      speak(u) { rec.spoken.push(u.text); },
      cancel() {},
    },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    Audio,
    Blob: function (parts) { this.parts = parts; },
    URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    confirm: () => true,
    Date, Math, JSON, Object, Array, String, Number, parseInt, parseFloat, console,
    setTimeout: (fn) => { fn(); },
    setInterval: () => 0,
    clearInterval: () => {},
  };
  sandbox.window = sandbox;
  sandbox.window.HSK1_DATA = DADOS;

  vm.createContext(sandbox);
  vm.runInContext(appJs, sandbox, { filename: "app.js" });
  byId.start.onclick();
  return { byId, rec, sandbox };
}

console.log("\n== caso 1: Mandarin instalado no sistema ==");
{
  const { byId, rec } = rodar([
    { lang: "en-US", name: "Microsoft Zira Desktop" },
    { lang: "zh-CN", name: "Microsoft Huihui Desktop - Chinese (Simplified)" },
  ]);
  check("usa a voz do sistema", rec.spoken.length > 0, "spoken=" + JSON.stringify(rec.spoken));
  check("nao baixa audio da web", rec.played.length === 0, "urls=" + JSON.stringify(rec.played));
  check("status diz 'voz do sistema'",
    byId.audioStatus.textContent.includes("voz do sistema"),
    JSON.stringify(byId.audioStatus.textContent));
}

console.log("\n== caso 2: so ingles no sistema (esta maquina) ==");
{
  const { byId, rec } = rodar([
    { lang: "en-US", name: "Microsoft David Desktop" },
    { lang: "en-US", name: "Microsoft Zira Desktop" },
  ]);
  check("nao tenta falar com a voz inglesa", rec.spoken.length === 0, "spoken=" + JSON.stringify(rec.spoken));
  check("usa o fallback web", rec.played.length > 0, "urls=" + JSON.stringify(rec.played));

  const url = rec.played[0] || "";
  check("url do Google Translate", url.includes("translate_tts"), url);
  check("pede zh-CN", url.includes("tl=zh-CN"), url);
  check("texto codificado em UTF-8", /q=(%[0-9A-F]{2}){2,}/.test(url), url);
  check("hanzi em vez de pinyin na url", !/%3F/.test(url.split("q=")[1] || ""), url);
  check("decodifica de volta para hanzi", /^\p{Script=Han}+$/u.test(
    decodeURIComponent(url.split("q=")[1])), url.split("q=")[1]);

  check("status avisa que nao ha Mandarin instalado",
    byId.audioStatus.textContent.includes("Mandarin"),
    JSON.stringify(byId.audioStatus.textContent));
}

console.log("\n== caso 3: botao Testar som ==");
{
  const { byId, rec } = rodar([{ lang: "en-US", name: "Microsoft Zira Desktop" }]);
  rec.played.length = 0;
  byId.testAudio.onclick();
  check("testar som dispara audio", rec.played.length > 0, "urls=" + JSON.stringify(rec.played));
  check("usa uma frase sanity check", (rec.played[0] || "").includes("q=%E4%BD%A0%E5%A5%BD"),
    rec.played[0]);
}

console.log(fails.length ? `\n${fails.length} FALHAS` : "\nTODAS AS VERIFICACOES DE AUDIO PASSARAM");
process.exit(fails.length ? 1 : 0);
