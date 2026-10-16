# 0128 — Tela TradingView: o widget gratuito do TradingView, embutido

**Status:** aceita (2026-10-16). Decisão do usuário (Welerson), com o mesmo poder de decisão do David.

## Contexto

O usuário quis comparar a visualização do FinMind com a do TradingView. O David manda prints de candles diários com
médias, Fibonacci e as linhas de stop e alvo, tirados do **Profit (Nelogica)** nos contratos da B3 (milho, café, soja);
para o ouro e o Brent, ele cita o TradingView e a Pepperstone, a corretora em que opera (ADR 0055, P3 e P8).

Avaliação de 2026-10-16:

- **Gráfico próprio (ECharts ou a biblioteca aberta Lightweight Charts):** possível, mas sem candle completo hoje: desde
  2025-12-12 nenhum futuro da B3 tem abertura (o Up2Data só traz mínima, máxima, média, último e ajuste; o Boletim Diário
  com a abertura mudou de formato), o Brent do Yahoo também não, e não há série contínua nem dado intradiário. E os
  indicadores (médias, Fibonacci) pedem uma decisão de quais e com que parâmetros.
- **Advanced Charts (biblioteca do TradingView):** licença gratuita só para sites públicos, por pedido; não se aplica.
- **Profit:** não tem widget para incorporar (a ProfitDLL é para robôs no Windows, com licença).
- **Widget gratuito do TradingView** (um script oficial que cria um iframe deles): sem custo nem cadastro, com o logo e o
  link do TradingView; a B3 aparece de graça nos widgets com 15 minutos de atraso desde nov/2023
  (<https://www.tradingview.com/blog/en/b3-data-available-in-tradingview-widgets-41743>).

Teste real (2026-10-16, widget aberto num navegador e conferido por print): abriram com candles diários e volume os
contratos da B3 `BMFBOVESPA:CCM1!`, `ICF1!`, `SJC1!`, `DOL1!` e `WDO1!` e os CFDs da Pepperstone `XAUUSD`, `SPOTBRENT`,
`CORN`, `COFFEE`, `SOYBEANS` e `USDBRL`. A abertura, a máxima e a mínima do dia do milho, do café e da soja bateram com
os prints do Profit do David; a série contínua não bate perto das rolagens (no milho, o salto aparece no fim de agosto
no Profit e no início de setembro no TradingView). Não serviram: `BMFBOVESPA:GLD1!` (o ouro da B3, quase sem negócio:
dias só com um traço, e o histórico parado em setembro), o Brent na B3 (não existe) e o TVC (`GOLD`, `UKOIL`), que só
repete ouro e Brent.

## Decisão

1. Uma tela **TradingView** (`/dados-mercado/tradingview`), no grupo Dados de Mercado, acima de Observáveis, com o widget
   "Advanced Real-Time Chart" do TradingView, em português, com os indicadores e as ferramentas de desenho do próprio
   widget:
   - **Tema:** escuro, com o fundo azul-marinho do Profit do David no lugar do preto do TradingView; um botão troca para
     o claro, lembrado no navegador.
   - **Tempo gráfico:** diário, aberto nos últimos 12 meses; **ouro e Brent abrem em 4 horas**, o tempo do ATR(14)
     deles na Cartilha (Tabela 2), sem janela fixa (testado: a janela manda no tempo gráfico, 1 mês abria em 30 min).
     Os outros tempos (1h, 30 min…) ficam no seletor do widget.
   - **Barra de períodos** embaixo (1D, 5D, 1M, 3M, 6M, YTD, 1A, 5A, Todos) e **painel de detalhes** à direita: preço,
     faixas do dia e de 52 semanas e, nos futuros, a curva dos vencimentos.
   - **Tela cheia** por um botão da tela (o widget não tem), com uma faixa para sair.
2. Os símbolos são uma lista fixa no código (`frontend/src/utils/tradingview.js`), em dois grupos: **B3** (milho, café,
   soja, dólar e minidólar) e **Pepperstone** (ouro e Brent, e milho, café, soja e dólar para comparação; os três
   agrícolas seguem a bolsa americana, em dólar e na unidade de lá). A lista fica ao lado do gráfico; o widget não deixa
   trocar o símbolo por dentro; um símbolo fora da lista na URL abre o padrão (o milho da B3).
3. Uma tela de **comparação** (`/dados-mercado/tradingview/comparar?par=milho`): o milho, o café, a soja e o dólar na B3
   e na Pepperstone, lado a lado (sem o painel de detalhes, por espaço), um terceiro gráfico com **os dois sobrepostos,
   em %** (a variação de cada um desde o início da janela, sem o ATR) e o que muda entre os dois (bolsa, unidade, série
   contínua). O desenho das duas telas saiu de um protótipo aprovado pelo usuário em 2026-10-16.
4. **Só visualização.** O dado é do TradingView, roda no iframe deles e não chega ao FinMind: não alimenta o motor, a IA,
   o Centro de Decisão nem as carteiras, e não é fonte de dado (a aquisição segue encerrada, sem fonte nova).
   **Indicadores:** só o **ATR(14)** vem ligado, porque é o da Cartilha de Operações (stop e alvos, ADR 0127); no
   TradingView é o de Wilder (RMA), o mesmo cálculo das carteiras, mas sobre a série contínua e o fechamento deles (salta
   nas rolagens). A barra lateral de desenho vem ligada (Fibonacci, linhas, textos, medição), porque a camada técnica da
   Cartilha (SMC: BOS, CHoCH, Order Blocks, FVG, sweep) é leitura e desenho do operador. O FinMind não escolhe outro
   indicador: as médias móveis dos prints do David não têm período definido em nenhum documento (Relatório FEL 1,
   Respostas, Cartilha, relatório do Comitê) e só entram pré-configuradas com os períodos decididos e registrados aqui;
   até lá, quem usa liga o que quiser no próprio widget.
   **Painel de detalhes e "Sinais técnicos" (decisão do usuário, Welerson, em 2026-10-16):** o painel de detalhes do
   widget mostra, além do preço, das faixas, do desempenho, dos sazonais e da curva dos vencimentos, o medidor "Sinais
   técnicos" do TradingView (de "venda forte" a "compra forte", um resumo automático de médias e osciladores deles; no
   ouro, em 2026-10-16, "Viés de baixa"). O widget só liga ou desliga o painel inteiro. O usuário decidiu **manter o
   painel**, como exceção à restrição de não mostrar sinal de compra ou venda (`CLAUDE.md`), só nesta tela: o sinal é do
   TradingView, não é gerado nem escolhido pelo FinMind, não foi validado pelo David nem pelo Comitê e não alimenta o
   motor, a IA, o Centro de Decisão nem as carteiras. A tela diz isso a quem usa, na dica do selo "Dado do TradingView" ("Tudo dentro do
   quadro do gráfico é do TradingView..."). Alternativa considerada: tirar o painel (perderia também a curva dos
   vencimentos, que o FinMind pode fazer depois com o próprio dado da B3).
5. O widget fica isolado em `frontend/src/components/charts/TradingViewWidget.vue`, como os outros gráficos. Não há
   biblioteca nova no `package.json`: é o script oficial do TradingView, carregado só nessa tela.

## Consequências

- Gráfico de candles, indicadores e desenhos sem trabalho de dado, nos contratos que o David acompanha.
- Os desenhos não ficam salvos (salvar pede conta no TradingView), e o gráfico não pode receber as leituras da IA nem o
  stop e os alvos das carteiras (o iframe é de outro domínio).
- Depende de um serviço de fora: se o TradingView mudar ou tirar o widget, a tela para; o resto do FinMind não é
  afetado. O navegador de quem abre a tela fala direto com o TradingView.
- A série contínua é a do TradingView, não a do Profit: perto das rolagens, os candles diferem dos prints do David.
- Um gráfico próprio (candles com o dado do FinMind e as leituras sobre o preço) continua possível, mas depende da
  abertura dos futuros, da regra da série contínua e da escolha dos indicadores; fica para quando houver essa demanda.
