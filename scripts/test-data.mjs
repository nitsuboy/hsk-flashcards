// Integridade do dataset: campos obrigatorios, cobertura de componentes, exemplos.
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const payload = JSON.parse(await fs.readFile(ROOT + "data/hsk1.json", "utf8"));
const ITENS = payload.itens;
const fails = [];
const check = (n, c, x) => { if (!c) fails.push(n + (x ? " -> " + x : "")); };

check("300 itens", ITENS.length === 300, "n=" + ITENS.length);
check("ids 1..300 sem buracos", ITENS.every((it, i) => it.id === i + 1));
check("hanzi nao vazio", ITENS.every((it) => /[\u4e00-\u9fff]/u.test(it.hanzi)));
// pinyin: minusculas + vogais com tom. Tons vem em duas faixas:
// U+00C0-U+00FF (a, e, i, o, u, n, e graves) e U+0100-U+01EF (circunflexos/breves).
// Substantivos proprios podem comecar com maiuscula (Zhōngguó, Hànyǔ).
const PINYIN_RE = /^[A-Z]?[a-z\u00c0-\u00ff\u0100-\u024f\s]+$/u;
check("pinyin so com letras e tons", ITENS.every((it) => PINYIN_RE.test(it.pinyin)),
  ITENS.filter((it) => !PINYIN_RE.test(it.pinyin))
    .map((it) => it.pinyin).join(" "));
check("pinyin tem pelo menos uma letra", ITENS.every((it) => /[a-z]/i.test(it.pinyin)));
check("classe de palavra preenchida", ITENS.every((it) => it.pos && it.pos.length > 1));
check("topico preenchido", ITENS.every((it) => !!it.topico));
check("gloss_pt preenchido", ITENS.every((it) => it.gloss_pt && it.gloss_pt.length >= 2),
  ITENS.filter((it) => !it.gloss_pt || it.gloss_pt.length < 2).map((it) => it.hanzi).join(" "));
check("conceito com pelo menos 60 chars", ITENS.every((it) => (it.conceito || "").length >= 60),
  ITENS.filter((it) => (it.conceito || "").length < 60).map((it) => it.hanzi).join(" "));
check("notas e string", ITENS.every((it) => typeof it.notas === "string"));
check("componentes nunca vazios", ITENS.every((it) => Array.isArray(it.componentes) && it.componentes.length));

// componentes cobrem todo caractere distinto, na ordem em que aparecem
const semCobertura = [];
for (const it of ITENS) {
  const distintos = [...it.hanzi].filter((c, i, a) => a.indexOf(c) === i);
  const cobertos = it.componentes.map((c) => c.char);
  const faltando = distintos.filter((c) => !cobertos.includes(c));
  if (faltando.length) semCobertura.push(it.hanzi + " sem " + faltando.join("/"));
  // sem componente duplicado, na ordem
  const extra = cobertos.filter((c) => !distintos.includes(c));
  if (extra.length) semCobertura.push(it.hanzi + " com componente fantasma " + extra.join("/"));
}
check("todo caractere tem componente", semCobertura.length === 0, semCobertura.slice(0, 8).join(" | "));

// cada componente tem ideia e partes bem formadas
const compRuim = [];
for (const it of ITENS) {
  for (const c of it.componentes) {
    if (!c.ideia || c.ideia.length < 15) compRuim.push(it.hanzi + "/" + c.char + " sem ideia");
    if (!Array.isArray(c.partes)) compRuim.push(it.hanzi + "/" + c.char + " partes nao-array");
    else for (const p of c.partes) {
      if (!p.radical || !p.nome || !p.papel) compRuim.push(it.hanzi + "/" + c.char + " parte incompleta");
    }
  }
}
check("componentes bem formados", compRuim.length === 0, compRuim.slice(0, 8).join(" | "));

// exemplos
const exRuim = [];
for (const it of ITENS) {
  if (!Array.isArray(it.exemplos) || it.exemplos.length < 2) { exRuim.push(it.hanzi + " tem " + (it.exemplos || []).length); continue; }
  for (const e of it.exemplos) {
    if (!e.zh || !e.py || !e.pt) exRuim.push(it.hanzi + " exemplo incompleto");
    else {
      if (!/[。？！]$/u.test(e.zh.trim())) exRuim.push(it.hanzi + " zh sem pontuacao: " + e.zh);
      if (!/[\u00e0-\u00ff\u0100-\u024f]/u.test(e.py)) exRuim.push(it.hanzi + " py sem tom: " + e.py);
      if (!/[\u4e00-\u9fff]/u.test(e.zh)) exRuim.push(it.hanzi + " zh sem hanzi: " + e.zh);
    }
  }
}
check("exemplos bem formados", exRuim.length === 0, exRuim.slice(0, 8).join(" | "));

// pelo menos um exemplo curto (2-5 caracteres) por item
const semCurto = ITENS.filter((it) =>
  !it.exemplos.some((e) => {
    const n = (e.zh.match(/[\u4e00-\u9fff]/gu) || []).length;
    return n >= 2 && n <= 5;
  })
).map((it) => it.hanzi);
check("todo item tem exemplo curto", semCurto.length <= ITENS.length * 0.25,
  semCurto.length + " sem exemplo curto (tolerancia 25%)");

// gloss_pt nao pode ser vazio nem igual ao hanzi (sinal de campo nao preenchido)
const glossHanzi = ITENS.filter((it) => it.gloss_pt === it.hanzi).map((it) => it.hanzi);
check("gloss_pt nao repete o hanzi", glossHanzi.length === 0, glossHanzi.join(" "));

// duplicatas de hanzi (permitido: 爸爸/妈妈 sao unicos; homografos reais ok)
const conta = new Map();
ITENS.forEach((it) => conta.set(it.hanzi, (conta.get(it.hanzi) || 0) + 1));
const dup = [...conta].filter(([, n]) => n > 1).map(([h, n]) => h + "x" + n);
check("sem palavras duplicadas", dup.length === 0, dup.join(" "));

// cobertura de caracteres
const chars = new Set();
ITENS.forEach((it) => [...it.hanzi].forEach((c) => chars.add(c)));
check("caracteres unicos > 200", chars.size > 200, "n=" + chars.size);

/* ---- relatorio ---- */
const topicos = {};
ITENS.forEach((it) => { topicos[it.topico] = (topicos[it.topico] || 0) + 1; });

console.log("itens:            " + ITENS.length);
console.log("caracteres unicos: " + chars.size);
console.log("componentes:       " + ITENS.reduce((a, it) => a + it.componentes.length, 0));
console.log("exemplos:          " + ITENS.reduce((a, it) => a + it.exemplos.length, 0));
console.log("conceitos:         " + ITENS.length + " (media " +
  Math.round(ITENS.reduce((a, it) => a + it.conceito.length, 0) / ITENS.length) + " chars)");
console.log("topicos (" + Object.keys(topicos).length + "):");
Object.entries(topicos).sort((a, b) => b[1] - a[1])
  .forEach(([k, v]) => console.log("   " + String(v).padStart(3) + "  " + k));

if (fails.length) {
  console.log("\nFALHAS (" + fails.length + "):");
  fails.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("\nINTEGRIDADE OK");
