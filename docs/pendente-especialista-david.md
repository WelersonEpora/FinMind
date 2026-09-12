# Pendente do especialista de mercado (David)

Esta casca do FinMind foi construída sem nenhuma dessas definições.
Nenhum item abaixo foi decidido, presumido ou implementado como
placeholder "de exemplo" — os módulos correspondentes (`backend/src/
collectors`, `backend/src/analytics-engine`, `backend/src/ai`) só têm
contratos vazios até que estas definições existam.

1. **Ativos** — quais ativos serão analisados (ações, moedas,
   commodities, criptoativos, renda fixa...).
2. **Mercados e fontes de dados** — quais mercados (B3, NYSE, forex...)
   e quais fontes (APIs pagas/gratuitas, boletins, scraping) serão
   usados.
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
