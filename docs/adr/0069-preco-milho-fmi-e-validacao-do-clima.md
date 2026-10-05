# 0069 — Preço mensal do milho do FMI e a validação do clima do milho contra Chicago

**Status:** aceita (2026-10-05).

## Contexto

O fator "Clima e safra nos EUA" do milho (F1, ADR 0056) não mostrou relação com o preço em reais: contra o Indicador
CEPEA/ESALQ, em 9 safras (2018 a 2026), a relação saiu no sentido contrário ao do FEL 1. A pergunta ao David era: o
fator fica como está, à espera de uma validação contra Chicago (o ZC, Fase 2 da P8), ou entra com peso reduzido no CCM?
O ZC da CME é pago.

Antes de buscar uma fonte, o teste foi refeito com o que já estava na base: o Indicador em dólar (`AVISTA_USD`) e a
paridade de exportação do IMEA, em reais e em dólar. Tirar o câmbio não fez a relação aparecer: em dólar ela fica até
mais forte no sentido contrário (+0,31 com a variação em 8 semanas). A paridade do IMEA tem quebras na troca de contrato
e não serve para esse teste.

**Demanda específica e autorização:** a pendência do F1 pede um preço de Chicago. O usuário (Welerson) autorizou em
2026-10-05 a coleta do preço mensal do milho do FMI (`PMAIZMTUSDM`, no FRED). **Limite:** só aquisição de dados e a
validação do F1. Não é precedente para outra fonte nem para qualquer regra.

**Reconhecimento (chamada real em 2026-10-05):** a série é "Global price of Corn", em US$ por tonelada métrica, média
do mês. É o preço do maior exportador (os EUA), do release 365 do FRED ("Primary Commodity Prices"), o mesmo do café
(ADR 0045). Vai de 1992-01 a 2026-07 e revisa: são 91 versões no ALFRED, desde 2015-11-06. A licença e a data de
versão seguem o café: o FRED atualiza de forma irregular, e a data gravada é a chegada ao FRED, um limite superior.

## Decisão

1. **Coletor `fred-milho-fmi`** (`collectors/fred/fred-milho-fmi.collector.js`), com o `criarColetorAlfred` do café e
   do CPI. A fonte é própria, `FRED_ALFRED_FMI_MILHO`, porque o descarte das versões já gravadas é por fonte. A série
   é `FRED.PMAIZMTUSDM`. Ele exige a `FRED_API_KEY` e não precisa de backfill: cada execução baixa todas as versões.
   Em dev foram 415 meses e 0 falhas.
2. **Card `MILHO_PRECO_FMI`** (mensal), nos dados do F1.
3. **Resultado da validação** (semanas de junho a agosto, 1992 a 2025, 34 safras, preço na versão atual):

   | Comparação | Correlação com o desvio da lavoura |
   |---|---|
   | Variação de abril até o mês da semana (junto com o preço) | **−0,57** (−0,50 sem 2012); com pressão de alta, o preço estava acima do de abril em 63% das semanas (+3,6%); com pressão de baixa, em 15% (−8,9%) |
   | Variação do mês da semana até 1, 2 ou 3 meses depois (antecipação) | −0,02 a +0,09; com pressão de alta, o preço subiu em 37% a 43% das semanas, menos que com pressão de baixa |

   O fator confirma o sentido do FEL 1 em Chicago, junto com o preço, mas não o antecipa. O Crop Progress é público e
   o mercado o precifica na mesma semana. No CCM nem a relação junto com o preço aparece.
4. **Decisão do usuário (Welerson, 2026-10-05):** o peso do F1 no calendário do David **não muda**. A validação
   histórica do fator (a parte D do prompt) passa a dizer as duas coisas: o sentido confirmado em Chicago e a ausência
   de antecipação, em Chicago e no CCM. A pergunta sai das Pendências, e a metodologia do milho vai à v5.

## Consequências

- O F1 não tem mais pendência com o especialista. As regras dele ficam como estão (ADRs 0056 e 0068).
- A IA recebe que o fator descreve o estado atual da oferta americana, já refletido em Chicago.
- O mesmo preço pode validar os outros fatores do milho que dependem de Chicago (o estoque/uso do WASDE, o F3). Isso
  fica para quando houver a demanda.
- A validação é mensal: um teste semanal contra Chicago continua dependendo do ZC.
