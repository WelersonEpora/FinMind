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
