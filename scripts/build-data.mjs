// Gera os artefatos derivados a partir de data/hsk1.json:
//   data/hsk1.js              -> loader para o app (funciona via file://)
//   anki/hsk1-zh-para-pt.tsv  -> deck 1 (frente: hanzi)
//   anki/hsk1-pt-para-zh.tsv  -> deck 2 (frente: sentido)
//   RADICAIS.md               -> guia dos componentes mais frequentes
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const payload = JSON.parse(await fs.readFile(ROOT + "data/hsk1.json", "utf8"));
const ITENS = payload.itens;

const clean = (s) => String(s == null ? "" : s).replace(/\s*\n\s*/g, " ").trim();
const tsvCell = (s) => clean(s).replace(/\t/g, " ");

/* ---------- data/hsk1.js ---------- */
const js =
  "/* Gerado por scripts/build-data.mjs. Nao editar a mao. */\n" +
  "window.HSK1_DATA = " + JSON.stringify(payload) + ";\n";
await fs.writeFile(ROOT + "data/hsk1.js", js, "utf8");

/* ---------- componentes formatados ---------- */
function componentesTxt(it) {
  return it.componentes
    .map((c) => {
      const partes = c.partes.length
        ? c.partes.map((p) => `${p.radical} (${p.nome}) — ${p.papel}`).join(" + ")
        : "ideograma simples";
      return `${c.char} = ${partes}. ${c.ideia || ""}`;
    })
    .join("\n");
}

function exemplosTxt(it) {
  return it.exemplos
    .map((e) => `${e.zh}\n${e.py}  —  ${e.pt}`)
    .join("\n");
}

function detalhesTxt(it) {
  const linhas = [
    `Pinyin: ${it.pinyin}   ·   Classe: ${it.pos}   ·   Tópico: ${it.topico}`,
    "",
    it.conceito || "",
  ];
  if (it.notas) linhas.push("", "⚠ " + it.notas);
  linhas.push("", "Componentes:", componentesTxt(it), "", "Exemplos:", exemplosTxt(it));
  return linhas.join("\n");
}

/* ---------- anki ---------- */
const head = "Front\tBack\tDetalhes\n";
const deckZh = ITENS.map((it) => [it.hanzi, it.gloss_pt, detalhesTxt(it)]);
const deckPt = ITENS.map((it) => [it.gloss_pt, `${it.hanzi}  ${it.pinyin}`, detalhesTxt(it)]);

await fs.mkdir(ROOT + "anki", { recursive: true });
await fs.writeFile(
  ROOT + "anki/hsk1-zh-para-pt.tsv",
  head + deckZh.map((r) => r.map(tsvCell).join("\t")).join("\n") + "\n",
  "utf8"
);
await fs.writeFile(
  ROOT + "anki/hsk1-pt-para-zh.tsv",
  head + deckPt.map((r) => r.map(tsvCell).join("\t")).join("\n") + "\n",
  "utf8"
);

/* ---------- RADICAIS.md ---------- */
const freq = new Map();
const desc = new Map();
for (const it of ITENS) {
  for (const c of it.componentes) {
    for (const p of c.partes || []) {
      const r = p.radical.replace(/\s*\(.*\)\s*/, "");
      freq.set(r, (freq.get(r) || 0) + 1);
      if (!desc.has(r)) desc.set(r, new Set());
      desc.get(r).add(`${p.nome} — ${p.papel.split(":")[0].trim()}`);
    }
  }
}
const ordered = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

const md = [
  "# Radicais e componentes do HSK1",
  "",
  `Derivado de \`data/hsk1.json\`: ${payload._meta.total} palavras, ` +
    `${payload._meta.caracteres_unicos} caracteres distintos, ` +
    `${freq.size} componentes recorrentes.`,
  "",
  "Os radicais são a espinha dorsal do HSK1. Cerca de 40 deles explicam a maioria",
  "dos 248 caracteres da lista — e vários deles carregam um **significado** que se",
  "mantém em milhares de caracteres que você ainda nem viu. Aprender 20 radicais",
  "economiza decorar centenas de ideogramas.",
  "",
  "## Como usar este guia",
  "",
  "1. Estude as linhas do topo (os que aparecem em 8+ palavras).",
  "2. Reconheça que `口` (boca) antes de um verbo costuma significar *ação da boca/falar*,",
  "   que `扌` (mão) significa *ação com a mão*, que `忄` (coração) indica emoção",
  "3. Não decore a lista inteira: ao encontrar um caractere novo, procure os dois ou",
  "   três componentes mais comuns aqui e infira o significado.",
  "",
  "## Tabela por frequência",
  "",
  "| Componente | Nome | Papel | Nº de palavras |",
  "| --- | --- | --- | ---: |",
];
for (const [r, n] of ordered) {
  const d = [...desc.get(r)][0] || "";
  const [nome, ...resto] = d.split(" — ");
  md.push(`| \`${r}\` | ${nome || "—"} | ${resto.join(" — ") || "—"} | ${n} |`);
}
md.push(
  "",
  "## Famílias que valem decorar inteiras",
  "",
  "**Pessoa / corpo** — `亻` pessoa (你, 他们, 休), `女` mulher (妈, 姐, 妹), `子` filho (字, 学),",
  "`口` boca (吃, 叫, 吗), `目` olho (看, 睡), `手` mão (打, 找), `心/忄` coração (想, 忙).",
  "",
  "**Fala e abstrato** — `讠 (言)` língua/conceito (说, 读, 请, 认, 谁, 课), `文` escrita (这, 交),",
  "`音` som (音, 暗).",
  "",
  "**Casa e espaço** — `宀` teto (家, 字, 室, 安), `广` abrigo (店, 床, 房), `门` porta (问, 们, 间),",
  "`辶` caminhar (过, 还, 这, 边).",
  "",
  "**Natureza** — `木` madeira (树, 桌, 机, 校), `艹` planta (花, 茶, 菜), `氵` água (海, 汗, 汁),",
  "`日` sol/dia (明, 时, 早, 晚), `月` lua/mês (朋, 明, 有), `火` fogo (热, 灯).",
  "",
  "**Dinheiro e troca** — `贝` concha/valor (钱, 贵, 买, 卖, 贸), `金/钅` metal (钱, 钟, 铁).",
  "",
  "## Armadilhas comuns",
  "",
  "- **Nem todo componente visível é radical.** Em 爱, os quatro quadrantes vêm da forma antiga do",
  "  caractere; o radical real é 心. Em 我, radical é 戈, não a mão que aparece à esquerda.",
  "- **Componente fonético ≠ componente semântico.** Em 妈 (`女` + `马`), 女 diz que é uma",
  "  mulher da família e 马 existe só para emprestar o som *mā*. O mesmo 马 em 码 e 骂 não tem",
  "  nada a ver com cavalo. Cerca de 80% dos caracteres do HSK1 são \"rebus\" assim.",
  "- **Simplificação junta partes.** `讠` (de 訁/言), `饣` (de 飠), `纟` (de 糹), `钅` (de 釒),",
  "  `贝` (de 貝), `见` (de 見), `车` (de 車) — quando vir a forma tradicional, é a mesma família.",
  ""
);

await fs.writeFile(ROOT + "RADICAIS.md", md.join("\n"), "utf8");

console.log("build ok:");
console.log("  data/hsk1.js            " + (js.length / 1024).toFixed(0) + " KB");
console.log("  anki/hsk1-zh-para-pt.tsv " + deckZh.length + " linhas");
console.log("  anki/hsk1-pt-para-zh.tsv " + deckPt.length + " linhas");
console.log("  RADICAIS.md             " + ordered.length + " componentes");
