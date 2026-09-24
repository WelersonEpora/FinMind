# BCB Focus — reconhecimento (nível 1) e implementação (nível 5)

**Data:** 2026-09-23. **Situação:** implementada no escopo estrito do FEL 1 (IPCA, Selic e câmbio por
ano-calendário), **autorizada pelo usuário em 2026-09-23**. Decisão e resultado: ADR 0022.

O relatório FEL 1 descreve "Relatório Focus e Reservas (BCB): ouro; semanal/mensal; API; Focus impacta Selic,
IPCA e BRL; calendário: Focus às segundas". Esta página trata só do **Focus**. As Reservas internacionais estão em
[bcb-reservas.md](bcb-reservas.md) (ADR 0023).

| # | Pergunta | Resposta (evidência de 2026-09-23) |
|---|---|---|
| 1 | API oficial? | Sim: OData do BCB (Olinda), `olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata`, com 13 endpoints. O usado é o `ExpectativasMercadoAnuais` |
| 2 | Pública ou autenticada? | Pública: todas as chamadas responderam 200 sem token |
| 3 | Cadastro ou chave? | Não |
| 4 | Formato | JSON (OData), com `$filter`, `$select`, `$orderby` e `$top`. Registro: `Indicador`, `IndicadorDetalhe`, `Data` (pesquisa), `DataReferencia` (ano-alvo), `Media`, `Mediana`, `DesvioPadrao`, `Minimo`, `Maximo`, `numeroRespondentes`, `baseCalculo` |
| 5 | Documentação | Portal de Dados Abertos (`dadosabertos.bcb.gov.br/dataset/expectativas-mercado`: descrição, Swagger, documentação). O `$metadata` não descreve `baseCalculo`; a legenda do PDF do boletim, sim: **0 = respondentes dos últimos 30 dias, 1 = últimos 5 dias úteis** |
| 6 | Histórico | IPCA, Câmbio e Selic anuais **desde 2000-01-03**, com 6.702 dias de pesquisa cada. A base 1 existe só desde 2014-01-02. A série inteira de um indicador (~32 mil linhas) cabe numa requisição (~2 a 3 s) |
| 7 | Revisa? | **Não medido como revisão, mas a API é igual ao PDF publicado** ao centavo em 2005-01-07, 2011-04-20, 2015-01-02, 2026-04-02, 2026-09-11 e 2026-09-18 (IPCA, Selic e câmbio, ano corrente e seguinte) |
| 8 | Publicação | A estatística é calculada todo dia útil, mas é "publicada todo primeiro dia útil da semana" (metadados do conjunto). Na quarta, 23/09, a última pesquisa na API era a de sexta, 18/09 (`R20260918.pdf`). A fonte não informa o horário. Dia sem pesquisa = dia não útil (07/09/2026 e o Carnaval de 16–17/02/2026 não têm pesquisa) |
| 9 | Limite de requisições | Nenhum observado (dezenas de chamadas nesta sessão, até ~32 mil linhas cada) |
| 10 | Licença | **ODbL** (Open Data Commons Open Database License), conforme o Portal de Dados Abertos. Uso interno |
| 11 | Riscos | (a) Nomes de endpoint irregulares: `ExpectativaMercadoMensais` é singular (o AgroMind recebeu 400 por isso), mas o endpoint usado aqui é o `ExpectativasMercadoAnuais`. (b) "Câmbio" e "Selic" anuais são **fim de ano**; a média do período, que o PDF de 2015 trazia, não existe na API. (c) Pesquisa isolada num sábado (2000-07-08, só no IPCA). (d) O endpoint de microdados por instituição foi **desativado** pelo BCB por confidencialidade. (e) O `curl` do Git Bash não conecta; o `fetch` do Node funciona |

## Recomendação e o que foi feito

**Adotar, no escopo do FEL 1.** É uma fonte institucional, pública, sem chave, com 26 anos de histórico e igual
ao boletim. Implementada: coletor `bcb-focus` e backfill `npm run backfill:bcb-focus`, com uma observação por
boletim semanal, `published_at` estimado e separado da data da pesquisa (ADR 0022).

**Não coletado:** PIB e os demais 25 indicadores do endpoint anual, expectativas mensais e trimestrais, Selic por
reunião do Copom, inflação 12/24 meses, Top 5, média, desvio, mínimo e máximo e base de 5 dias úteis. As Reservas
internacionais foram feitas à parte (ADR 0023).

## Fontes

- Portal de Dados Abertos do BCB — Expectativas de Mercado: https://dadosabertos.bcb.gov.br/dataset/expectativas-mercado
- Focus — Relatório de Mercado (PDF semanal): `https://www.bcb.gov.br/content/focus/focus/R<AAAAMMDD>.pdf`
