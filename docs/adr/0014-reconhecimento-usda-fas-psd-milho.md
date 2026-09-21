# 0014 — Reconhecimento do USDA FAS PSD Online (milho): nível 1, sem coletor

## Contexto

O relatório FEL 1 do David lista o balanço de oferta e demanda do milho (estoque final, estoque/uso) como
observável **M3** ("essencial"), com fonte USDA FAS PSD Online / WASDE (Fase 1 do plano, §9.2: "PSD tem
API, WASDE é PDF mensal"). O NASS (Crop Progress) já é coletado; o balanço não. No AgroMind a fonte está no
nível 0 (nunca testada), então não havia endpoint nem armadilha a reaproveitar.

Este ADR **só reconhece a fonte** (nível 0 → 1, `docs/processo-reconhecimento-fontes.md`). **Nenhum coletor é
escrito e nada é desbloqueado**: a PSD continua "fora do escopo" (`STATUS_DO_PROJETO.md` §5) até a decisão do
David ou autorização explícita registrada em novo ADR (`CLAUDE.md`).

## Evidência (chamadas reais, 2026-09-21)

Base: `https://api.fas.usda.gov/api/psd`, header `X-Api-Key`. Cerca de 25 requisições no total.

| Pergunta | Resposta | Evidência |
|---|---|---|
| 1. API oficial? | Sim, JSON, mantida pelo FAS (gerenciador api.data.gov / api-umbrella) | `GET /commodities` → 200 |
| 2–3. Autenticação / chave | **Exige chave** do api.data.gov (gratuita). **A chave do NASS não serve** (403 `API_KEY_INVALID`); sem chave: 403 `API_KEY_MISSING`. Variável `FAS_API_KEY` | testes com as duas chaves |
| 4. Formato | JSON. Uma linha por país × safra × atributo: `{commodityCode, countryCode, marketYear, calendarYear, month, attributeId, unitId, value}` | amostras |
| 5. Documentação | Portal `apps.fas.usda.gov/opendatawebV2` (não consegui ler o conteúdo, só um aviso de manutenção). Sem `swagger.json` acessível nos caminhos testados. **A semântica de `calendarYear`/`month` não está documentada** (ver 8) | 404 nos caminhos testados |
| 6. Histórico | Safras **1960 a 2026**. Milho = commodity `0440000` (a única "Corn" das 63). 125 países na safra 2024 + agregado mundial (`/world/year/{ano}`, país `00`). 15 atributos no milho | `dataReleaseDates`, `BR` 1960/1980/2005/2026 |
| 7. Revisa? | **Sim, mas a API só expõe a edição mais recente.** Cada par país × safra tem 1 linha de release; na safra 2024 os marcadores vão de 2025-04 a 2026-09 (o dado foi revisado ao longo de 14 meses). Os parâmetros `releaseYear`/`releaseMonth`/`month`/`calendarYear` são **ignorados** (mesma resposta) e o caminho `/release/{ano}/{mês}` dá 404. **Não há vintage histórico recuperável** | sondagem de parâmetros |
| 8. `published_at` | Só **mês** (`calendarYear` + `month`), sem dia, sem fuso, e **é a data da última revisão do par país × safra**, não da primeira publicação. Interpretação **inferida** (a fonte não a documenta). Nenhuma linha é anterior a 2006-07 (todo o histórico antigo aparece "revisado" em 2006-07 ou depois) | `dataReleaseDates`: 7.586 linhas = 7.586 pares únicos, 188 meses distintos, 2006-07 a 2026-09 |
| 9. Limite | Header `x-ratelimit-limit: 1000`; `remaining` desceu 998 → 983 em ~17 chamadas. **Janela não confirmada** (o padrão do api.data.gov costuma ser por hora, não verificado) | headers |
| 10. Licença | **Não verificada.** Dado do governo dos EUA; os termos do api.data.gov e do FAS não foram lidos. Uso atual: interno | — |
| 11. Riscos | Ver "Riscos" abaixo | — |

Atributos do milho (`attributeId`, unidade): Area Harvested (4, 1000 ha), Beginning Stocks (20), Production (28),
Imports (57), TY Imports (81), TY Imp. from U.S. (84), Total Supply (86), Exports (88), TY Exports (113),
Domestic Consumption (125), Feed Dom. Consumption (130), FSI Consumption (192), Ending Stocks (176),
Total Distribution (178) — todos em 1000 MT — e Yield (184, MT/ha).

**Conferência de sanidade:** EUA safra 2024 → produção 378.268 mil t (14,89 bilhões de bushels) e estoque final
39.404 mil t; mundo 2024 → produção 1.235.033 mil t, estoque final 295.701 mil t. Os números são compatíveis com
o que se conhece do WASDE e **foram conferidos contra o XLS do WASDE de set/2026** (ver "Complemento" abaixo).

**Custo de uma carga completa** (medido, não executado): `country/all/year/{ano}` devolve ~275 KB e 1.875 linhas
por safra (2024) — 67 chamadas para 1960–2026, bem abaixo do limite de 1.000.

## Complemento: o arquivo de edições do WASDE (ESMIS) traz o vintage que a PSD não tem

Como a PSD só dá a edição atual, procurou-se outra rota para o vintage. O **ESMIS**
(`esmis.nal.usda.gov`, ex-Cornell) guarda **cada edição mensal do WASDE desde dez/1973**, em PDF, TXT, XLS e XML
(`/sites/default/release-files/[ID]/wasde[MMAA].[formato]`). O `curl` local falha nos hosts `usda.gov` por
certificado (`self signed certificate in certificate chain`, problema do ambiente, verificação não desligada),
então o usuário baixou 6 edições à mão para `docs/Docs_Base/ESMIS_WASDE/` (leitura com `xlrd`, fora do projeto):
TXT jan/2010, XLS jan/2011, jan/2012, jan/2015, mai/2025 (`wasde0525v2`) e set/2026.

| Achado | Evidência |
|---|---|
| **Layout estável de 2011 a 2026**: aba `Page 12` = milho dos EUA, `Page 22`/`23` = milho do mundo, mais `WASDE Text` | 5 XLS com as mesmas 31 abas |
| **O vintage existe de fato.** Estoque final dos EUA 2010/11: **745** (projeção de jan/2011) → **1.128** (jan/2012). Safra 2024/25: produção 14.867 → **14.892** e estoque final 1.415 → **1.551** (mai/2025 → set/2026) | tabelas extraídas |
| Cada edição traz **duas colunas para a safra em projeção** (a do mês anterior e a atual) | `Page 12` |
| **A PSD atual = o WASDE final.** EUA 2024/25: produção 378,27 e estoque final 39,40 Mt; mundo: 1.235,03 e 295,70 Mt — iguais aos valores da PSD (378.268, 39.404, 1.235.033, 295.701 mil t) | conferência cruzada. Isto **fecha a conferência de sanidade** que ficara aberta acima |
| Milho **dos EUA em milhões de bushels** (`Page 12`); **mundo em milhões de t** (`Page 22`); PSD em mil t | unidades diferentes: exige conversão declarada |
| **Menos países que a PSD:** ~14 países/grupos (Argentina, Brasil, Rússia, África do Sul, Ucrânia, Egito, UE, Japão, México, Sudeste Asiático, Coreia do Sul, Canadá, China + agregados), contra 125 | `Page 22` |
| O **TXT de 2010 tem layout diferente** ("Ending stocks, total", números com vírgula de milhar): outro parser | `wasde-01-12-2010.txt` |

**Datas de release:** dentro do XLS só há o **mês** ("January 2011") e o número da edição ("WASDE - 490"); não há
dia. Nos arquivos de 2010–2015 baixados o nome carrega `MM-DD-YYYY` (`01-12-2011` = 12/jan/2011), nos recentes só
`MMAA`. O dia real viria do calendário público do USDA ou da listagem do ESMIS (**não confirmados**).

**Não confirmado:** a API do ESMIS (a página `/api-documentation` veio vazia), o CSV consolidado "Historical WASDE
Report Data" (2010–2025; a página deu 403), o XML, a existência de XLS antes de 2011 (o usuário relatou só PDF e
TXT em 2010) e a licença. O sufixo `v2` em `wasde0525v2.xls` sugere que **uma edição pode ser republicada com
correção**: um coletor teria de tratar isso.

## Recomendação (a decidir com o David — **não é decisão tomada**)

Duas camadas complementares, **não concorrentes**:

1. **PSD** = histórico profundo e largo (1960+, 125 países), edição atual, `published_at` estimado por mês.
2. **WASDE (XLS do ESMIS)** = **camada de vintage real** para EUA e principais países: cada edição vira um
   conjunto de linhas com `published_at` = data da edição. Cobre de 2011 em diante com um só parser de XLS; antes
   disso (TXT/PDF) exige outro parser, de custo maior e a decidir. O **PDF do WASDE** continua descartado como fonte
   numérica (ADR 0001); só interessa como texto para o experimento de IA (ADR 0010).

Isto atenua a **pergunta 5 do David** (backtest com dado revisado e viés declarado, ou acumular vintage): para o
milho dos EUA e principais países passa a existir vintage histórico real a partir de 2011, sem esperar meses de
coleta. Para os demais países da PSD, o vintage só se acumula daqui para a frente.

Se a PSD for autorizada, o modelo natural segue o ADR 0008: série em `observation` com chave natural
(país, safra, atributo), coleta periódica relendo a safra corrente e a anterior (2–3 chamadas), e **cada
mudança de valor vira uma linha nova** (append-only). Consequências que precisam ser aceitas de antemão:

- **Só pela PSD, o vintage só passa a existir a partir da primeira coleta.** Para o passado só temos a edição
  mais recente; o `published_at` do histórico seria o marcador `month` da fonte (estimado, sem dia), e `asOf()`
  antes dele devolve **nada**, nunca o valor antigo. Isso é honesto, mas deixa lacunas num backtest — é a
  **pergunta 5 do David**. O arquivo do WASDE (acima) cobre essa lacuna para EUA e principais países.
- **A cobertura de países é ampla (125).** Recomenda-se decidir com o David quais entram (EUA, Brasil, mundo e
  talvez Argentina, Ucrânia e China) antes de coletar tudo.

## Riscos e incertezas declaradas

- Semântica de `month`/`calendarYear` inferida, não documentada; sem dia de publicação.
- Vintage histórico inexistente na API (só edição atual); o antigo `apps.fas.usda.gov/OpenData/api/psd` **não foi
  testado com chave válida** (só com a chave errada, "Bad API Key"), então não sei se ele expõe algo a mais.
- Janela do rate limit e licença não confirmadas.
- O portal avisou de manutenção programada do FAS: pode haver indisponibilidade; a coleta precisa tolerar isso
  (o pipeline já trata falha de fonte como execução `failed`, ADR 0002).
- Atributos "TY" (trade year) usam ano comercial diferente do ano-safra: precisam de tratamento na modelagem.

## Consequências

- Nível **1** para a PSD (milho) e para o WASDE via ESMIS (parcial: 6 edições reais lidas; API, CSV consolidado e
  XML não confirmados). Linhas registradas em `docs/reconhecimento-fontes/README.md`.
- Os 6 arquivos baixados ficam em `docs/Docs_Base/ESMIS_WASDE/` (ainda não versionados; decidir se entram no git).
- `FAS_API_KEY` adicionada ao `.env`/`.env.example` (nada a lê ainda). Se virar coletor, a chave também vai para
  o `.env` da VM.
- Sem coletor, migration, catálogo de observáveis ou mudança de tela.
