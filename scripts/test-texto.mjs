// Caça-corrupções de texto nos arquivos de conteúdo (não no código).
// Procura: mojibake (U+FFFD), CJK colado em palavra latina sem espaço,
// sequências uppercase suspeitas no meio de texto e palavras pt-BR coladas.
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

// Apenas conteúdo editorial. Código (.js/.html) é validado por --check e pelos testes.
const ARQUIVOS = ["PLANO-DE-ESTUDOS.md", "RADICAIS.md", "README.md", "data/hsk1.json"];

// Nenhum termo em CJK deve aparecer colado a uma palavra latina: o scanner
// trata qualquer colagem como erro, porque texto didático sempre separa
// "palavra" de "termo em chinês" com espaço.
const IGNORAR = new Set();

let total = 0;
const RELATORIO = [];

for (const f of ARQUIVOS) {
  let text;
  try { text = await fs.readFile(ROOT + f, "utf8"); }
  catch { RELATORIO.push(`${f}: (ainda nao existe)`); continue; }

  const achados = [];

  // Trechos literais em markdown (`inline code` e blocos cercados) sao citados
  // de proposito — o README documenta as corrupcoes passadas como exemplo.
  // O JSON e varrido por inteiro: conceito/notas/ideia sao justamente onde a
  // corrupcao aparecia.
  const escopo = f.endsWith(".md")
    ? text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, " ")
    : text;

  // 1. caractere de substituição / mojibake
  const moji = (escopo.match(/\uFFFD/g) || []).length;
  if (moji) achados.push(`${moji}x U+FFFD (caractere de substituicao)`);

  // 2. CJK colado em palavra latina (sem espaco) — tipico de geração embaralhada
  const gluedCJK = escopo.match(/[A-Za-zÀ-ÿ]{2,}[一-鿿]/gu) || [];
  for (const g of [...new Set(gluedCJK)]) {
    if (IGNORAR.has(g)) continue;
    achados.push(`CJK colado: ...${g}...`);
  }

  // 3. sequências uppercase suspeitas no meio de texto (ex.: "quePSS", "pigREITO")
  const psi = escopo.match(/[a-zà-ÿ]{3,}[A-Z]{2,}[a-zà-ÿ]*/gu) || [];
  if (psi.length) achados.push(`colagem: ${[...new Set(psi)].slice(0, 10).join(", ")}`);

  // 4. palavras pt-BR coladas (minúscula+Mayúscula sem espaço, ex.: "asTexto")
  const gluedPT =
    escopo.match(/\b[a-záéíóúâêôãõç]{4,}[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]{3,}\b/gu) || [];
  if (gluedPT.length) achados.push(`possivel palavra colada: ${[...new Set(gluedPT)].slice(0, 10).join(", ")}`);

  // 5. inglés comum vazado em texto pt-BR
  const ingles = escopo.match(/\b(Another|another|The|With|When|Then|This|These)\b/g) || [];
  const inglesPt = [...new Set(ingles)].filter((w) => {
    const i = escopo.indexOf(w);
    return /[\u4e00-\u9fff]/.test(escopo.slice(i, i + w.length + 1));
  });
  if (inglesPt.length) achados.push(`ingles vazado perto de CJK: ${inglesPt.join(", ")}`);

  if (achados.length) {
    total += achados.length;
    RELATORIO.push(`\n${f}:`);
    achados.forEach((a) => RELATORIO.push("  - " + a));
  }
}

console.log(RELATORIO.join("\n"));
console.log("\n" + (total ? `${total} possiveis problemas` : "nenhuma corrupcao textual encontrada"));
process.exit(total ? 1 : 0);
