# 0061 — Café: fontes novas do Motor do Café v1 (sacas pendentes da ICE, relatório mensal da ICO e portos europeus da ECF)

**Status:** aceita (2026-10-04).

## Contexto

O Motor do Café v1 (ADR 0060) pede dados que o FinMind não coletava. O estudo de viabilidade
(`docs/reconhecimento-fontes/cafe-fontes-novas-motor-v1.md`) testou cada fonte com chamada real e sugeriu esta ordem:

1. as sacas aguardando classificação da ICE (já no arquivo que baixamos);
2. o relatório mensal da ICO;
3. os estoques dos portos europeus da ECF;
4. o INMET, depois de o David definir o índice;
5. o diário de Londres e do KC, só com orçamento e licença.

**Autorização:** o usuário, em 2026-10-04 ("Pode seguir sua sugestão, comite autorizou"), com a aprovação do Comitê.
**Limite:** só aquisição de dados. Os três primeiros itens entram neste ADR. O INMET espera o índice do David (sem índice
não há o que coletar). O diário da ICE espera orçamento e licença (decisão do Luiz). Nenhum dado novo entra na decisão
dos fatores, no prompt ou na IA: usá-los numa regra é definição do David.

## Evidência (chamada real, 2026-10-04)

**ICE, sacas aguardando classificação.** O bloco *Pending Grading Report* está nos arquivos de 2016-01-04, 2021-07-21
e 2026-09-25, em dois formatos:

- **2016 e 2021:** por porto, com "Grand Total in Bags" (AN 28.119 + HA/BR 4.437 = 32.556 sacas em 2016-01-04).
- **2026:** por origem e porto, com "Total in Bags" (21.117 sacas em 2026-09-25).

O total é a única parte estável.

**ICO, Coffee Market Report:**

- **Arquivo:** 165 relatórios mensais, de out/2012 a ago/2026, em
  `ico.org/documents/cy<ano-café>/cmr-<MMAA>-e.pdf`. Exceção: set/2024 está na pasta do ano-café seguinte. Antes de
  out/2012, 404.
- **Tabelas 1 e 5:** lidas em 2012, 2014, 2016, 2018, 2020, 2023, 2025 e 2026. Os layouts variam:
  - o rótulo do mês fica acima ou abaixo da linha de números (2020);
  - o mês vem por extenso, com o ano numa linha à parte e as médias anuais depois (2012);
  - o rótulo vem quebrado ("Ja n-14", "May - 17");
  - o "London" da tabela 5 fica 3,4 pontos acima dos números.

  Em 2012 a tabela 5 era um gráfico.
- **`Last-Modified`:**
  - **de out/2023 em diante:** real, de 3 a 38 dias depois do fim do mês;
  - **antes:** traz as datas das migrações do site (2023-02-20 e 2025-04-09).
- **Revisão: a fonte revisa.** O estudo de viabilidade comparou 11 meses e não viu revisão; a carga completa desmentiu.
  Ela gravou 127 revisões em 167 relatórios, de dois tipos:
  - **centésimos:** Brazilian Naturals de jun/2021, 148,12 → 148,18; estoques, 2,21 → 2,18 milhões de sacas;
  - **erros de digitação corrigidos no mês seguinte:** Nova York de set/2020 saiu 2,45 no relatório de setembro e 1,26
    no de outubro.
- **Carga completa:**
  - **Números de tabela:** mudam (os preços são a "Table 2" em fev/2013 e jan/2014).
  - **Título:** em out/2023 a tabela de preços não tem título no texto.
  - **Números e palavras partidos em itens:** "12" + "1.18" = 121,18 (abr/2019); "Brazilia" "n" (dez/2021).
  - **Cabeçalho de estoques em duas linhas:** mês em cima, ano embaixo (ago/2021).
  - **Estoques no mês anterior:** às vezes terminam no mês anterior ao relatório (fev/2020).
  - **Tabelas em imagem, sem texto:** preços em jul e ago/2015 e set, nov e dez/2016; estoques em set, nov e dez/2016.
  - **PDF ilegível:** dez/2017.

**ECF, Stocks in European Ports:**

- **Página da categoria:** linka um PDF por ano, de 2016 a 2026, e também a versão de junho de 2026 ao lado da de
  agosto. Cada PDF é uma edição.
- **Tabela por tipo:** existe desde o arquivo de 2020. Antes era por porto, e a Antuérpia saiu da conta em ago/2019, o
  que quebra o total.
- **Defeitos conhecidos da fonte:**
  - o ano digitado errado ("31-May-24" no arquivo de 2025);
  - o número quebrado em três itens ("193" "," "274");
  - o milhar com ponto ("256.216", 2023);
  - números 1 ponto acima do rótulo.
- **Revisão:** a fonte revisa; o robusta de abr/2026 tem 150.769 t na versão de junho e 150.565 t na de agosto.
- **`robots.txt`:** livre.

## Decisão

1. **ICE: o total pendente no coletor existente** (`ice-cafe-estoques`):
   - **Série:** `ICE.CAFE_C.ESTOQUE.TOTAL.PENDENTE` (sacas), com as mesmas datas do certificado. Só o total, porque o
     bloco muda de formato.
   - **Trava:** a soma das linhas tem de fechar com o total.
   - **Bloco ausente ou ilegível:** vira aviso, e o certificado do dia é gravado assim mesmo.
   - **Histórico:** `npm run backfill:ice-cafe-estoques -- --serie=pendente` pede de novo, no mesmo ritmo do ADR 0032
     (20 s entre arquivos, ~15 h no servidor), os dias que ainda não têm o pendente. O certificado relido é ignorado
     (mesmo valor).
   - **Card:** um campo novo no card da ICE.
2. **ICO: coletor `ico-cafe`** (`collectors/ico/`):
   - **Tabela 1:** a média mensal dos preços indicativos (I-CIP, Colombian Milds, Other Milds, Brazilian Naturals,
     Robustas) e dos futuros de Nova York e Londres, em `ICO.CAFE.PRECO_<GRUPO>` (US¢/lb).
   - **Tabela 5:** os estoques certificados das duas bolsas, em `ICO.CAFE.ESTOQUE_<BOLSA>` (milhões de sacas).
   - **Datas:** `observed_at` é o 1º dia do mês.
   - **Leitura:** por coordenada, em linhas por proximidade de y. As travas são as 7 colunas na ordem, 7 números por
     linha e os meses consecutivos terminando no mês do relatório.
   - **Edições:** cada relatório é uma edição (`persistirPorEdicao`), e o mês entra com a data do próprio relatório.
     As correções ficam com a data do relatório que as trouxe.
   - **`published_at`:** o `Last-Modified` quando cai até 60 dias depois do fim do mês. Senão, fim do mês + 45 dias,
     estimado (acima do maior atraso visto, 38 dias).
   - **Base nova `edition_lag_rule`** (`point-in-time.service.js`):
     - **Regra geral:** o serviço data com `collected_at` toda revisão de série com data estimada, porque a regra
       estimaria a publicação original, não a da revisão.
     - **Exceção:** quando a estimativa é a data da edição que traz o valor, a revisão saiu nessa mesma edição.
     - **Sem a exceção:** as 127 revisões da carga histórica ficariam com a data de hoje, e o erro de digitação de
       set/2020 valeria no histórico até hoje.
     - **Uso:** a ICO e a ECF usam a nova base.
   - **Coleta diária:** os 2 meses anteriores que faltam no banco.
   - **Backfill:** `npm run backfill:ico-cafe`.
   - **Fora:** a tabela 2 (diferenciais, deriváveis da tabela 1), a 3 (balanço por ano-café: o layout muda e o PSD já
     traz a produção por espécie) e a 4 (exportações por grupo).
3. **ECF: coletor `ecf-cafe-estoques`** (`collectors/ecf/`):
   - **Dado:** a tabela por tipo (Robusta, Natural Arabica, Washed Arabica, total), em `ECF.CAFE.ESTOQUE_<TIPO>`
     (toneladas), mensal, a partir de jan/2020.
   - **Edições:** cada PDF linkado é uma edição. O `published_at` é o `Last-Modified` (real); sem ele, o fim do mês da
     pasta de upload (estimado).
   - **Defeitos conhecidos:** o ano errado vira aviso e é lido pela sequência do bloco.
   - **Trava:** o total tem de fechar com a soma dos tipos (até 3 t de arredondamento), senão o mês fica de fora com o
     motivo.
   - **Coleta diária:** o ano corrente e o anterior.
   - **Backfill:** `npm run backfill:ecf-cafe`.
4. **Metodologia do café (`metodologia-cafe.js`):**
   - **F3 e F6:** listam os cards novos como dados disponíveis, e as lacunas e perguntas passam a dizer o que falta
     decidir. Exemplos: o que é "redução nos lotes pendentes"; se a arbitragem Nova York − Londres mede a substituição.
   - **Cálculos:** não mudam.
   - **Pergunta nova da §4:** o índice do INMET.

## Consequências

- **Ordem de carga no servidor:**
  1. `npm run backfill:ico-cafe` e `npm run backfill:ecf-cafe`, antes da coleta diária, que se recusa a gravar série
     sem carga histórica;
  2. `npm run backfill:ice-cafe-estoques -- --serie=pendente` em segundo plano, como o backfill original.
- **Resultado no dev:**
  - **ICO:** 167 relatórios; 1.595 valores, 127 revisões, nenhuma datada pela coleta. Ficaram de fora 9 tabelas: as em
    imagem e o PDF de dez/2017.
  - **ECF:** 8 edições; 312 valores (jan/2020 a jun/2026 × 4 séries) e 8 revisões (março e abril/2026, entre as
    versões de junho e agosto).
  - **ICE:** o pendente, de ago a out/2026.
- **Sobreposição:**
  - o estoque de Nova York da ICO repete, com menos precisão, o certificado diário da ICE;
  - o de Londres (ICO) está contido nos portos da ECF.

  Uma regra que use os dois conta duas vezes (a dupla contagem do §5 do estudo).
- **Dado mensal:** a ICO e a ECF são mensais, e a ECF chega com ~2 meses de atraso. Servem aos horizontes longos, não
  ao diário.
- **Licenças:**
  - **ICO:** reuso livre citando a fonte.
  - **ECF:** licença não lida; uso interno.
  - **ICE:** o risco de termos já aceito no ADR 0032 vale também para o pendente.

## Fora do escopo

- **Fontes que esperam outra decisão:** o INMET (índice do David), o diário de Londres e do KC (orçamento e licença) e
  o diferencial FOB (sem fonte pública).
- **Federação do Café da Colômbia:** reconhecida, mas fora da ordem sugerida; entra se o Comitê quiser outras origens.
- **Uso dos dados novos:** o uso em regra de fator, no prompt ou na IA fica fora.
