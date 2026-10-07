# 0093 — As pendências do refino do petróleo (F9): contexto da demanda, sem pressão própria

**Status:** aceita (2026-10-06).

## Contexto

O F9 do petróleo ("Refino e margens (crack spreads)", peso Médio) é calculado desde 2026-10-03 (ADR 0050, item 11): o
crack 3-2-1 com os preços à vista de Nova York e o Brent, contra a média da mesma semana nos 5 anos anteriores, em US$
por barril. A camada C seguia a direção do FEL 1: "margens altas elevam demanda por cru" (margem acima do normal é
pressão de alta). Duas perguntas estavam abertas:

1. Qual crack spread: 3-2-1, 2-1-1, ou gasolina e diesel separados?
2. A margem muito alta por falta de derivados (como em 2022 e hoje) puxa o petróleo para cima, como diz o FEL 1, ou é
   um problema do refino que não puxa o petróleo?

Com o preço de referência passado do WTI ao Brent (ADR 0052, adendo), o FinMind refez as validações dos fatores do
petróleo contra o Brent (2026-10-06, sem gravar nada): o ponto de cada semana na data de publicação, contra a variação
do Brent 30, 90 e 182 dias depois, de 2011 (a 1ª média de 5 anos) a 2026.

| Medida | Brent 26 semanas depois (correlação) | Margem bem acima do normal (≥ US$ 10): Brent subiu | Todas as semanas |
|---|---|---|---|
| 3-2-1 (o cálculo atual) | −0,16 | 26% (n = 91; média −7,2%) | 48% |
| 3-2-1, sem 2022-23 | — | 32% (n = 25; −2,4%) | 50% |
| Só o diesel (42 × diesel − Brent) | −0,17 | 28% (n = 94; −4,8%) | 48% |
| Só a gasolina (42 × gasolina − Brent) | −0,11 | 37% (n = 101; −3,0%) | 48% |

A margem anda com o preço no mesmo período (+0,15 com os 6 meses anteriores; +0,32 com o nível do Brent) e com
refinarias mais cheias (+0,25 com a utilização), mas a direção do FEL 1 para frente não aparece: com a margem bem acima
do normal, o Brent caiu depois na maioria dos casos. Ressalva: são semanas sobrepostas de poucos episódios (a crise do
diesel de 2022-23 domina a amostra forte); sem ela, ainda 32%. Hoje (semana de 2026-10-02) a margem está em US$ 46,9,
US$ 22,5 acima do normal: o fator ia ao prompt como pressão de **alta forte**.

O mesmo trabalho mostrou o padrão dos outros fatores contra o Brent (o dólar, a produção dos EUA e os juros antecipam o
preço no sentido do FEL 1; os estoques, a demanda e a oferta não-OPEP descrevem a situação); eles são decididos um a um,
nos ADRs seguintes.

## Decisão (usuário, Welerson, 2026-10-06, pelo mesmo poder de decisão do David)

1. **Crack spread:** fica o 3-2-1 com o Brent. Separar gasolina e diesel não muda a relação com o preço (o diesel dá o
   mesmo; a gasolina, uma relação mais fraca), e a margem do diesel, que puxa a alta de 2022 e de 2026, já pesa nele.
2. **O refino passa a contexto da demanda** (`contextoDe: "PETROLEO_DEMANDA"`), o mecanismo do FEL 1 ("rentabilidade
   do refino influencia demanda por petróleo bruto"). O cálculo (A e B) e a validação histórica (D) continuam no prompt;
   em C, só o papel e a tendência da margem, sem pressão e sem intensidade. A IA não o lista a favor nem contra (a
   validação da resposta já recusa isso para um fator de contexto, ADR 0054). Das três saídas, foi a recomendada:
   manter a direção do FEL 1 contrariaria o histórico; inverter a leitura se apoiaria quase só em 2022-23.
3. A simulação da camada C continua na tela de metodologia, só como referência para o Comitê, como na inflação do ouro.

## Implementação

- `shared/metodologia-base.js`: `papelDecididoPor` (opcional; nome do ADR 0094, que o estende ao fator só de informação), quem decidiu o papel de contexto, como o texto do
  prompt o diz: "do especialista" por padrão (a inflação do ouro, decisão do David, sem mudança no texto dela) e "do
  usuário" no refino. `factors/base/texto-prompt.js` usa o campo.
- **Metodologia do petróleo v3:** o F9 sem perguntas, com as duas decisões e o texto D com a validação contra o Brent.
  O cálculo não muda (`refino_petroleo_crack_321` v1).
- **Prompt diário do petróleo v5:** o item 3 de "Como analisar" e a legenda do bloco 3 dizem como usar um fator de
  contexto, como no prompt do ouro. Nenhuma regra de peso nova.

## Consequências

- O F9 não tem pergunta pendente. O petróleo passa a ter um fator de contexto, como o ouro.
- A leitura da IA perde uma pressão de alta forte que o histórico não sustenta; as leituras já gravadas não mudam.
- Os scripts da validação ficam fora do repositório (só leem o banco); os números estão aqui e no texto D do fator.
