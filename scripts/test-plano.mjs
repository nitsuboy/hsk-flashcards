// Confere se as listas de palavras citadas no plano batem com data/hsk1.json.
import fs from "node:fs/promises";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ITENS = JSON.parse(await fs.readFile(ROOT + "data/hsk1.json", "utf8")).itens;
const plano = await fs.readFile(ROOT + "PLANO-DE-ESTUDOS.md", "utf8");

const secoes = plano.split(/^### /m).filter((s) => s.startsWith("Fase "));
let bad = 0;

for (const s of secoes) {
  const m = s.match(/^Fase (\d+)/);
  const f = Number(m[1]);
  const linha = s.split("\n")[0];
  const bloco = s.split("\n").slice(1, 4).join(" ");

  // sequencia de hanzi separada por espaco, dentro de crase
  const esperado = ITENS.filter((it) => Math.ceil(it.id / 25) === f).map((it) => it.hanzi);
  const citado = (bloco.match(/`([^`]+)`/) || [])[1] || "";
  const lista = citado.split(/\s+/).filter(Boolean);

  const setE = new Set(esperado);
  const setC = new Set(lista);
  const faltando = esperado.filter((h) => !setC.has(h));
  const sobrando = lista.filter((h) => !setE.has(h));
  const dup = lista.filter((h, i) => lista.indexOf(h) !== i);

  if (faltando.length || sobrando.length || lista.length !== esperado.length || dup.length) {
    bad++;
    console.log(`FASE ${f} (${linha.trim()})`);
    if (lista.length !== esperado.length)
      console.log(`   contagem: plano=${lista.length} dados=${esperado.length}`);
    if (faltando.length) console.log(`   faltando no plano: ${faltando.join(" ")}`);
    if (sobrando.length) console.log(`   sobrando no plano: ${sobrando.join(" ")}`);
    if (dup.length) console.log(`   repetido no plano: ${[...new Set(dup)].join(" ")}`);
  } else {
    console.log(`FASE ${f} ok  (${lista.length} palavras)`);
  }
}

// caracteres nao-cineseiros colados dentro de texto corrido (sinal de corrupcao)
const suspect = plano.match(/[\u4e00-\u9fff][A-Za-z\u00c0-\u00ff]{2,}[A-Za-z\s]/gu) || [];
const colados = [...new Set(suspect)];
if (colados.length) {
  console.log("\npossiveis corrupcoes (hanzi colado em palavra latina):");
  colados.forEach((c) => console.log("   " + c));
}

process.exit(bad || colados.length ? 1 : 0);
