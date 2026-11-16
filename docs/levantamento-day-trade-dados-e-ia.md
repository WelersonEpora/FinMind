# Levantamento: dados intradiários e custo da IA para o day-trade (ouro e mini-dólar)

Levantamento feito em 2026-11-06, a pedido do usuário, para a conversa do Comitê sobre o day-trade (a fase 2 do
[ADR 0117](adr/0117-dolar-como-ativo-fase-1.md)). **Não é decisão:** nenhum provedor foi contratado e nenhuma fonte entra
no FinMind sem a autorização do usuário registrada num ADR (a aquisição está encerrada desde 2026-10-01, salvo demanda
específica). Os preços são os publicados pelos provedores ou por comparativos na data. Onde a fonte é de terceiros ou não
foi possível conferir, está marcado "a confirmar".

## 1. A premissa usada nas contas

- **Ciclo de 15 minutos**, só quando há mercado: o ouro negocia cerca de 23 h por dia de domingo à noite a sexta, e o WDO
  só no pregão da B3, das 9h às 18h30. Rodar 24/7 gastaria ciclos sem preço novo.
- Por mês (22 dias úteis), isso dá cerca de **2.000 ciclos do ouro e 840 do WDO, ~2.850 no total**.
- **Notícias: uma busca por hora**, reaproveitada pelos ciclos da hora seguinte, o que dá ~750 buscas por mês.
- **O prompt intradiário** tem duas partes: uma fixa do dia, com os fatores e as instruções, montada uma vez e
  guardada em cache; e uma parte pequena trocada a cada ciclo, com o preço, a faixa do dia e as notícias novas. Na conta
  abaixo, cada chamada tem 10 mil tokens de entrada e 3 mil de saída, com o raciocínio do modelo incluído. Esses números
  são estimativas e ainda precisam ser conferidos com os tokens reais das leituras de hoje, que ficam gravados em cada
  execução.

## 2. Custo da IA (Gemini, preços oficiais em 2026-11-06)

| Modelo | Entrada / saída (US$ por 1M tokens) | Custo por mês (~2.850 ciclos) |
|---|---|---|
| Gemini 3.1 Flash-Lite | 0,25 / 1,50 | ~US$ 20 |
| Gemini 3.5 Flash-Lite | 0,30 / 2,50 | ~US$ 30 |
| Gemini 3.8 Flash | 0,75 / 3,75 (**1,50 / 7,50 a partir de 2027-01-01**) | ~US$ 55 (~US$ 105 em 2027) |
| Gemini 4 Argon | 2,00 / 10,00 (**4,00 / 20,00 a partir de 2026-12-01**) | ~US$ 145 (~US$ 285 em dezembro) |

- **A saída pesa mais que a entrada**, porque o raciocínio do modelo é cobrado como saída. Limitar o raciocínio no
  intradiário reduz a conta mais que o cache.
- **Busca na web:** 5.000 buscas grátis por mês, somando todos os modelos Gemini 3 ou mais novos, e depois US$ 14 por mil.
  O limite é de 1.500 por dia. Cada pedido pode fazer mais de uma busca. Com ~750 pedidos por mês, mais as leituras
  diárias de hoje, o uso fica perto da franquia: no pior caso, alguns dólares por mês acima dela.
- **Não há busca no plano gratuito.** O day-trade exige a chave paga.
- **Alerta à parte, que já vale hoje:** a recomendação das carteiras usa o `gemini-3.8-flash`
  (`GEMINI_MODEL_RECOMENDACAO`), que **dobra de preço em 2027-01-01**. O `gemini-2.5-flash` e o `gemini-2.5-pro` estão
  descontinuados e passam a ser atendidos por outros modelos em 2026-12-01.

## 3. Preço do ouro durante o dia

| Provedor | O que entrega | Preço | Observação |
|---|---|---|---|
| **Databento** | Futuro de ouro da COMEX (GC), dado oficial da CME | Plano Standard: **US$ 199/mês** (desde 2026-06-22). O uso pessoal da CME está incluído, em até 2 dispositivos. | A melhor qualidade da lista. Para uso comercial, as taxas da CME são cobradas à parte. |
| **Twelve Data** | XAU/USD (ouro à vista) por API REST | Grátis: 8 chamadas por minuto e 800 por dia. Pagos a partir de **US$ 29/mês** (Grow) e US$ 99/mês (Pro). | Um ciclo de 15 minutos usa ~96 chamadas por dia, o que caberia no plano grátis. A confirmar se o XAU entra no plano grátis. |
| **GoldAPI** | Ouro à vista | Grátis: 300 chamadas/mês (não basta). Pro: **US$ 99/mês**. | Comparativo feito por um concorrente. A confirmar. |
| **Massive** (ex-Polygon) | XAU/USD como par de moedas | Planos de câmbio a partir de ~US$ 29 a 49/mês | Preço a confirmar no site. |
| **OANDA** | XAU/USD por API v20 | API grátis com a conta | A confirmar se a OANDA aceita conta de residente no Brasil. |
| **Yahoo (GC=F)** | Futuro da COMEX, com atraso | Grátis | O FinMind já usa o Yahoo, como fonte não oficial e provisória ([ADR 0096](adr/0096-brent-futuro-yahoo-provisorio.md)). Serve para um teste, não como fonte definitiva. |

## 4. Preço do mini-dólar (WDO) durante o dia

**A taxa da B3 é pequena para pessoa física.** O custo está no distribuidor. Valores da Política Comercial de Market
Data B3 2026 (v1.1, §4.2.1, dataset Futuros):

| Uso | Por mês |
|---|---|
| Terminal não profissional (pessoa física), topo do livro ou livro completo | **R$ 1,86** |
| Aplicação automática de não profissional (non-display), fora do co-location | **R$ 0,00** |
| Terminal profissional, topo do livro / livro completo | R$ 145 / R$ 209 |
| Aplicação automática profissional para trading, fora do co-location | R$ 500 |

**Ponto a esclarecer antes de contratar:** se o servidor do FinMind recebe o dado e o mostra a várias pessoas, a B3 pode
enquadrar isso como **distribuição**, que tem licença própria e bem mais cara. Esse ponto precisa ser perguntado ao
distribuidor escolhido. Se cada pessoa usar o próprio acesso, o enquadramento é outro.

| Caminho | O que entrega | Preço | Roda no servidor do FinMind (Linux ARM)? |
|---|---|---|---|
| **Cedro (Market Data Cloud)** | BM&F em tempo real ou com atraso, por REST e WebSocket. Histórico da BM&F desde 2007. | Planos de pessoa física, só para uso próprio e sujeitos a auditoria: entre **R$ 439,90 e R$ 1.033,50/mês**. Contratação pelo comercial. | **Sim**, é uma API web. |
| **Nelogica (ProfitDLL)** | Tick a tick, livro de ofertas e histórico | Preço só na área logada. Como referência, o Profit Ultra custa R$ 550/mês. | **Não**: é uma biblioteca do Windows. |
| **MetaTrader 5 pela corretora** | Tempo real incluído na conta de várias corretoras | Em geral, sem custo extra | **Não**: a biblioteca em Python só roda no Windows. No Linux, só por Wine, e é frágil. Precisaria de um computador Windows ligado o tempo todo. |
| **Dados de Mercado** | Ações, fundos, Tesouro e macro | Sob consulta | Não lista futuros. Não atende. |

## 5. Notícias

| Opção | Preço | Observação |
|---|---|---|
| **Busca do Gemini, a cada hora** | Dentro da franquia de 5.000 buscas/mês (ver §2) | É como a leitura de eventos já funciona hoje, usando fontes autorizadas. |
| **Marketaux** | Grátis: 100 pedidos/dia. Basic: **US$ 29/mês**, com 2.500 por dia. | Notícias marcadas por ativo e com sentimento. A confirmar se cobre o ouro e o dólar. |
| **Finnhub** | Os comparativos divergem, de grátis a milhares de dólares | O plano pessoal proíbe uso por empresa sem autorização. |
| **Reuters (Reuters Connect / LSEG)** | Sem preço público: contrato anual, estimado em **cinco dígitos em dólar por ano** | Só se a busca horária não bastar, como o usuário disse. |

## 6. Ordem de grandeza do total por mês

| Item | Faixa |
|---|---|
| IA (Flash-Lite a Flash) | US$ 20 a 55 |
| Notícias (busca do Gemini) | ~US$ 0 a 10 |
| Ouro | US$ 0 a 29 (Twelve Data ou Yahoo) ou US$ 199 (Databento, oficial) |
| WDO | R$ 440 a 1.035 (Cedro) ou ~R$ 0 com o MetaTrader 5 de uma corretora, que exige um computador Windows |

**O dado do WDO é o item mais caro e o que pede a decisão mais difícil.** Ele envolve o enquadramento na B3, o
distribuidor e onde roda a coleta. A IA e as notícias ficam em dezenas de dólares por mês.

## 7. O que fica para decidir (usuário e Comitê)

1. **Ouro:** ouro à vista (XAU/USD) ou futuro da COMEX (GC)? Dado oficial ou não oficial?
2. **WDO:** dado em tempo real ou com atraso de 15 minutos? Cedro (no servidor) ou MetaTrader 5 (num computador
   Windows)?
3. **Uso:** cada pessoa com o próprio acesso, ou o FinMind distribuindo para o grupo? Isso muda a licença da B3.
4. **Modelo da IA no intradiário:** um Flash-Lite, ou o mesmo modelo da leitura diária?
5. **Ciclo:** fica o de 15 minutos, só com mercado aberto? O ciclo roda sempre ou só com alguém acompanhando?

## Fontes

- Gemini, preços: https://aistudio.google.com/docs/pricing ; busca: https://ai.google.dev/gemini-api/docs/google-search
- B3, Política Comercial de Market Data 2026 (v1.1): https://b3.com.br/data/files/20/35/7A/71/5CCFF91094DCD8F9AC094EA8/Politica%20Comercial%20de%20Market%20Data%20B3%202026%20V1.1.pdf
- Databento: https://databento.com/blog/updates-to-subscription-pricing ; https://databento.com/docs/portal/live-data
- Twelve Data (comparativos): https://www.g2.com/products/twelve-data/pricing ; https://apiterms.com/api/twelvedata.com/
- GoldAPI (comparativo): https://goldprice.dev/comparison/goldapi-io-review
- Massive/Polygon (comparativo): https://costkite.com/tools/massive-formerly-polygon-io
- OANDA: https://developer.oanda.com/rest-live-v20/api-comparison/
- Cedro: https://www.marketdatacloud.com.br/precos/ ; https://cedrotech.com/produtos/market-data-cedro/
- Nelogica: https://blog.nelogica.com.br/primeiros-passos-profitdll/
- MetaTrader 5 no Linux: https://www.mql5.com/en/forum/457940 ; https://github.com/hpdeandrade/pymt5linux
- Dados de Mercado (comparativo): https://usebolsai.com/blog/melhores-apis-dados-b3-2026-comparacao
- Marketaux: https://www.marketaux.com/pricing ; Finnhub (comparativo): https://apicostcalc.com/finnhub.html
- Reuters Connect: https://dataresearchtools.com/reuters-connect-api-2026-pricing-coverage-how-to-get-access/
