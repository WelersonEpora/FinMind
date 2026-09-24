# Pendente do especialista de mercado (David)

Esta casca do FinMind foi construída sem nenhuma dessas definições.
Nenhum item abaixo foi decidido, presumido ou implementado como
placeholder "de exemplo" — os módulos correspondentes (`backend/src/
collectors`, `backend/src/analytics-engine`, `backend/src/ai`) só têm
contratos vazios até que estas definições existam.

> **Exceção pontual (2026-09-14):** o usuário do projeto autorizou
> explicitamente a primeira integração real de dados, restrita à cotação do
> dólar (USD/BRL) via API SGS do Banco Central — ver
> `docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md`. Isso resolve, só para este
> caso específico, a parte de "ativos" e "mercados e fontes de dados" dos
> itens 1 e 2 abaixo. Nenhum outro ativo, mercado ou fonte foi decidido —
> os itens continuam pendentes do especialista David para qualquer coisa
> além de USD/BRL.
>
> **Exceção pontual (2026-09-18):** o usuário do projeto autorizou
> explicitamente a coleta da taxa Selic — meta definida pelo Copom (série
> SGS 432) e realizada, já anualizada pelo próprio BCB (série SGS 1178) —
> ver `docs/adr/0006-fonte-taxa-selic-bcb-sgs.md`. Mesma lógica da exceção
> acima: resolve só este caso específico. Nenhum outro ativo, mercado ou
> fonte além de USD/BRL e Selic foi decidido.

> **Exceção pontual (2026-09-20):** o usuário do projeto autorizou
> explicitamente a **aquisição de dados** de **ouro** e **milho** listados na
> análise `docs/analise-critica-fel1-milho-ouro.md` (FRED, LBMA Gold PM,
> CFTC COT, USDA Crop Progress; preço de ajuste do CCM na B3 — coletado desde
> 2022-03-21, ~4 anos, com buraco em 2023, ADRs 0009 e 0020) e a criação da
> camada point-in-time — ver
> `docs/adr/0008-camada-observation-point-in-time.md` e
> `docs/adr/0009-fontes-ouro-milho-status.md`. Vale **só para coleta e
> armazenamento**: nenhum sinal, limiar, indicador técnico ou regra de
> compra/venda foi definido (o "juro real 10a" é a leitura direta do DFII10, um
> dado publicado pelo FRED). Café, petróleo e qualquer outro ativo seguem
> pendentes.
>
> **Exceção pontual (2026-09-23):** o usuário do projeto autorizou
> explicitamente a coleta das **expectativas do Focus (BCB)** de **IPCA, Selic e
> câmbio** por ano-calendário, no escopo estrito da linha "Relatório Focus e
> Reservas (BCB)" do FEL 1 (ouro) — ver
> `docs/adr/0022-focus-bcb-expectativas-ipca-selic-cambio.md`. Só aquisição de
> dado: nenhum fator sobre o Focus (surpresa, variação, dispersão) foi definido.
> No mesmo dia, a outra metade da linha, as **reservas internacionais
> brasileiras** (SGS 13621, total diário) — ver
> `docs/adr/0023-reservas-internacionais-bcb.md`. PIB, Top 5, Selic por reunião,
> inflação 12/24 meses e a composição das reservas seguem fora. Também em
> 2026-09-23: a **produção e os estoques semanais de etanol da EIA** (fator do
> milho "Demanda de etanol") — ver `docs/adr/0024-eia-etanol-producao-estoques.md`.
>
> **Exceção pontual (2026-09-24):** o usuário do projeto autorizou a coleta da
> **saúde da vegetação por cultura da NOAA STAR** (VHI, VCI e TCI semanais,
> medidos só sobre a área do milho, por país e estado) para o fator do milho
> "Clima e safra" — ver `docs/adr/0025-noaa-star-saude-vegetacao-por-cultura.md`.
> As fontes de clima do FEL 1 (NASA POWER, INMET, CPTEC/INPE, ERA5) foram
> reconhecidas como inadequadas (dado de tempo, não o efeito na lavoura). O
> usuário pediu o **café pela mesma fonte** como próximo passo. Só aquisição de
> dado: como o índice entra no preço (regiões, pesos, fases do ciclo, limiar) é
> do Comitê.
>
> **Em aberto para o Comitê (2026-09-23):** preço futuro do milho — seguir só com
> o CCM (grátis, ~4 anos de histórico) ou contratar o ZC da CME (pago, 16+ anos)?
> Pergunta 2 de `STATUS_DO_PROJETO.md` §4, com o detalhe para a reunião logo
> abaixo da tabela.

1. **Ativos** — quais ativos serão analisados (ações, moedas,
   commodities, criptoativos, renda fixa...). *(USD/BRL e Selic resolvidos
   como exceção pontual, ver notas acima — demais ativos seguem
   pendentes.)*
2. **Mercados e fontes de dados** — quais mercados (B3, NYSE, forex...)
   e quais fontes (APIs pagas/gratuitas, boletins, scraping) serão
   usados. *(Câmbio USD/BRL e Selic via API SGS do Banco Central
   resolvidos como exceção pontual, ver notas acima — demais
   mercados/fontes seguem pendentes.)*
3. **Dados a coletar** — quais informações exatas por fonte (preço,
   volume, indicadores macro, notícias, dados fundamentalistas...).
4. **Regras e cálculos** — o que o motor analítico deve executar:
   fórmulas, indicadores técnicos, critérios de comparação.
5. **Formato de apresentação dos resultados** — como analistas/usuários
   vão consumir a saída (dashboard, relatório, alerta...).
6. **Avaliação da saída da IA** — critérios de qualidade, quem valida,
   com que frequência.
7. **Condições de sinal operacional** — o que, tecnicamente, qualifica
   uma situação como sinal (nenhum sinal é gerado hoje).
8. **Execução automática de operações** — se vai existir, com quais
   validações, limites e aprovações. Não implementado nem desenhado
   em detalhe nesta fase; a arquitetura só garante, desde já, que
   geração de análise e execução de ordens são camadas fisicamente
   separadas (ver `docs/architecture.md`).
