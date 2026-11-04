# 0152 — Ouro: as faixas de variação proporcionais à volatilidade; os pesos por horizonte testados e não adotados

## Contexto

O "Relatório de oportunidades de melhoria: sistema de sinais do ouro (prompt ouro-v3)", de 2026-11-01 (resposta no
`STATUS_DO_PROJETO.md`, §0), aponta:

- **E6:** as faixas do ouro são fixas (LATERAL até ±0,4% e BAIXA_FORTE a partir de −1,2% no horizonte imediato). Com a
  volatilidade diária do ouro acima de 1%, muitos dias caem em faixa forte por ruído, e o estado lateral quase não
  aparece. Pede normalizar as faixas pela volatilidade recente (limiar = k × σ × √h, com k calibrado no histórico),
  com a frequência de cada estado perto da histórica.
- **M9:** pesos por horizonte, "hipótese a testar", sem produção antes de um backtest fora da amostra. Junto vêm o
  **E7** (uma regra de agregação determinística em código) e o **M8** (uma regra explícita para o estado lateral).

O que o FinMind tinha: as faixas fixas por horizonte (`analise-diaria-ouro.js`), os percentis 40 e 80 da variação
absoluta do ouro da LBMA de 2010 a 2026-09-28, desenhadas para ~40% LATERAL, ~40% LEVE e ~20% FORTE. A Qualidade da IA
classifica o realizado com as faixas gravadas em cada leitura (ADR 0063), não com as da configuração. A agregação fica
com a IA: no café e no milho, a soma ponderada em código não superou os benchmarks (ADRs 0066 e 0081), e os motores
foram validados sem ela (ADR 0108).

**Quem decidiu:** o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind.

## Evidência (banco de dev, ouro da LBMA, 2010 a 2026-09)

**E6.** A frequência de cada faixa, ano a ano, com a variação de 1, 5, 21 e 62 pregões a partir de cada pregão. As
faixas normalizadas usam σ = o desvio dos retornos diários dos 60 pregões anteriores, e k1 e k2 = os quantis 40 e 80 de
|variação| ÷ (σ × √n) em **2010 a 2019**; **2020 a 2026 fica fora da amostra**.

| IMEDIATO | σ diário médio | Fixas: LATERAL / LEVE / FORTE | Normalizadas: LATERAL / LEVE / FORTE |
|---|---|---|---|
| 2018 (calmo) | 0,56% | 53% / 42% / 5% | 35% / 42% / 23% |
| 2024 | 0,88% | 42% / 44% / 14% | 40% / 40% / 19% |
| 2025 | 1,09% | 36% / 41% / 23% | 40% / 37% / 23% |
| 2026 (até set) | 1,82% | **19% / 36% / 45%** | 38% / 41% / 21% |

No CURTO de 2026, as fixas deram 18% / 31% / **51%**, e as normalizadas, 42% / 41% / 17%. Em todos os anos fora da
amostra, as normalizadas ficam perto de 40 / 40 / 20 no IMEDIATO, no CURTO e no MEDIO. No LONGO oscilam mais nos dois
desenhos, porque as tendências longas dominam (em 2025, 71% FORTE nos dois).

Os k: IMEDIATO 0,43 / 1,22; CURTO 0,51 / 1,24; MEDIO 0,52 / 1,30; LONGO 0,55 / 1,29. Com σ de 1% ao dia, o IMEDIATO fica em
0,4 / 1,2%, as faixas fixas de antes. Com o GLD até 2026-10-09 (σ de 1,34%), o IMEDIATO fica em 0,6 / 1,6% e o LONGO em
5,8 / 13,6%.

**M9.** A soma ponderada dos escores dos fatores (forte 2, moderada 1, fraca 0,5, como no IC, ADR 0150), com os pesos
da Tabela 3 do documento (Alto 3, Médio 2, Baixo 1, Zero 0; sem a expectativa de juros, que não existe, e sem o F4, de
eventos), renormalizada pelos pesos com dado, toda sexta de 2013-10 a 2026-09:

| Horizonte | IC [90%] | Acerto do lado (escore de 0,5 ou mais) | Semanas com alta depois |
|---|---|---|---|
| IMEDIATO | +0,02 [−0,05; +0,08] | 49% (316 semanas) | 50% |
| CURTO | +0,05 [−0,02; +0,11] | 54% (337) | 55% |
| MEDIO | +0,09 [−0,04; +0,20] | 52% (293) | 55% |
| LONGO | +0,17 [−0,01; +0,32] | 57% (314) | 62% |

Nenhum IC tem o intervalo excluindo o zero, e o acerto não supera "sempre alta" em nenhum horizonte. O pouco do LONGO vem
do F5 (peso Alto ali), que já vota nesse horizonte (ADR 0150, adendo).

## Decisão

1. **E6: as faixas do ouro passam a ser proporcionais à volatilidade** (configuração do ouro v4,
   `FAIXAS_POR_VOLATILIDADE`): em cada leitura, T = k × σ × √n, com σ o desvio dos retornos diários dos últimos 60
   pregões do GLD até o último preço recebido e n = 1, 5, 21 e 62. O retorno de cada par de pregões sai do vencimento
   mais próximo com ajuste nos dois dias: a troca de contrato nunca vira retorno (`factors/volatilidade-futuro.js`). As
   faixas vão ao bloco 2.4 com o σ e o período, e ficam gravadas na entrada da leitura (com `faixasPorVolatilidade`): o
   realizado e a Qualidade da IA usam as gravadas. Sem 60 retornos, valem as faixas fixas, e o bloco diz isso.
2. **Só no ouro.** Os outros ativos têm faixas fixas no mesmo desenho; mudar seria decidir por eles.
3. **A Persistência das carteiras virtuais** (o T1 do MEDIO, ADR 0127) **segue com o T1 fixo:** a medição das carteiras
   é pré-registrada.
4. **M9: os pesos por horizonte não são adotados**, e com eles o **E7** e o **M8**: a soma ponderada em código não tem
   sinal, como no café (ADR 0141). A combinação dos fatores segue com a IA, e o estado lateral vem das faixas do item 1.

## Consequências

- "LEVE" e "FORTE" passam a significar grande para a volatilidade do momento, não um percentual fixo.
- As leituras da configuração v4 não são comparáveis às anteriores na métrica de faixa; a Qualidade da IA separa as
  versões. A métrica de direção não muda.
- O cálculo do E6 e do M9 foi uma análise avulsa, sem script no repositório: os números e o método estão aqui.
