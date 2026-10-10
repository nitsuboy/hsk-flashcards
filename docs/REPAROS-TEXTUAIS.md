# Reparos textuais aplicados ao dataset

A primeira geração dos 300 verbetes (produzida por modelo de linguagem em 11
lotes) saiu com pedaços de texto colados no meio do português. Não é erro de
codificação — o arquivo está em UTF-8 válido. É o modelo ter "continuado" uma
frase em outro idioma, produzindo Tokens híbrido como `pigREITO` ou `em讨论`.

`scripts/test-texto.mjs` foi escrito depois de encontrar isso, e
`scripts/test-scanner.mjs` prova que ele pega os casos reais. Este arquivo é o
registro do que foi corrigido, para auditoria.

## Como foram detectadas

O `Out-File` do PowerShell em Windows PowerShell 5.1 corrompe CJK no console, o
que mascarou o problema em várias rodadas. A correção do fluxo foi: fazer o Node
gravar o relatório direto com `fs.writeFile(..., "utf8")` e ler o arquivo pelo
editor, em vez de confiar no console.

## 31 substituições

### Lixo inserido dentro de frase

| Onde | Antes | Depois |
| --- | --- | --- |
| 半 | `tanto com 类GERAL de coisa` | `tanto com 类 de coisa (半个苹果)` |
| 半 | `半个 com 类GERAL` | `半个 + 类 de medida` |
| 本 | `usa o 类GERAL 个` | `usa o classificador geral 个` |
| 菜 | `一道菜 para um prato: 类GERAL de prato` | `um classificador de prato` |
| 病 | `você病了吗 soa como acusação` | `你病了吗 ('você está doente?')` |
| 不 | `não去 bù qù` | `不去 bù qù` |
| 家 | `o pigREITO doméstico` | `o porco doméstico` |
| 那边 | `o que está em讨论` | `o que está em discussão` |
| 那儿 | `se você se坚persistent em` | `se você se prender em` |
| 男朋友 | `nada de特別` | `nada de especial` |
| 女士 | `moça em服装店` | `moça em loja de roupa` |
| 女士 | `padrão em牌子 e formulários` | `padrão em placa e formulário` |
| 睡 | `sem o 类ificador nem plural` | `sem o classificador nem plural` |
| 午饭 | `Daí 午 pan鏡 em 上午` | `Daí 午 aparece em 上午` |
| 月 | `leva para完成 um ciclo` | `leva para completar um ciclo` |
| 再 | `Another常见 é 再 + verbo` | `outra construção comum é 再 + verbo` |
| 只 | `com duas一直在erviços` | `com duas funções` |

### Falta de espaço entre termo CJK e palavra

| Onde | Antes | Depois |
| --- | --- | --- |
| 那儿 | `então哪儿 soam` | `então 哪儿 soam` |
| 漂 | `Água ao lado de票` | `Água ao lado de 票 (bilhete)` |
| 热 | `Com substantivo省略` | `Com o substantivo 省略 (omitido)` |
| 有些 | `o mesmo有些 traduz` | `o mesmo 有些 traduz` |
| 元 | `um yuan vale um块` | `um yuan vale um 块钱` |
| 中学生 | `um 中学生, dois中学生` | `um 中学生, dois 中学生` |

### Outros desvios achados na revisão manual

| Onde | Antes | Depois | Motivo |
| --- | --- | --- | --- |
| 大家 | `abre e fecha as-Texto` | `abre e fecha as apresentações` | lixo |
| 那边 | `Emptrabalho, 那边 exige` | `No trabalho, 那边 exige` | lixo |
| 那边 | `equivalentes para o ouvinte` | `equivalentes para quem ouve` | palavra trocada |
| 男朋友 | `Registr é casual` | `Registro é casual` | truncado |
| 朋友 | `a mesma raiz de 友好, 友好 e 友人` | `友好, 友善 e 友人` | item duplicado |
| 士 | `gente de que é` | `gente de posição` | frase sem sentido |
| 月 | `o yí vem do sandui` | `o yí vem do sanduí` | acento |
| 菜 | `e por isso que o Mandarin diz` | `e é por isso que o Mandarin diz` | redundância |
| 女士 | `pode ser moça educado e antigo` | `pode ser 'moça', um tratamento educado e antigo` | truncado |

## Metadata

- `_meta.caracteres_unicos_no_roteiro` foi removido: valia 300, que é a
  quantidade de verbetes, não de caracteres. `_meta.caracteres_unicos` continua
  valendo 248 e é o número real.
- Tópico `Verbos everyday` (34 verbetes) renomeado para `Verbos cotidianos`, já
  que o material é todo em português. `_meta.topics` foi recalculado.

## Arquivo de origem

`RADICAIS.md` era gerado com `que \`忄\` (coração) indica情绪.`, com `情绪`
(emoção) grudado na frase. A correção foi feita em `scripts/build-data.mjs:98`,
não no markdown gerado, para não voltar na próxima geração.
