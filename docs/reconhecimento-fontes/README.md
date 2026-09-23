# Índice de reconhecimento de fontes

Uma linha por fonte. Processo, checklist e definição dos níveis 0–5:
`docs/processo-reconhecimento-fontes.md`. A evidência (chamadas reais, números)
vive nos ADRs — este índice só aponta.

**Última atualização: 2026-09-23** (B3 CCM: histórico pelo Boletim Diário, ADR 0020; antes: registro retroativo das 7 fontes já implementadas; PSD reconhecida no nível 1; WASDE, Conab e IMEA implementados; IMEA - balanço de oferta e demanda reabre o que o ADR 0018 tinha descartado).

## Fontes implementadas

| Fonte | Nível | Incertezas em aberto | Evidência |
|---|---|---|---|
| BCB SGS — dólar (série 1) | 5 | Histórico desde 01/07/1994 carregado em dev e produção (2026-09-21). Limite da API: 10 anos por pedido (406 acima). Rate limit não verificado | ADR 0001 |
| BCB SGS — Selic (432 meta, 1178 realizada) | 5 | Idem (meta desde 05/03/1999, realizada desde 04/07/1994). A meta traz datas futuras, até a próxima reunião do Copom (o BCB publica o alvo vigente); a janela de 2014–2024 da meta falhou uma vez com HTML no lugar de JSON e passou na repetição | ADR 0006 |
| FRED — DGS10, T10YIE, DFII10, DTWEXBGS | 5 | Licença lida em 2026-09-21: 3 de 4 séries são domínio público com citação; `T10YIE` não confirmada; **adiada** (sem distribuição prevista). Coleta via API com chave, CSV de reserva; chave `FRED_API_KEY` já está na VM. `published_at` estimado; vintage real só provado por teste (ALFRED cobre só de ~2015–2018 em diante). Reserva CSV `fredgraph.csv` não é a API documentada | ADRs 0009, 0011, 0012 · [fred.md](fred.md) |
| LBMA — ouro PM (USD/oz) | 5 | **Exige licença da IBA** para obter/usar/redistribuir o histórico; **adiada** (sem distribuição prevista, uso interno). Feed JSON não documentado. `published_at` estimado | ADR 0009 · [lbma.md](lbma.md) |
| CFTC COT — ouro e milho | 5 | `published_at` real só desde 2022-08; antes, estimado pelo cronograma. Licença: governo dos EUA, não verificado juridicamente | ADR 0009 |
| USDA NASS — Crop Progress do milho | 5 | Histórico 1980+ já carregado em dev e no servidor (2026-09-21, informado pelo usuário). `published_at` estimado e **não validado para 1980–2005**. Exige chave gratuita | ADR 0009 |
| Comex Stat (MDIC) — exportação de milho | 5 | **Cobertura só a partir de 2005** (o NCM anterior muda e não foi mapeado; pode ser estendido). API pública sem chave; rate limit rígido (429, backoff crescente); revisões da fonte não confirmadas; `published_at` estimado; licença não explícita (uso interno). Carga de 2005 a 2026-08 feita em dev e produção (2026-09-21) | ADR 0013 |
| USDA WASDE — balanço do milho, arquivo de edições (ESMIS) | 5 | **Vintage real por edição mensal**, com `published_at` real (data do release, na listagem em HTML). **Só de 2011 em diante** (antes só PDF/TXT, sem leitor). Só EUA e ~20 regiões; EUA em milhões de bushels. Raspa o HTML (sem API confirmada); republicação do mesmo dia mantém a 1ª versão. **Não confirmados:** API do ESMIS, licença, limite de uso. `curl` local falha por certificado nos hosts `usda.gov` (o `fetch` do Node funciona). Carga de 2011 a 2026-09 feita em dev e no servidor (2026-09-21, informado pelo usuário) | ADR 0015 |
| Conab — Boletim da Safra de Grãos (milho: 1ª/2ª/3ª safra por UF e balanço) | 5 (limitado) | **Vintage real por levantamento mensal**, com `published_at` real (data e hora da página do levantamento). **Só de fev/2025 em diante** (o que o índice da Conab mantém: 15 planilhas, com lacunas). Sem API nem dicionário de dados (quebra se o layout mudar; unidade e mês conferidos). O `published_at` das safras antigas é um limite superior (conservador). A planilha é a versão atual, que pode ter correção posterior à publicação (`metadata.paginaAtualizadaEm`). Licença não verificada. Carga de 2025-02 a 2026-09 feita em dev e no servidor (2026-09-21, informado pelo usuário; a Conab é acessível de lá) | ADR 0017 (reconhecimento: ADR 0016) |
| B3 — futuros CCM por vencimento | 5 (limitado) | Coleta diária: janela de **~15 meses** do Up2Data (CSV). Histórico anterior pelo **Boletim Diário (BDI) em PDF**, de **2022-03-21 a 2025-12-11**, com contratos em aberto e abertura (backfill único, extração por coordenada; 745 boletins, 0 divergências com o CSV) — **buraco de ~9 meses em 2023** (boletins publicados sem o capítulo de derivativos) e, depois de 2025-12-11, sem contratos em aberto por vencimento. 10+ anos exigem fonte paga (decisão de orçamento). Nenhum dos dois arquivos tem documentação oficial | ADRs 0009, 0020 |
| IMEA — milho de MT: área/produção/produtividade por safra e custo de produção | 4 (sem backfill possível) | **Sem vintage histórico**: a API de safra só guarda o valor atual de cada safra e o catálogo de custo só a versão atual de cada planilha — o vintage começa a partir de agora, sem backfill a rodar (diferente do WASDE/Conab). 3 indicadores identificados por casamento de valor contra o relatório de O&D (IDs sem nome na API). Intenção de plantio e andamento de safra existem só em PDF, fora do escopo (mesmo limite do WASDE); o balanço de oferta e demanda em PDF foi implementado à parte, ver linha abaixo. Licença não investigada | ADR 0018 |
| IMEA — milho de MT: balanço de oferta e demanda (PDF mensal) | 5 | **Vintage real por edição mensal**, com `published_at` real (data do catálogo de arquivos). Catálogo com edições de 2014-04-14 em diante (77 reais, depois de descartar 1 PDF de metodologia e 1 republicação no mesmo dia). Extração por COORDENADA (x/y de cada texto, `pdfjs-dist`), diferente do WASDE (texto corrido desalinhava a tabela): validada nas 77 edições reais, 0 inválidas. Sem API nem dicionário de dados (quebra se o layout mudar). Só Mato Grosso (sem quebra regional); Produção não é reconciliada com o card de safra. Licença não investigada. Carga de 2014 a 2026-08 feita em dev (2026-09-22). **Achado real**: repetir o backfill inteiro depois de já ter terminado em sucesso pode logar falhas espúrias, sem corromper dado — mecanismo de deduplicação compartilhado com WASDE/Conab (não corrigido, documentado como limitação conhecida) | ADR 0019 |

## Reconhecidas (nível 1 — sem coletor, sem autorização)

Reconhecimento feito com chamada real; **implementar depende da decisão do David** ou de autorização
explícita registrada em ADR (`CLAUDE.md`).

| Fonte | Nível | Incertezas em aberto | Evidência |
|---|---|---|---|
| Conab — séries históricas (XLS) e preços (TXT) do milho | 1 | (B) **Séries históricas** de 1ª/2ª/3ª/total por UF, **desde 1976/77**, sem vintage (foto atual): o histórico longo que o boletim mensal não tem. (C) **Preços**, semanais/mensais por UF e município, atualizados diariamente, mas só ~12 meses; o histórico longo de preço segue bloqueado (reCAPTCHA / Pentaho, segundo o AgroMind). **Sem coletor por decisão do usuário** (2026-09-21): fica para quando houver uma opção. Licença não verificada (preços: CC "sem derivações"). `curl` do Git Bash falha em `barramento.conab.gov.br` (o `fetch` do Node funciona) | ADR 0016 |
| USDA FAS — PSD Online (milho) | 1 | Exige chave própria `FAS_API_KEY` (a do NASS não serve). Safras 1960–2026, 125 países + mundo, 15 atributos. **A API só expõe a edição mais recente: sem vintage histórico** (parâmetros de release ignorados); `published_at` só com mês, da última revisão do par país × safra (confere com o WASDE em 3 de 4 testes; sem dia). Janela do rate limit (1.000) e licença não confirmadas. Números conferidos contra o WASDE de set/2026 (batem). O vintage vem do WASDE (linha acima) | ADR 0014 |

## Candidatas (nível 0 — sem coletor, sem autorização)

Todas listadas no relatório do David (FEL 1). Nenhuma tem coletor nem
reconhecimento no FinMind; a lista de trabalho está em `STATUS_DO_PROJETO.md` §3.
Entrar em implementação exige a decisão do David ou autorização explícita
registrada em ADR (`CLAUDE.md`). "AgroMind" indica o nível que a fonte tem lá.

| Fonte | Observação |
|---|---|
| CEPEA | Bloqueada para automação (Cloudflare) — pergunta 7 do David |
| FAO/AMIS | FAOSTAT API; nunca reconhecida |
| BCB Focus | Expectativas de mercado. AgroMind: nível 3 (Selic) |
| Clima — NOAA, INMET, NASA POWER, CPTEC/INPE, ECMWF ERA5 | Acrescentadas na revisão do relatório. AgroMind: NOAA nível 0 |
| Abimilho, CNA | Estatísticas do setor, sem API |
| CPI (BLS/FRED) | Candidata nossa (não do relatório) a primeira série revisável de verdade (ADR 0011) |
| WGC (ouro) | Só citada no relatório do David |
