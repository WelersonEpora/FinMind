# 0089 — As pendências dos fundos do café (F7): a janela de 3 anos e o extremo só com o catalisador

**Status:** aceita (2026-10-06).

## Contexto

O F7 do café ("Posicionamento dos fundos", ADR 0060) lê o managed money do Coffee C (COT da CFTC) contra os 3 anos
anteriores, em reversão: vendidos em extremo pesam para alta, comprados em extremo para baixa. O estudo diz que o fator
não vota: é modificador de risco. Na agregação em código (ADR 0066), o F7 em extremo contra a direção agregada marca
RISCO_DE_REVERSAO e baixa a confiança um nível. As regras do estudo pedem um catalisador de F1 ou F2 para o extremo
pesar. Duas perguntas estavam abertas: janela de 1 ou de 3 anos para o percentil? Sem o catalisador, o extremo sozinho
já é pressão?

O FinMind rodou o próprio cálculo do F7 nas duas janelas (2009 a 2026) contra o preço mensal do arábica do FMI (FRED
`PCOFFOTMUSDM`), sem gravar nada. O catalisador testado: o F1 de alta nas 4 semanas anteriores.

| Semanas | n (3 anos / 1 ano) | 3 anos: preço em 3 meses | 1 ano | Base (todas) |
|---|---|---|---|---|
| Vendidos em extremo (leitura: alta) | 206 / 257 | subiu em 33% | 32% | subiu em 46% |
| Comprados em extremo (leitura: baixa) | 279 / 268 | caiu em 39% | 44% | caiu em 54% |
| Vendidos e F1 de alta | 8 / 9 | subiu em 0% | 0% | — |

No café, o extremo foi seguido de continuação, não de reversão, nos dois lados e nas duas janelas. Ressalva: são
semanas sobrepostas de poucos episódios longos, com o preço mensal. Com o catalisador, a amostra não basta.

Na agregação, isso quer dizer que o modificador tende a baixar a confiança quando a leitura está certa. Exemplo: em
2026-09-28 e 2026-10-05, o F7 em extremo de alta, contra a baixa agregada, baixou a confiança (ADR 0066, primeira
rodada no servidor); o F2 apontava baixa, então não havia catalisador.

## Decisão (usuário, Welerson, 2026-10-06)

1. **Janela:** 3 anos, como na v1.
2. **Só com o catalisador:** o extremo contra a direção agregada só é RISCO_DE_REVERSAO, e só baixa a confiança, com o
   F1 ou o F2 apontando na mesma direção dele, como a regra do estudo pede. Sem ele, SEM_PAPEL. Inverter a leitura para
   continuação contrariaria a regra do estudo e não foi proposto.
3. **Prompt:** o item 9 do bloco 4 passa a dizer que, sem o catalisador, o extremo não tem papel, e que a IA não lê
   reversão por conta própria; a validação histórica vai ao bloco D do fator.

## Consequências

- A agregação do café vai à v2 (`agregacao-cafe.js::papelDosFundos`, com os catalisadores em `MODIFICADOR`); muda a
  confiança gravada nas leituras em produção daqui em diante. As já gravadas não mudam.
- O prompt do café vai à v4; a metodologia, à v10. O F7 não tem pergunta pendente; o cálculo dele não muda.
- O "refinamento do catalisador no F7", fora do escopo do ADR 0066, fica feito aqui.
