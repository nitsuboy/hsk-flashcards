// Teste negativo do scanner: injeta corrupcoes conhecidas numa copia do JSON,
// roda scripts/test-texto.mjs e confirma que ele acusa. O arquivo real nunca
// e tocado: cada caso roda contra um arquivo temporario via env HSK1_ROOT.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const TMP = path.join(os.tmpdir(), "hsk1-scanner-fixture");

// test-texto.mjs le de ROOT fixo; vamos temporariamente apontar via copia do script.
const SCRIPT = new URL("./test-texto.mjs", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let codigo = fs.readFileSync(SCRIPT, "utf8");
if (!/const ROOT = .*?;/.test(codigo)) {
  console.error("test-texto.mjs mudou de forma; ajuste o fixture");
  process.exit(1);
}
const SCRIPT_TMP = path.join(TMP, "test-texto-fixture.mjs");
fs.mkdirSync(TMP, { recursive: true });
fs.writeFileSync(
  SCRIPT_TMP,
  codigo.replace(/const ROOT = .*?;/, `const ROOT = "${TMP.replace(/\\/g, "/")}/";`),
  "utf8"
);

const ORIG = JSON.parse(fs.readFileSync(ROOT + "data/hsk1.json", "utf8"));

const FIXTURES = [
  {
    nome: "colagem camelAnonima (pigREITO)",
    aplica: (d) => {
      d.itens[25].componentes[1].ideia = d.itens[25].componentes[1].ideia.replace(
        "o porco doméstico",
        "o pigREITO doméstico"
      );
      return /pigREITO/.test(d.itens[25].componentes[1].ideia);
    },
  },
  {
    nome: "CJK colado em palavra (em讨)",
    aplica: (d) => {
      const it = d.itens.find((x) => x.id === 137);
      it.conceito = it.conceito.replace("do que está em discussão", "do que está em讨论");
      return /em讨论/.test(it.conceito);
    },
  },
  {
    nome: "mojibake U+FFFD",
    aplica: (d) => {
      d.itens[0].conceito = "bibli\uFFFDoteca " + d.itens[0].conceito;
      return true;
    },
  },
  {
    nome: "ingles vazado (Another常见)",
    aplica: (d) => {
      d.itens[269].conceito = d.itens[269].conceito.replace(
        "outra construção comum",
        "Another常见"
      );
      return /Another/.test(d.itens[269].conceito);
    },
  },
  {
    nome: "CONTROLE: arquivo limpo",
    aplica: () => true,
    esperadoOk: false,
  },
];

let passou = 0;
for (const fx of FIXTURES) {
  const copia = JSON.parse(JSON.stringify(ORIG));
  const aplicado = fx.aplica(copia);
  if (!aplicado) { console.log(`FALHOU  ${fx.nome}: fixture nao aplicou`); continue; }

  fs.mkdirSync(path.join(TMP, "data"), { recursive: true });
  fs.writeFileSync(path.join(TMP, "data", "hsk1.json"), JSON.stringify(copia, null, 2), "utf8");
  for (const extra of ["PLANO-DE-ESTUDOS.md", "RADICAIS.md", "README.md"]) {
    const src = ROOT + extra;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(TMP, extra));
  }

  let saida = "", code = 0;
  try {
    saida = execFileSync("node", [SCRIPT_TMP], { encoding: "utf8" });
  } catch (e) { saida = e.stdout || ""; code = e.status; }

  const acusou = code === 1 && /possiveis problemas/.test(saida);
  const esperando = fx.nome.startsWith("CONTROLE") ? !acusou : acusou;
  console.log(`${esperando ? "OK      " : "FALHOU  "} ${fx.nome}  (exit ${code})`);
  if (esperando) passou++;
}

console.log(`\n${passou}/${FIXTURES.length} fixtures behaved as expected`);
process.exit(passou === FIXTURES.length ? 0 : 1);
