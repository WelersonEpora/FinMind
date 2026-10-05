# 0058 — Leitura diária de tendência do milho (prompt, IA e Centro de Decisão)

## Contexto

O milho tinha os 8 fatores calculados na tela Metodologia do Ativo, com a proposta v0 do David (Motor do Milho v0,
ADR 0056), mas ficava fora do prompt diário, da IA e do Centro de Decisão até a aprovação do Comitê. O mesmo caminho
foi seguido pelo petróleo (ADRs 0050 a 0052) e pelo ouro (ADRs 0053 e 0054).

**Aprovação (registrada pelo usuário em 2026-10-04):**

- **O que foi aprovado:** o Motor do Milho v0 como está na tela, com as regras do David, os limiares v0 e os
  acréscimos do FinMind (fortes, tendências e travas). Os ajustes daqui em diante são pelos parâmetros.
- **Formato da IA:** leitura de tendência, como no petróleo e no ouro, e não recomendação de compra ou venda. O
  David tinha pedido uma recomendação absoluta (comprado, vendido ou fora). A restrição permanente do `CLAUDE.md`
  continua valendo.
- **Base do F4** (Campinas − paridade de MT): fica como está por ora, com o limiar 0.
- **Preço de referência:** o CCM, no vencimento mais próximo negociado.
- **Eventos sem validação humana, por ora:** combinado com o Comitê. Os eventos vão ao prompt como chegam da leitura
  diária por IA, e a decisão pode ser revista. O David tinha pedido validação humana antes do prompt no F8; essa
  validação fica para depois.

## Decisão

1. **Configuração** `shared/analise-diaria-milho.js` (versão 1), no molde da do ouro.
   - **Horizontes:** os quatro do petróleo e do ouro (1, 7, 30 e 90 dias, contados da data da análise). São os
     mesmos do prompt do David.
   - **Faixas:** T1 e T2 são os percentis 40 e 80 da variação absoluta do Indicador CEPEA/ESALQ (2018-06-08 a
     2026-09-25, 2.062 pregões).

     | Horizonte | T1 | T2 |
     |---|---|---|
     | Imediato (1 dia) | 0,3% | 1% |
     | Curto (7 dias) | 1% | 3% |
     | Médio (30 dias) | 3% | 9% |
     | Longo (90 dias) | 6% | 19% |

     O ESALQ, e não o CCM, pelo mesmo critério do ouro (a LBMA no lugar do GLD): o CCM só tem histórico desde 2022, com
     um buraco em 2023, e liquida contra o ESALQ. No CCM (todos os vencimentos, 2022 a 2026), as faixas saem mais
     estreitas nos prazos longos: 1,9 e 5,1% em 30 dias, 2,8 e 7,7% em 90 dias. As 6 classes fixas do prompt do David
     (1, 3, 5, 7 e 10%) ficam como alternativa para o Comitê. As faixas são provisórias.
   - **Preço:** o futuro CCM da B3, em R$/saca. É o vencimento mais próximo negociado, sem emendar contratos, e sem a
     conversão pela PTAX. O bloco de preço do prompt deixou de ter "US$" escrito à mão: a moeda vem da configuração.
   - **Curva:** fora desta versão. Os vencimentos do CCM por horizonte, com a liquidez mínima, são pergunta do ativo.
2. **Prompt** `ai/prompts/milho-analise-diaria.md` (versão 1).
   - **O que não muda:** a mesma estrutura e o mesmo formato de resposta (JSON) do ouro.
   - **O que é do milho:**
     - o CCM como ativo, com Chicago só como referência externa;
     - sem fórmula de agregação: a IA não conta votos;
     - o bloco de oferta (clima, safrinha e estoques) como um argumento só, sem contar duas vezes o mesmo choque;
     - os estoques como filtro dos sinais de oferta;
     - a ressalva da base do F4;
     - os fundos com leitura de reversão, como contexto e não voto;
     - o custo de produção como sinal defasado;
     - o conflito entre blocos explicado, com a confiança reduzida.

     Tudo isso vem do prompt e das regras de agregação do Motor do Milho v0 do David. Fica como orientação à IA, não
     como cálculo.
3. **Eventos em fatores calculados.** No ouro e no petróleo, só os fatores de evento têm eventos. No milho, a leitura
   de eventos atribui cada evento a um dos 8 fatores (uma tarifa ao F8, uma seca ao F1). Por isso cada fator calculado
   passa a levar também os eventos marcados com ele, depois do texto do cálculo. O cálculo não usa os eventos.
   - **Janela:** 7 dias, como a geopolítica do ouro, e 30 no F8, porque tarifas e habilitações pesam por mais tempo.
     É um acréscimo do FinMind.
   - **Na tela:** a metodologia marca esses fatores com "Com eventos" e mostra os eventos abaixo do cálculo.
   - **No código:** `deEvento` passou a valer só para o fator sem cálculo, e `comEventos` marca o calculado com eventos.
4. **Centro de Decisão:** o CCM passou a ser a 1ª série do milho, e o Indicador ESALQ fica como alternativa. O
   coletor `milho-analise-ia-diario` roda depois dos outros coletores, uma vez por dia, como no ouro.

## Evidência (dev, 2026-10-04)

- O prompt de 2026-10-04 foi montado com o CCMX26 a R$ 71,67 (02/10), os 8 fatores e os 8 blocos de eventos.
- Uma chamada real ao Gemini passou na validação de formato:

  | Horizonte | Tendência | Confiança |
  |---|---|---|
  | Imediato | Lateral | Baixa |
  | Curto | Baixa leve | Média |
  | Médio | Lateral | Baixa |
  | Longo | Alta leve | Baixa |

- **O que a IA trouxe de fora da base:** na leitura de longo prazo, ela citou a "entressafra" e o "esgotamento
  sazonal". A sazonalidade não está na base. É o tipo de coisa que o mapa sazonal de pesos, ainda pendente,
  resolveria.
- **Bug achado:** o serviço da análise tinha o catálogo de fatores fixo para o petróleo e o ouro. A primeira leitura
  do milho derrubaria o Centro de Decisão. Foi corrigido, e um teste agora cobre o caso.

## Consequências

- O milho passa a ter leitura de tendência diária no Centro de Decisão e na tela de metodologia (aba do prompt).
- A IA recebe os eventos sem validação humana, como no ouro e no petróleo. Uma pressão de evento é leitura de outra
  IA, e o prompt pede menos firmeza para ela do que para um dado medido.
- **Continuam abertos:**
  - o mapa sazonal de pesos e a agregação em código;
  - os vencimentos por horizonte e a curva;
  - as faixas (as do ESALQ ou as classes do David);
  - a base do F4.

## Fora do escopo

Recomendação de compra ou venda; o café; a agregação dos fatores em código; a curva do CCM; a validação humana dos
eventos.

## Adendo (2026-10-05): as faixas recalibradas no CCM (configuração v2)

**Decisão do usuário (Welerson, 2026-10-05):** as faixas do milho passam a ser calibradas no próprio CCM, o preço que a
leitura mede e que a Qualidade da IA avalia (ADR 0064). Nos outros três ativos as faixas já vinham do instrumento medido
(o Brent, o GLD e o ICF); o milho era o único com a régua tirada de outra série. Com as do ESALQ, as faixas longas
ficavam largas para o CCM: em 90 dias, o lateral ia de −6% a +6%.

| Horizonte | v1 (ESALQ) | v2 (CCM) | Percentis 40 e 80 do CCM |
|---|---|---|---|
| Imediato (1 dia) | 0,3 / 1% | 0,3 / 1% | 0,31 / 1,03% |
| Curto (7 dias) | 1 / 3% | 0,8 / 2,5% | 0,81 / 2,44% |
| Médio (30 dias) | 3 / 9% | 2 / 5% | 1,94 / 5,07% |
| Longo (90 dias) | 6 / 19% | 3 / 8% | 2,82 / 7,65% |

Os percentis são da variação absoluta de todos os vencimentos do CCM, cada um sem emendar, de 2022-03-21 a 2026-10-02
(banco de dev), com a regra de variação do Centro de Decisão. O critério é o mesmo dos outros ativos.

- **Ressalva:** o CCM tem histórico curto (desde 2022, com um buraco em 2023) e mais calmo que o do ESALQ. Se a
  volatilidade voltar, as faixas ficam apertadas. Continuam provisórias, e as classes fixas do prompt do David (1, 3,
  5, 7 e 10%) seguem como alternativa para o Comitê.
- **Uma faixa mais estreita não aumenta o acerto:** a leitura diz mais sobre o preço, mas a faixa exata fica mais
  difícil de acertar. O que mantém a avaliação justa é calibrar no instrumento medido, com os mesmos percentis.
- **Versão nova da configuração (v2):** o prompt passa a mostrar as faixas novas. As leituras da v1 continuam medidas
  com a régua gravada com elas, e o filtro de versão da Qualidade da IA separa as duas séries.
