# 0048 — Centro de Decisão: a tela inicial no lugar do Dashboard

**Status:** aceita (2026-10-02).

## Contexto

O Dashboard (`/`) era uma tela provisória: o cartão da cotação do dólar e quatro cartões "aguardando definição". Ao
terminar a tela Eventos (ADR 0047), o usuário (Welerson) notou que os dois cards do topo dela (o nível e o resumo do
dia do ouro e do petróleo) pertencem à tela inicial, e propôs, em 2026-10-02, tomar como referência a tela "Centro de
Decisão" do AgroMind, que já reúne o que se quer agora: uma pergunta e uma data no topo, o preço do ativo com o
histórico recente e uma seção "O que está movimentando o mercado" com os eventos.

Na conversa, o usuário aprovou:

- o nome **Centro de Decisão** e a substituição do Dashboard;
- a lista de séries de preço por ativo (abaixo), com **troca de série no card**, como a troca de fonte do AgroMind;
- mostrar nos futuros o **vencimento mais próximo, sem emendar contratos**;
- o **mini-gráfico com o ECharts** já usado no FinMind, e não o SVG desenhado à mão do AgroMind (o card do AgroMind,
  de 2026-07-27, é anterior à entrada do ECharts lá, em 2026-08-10, e nunca foi atualizado).

**Limite (`CLAUDE.md`):** a tela do AgroMind mostra um sinal ("SINAL DE ALTA"), uma leitura por prazo
(favorável/desfavorável), os "Principais Fatores" e uma síntese, em resposta à pergunta "Comprar agora ou esperar?".
Tudo isso é sinal ou recomendação, e as regras são do David e do Comitê. Nada disso é implementado aqui: o espaço fica
reservado e a pergunta vira um seletor de ativo neutro.

## Decisão

1. **Rota `/` (nome `centro-decisao`)**, `CentroDecisaoView.vue`, item "Centro de Decisão" no menu. Sai o Dashboard
   (`DashboardView.vue`, `GET /api/v1/dashboard` e seu service, controller e rota).
2. **Um endpoint**, `GET /api/v1/centro-decisao?ativo=&data=&serie=` (`centro-decisao.service.js`), resposta
   `{ centroDecisao }`. Sem parâmetros: o 1º ativo, hoje (dia de São Paulo) e a série padrão. Data futura é recusada.
   O ativo, a data e a série ficam na URL da tela: recarregar ou compartilhar o link abre a mesma leitura.
3. **Ativos e séries de preço** (lista fixa no service; a 1ª é o padrão; nenhuma regra escolhe a "melhor"):

   | Ativo | Séries | Por quê |
   |---|---|---|
   | Ouro | Futuro GLD da B3 · LBMA Gold Price PM | O GLD é o único preço diário coletado desde 2026-10-01 (ADR 0044); a LBMA cobre as datas antes de 2025-07-21 e vai até 2026-09-30 |
   | Petróleo | WTI à vista (EIA) · Brent à vista (EIA) | Preço à vista, sem vencimento; o WTI casa com o COT do WTI (ADR 0040) |
   | Milho | Indicador CEPEA/ESALQ · Futuro CCM da B3 | O indicador é o preço físico de referência e a base de liquidação do CCM (ADR 0021) |
   | Café | Futuro ICF da B3 · FMI mensal (arábica) | O ICF é o único preço diário do café (ADR 0028); o FMI, mensal, cobre ciclos longos (ADR 0045) |

   O critério foi preço à vista diário quando existe, e futuro só onde não existe. É uma escolha de **exibição**, não
   de análise: quando o David definir o preço de referência de cada ativo (o status ainda tem em aberto se o GLD faz
   esse papel no ouro), muda só a lista.
4. **Point-in-time:** o preço é lido por `buscarAsOf` (ADR 0008), como era conhecido no fim do dia escolhido em
   Brasília (hoje: o instante atual), sem o modo estrito: vale o `published_at` estimado por regra, a visão "o que o
   mercado já podia saber". Uma série que parou antes da data aparece com o aviso (último dado e quantos dias antes,
   pela `toleranciaDias` do catálogo); uma série encerrada (`encerradaEm`) diz isso; sem dado até a data, o card diz
   "sem dado" e sugere trocar a série.
5. **Futuros, sem emendar contratos:** o card usa o vencimento mais próximo que negociou no último pregão até a data
   (os vencimentos de meses anteriores ao da data nem entram na consulta) e mostra o ticker. O gráfico e as variações
   usam só o histórico **desse** contrato; numa troca de vencimento, o card passa ao contrato seguinte, sem salto
   artificial. Emendar vencimentos numa série contínua é cálculo, do David.
6. **Variações:** contra o ponto anterior (1 dia) e contra o último ponto até 7, 30 e 90 dias corridos antes. Numa série
   mensal, 1 e 7 dias não existem e somem do card; num contrato com menos de 90 dias de histórico, a de 90 dias também.
   É aritmética da própria série, sem limiar nem leitura: nenhuma cor ou seta vira sinal.
7. **Mini-gráfico:** o `LineChart.vue` existente, com a opção `compacto` (e as casas decimais da série) em
   `echarts-option-builder.js`. Janela: 90 dias numa série diária, 2 anos numa mensal.
8. **"O que está movimentando o mercado":** a leitura de geopolítica da data (nível e resumo do ativo, que saem do topo
   da tela Eventos) e os eventos aceitos dos 7 dias até a data (até 12; o resto, pelo link para Eventos). Cada card
   abre o detalhe do evento num modal. O detalhe é o mesmo componente da expansão da linha na tela Eventos
   (`components/eventos/EventoDetalhe.vue`, com `NivelBadge.vue` e `PressaoIndicador.vue`). Milho e café não têm
   leitura de geopolítica (ADR 0047): a seção diz isso. Data sem leitura: "sem leitura", nunca a de outro dia.
9. **"Análise do FinMind":** o espaço do Insight do AgroMind, só com o aviso de que as regras, os cálculos e os
   critérios de sinal são do especialista e do Comitê, e o link para o status.

## Alternativas consideradas

- **Copiar o código do AgroMind:** a tela de lá soma ~4.500 linhas entre o composable (`useDashboardData.js`, 1.057),
  o `DecisionSignal.vue` (1.436) e o `PrecoDestaqueCard.vue` (900), com outra casca (`DashboardShell`) e um Motor de
  Consolidação que escolhe a fonte. Foi usado só o desenho, montado com o que o FinMind já tem.
- **Escolher a série por confiabilidade (o Motor de Consolidação do AgroMind):** é critério de análise. A lista fixa
  com troca manual deixa a escolha com quem olha.
- **Troca de série só no dia de hoje**, como no AgroMind (`permiteTrocaFonte = !dataSelecionada`): desnecessário aqui,
  porque toda série é lida pelo mesmo `asOf`. A troca vale em qualquer data, e é o que permite ver a LBMA nas datas sem GLD.
- **Emendar os vencimentos (série contínua):** daria variações de 90 dias sempre, mas é um cálculo com várias regras
  possíveis (por volume, por data, com ou sem ajuste), cada uma com outro histórico. Fica com o David.
- **Mostrar a leitura de geopolítica dos dois ativos sempre:** a tela é de um ativo por vez; a do outro aparece ao
  trocar o ativo, e a lista completa continua em Eventos.

## Consequências

- A tela inicial mostra dado real e a data a que ele se refere, nunca um valor "ao vivo" (`periodicidade` e
  `tempoReal: false` na resposta).
- A tela Eventos perde os cards do topo e passa a usar o
  `EventoDetalhe.vue` na expansão da linha.
- O cartão do dólar do Dashboard sai; a série continua no card "Dólar (USD/BRL)" de Observáveis.
- Quando o Motor existir, a análise entra no espaço reservado, com a mesma data e o mesmo ativo, sem mudar o resto.
- A leitura de geopolítica só existe de 2026-10-02 em diante: nas datas anteriores a seção diz "sem leitura".
