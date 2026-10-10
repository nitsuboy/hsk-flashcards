# Chinês — HSK 3.0 Band 1 (HSK 1)

Material de estudo em português para os **300 verbetes do HSK 3.0 Nível 1**, com
significado conceitual, análise de componentes, exemplos e flashcards com repetição
espaciada.

Você já sabe pinyin e tons. Aqui o foco é guardar o **significado** de cada
ideograma e reconhecer os **componentes** que se repetem — não decorear de vez.

**Publicado em GitHub Pages:** <https://nitsuboy.github.io/hsk-flashcards/>
(flashcards em `.../hsk-flashcards/flashcards/`).

## Como usar

| Arquivo | Para quê |
| --- | --- |
| [`flashcards/index.html`](flashcards/index.html) | Revisão diária com SRS (abra direto no navegador) |
| [`PLANO-DE-ESTUDOS.md`](PLANO-DE-ESTUDOS.md) | Roadmap de 12 fases + como estudar de verdade |
| [`RADICAIS.md`](RADICAIS.md) | Tabela dos 190 componentes mais frequentes |
| [`data/hsk1.json`](data/hsk1.json) | Fonte canônica dos 300 verbetes |
| [`anki/`](anki) | Decks `.tsv` para importar no Anki |

**Comece por [`PLANO-DE-ESTUDOS.md`](PLANO-DE-ESTUDOS.md)** — ele explica a ordem de
estudo e a rotina diária. Os flashcards são a revisão, não a primeira leitura.

## Flashcards

Abra `flashcards/index.html` no navegador. Não precisa de servidor nem de build:
o app carrega `data/hsk1.js`, que é gerado a partir do JSON.

Quatro modos:

| Modo | O que faz |
| --- | --- |
| `recognize` | Ver hanzi + pinyin e revelar o significado |
| `produce` | Ver o significado em português e produzir hanzi + pinyin |
| `audio` | Ouvir a pronúncia e reconhecer a palavra escrita |
| `comp` | Treinar os componentes/radicais de um caractere |

Escolha com o teclado ou pelos botões:

| Tecla | Ação |
| --- | --- |
| `Espaço` | Revelar a resposta |
| `1` `2` `3` `4` | Graduar (de novo / difícil / bom / fácil) |
| `U` | Writing mode: escrever o caractere no canvas |
| `R` | Ouvir novamente |
| `P` | Pausar |

O agendamento segue **SM-2**: erro devolve o cartão em 10 minutos; acerto empurra o
intervalo. O progresso fica em `localStorage`, na chave `hsk1.progress.v1`, e o
botão **Exportar** salva um JSON para backup.

### Áudio

A barra **Som:** acima do cartão mostra qual fonte está em uso.

| Fonte | Quando | Observação |
| --- | --- | --- |
| Voz do sistema | Há Mandarin instalado no Windows | Offline, melhor latência |
| Voz web | Nenhuma Mandarin instalada | Usa o Google Translate TTS, precisa de internet |

O botão **Testar som** fala 你好 e mostra o resultado na barra — é a forma rápida de
descobrir se o áudio está funcionando antes de começar a sessão.

**Para instalar a voz Mandarin no Windows** (deixa o app 100% offline):

1. Configurações → Hora e Idioma → Idioma → adicionar **Chinês (Simplificado)**.
2. Clicar nos três pontos do idioma → **Opções de idioma** → ativar **Fala**.
3. Em *Gerenciador de fala*, instalar **Microsoft Huihui Desktop (zh-CN)**.
4. Reiniciar o navegador.

Se você estiver no Chrome e ainda assim a barra mostrar "voz do sistema" com voz
errada, recarregue com `Ctrl+Shift+R` — o `speechSynthesis` só popula as vozes
depois que a página carrega.

## Anki

Os arquivos em `anki/` são TSV com cabeçalho:

- `hsk1-zh-para-pt.tsv` — hanzi → pinyin e significado (reconhecer)
- `hsk1-pt-para-zh.tsv` — significado → hanzi e pinyin (produzir)

No Anki: **Arquivo → Importar**, tipo *Basic*, separador *Tab*. Marque as colunas
como: Frente, Tras, e o pinyin como campo extra ou na contracarta.

## Formato dos dados

`data/hsk1.json` é a fonte única da verdade. Cada verbete:

```jsonc
{
  "id": 137,
  "hanzi": "那边",
  "pinyin": "nàbiān",
  "pos": "advérbio / pronome",  // ou verbo, substantivo, classificador...
  "topico": "Palavras funcionais",
  "gloss_pt": "aquele lado de lá",
  "conceito": "...",          // explicação do uso real, em português
  "componentes": [
    { "char": "那", "partes": ["那"], "ideia": "..." },
    { "char": "边", "partes": ["辶", "力"], "ideia": "..." }
  ],
  "exemplos": [ { "zh": "椅子在那边。", "pt": "A cadeira está daquele lado." } ],
  "notas": "..."              // curvas, falsos amigos, regras
}
```

`componentes` traz **um objeto por caractere distinto** do verbete, com as partes
realmente visíveis na forma e o que elas sugerem. Nenhuma etimologia é inventada:
quando o ideograma é simples (`大`, `中`, `生`), o campo diz isso e descreve o desenho
como pista de memorização.

## Scripts

```bash
node scripts/build-data.mjs    # gera data/hsk1.js, anki/*.tsv e RADICAIS.md
node scripts/test-data.mjs     # integridade dos 300 verbetes
node scripts/test-texto.mjs    # caça-corrupções de texto
node scripts/test-scanner.mjs  # prova que o caça-corrupções funciona
node scripts/test-plano.mjs    # confere as listas do plano
node scripts/test-app.mjs      # testa os flashcards sem navegador
node scripts/test-audio.mjs    # testa os dois caminhos de TTS
node --check flashcards/app.js
```

**Rode `build-data.mjs` sempre que editar `data/hsk1.json`** — os outros arquivos
são derivados e não são lidos de volta.

`test-texto.mjs` é a rede de segurança contra um problema que apareceu na geração
inicial: textos em português com pedaços de outros idiomas colados no meio
(`pigREITO`, `em讨论`, `Another常见`). Ele varre `hsk1.json`, o plano e o
`RADICAIS.md` procurando CJK grudado em palavra latina, maiúsculas suspeitas,
inglês vazado e mojibake. `test-scanner.mjs` injeta cada um desses defeitos numa
cópia do dataset e confirma que o scanner acusa — senão o scanner só pareceria
funcionar.

O registro do que foi corrigido, e por quê, está em
[`docs/REPAROS-TEXTUAIS.md`](docs/REPAROS-TEXTUAIS.md).

## Referência

- Lista: HSK 3.0 Nível 1, 300 verbetes, hanzi simplificado, conferida contra a
  ementa oficial. A ementa antiga de 2010 tinha 500 palavras e **não** é a mesma
  lista — não use listas velhas de HSK1.
- Radicais: os componentes listados são as partes visíveis dos ideogramas
  simplificados, não o catálogo oficial de 214 radicais Kangxi. Para esse
  catálogo, consulte o *Chinese radical database*.
- Pinyin: sem tons nos arquivos TSV para facilitar colagem; com tons
  no app e no JSON.
