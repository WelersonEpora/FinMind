# Análise crítica — Relatório FEL 1 (David) e a proposta Milho + Ouro

**Data:** 2026-09-20
**Status:** subsídio técnico para validação com David e o Comitê Gestor. **Não é
deliberação, não é ADR, não decide nada.**
**Base:** `docs/Docs_David/Relatório FEL 1 Commodities - v1.1 Revisado.pdf`
(33 páginas, seções 1–14) + `controle_fatores.xlsx` (34 fatores, 22 relatórios),
lidos integralmente; arquitetura atual do FinMind; evidência empírica do
AgroMind (`docs/reconhecimento-fontes/`).

> **Restrição respeitada:** este documento **não propõe nenhuma estratégia,
> sinal, limiar, indicador técnico ou regra de compra/venda.** Os observáveis
> abaixo são o mapeamento dos fatores que o **próprio relatório do David já
> elegeu** (§7.2 e planilha) para séries de dados concretas e coletáveis. Toda
> regra que *interprete* esses dados continua pendente do especialista.

---

## Resumo executivo (leia só isto se tiver 2 minutos)

1. **Milho + Ouro faz sentido como recorte de MVP — mas a justificativa de
   vocês está parcialmente errada.** Café não é "redundante com milho": em
   engenharia de dados é o *mais difícil* dos quatro. E Ouro não prova
   generalização de aquisição — é o *mais fácil* dos quatro (o próprio
   relatório diz isso, §10). O recorte está certo; o argumento precisa ser
   trocado antes de ir ao Comitê, ou será derrubado.
2. **O gargalo real não é escolher commodity — é preço.** Não existe, no
   núcleo gratuito do relatório, uma série OHLCV de futuros utilizável para
   backtest. O relatório admite isso (§6.5.2, lacuna incluída só na v1.1) e
   veda Yahoo/Stooq para decisão. **Consequência: o MVP não pode prometer
   backtest.** Pode prometer observáveis + contexto.
3. **O modelo de dados atual do FinMind é incompatível com point-in-time.**
   `market_quote` faz upsert por chave natural e *sobrescreve* o valor quando
   ele muda (ADR 0003). Isso serve para PTAX/Selic (não revisam) e quebra para
   WASDE/Conab/Crop Progress/CPI (revisam sempre). O relatório exige o oposto
   (§9.4). **Isto precisa ser corrigido antes do primeiro observável
   fundamentalista, não depois.**
4. **Vintage não se recupera retroativamente.** Exceto FRED/ALFRED e USDA, não
   dá para reconstruir "o que se sabia em 2019". Cada dia sem coletar é dado
   perdido para sempre. Isso é o argumento mais forte para começar *agora*,
   antes da reunião.
5. **Não coloquem a IA no caminho da geração do sinal.** Torna o backtest
   inviável (não-determinismo + o modelo conhece o futuro). A IA deve propor
   *hipóteses* e narrar contexto; a regra que gera sinal tem de ser
   determinística e versionada.

---

## 1. Viabilidade

### A proposta Milho + Ouro faz sentido?

**Sim, como recorte de engenharia. Não, como recorte de prioridade de negócio.**

O relatório é explícito em §5.5: a ordem de prioridade proposta ao Comitê é
**CAFÉ → PETRÓLEO → MILHO → OURO**. A proposta de vocês pega exatamente o 3º e
o 4º e descarta o 1º e o 2º. Isso é uma contradição direta com o documento em
deliberação, e se for apresentada como "escolhemos 2 das 4 commodities" vai ser
lida como disputa de prioridade — e provavelmente perdida.

**Reenquadramento recomendado:** não escolham 2 commodities. Escolham **2
trilhas de dados** para provar a arquitetura:

| Trilha | Representada por | O que prova |
|---|---|---|
| Agro-brasileira, revisável, baixa frequência | Milho | Dado que **revisa** (Conab/WASDE), safra, fonte nacional frágil, `published_at ≠ reference_date` |
| Macro-internacional, alta frequência, multi-fonte | Ouro | Série diária, **fator derivado** de múltiplas fontes, frequências heterogêneas, vintage real disponível |

Juntas cobrem os 4 padrões técnicos que **qualquer** commodity futura vai
exigir. Se o Comitê mantiver café primeiro, nada do trabalho se perde — os
coletores de café entram na mesma infraestrutura.

**Bônus decisivo, tirado do próprio relatório:** §10 define um "Bloco
Macrocomum (juros reais, DXY, liquidez) aplicável transversalmente aos 4
ativos". Ou seja, **o bloco macro do Ouro serve aos 4 ativos independentemente
de qualquer deliberação do Comitê.** Começar por ele é tecnicamente
inatacável — nenhuma decisão do David pode tornar esse trabalho inútil.

### É um bom recorte para MVP?

Sim, com uma correção de escopo: **2 commodities × ~7 observáveis = ~14
coletores** é grande demais para um primeiro experimento. O AgroMind levou
meses para chegar a ~15 fontes em nível 4–5. Proponho **4 a 5 séries** no
primeiro corte (ver §8).

### Existe razão forte para começar com outras commodities?

Há uma razão real a considerar e descartar conscientemente: **Petróleo tem a
melhor infraestrutura de dados de todas as quatro.** A API do EIA (`api.eia.gov`)
é gratuita, estável, documentada, com histórico longo, e cobre estoques
semanais + produção + preços — que são os drivers de peso ALTO nº 1 e nº 2 do
ativo. Se o critério fosse *só* "menor atrito de aquisição", petróleo seria o
primeiro, não o último.

**Por que ainda assim não recomendo trocar:** petróleo tem os drivers mais
dependentes de eventos qualitativos (decisões OPEP+, geopolítica) — exatamente
o tipo de informação que só a IA Search alcança e que é a parte *menos*
confiável da arquitetura. Petróleo é um bom **segundo** experimento, quando a
camada de evento estiver madura. Vale registrar isso ao Comitê como alternativa
avaliada, não ignorada.

### O que vocês estão subestimando

1. **Preço.** (ver §4). Sem série de futuros confiável não há backtest. Nenhum
   observável fundamentalista resolve isso.
2. **Que "milho" não é um ativo só.** CCM (B3, R$/saca, 450 sacas) e ZC (CME,
   US¢/bushel) são mercados diferentes, com bases, vencimentos e calendários
   diferentes. O relatório diz "B3 (CCM) **e** CME (ZC)" — isso dobra o
   trabalho. **Para o MVP é preciso escolher um.**
3. **Que vintage não é retroativo.** Ver §6.
4. **Que o modelo de dados atual não serve.** Ver §2.
5. **Que fonte gratuita ≠ fonte utilizável.** O relatório trata custo, mas
   **não trata licença de uso e redistribuição em nenhum ponto.** O AgroMind já
   reprovou uma fonte tecnicamente trivial (Agrolink) puramente por Termos de
   Uso. Se o FinMind vai *exibir* esses dados a usuários, isso é risco
   jurídico real e não mapeado.
6. **Custo de manutenção permanente.** Cada fonte por PDF/scraping é dívida
   recorrente, não custo único. O relatório dimensiona esforço de
   implementação, nunca de manutenção.

---

## 2. Arquitetura

### A arquitetura atual é adequada?

**As camadas, sim. O modelo de dados, não.**

O que já está certo e deve ser mantido:
- Pipeline de coleta genérico (`collectors/base/`) com download/parse/
  normalize/persist + retry + log de execução (`collection_execution`). É
  exatamente o formato certo e já funciona com 3 coletores reais.
- Separação física entre análise e execução de ordens.
- Dado de mercado como GLOBAL, sem `workspace_id` (ADR 0007).
- Catálogo de observáveis estático no código.

**O que está errado para este próximo passo:**

`market_quote` modela **um escalar por (instrumento, data)**, com upsert que
sobrescreve:

```js
// market-quote.repository.js — upsertPorChaveNatural
// "um valor diferente para a mesma data atualiza o registro existente" (ADR 0003)
```

Três problemas, em ordem de gravidade:

1. **Sem `published_at`.** A revisão sobrescreve o original. Isso destrói
   exatamente o que §9.4 do relatório exige preservar. Para PTAX/Selic é
   inofensivo; para WASDE/Conab/CPI é fatal.
2. **Sem OHLCV.** `value DECIMAL(18,6)` não comporta open/high/low/close +
   volume + open interest + contrato/vencimento.
3. **Sem dimensões.** Um balanço de oferta/demanda tem safra, região,
   1ª/2ª safra, produção/consumo/estoque final. Não cabe em um escalar.

### O que precisa existir ANTES de implementar observáveis

Esta é a resposta mais acionável de todo o documento. Três coisas, nessa ordem:

**(1) Tabela de observação com vintage (append-only).**

```
observation
  series_code       -- ex.: FRED.DFII10, USDA.CORN.COND_GOOD_EXC
  reference_date    -- a que período o dado se refere
  published_at      -- quando a fonte tornou o dado público  ← a coluna que falta hoje
  collected_at      -- quando o FinMind baixou
  value, unit
  source_code, raw_hash, collection_execution_id
  UNIQUE (series_code, reference_date, published_at)
```

Revisão gera **linha nova**, nunca UPDATE. `market_quote` pode continuar como
está (PTAX/Selic não revisam) ou ser absorvida depois — não bloqueie o MVP
nisso.

**(2) A função `asOf(series, data_decisao)`.**

A consulta que devolve *o que se sabia* numa data passada. É o coração de
qualquer backtest honesto, e a única peça de todo o projeto que pode ser
construída e **testada hoje, com dado real, sem nenhuma definição do David.**
Se ela não existir, tudo que vier depois é look-ahead bias.

**(3) Separação explícita Observável × Fator.**

- **Observável** = série bruta, coletada, com vintage. Nunca calculada.
- **Fator/Indicador** = função **determinística e versionada** de observáveis.

A planilha do David mistura os dois (ex.: "Juros reais (Fed)" e "paridade de
exportação" são fatores derivados, não séries publicadas). Implementar
"observável = fator" trava o projeto na primeira revisão de dado. Esta é a
mesma separação que o AgroMind já faz (Camada Analítica × Observação) e
funciona.

### Genérico × específico por commodity

| Genérico (núcleo, uma vez só) | Específico por commodity |
|---|---|
| Pipeline de coleta, retry, log de execução | Parser da fonte (cada PDF/XLSX/API é único) |
| `observation` + vintage + `asOf()` | Catálogo de séries daquele ativo |
| Catálogo de séries e metadados (periodicidade, latência, revisável?) | Calendário de divulgação (§7.4) |
| Motor de fatores (função versionada) | Fórmula de cada fator |
| Registro de evidência de IA Search | Especificação de contrato/rolagem |
| Monitoramento (dado ausente/congelado/outlier) | Regras do especialista |

**Regra de bolso:** se precisar de um `if (commodity === 'MILHO')` fora de um
parser ou de um catálogo, o desenho está errado.

---

## 3. Observáveis — núcleo mínimo priorizado

Derivados dos fatores que o relatório já elegeu (§7.2 + planilha). Dificuldade
é estimativa de engenharia, ancorada na experiência real do AgroMind quando
disponível.

### MILHO

| # | Observável | O que mede | Por que importa | Período | Fonte candidata | Dificuldade | Nível |
|---|---|---|---|---|---|---|---|
| M1 | **Preço futuro do milho** (CCM **ou** ZC — escolher um) | OHLCV + open interest do contrato ativo | Sem isso não há análise técnica nem backtest | Diário | B3 (CCM) / CME (ZC) — **VALIDAR**, ver §4 | **ALTA** | **Essencial** |
| M2 | **Crop Progress — condição da lavoura EUA** | % boa/excelente, % plantado/colhido | Driver de peso ALTO (§7.2); melhor caso de teste de vintage | Semanal (abr–nov) | USDA NASS QuickStats API | **BAIXA** | **Essencial** |
| M3 | **Balanço oferta/demanda — estoque final e estoque/uso** | Estoque final EUA e mundo | "Driver clássico de preço de grãos" (§8.1) | Mensal | USDA PSD Online / WASDE | MÉDIA | **Essencial** |
| M4 | **Indicador CEPEA milho** | Preço físico BR, R$/saca | Referência do mercado interno; base do CCM | Diário | CEPEA — **só export manual** (ver §4) | **ALTA** | **Essencial** |
| M5 | **Safra brasileira — 2ª safra (safrinha)** | Produção/área/produtividade | "O evento do ano" para o CCM (§8.1) | Mensal | Conab (XLSX) | MÉDIA-ALTA | **Essencial** |
| M6 | **USD/BRL (PTAX)** | Câmbio de referência | Paridade de exportação; **já implementado** | Diário | BCB SGS (ADR 0001) | **NULA** | **Essencial** |
| M7 | Posicionamento de fundos (COT) | Posição líquida managed money | Fluxo; defasagem real de publicação | Semanal | CFTC | BAIXA-MÉDIA | Secundário |
| M8 | Clima nas regiões da safrinha | Precipitação/temperatura MT-PR-GO | Driver de peso ALTO, sem fonte no catálogo original | Diário | NASA POWER / INMET | MÉDIA | Secundário |
| M9 | Exportações brasileiras de milho | Volume/valor/destino | Demanda externa | Mensal | Comex Stat API | **BAIXA** (AgroMind já tem) | Secundário |

> **Não é observável, é fator:** *paridade de exportação* exige preço CME +
> câmbio + frete marítimo + prêmio de porto. **O relatório atribui fonte
> "Cepea, Comex Stat" a esse fator, mas nenhuma das duas publica frete nem
> prêmio do Arco Norte.** É uma lacuna real de fonte, não de cálculo.

### OURO

| # | Observável | O que mede | Por que importa | Período | Fonte candidata | Dificuldade | Nível |
|---|---|---|---|---|---|---|---|
| O1 | **Juro real 10 anos EUA (DFII10)** | Yield TIPS 10a | "A relação mais forte e documentada" com o ouro (§8.1) | Diário | FRED | **BAIXA** | **Essencial** |
| O2 | **Yield nominal 10a (DGS10) + breakeven (T10YIE)** | Nominal e inflação implícita | Decompõe O1; **têm vintage real no ALFRED** | Diário | FRED | **BAIXA** | **Essencial** |
| O3 | **Índice do dólar** | Força do dólar | Driver de peso ALTO; correlação inversa clássica | Diário | **FRED `DTWEXBGS`** (Fed Broad) — ver ressalva §4 | **BAIXA** | **Essencial** |
| O4 | **Preço de referência do ouro** | Preço diário em USD/oz | Sem preço não há nada | Diário | LBMA Gold Price — **VALIDAR**; futuro GC é pago | MÉDIA-ALTA | **Essencial** |
| O5 | **COT ouro** | Posição líquida managed money | Fluxo; **melhor caso didático de vintage** (referência terça, publicação sexta) | Semanal | CFTC | BAIXA-MÉDIA | **Essencial** |
| O6 | CPI EUA | Inflação observada | Driver de peso ALTO; **revisa** → ótimo teste de vintage | Mensal | FRED | **BAIXA** | Secundário |
| O7 | Reservas de ouro de bancos centrais | Compras oficiais | "O diferencial recente" (§8.1) | Mensal/Trim. | IMF IFS / WGC | MÉDIA-ALTA | Secundário |
| O8 | Fluxo de ETFs de ouro | Entradas/saídas | Amplificador de movimento | Mensal | WGC Goldhub (sem API) | MÉDIA-ALTA | Secundário |
| O9 | Produção mineral | Oferta primária | Peso **BAIXO** e oferta inelástica | Anual | USGS | — | **Ignorar no MVP** |

> **Nota sobre O1/O2:** o "juro real" pode ser coletado direto (DFII10) **ou**
> derivado (DGS10 − T10YIE). Recomendo coletar os três: as duas séries brutas
> como observáveis e o spread como **fator versionado** — é o caso de teste
> perfeito para a camada de fator.
>
> **Ressalva do relatório que confirma essa escolha:** §8.1 registra que
> "parte relevante da alta de 2023-2025 ocorreu COM juros reais americanos
> ainda elevados... o peso deste fator não é estável no tempo e exige detecção
> de regime, não coeficiente fixo". Isso é maduro e está correto — e é
> exatamente o conceito de **Regime** que o AgroMind já formalizou
> (`inteligencia-mercado/ontologia.md`). Reaproveitável direto.

---

## 4. Fontes de dados — análise crítica

**Advertência metodológica:** o próprio relatório declara, na página 9, que
"a indicação das fontes ocorreu por meio de pesquisas, **mas não foram testadas
na prática**". Isso é honesto e precisa ser levado a sério: **a §7.1 classifica
42 fontes por modo de acesso sem ter chamado nenhuma delas.** A tabela abaixo
confronta essas classificações com evidência real.

### Contradições entre o relatório e a evidência empírica do AgroMind

| Fonte | Relatório diz | Realidade verificada (AgroMind) | Veredito |
|---|---|---|---|
| **CEPEA** | "scraping viável; sem API oficial" | **Bloqueada por Cloudflare em todo o domínio.** Reprovada em reconhecimento técnico **e jurídico** em 2026-08-08, confirmado por duas infraestruturas de rede independentes. Funciona **só** por export manual (43 `.xls` baixados à mão) | ❌ **Relatório factualmente errado.** Planejar CEPEA automatizada é planejar em cima de algo que não existe |
| **USDA (NASS/FAS)** | Fase 1, "API oficial gratuita", tratada como pronta | **Nível 0** no AgroMind — "candidata identificada, API exige chave de cadastro". **Nunca implementada nem testada** | ⚠️ Plausível, mas **não validada por ninguém ainda** |
| **NOAA** | "API pública e gratuita" (§6.5.1) | **Nível 0** — nunca implementada | ⚠️ VALIDAR |
| **Conab** | "Download de relatório + consulta online" | Nível 5 **para o balanço atual**, mas "safras anteriores exigem um produto CONAB diferente, **ainda não investigado**". O portal "Preços Agropecuários" está atrás de **reCAPTCHA** | ⚠️ **Histórico profundo da Conab não está resolvido** — impacto direto no backtest de 10-15 anos |
| **Comex Stat** | "API oficial gratuita" | **Nível 4, funciona** — API JSON oficial, sem auth, sem anti-bot. **Já existe coletor de milho pronto** | ✅ Confirmado e reaproveitável |
| **BCB** | "API de dados abertos gratuita" | **Nível 5** — backfill 1994→hoje, 8.037 observações | ✅ Confirmado (e já no FinMind) |
| **IMEA** | "XLSX, PDF; boletins mensais" | Nível 4 via **API não-documentada** (engenharia reversa), mas "só devolve o valor mais recente — **profundidade de histórico não confirmada**" | ⚠️ Modo de acesso do relatório está errado; e sem histórico não serve a backtest |

### Fontes prioritárias do MVP

| Fonte | API? | Download? | Histórico? | Limitações | Custo | Scraping? | Alternativa |
|---|---|---|---|---|---|---|---|
| **FRED (Fed St. Louis)** | ✅ REST/JSON, chave gratuita | ✅ CSV | ✅ Longo (DGS10 desde 1962) | Rate limit | Grátis | Não | — |
| **ALFRED (vintages FRED)** | ✅ Mesma API | ✅ | ✅ **Vintages reais** | — | Grátis | Não | **Não tem substituto.** É a única fonte do MVP com point-in-time histórico verdadeiro |
| **USDA NASS QuickStats** | ✅ chave gratuita | ✅ | ✅ Longo | Limite de registros/chamada — VALIDAR | Grátis | Não | Relatório em PDF (pior) |
| **USDA FAS PSD Online** | ✅ chave gratuita | ✅ | ✅ | Cobertura por commodity — VALIDAR | Grátis | Não | WASDE PDF |
| **CFTC (COT)** | ✅ Socrata + arquivos | ✅ CSV/TXT | ✅ desde 1986 (legacy) | Legacy × disaggregated: escolher e documentar | Grátis | Não | — |
| **LBMA Gold Price** | ⚠️ **VALIDAR** | ⚠️ VALIDAR | ✅ Longo | Acesso programático incerto; houve troca de provedor de dados | Grátis (consulta) | Talvez | World Bank Pink Sheet (**mensal**, insuficiente p/ swing) |
| **B3 (CCM/ICF EOD)** | ⚠️ **VALIDAR** | ⚠️ VALIDAR | ? | **Ver alerta abaixo** | Parcial | ? | Agregador pago |
| **CME (ZC/GC)** | ✅ DataMine | — | ✅ | **Pago.** Cotações atrasadas no site: uso automatizado provavelmente contra ToS — VALIDAR | **Pago** | ❌ não recomendado | Nasdaq Data Link, Barchart, EOD Historical, Databento |
| **NASA POWER** | ✅ pública, sem chave | ✅ | ✅ desde ~1981 | Reanálise, não estação real | Grátis | Não | INMET (estação real, mas com falhas) |
| **CEPEA** | ❌ | ⚠️ manual | ✅ 1997→ | **Cloudflare + Termos de Uso** | Grátis | ❌ **bloqueado e reprovado** | IMEA (só MT, sem histórico), DERAL (só PR) |
| **Conab** | ❌ | ✅ XLSX | ⚠️ Parcial | Histórico profundo não resolvido | Grátis | — | IBGE LSPA (nível 5 no AgroMind) |
| **WGC Goldhub** | ❌ (relatório confirma "sem API pública") | ✅ mediante cadastro | ✅ | Defasagem 4-6 semanas pós-trimestre | Grátis | — | IMF IFS |
| **IMF Data (SDMX)** | ✅ | ✅ | ✅ | Plataforma historicamente instável — **VALIDAR** | Grátis | — | WGC |

### ⚠️ Alerta específico: COTAHIST

O relatório afirma (§6.5.2): *"B3 — arquivos COTAHIST (séries históricas de fim
de dia, gratuitas)... **Atende ICF e CCM**"*.

Até onde sei, **COTAHIST é o arquivo histórico do mercado à vista (ações), não
de derivativos.** Se isso se confirmar, a afirmação está errada e a fonte
gratuita de histórico de CCM/ICF que o relatório dá como resolvida **não
existe** — o que agrava o problema de preço. **VALIDAR com prioridade máxima**,
porque isso muda a viabilidade do backtest do milho B3.

### Duas lacunas de fonte que o relatório não fecha

1. **Licença e direito de redistribuição.** Não aparece em nenhuma das 33
   páginas. "Gratuito" ≠ "pode armazenar, exibir a terceiros e redistribuir".
   O AgroMind já reprovou fonte por isso.
2. **Frete marítimo e prêmio de porto** (necessários para paridade de
   exportação do milho). Citado como driver, sem fonte que o forneça.

---

## 5. IA Search

### O princípio, em uma frase

**IA Search é um instrumento de descoberta e interpretação, nunca um
instrumento de medição.** Se o resultado vira um número que entra num cálculo,
está errado por construção.

### Onde FAZ sentido

| Uso | Por quê |
|---|---|
| **Reconhecimento de fonte** | Descobrir se existe API, qual endpoint, qual formato, se há anti-bot, o que dizem os Termos de Uso. É o trabalho que o FEL 2 pede e que o AgroMind fez à mão — a IA acelera muito e o erro é barato (você confere chamando a API) |
| **Monitoramento de mudança de fonte** | Detectar que um layout/URL mudou, que um relatório passou a sair em outro formato |
| **Captura de evento qualitativo datado** | "OPEP+ anunciou corte em DD/MM", "Copom decidiu X". Entra como **Evento com URL e data de publicação**, nunca como número |
| **Preenchimento de metadado de catálogo** | Calendário de divulgação, horário, periodicidade |
| **Narração e contexto na camada de síntese** | Explicar ao usuário *por que* o conjunto de observáveis está com essa cara |
| **Proposição de hipóteses** | Sugerir heurísticas candidatas para curadoria humana (ver §7) |

### Onde NÃO faz sentido

**Qualquer número que alimente indicador, fator, sinal ou backtest.** Sem
exceção: preço, estoque, produção, produtividade, yield, COT, CPI, câmbio,
volume, open interest.

A razão não é que a IA erre o número — é que **a data em que aquele número
passou a ser conhecido não é auditável**, e é exatamente isso que o backtest
precisa saber. Um número certo com vintage desconhecido é inutilizável para
decisão histórica.

### Como registrar origem e evidência

Toda afirmação obtida por IA Search deve ser persistida como **evidência**, não
como observação:

```
ai_evidence
  claim              -- o que foi afirmado
  source_url         -- de onde veio
  quoted_excerpt     -- trecho literal citado (snapshot)
  content_hash       -- hash do conteúdo baixado, para detectar mudança posterior
  published_at_declared  -- data que a página declara
  captured_at        -- quando o FinMind capturou  ← o que realmente conta
  model_id, model_version, prompt_id   -- reprodutibilidade
  confidence
  eligible_for_backtest  DEFAULT FALSE   ← trava por desenho
```

`eligible_for_backtest = FALSE` por padrão, e só um humano pode virar essa
chave, caso a caso, com justificativa.

### Riscos em backtest (os cinco reais)

1. **Look-ahead por conhecimento do modelo.** Pergunte a um LLM "qual era a
   expectativa de safra em maio de 2021" e ele responde com o benefício de
   saber o que aconteceu em julho. É o vazamento mais insidioso porque é
   invisível.
2. **O índice de busca é o de hoje.** Páginas revisadas, artigos reescritos,
   correções retroativas. Você não está lendo 2021 — está lendo a versão de
   2021 que sobreviveu até 2026.
3. **Viés de sobrevivência de fonte.** Só existe o que ainda está no ar.
4. **Não-determinismo.** Mesma pergunta, respostas diferentes. Um backtest que
   não reproduz não é um backtest.
5. **Contaminação pelo alvo.** A IA acha uma reportagem que *menciona o
   movimento de preço*. O alvo entrou na feature.

**Regra prática que eu adotaria:** IA Search só entra em avaliação histórica se
a evidência foi **capturada e congelada antes da data de decisão simulada**. Na
prática isso significa: **IA Search vale para forward-test, não para backtest.**
É restritivo e é honesto.

---

## 6. Backtest

### O que o relatório acerta (e é melhor que a média do mercado)

§8.3, §9.4 e §12 cobrem, com correção: point-in-time, look-ahead, revisão de
dados, gatilho de rolagem (recomendando liquidez, que é o critério certo),
back-adjust × ratio-adjust, custo de rolagem debitado, contango/backwardation,
custos quantificados, slippage medido do livro real, walk-forward, número
mínimo de trades (100/ativo), robustez a custos +50%, sensibilidade a
parâmetros, e vedação explícita a excluir períodos de perda. Isso está bom.

### Contradições internas que precisam ser resolvidas antes

| # | Contradição | Onde |
|---|---|---|
| 1 | **Janela de backtest:** §4 diz "Backtest histórico (**1 a 5 anos**)"; §12.1 diz "**10 a 15 anos** de dados point-in-time" | §4 × §12.1 — a §12 foi acrescentada na v1.1 e não corrigiu a §4 |
| 2 | **Demo:** §4 diz "mínimo de **3 meses**"; §12 afirma que "o item Execução previa teste demo por **60 dias**" e propõe 6 meses | §12 descreve incorretamente o que a §4 diz |
| 3 | **WASDE e café:** o texto diz "WASDE... **NÃO cobre café**" (correção correta da v1.1), mas a aba *Calendário de Relatórios* da planilha lista WASDE com "Ativo impactado: **Milho, Café**" | PDF §6.2 × `controle_fatores.xlsx` |
| 4 | **Crop Progress:** PDF diz "(**abr-nov**)"; planilha diz "(**mar-nov**)" | PDF §7.4 × planilha |
| 5 | **Seções 15 e 16 não existem.** O cabeçalho remete a "ver Seção 16 — Registro de Revisão"; o documento termina na Seção 14 | Página 1 × fim do documento |

### O que falta definir antes de confiar em qualquer resultado

1. **10-15 anos de point-in-time é, para o agro, impossível de obter
   retroativamente.** Você não reconstrói o vintage do passado. As exceções
   são FRED/ALFRED (vintages reais) e, parcialmente, USDA. Para Conab/CEPEA
   **não existe** vintage histórico recuperável.
   **Decisão inescapável para o Comitê:** ou (a) backtest agro com dado
   revisado, com o viés declarado e quantificado, ou (b) acumular vintage a
   partir de hoje e aceitar que o backtest agro honesto só existirá em alguns
   anos. **Não há opção (c).** — *Este é o argumento mais forte para começar a
   coletar antes da reunião: cada dia sem coleta é um vintage perdido para
   sempre.*
2. **Timestamp de decisão.** §8.6 levanta o problema dos fusos e não resolve.
   Precisa de regra explícita: um dado só é elegível a partir de
   `published_at + latência`, e a decisão ocorre no fechamento seguinte.
3. **Benchmark.** "Sharpe mínimo" comparado com o quê? Sem baseline
   (buy-and-hold da própria commodity, no mínimo) o número não significa nada.
4. **Múltiplos testes / data dredging.** §12.2 pede sensibilidade a
   parâmetros — bom, mas insuficiente. Se forem testadas 50 configurações, o
   melhor Sharpe é ruído. Precisa registrar **quantas configurações foram
   testadas** antes de reportar a melhor.
5. **Dupla contagem do custo de rolagem.** Se a série é back-adjusted **e** o
   spread de rolagem é debitado, o custo pode entrar duas vezes (ou nenhuma).
   Precisa ser explícito.
6. **Sobrevivência de contrato.** A série contínua precisa saber qual
   vencimento estava ativo em cada data histórica — não dá para inferir depois.

### Veredito

**Backtest é prematuro para o MVP, e o próprio relatório fornece o argumento:
sem série de preço aprovada (§6.5.2) e sem vintage acumulado (§9.4), qualquer
resultado agora seria inválido pelas próprias vedações da §12.3.** Construam a
infraestrutura que torna o backtest possível; não tentem o backtest.

---

## 7. Estratégia — a cadeia proposta

### A cadeia de vocês

```
dados → observáveis → indicadores/fatores → contexto → análise IA → hipótese/sinal → backtest
```

**É muito melhor que "joga tudo na IA e pergunta se compra".** As quatro
primeiras setas estão certas e são exatamente o que eu recomendaria.

**Mas há um furo grave na quinta seta:** a IA está no **caminho crítico da
geração do sinal**. Isso torna o backtest quase impossível:

- a IA não é determinística → o backtest não reproduz;
- reexecutar a IA sobre 2015 usa um modelo que **sabe** o que aconteceu em
  2016 → look-ahead estrutural, impossível de remover;
- custo de rodar milhares de decisões históricas por LLM;
- e viola o princípio já escrito no `CLAUDE.md` do FinMind ("uma resposta de IA
  nunca dispara uma ação sozinha").

### O que eu mudaria: duas cadeias, não uma

**Cadeia de decisão — determinística, backtestável, sem IA:**
```
dados → observáveis (com vintage) → fatores versionados → regras/heurísticas explícitas → sinal → backtest
```

**Cadeia de conhecimento — com IA, não determinística, fora do caminho do sinal:**
```
observáveis + fatores + eventos → IA propõe hipóteses e narra contexto → curadoria humana → regra determinística
                                                                                                    │
                                                                            (só então entra na cadeia de decisão)
```

**A IA gera candidatos a regra e explicação. Ela não gera o sinal.**

Isso não é conservadorismo: é o que torna o sistema auditável, backtestável e
compatível com a §13.3 do relatório ("registro obrigatório de toda operação,
com o sinal que a originou e os dados que alimentaram o sinal").

E é **exatamente o desenho que o AgroMind já validou**: heurística curada por
humano, IA nunca decide (`inteligencia-mercado/metodologia.md` §6;
`ontologia.md`, "Fronteira explícita"). Há ali uma ontologia pronta —
**Caso → Heurística → Regime → Estado de Mercado** — com ciclo de vida
(hipótese → em observação → validada → contestada → aposentada) e
versionamento append-only. Isso é diretamente transferível para o FinMind e
resolve o "como a IA contribui sem decidir".

> Se, mais adiante, o Comitê quiser IA no laço de decisão, as condições mínimas
> são: modelo pinado por versão, prompt versionado, entrada **exclusivamente**
> do snapshot point-in-time, saída estruturada e cacheada por hash da entrada.
> Mesmo assim o viés de conhecimento do modelo permanece — e precisa ser
> declarado ao Comitê, não escondido.

---

## 8. Primeiro experimento — o que construir agora

**Nome:** Núcleo de Observáveis com Vintage
**Duração alvo:** curto. **Commodities:** milho e ouro. **IA:** nenhuma.
**Backtest:** nenhum. **Sinal:** nenhum.

### Critério de sucesso (defina antes, não depois)

> Conseguir responder, para uma data D no passado: **"quais valores o sistema
> conhecia em D?"** — e demonstrar que, para pelo menos uma série, esse valor
> **difere** do valor atual da mesma data de referência.

Essa demonstração é a prova viva de que a arquitetura point-in-time funciona.
É pequena, é verificável, e é o alicerce de tudo o que vem depois.

### O que implementar, em ordem

**Passo 1 — Infraestrutura (sem a qual nada mais vale).**
- Tabela `observation` com `published_at` + append-only (migration com
  `Escopo: GLOBAL`, conforme ADR 0007).
- Função `asOf(series, data)` + testes.
- Catálogo de séries ampliado (periodicidade, latência esperada, revisável
  sim/não) — mantido estático no código, conforme convenção do repo.

**Passo 2 — Bloco macro via FRED (imune a qualquer decisão do Comitê).**
- `DGS10`, `T10YIE`, `DFII10`, `DTWEXBGS`.
- **Backfill de vintages via ALFRED** para pelo menos uma série — é o único
  dado point-in-time histórico verdadeiro disponível de graça, e serve para
  validar `asOf()` com dado real.
- Justificativa ao Comitê: §10 do relatório define o bloco macro como
  transversal aos **4** ativos.

**Passo 3 — Um fator derivado (prova a camada de fator).**
- Juro real 10a = `DGS10 − T10YIE`, versionado, recalculável, comparável
  contra `DFII10` como validação cruzada.

**Passo 4 — Dois observáveis com defasagem real de publicação.**
- **COT ouro** (CFTC): referência terça, publicação sexta. `published_at ≠
  reference_date` de forma inequívoca.
- **Crop Progress milho** (USDA QuickStats): semanal, sazonal, revisável.

Total: **~6 séries, 3 fontes novas** (FRED, CFTC, USDA), todas com API
gratuita e todas úteis sob qualquer deliberação do Comitê.

### Dados históricos a puxar

| Série | Profundidade | Observação |
|---|---|---|
| FRED DGS10 | 1962→ | Trivial |
| FRED T10YIE / DFII10 | 2003→ | Limitado pela existência dos TIPS |
| ALFRED (vintages) | O que houver | **A peça mais valiosa do experimento** |
| CFTC COT | 2006→ (disaggregated) | Escolher legacy × disaggregated e documentar |
| USDA Crop Progress | ~1979→ | VALIDAR limite de registros por chamada |

### O que NÃO implementar ainda

- ❌ Preço de futuros, série contínua, rolagem
- ❌ Backtest, qualquer motor de sinal, qualquer limiar
- ❌ IA em qualquer ponto (nem narração)
- ❌ Café, petróleo
- ❌ CEPEA (bloqueada — só export manual), Conab PDF, IMEA, LBMA
- ❌ Clima
- ❌ Dashboard novo — reaproveitar a tela de observáveis existente
- ❌ Qualquer tabela com `workspace_id` (dado de mercado é GLOBAL, ADR 0007)

### Por que este experimento gera valor mesmo se o David mudar tudo

Porque nada nele depende de uma decisão do especialista: a infraestrutura de
vintage serve a qualquer ativo; o bloco macro serve aos 4 ativos por definição
do próprio relatório; e COT/Crop Progress são séries que existem em qualquer
cenário em que milho ou ouro sobrevivam à deliberação. **O pior caso é ter
começado a acumular vintage cedo demais — que não é um caso ruim.**

---

## 9. Crítica direta à proposta de vocês

| Afirmação de vocês | Veredito |
|---|---|
| "Começar com Milho + Ouro" | ✅ **Faz sentido** — mas reenquadrem como trilhas de dados, não como escolha de ativos, ou vão colidir com a ordem CAFÉ→PETRÓLEO→MILHO→OURO da §5.5 |
| "Já temos experiência com Milho no AgroMind" | ✅ **Verdadeiro e subestimado.** Há mais reaproveitável do que vocês citaram: ontologia de Caso/Heurística/Regime, processo de reconhecimento de fontes com níveis 0-5, coletor Comex Stat de milho pronto, Conab/IBGE em nível 5. **Mas atenção:** o AgroMind **não** tem coletor USDA, CME ou NOAA — essas pastas existem e estão vazias |
| "Café é parecido com Milho, testaria duas vezes o mesmo problema" | ❌ **Errado como argumento.** Parecidos nos *drivers conceituais*, muito diferentes na *aquisição*: café depende de ICO (PDF), Cecafé (PDF), estoque certificado ICE e USDA FAS bianual — e o relatório corrige explicitamente que **o WASDE não cobre café**. Café não é redundante: é o mais difícil. A conclusão (deixar para depois) está certa; a razão, não |
| "Ouro testa se a arquitetura é generalizável" | ⚠️ **Meia-verdade.** Ouro é o ativo **mais fácil** — o relatório diz textualmente "Plena Automatização do Ativo Ouro... viabilizando automação integral" (§10). Ele não testa muito a aquisição. **O que ele realmente testa bem** é vintage real (ALFRED), fator derivado multi-fonte e frequências heterogêneas — que é um motivo melhor e defensável |
| "Reduzir escopo antes de expandir" | ✅ **Certo** — e ainda não foi longe o suficiente. 2 commodities × 7 observáveis ainda é grande. Comecem com 6 séries |
| "Considerar múltiplas formas de aquisição desde o início" | ✅ **Certo, e é a lição mais importante que vocês trouxeram.** O relatório classifica 42 fontes por modo de acesso **sem ter testado nenhuma** (declarado na p. 9). Formalizem o processo de reconhecimento de fontes do AgroMind (níveis 0-5) como primeira entrega |
| "IA Search como forma de aquisição" | ⚠️ **Certo como descoberta, perigoso como aquisição.** A palavra "aquisição" já é a armadilha. Ver §5 |
| "…→ análise IA → hipótese/sinal → backtest" | ❌ **Precisa mudar.** IA no caminho do sinal inviabiliza o backtest. Separem as duas cadeias (§7) |
| "Testar estratégias de trading através de backtests" (objetivo declarado) | ⚠️ **Prematuro.** Sem série de preço aprovada e sem vintage acumulado, o backtest é vedado pela própria §12.3 do relatório |

---

## 10. Resultado final

### A) Avaliação da escolha Milho + Ouro

**Aprovada, com reenquadramento obrigatório.** O par cobre os quatro padrões
técnicos que qualquer commodity futura vai exigir (revisão de dado, série
diária, defasagem de publicação, fator derivado). Mas apresente ao Comitê como
**recorte de engenharia para provar a arquitetura**, nunca como mudança da
prioridade CAFÉ→PETRÓLEO→MILHO→OURO — que é prerrogativa do Comitê, não da
engenharia. E troque o argumento: café é o **mais difícil**, não o redundante;
ouro é o **mais fácil**, e vale por outras razões.

### B) Principais riscos e dúvidas

1. **Preço de futuros sem solução gratuita** — o risco nº 1. Pode inviabilizar
   o backtest independentemente de tudo o mais.
2. **COTAHIST provavelmente não cobre derivativos** — se confirmado, o
   relatório dá como resolvida uma fonte que não existe.
3. **Vintage histórico do agro é irrecuperável** — decisão inescapável do
   Comitê (aceitar viés ou esperar anos).
4. **CEPEA bloqueada** — o relatório planeja em cima de scraping que já foi
   tecnicamente e juridicamente reprovado no AgroMind.
5. **Licenciamento e redistribuição não mapeados** em nenhuma das 33 páginas.
6. **Modelo de dados atual incompatível com point-in-time** — dívida técnica
   que cresce a cada coletor novo adicionado antes da correção.
7. **IA no caminho do sinal** — se mantida, o backtest não será reproduzível.
8. **42 fontes classificadas sem teste prático** — declarado pelo próprio
   relatório.

### C) Observáveis iniciais — MILHO

**Essenciais:** M1 preço futuro (CCM **ou** ZC — escolher um) · M2 Crop
Progress · M3 estoque/uso (WASDE/PSD) · M4 CEPEA milho · M5 safrinha (Conab) ·
M6 USD/BRL *(pronto)*
**Secundários:** M7 COT · M8 clima safrinha · M9 exportações (Comex Stat)
**Fator, não observável:** paridade de exportação — *sem fonte de frete/prêmio*

### D) Observáveis iniciais — OURO

**Essenciais:** O1 juro real 10a (DFII10) · O2 DGS10 + T10YIE · O3 índice do
dólar (DTWEXBGS) · O4 preço de referência (LBMA — VALIDAR) · O5 COT ouro
**Secundários:** O6 CPI · O7 reservas de bancos centrais · O8 fluxo de ETFs
**Ignorar no MVP:** O9 produção mineral (peso BAIXO, oferta inelástica)

### E) Fontes prioritárias a validar

| Prioridade | Fonte | O que validar |
|---|---|---|
| 🔴 Máxima | **B3 / COTAHIST** | COTAHIST cobre derivativos (CCM/ICF)? Se não, qual é a fonte gratuita de EOD de futuros B3 — se é que existe? |
| 🔴 Máxima | **Preço de futuros em geral** | Custo real de Nasdaq Data Link / Barchart / EOD Historical / Databento, **e licença para uso em backtest e exibição** |
| 🔴 Máxima | **LBMA Gold Price** | Existe acesso programático estável e licenciado ao histórico diário? |
| 🟡 Alta | **USDA NASS QuickStats** | Chave, limites por chamada, profundidade de Crop Progress |
| 🟡 Alta | **USDA FAS PSD** | Cobertura do balanço de milho, granularidade, disponibilidade de releases anteriores |
| 🟡 Alta | **FRED / ALFRED** | Confirmar vintages por série (é a peça central do experimento) |
| 🟡 Alta | **CFTC COT** | Legacy × disaggregated; datas exatas de referência e publicação |
| 🟢 Média | **Conab (histórico profundo)** | Existe produto com safras anteriores a 2024/25? |
| 🟢 Média | **IMF / WGC** | Estabilidade da API SDMX; acesso ao Goldhub |
| ⚪ Transversal | **Todas** | **Termos de Uso: armazenar, exibir a terceiros, redistribuir** |

### F) Começar a implementar agora

1. Tabela `observation` com `published_at`, append-only (Escopo: GLOBAL)
2. Função `asOf(series, data)` + testes
3. Coletor FRED (DGS10, T10YIE, DFII10, DTWEXBGS) + **backfill de vintages ALFRED**
4. Um fator versionado (juro real 10a), validado contra DFII10
5. Coletor CFTC COT (ouro) — defasagem real de publicação
6. Coletor USDA QuickStats (Crop Progress milho)
7. ADR registrando a decisão de point-in-time e a separação Observável × Fator
8. Portar o **processo de reconhecimento de fontes** do AgroMind (níveis 0-5) —
   uma linha por fonte, antes de implementar qualquer coletor

### G) Deixar para depois

Preço de futuros e série contínua · rolagem · backtest · motor de sinal ·
IA em qualquer ponto · café · petróleo · CEPEA/Conab/IMEA/WGC · clima ·
execução de ordens · corretora · cartilha de riscos (é do Comitê, §13) ·
dashboard novo

### H) Perguntas para o David e o Comitê

**Sobre ativos e escopo**
1. O recorte Milho + Ouro como **prova de arquitetura** (não como mudança de
   prioridade) é aceitável, mantida a ordem CAFÉ→PETRÓLEO→MILHO→OURO para o
   produto?
2. Milho: vamos operar **CCM (B3, R$)** ou **ZC (CME, US$)**? Ambos dobram o
   trabalho de dados. Mesma pergunta para ouro: **GC** ou preço de referência?

**Sobre dados (as que travam o desenvolvimento)**
3. Existe orçamento para **dados de preço**? Sem isso não há backtest — e o
   núcleo gratuito da §7 não cobre preço (§7.1, ressalva v).
4. Confirmam que **COTAHIST não atende CCM/ICF**? Qual a alternativa?
5. **Vintage do agro:** backtest com dado revisado e viés declarado, ou
   acumular vintage a partir de agora? (Não há terceira opção.)
6. Quem responde por **licença e redistribuição** das fontes?
7. A CEPEA está **bloqueada para automação** (confirmado no AgroMind). O
   processo de export manual é aceitável em produção?

**Sobre backtest e método**
8. §4 diz 1–5 anos; §12.1 diz 10–15 anos. **Qual vale?**
9. Qual o **benchmark** contra o qual o Sharpe mínimo será julgado?
10. Os limiares da §12.2 (Sharpe, drawdown, profit factor) serão deliberados
    **antes** dos testes, como a própria §12.2 exige?

**Sobre IA**
11. Concordam que a IA **propõe hipóteses e narra**, mas **não gera o sinal**?
12. IA Search pode ser usada para **descoberta de fonte e evento qualitativo**,
    ficando **vedada** como origem de qualquer número que entre em cálculo?

**Sobre o documento**
13. As **Seções 15 e 16** (Registro de Revisão), referenciadas na página 1, não
    constam do PDF nem do DOCX. Existem?
14. A planilha lista **WASDE impactando café**, mas o texto revisado diz que o
    WASDE não cobre café. Qual prevalece?

---

## Anexo — Inconsistências encontradas no relatório

| # | Inconsistência | Gravidade |
|---|---|---|
| 1 | §4 "backtest de 1 a 5 anos" × §12.1 "10 a 15 anos" | **Alta** — muda a viabilidade do projeto |
| 2 | §12 afirma que §4 previa demo de "60 dias"; §4 diz "3 meses" | Baixa |
| 3 | Planilha: WASDE impacta "Milho, Café" × texto: "WASDE NÃO cobre café" | Média |
| 4 | Crop Progress: PDF "abr-nov" × planilha "mar-nov" | Baixa |
| 5 | Seções 15 e 16 referenciadas, inexistentes | Baixa (rastreabilidade) |
| 6 | §6.5.2 afirma que COTAHIST atende ICF e CCM | **Alta** — VALIDAR com urgência |
| 7 | Fator "paridade de exportação" com fonte Cepea/Comex Stat, que não publicam frete nem prêmio de porto | Média |
| 8 | Planilha atribui o **DXY** às fontes "US Treasury, World Bank" — nenhuma das duas publica o DXY (índice ICE, licenciado) | Média |
| 9 | "Cepea: scraping viável" — bloqueada por Cloudflare, reprovada técnica e juridicamente no AgroMind | **Alta** |
| 10 | Licença/Termos de Uso e direito de redistribuição ausentes nas 33 páginas | **Alta** |
| 11 | §8.1: tabela de especificações com colunas desalinhadas no PDF (cotação do milho aparece como "US$/onça troy") — o conteúdo está correto, a diagramação não | Baixa |

> Nota de mérito: as especificações de contrato conferidas (CCM 450 sacas/60kg,
> tick R$0,01 = R$4,50; GC 100 oz troy, tick US$0,10 = US$10; meses de
> vencimento de ambos) estão **corretas**. As correções da v1.1 — Brent BZ é
> código CME, WASDE não cobre café, margem é dinâmica, instabilidade do fator
> juros reais no ouro, liquidez nula do Conilon — são todas pertinentes e
> indicam revisão técnica séria.
