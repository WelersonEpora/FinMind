# 0017 — Milho da Conab (boletim mensal): safra 1ª/2ª/3ª por UF e balanço, com vintage real

## Contexto

O ADR 0016 reconheceu a Conab e mostrou que **safra 1ª e 2ª, estoque e balanço** (o que o relatório do David pede)
estão na **planilha XLSX do boletim mensal** da safra de grãos, e que cada levantamento mensal é uma nova estimativa da
mesma safra: é o vintage. Em 2026-09-21 o usuário **autorizou explicitamente** a implementação do coletor diário,
deixando o histórico longo para quando houver uma opção ("implementar o coletor e deixar o histórico para quando
tivermos uma opção"): exceção pontual prevista em `CLAUDE.md`, mesmo precedente do dólar (ADR 0001), do Comex Stat
(ADR 0013) e do WASDE (ADR 0015). **Continuam sem coletor**: as séries históricas desde 1976/77 (XLS) e os preços da
Conab (TXT) do ADR 0016. Nada além do milho é coletado.

## Decisão

- **Coletor `conab-milho`** (`collectors/conab/`), no contrato de sempre (download → parse → normalize → persist),
  registrado em `collectors/index.js` e rodado pela mesma rotina diária e por `POST /api/v1/coletas`.
- **Camada point-in-time** (`observation`, ADR 0008), porque a Conab revisa a estimativa todo mês. `source_code`
  `CONAB_LEVANTAMENTO_SAFRAS`.
- **Download:** o índice `.../safra-de-graos/boletim-da-safra-de-graos` lista as planilhas
  (`<n>o-levantamento-safra-<AAAA-AA>/site_previsao_de_safra-por_produto-<mês>-<ano>.xlsx`); a página de cada
  levantamento traz **"Publicado em 15/09/2026 09h00"** (Brasília). A coleta diária baixa só o levantamento mais
  recente (índice + página + ~1 MB); o backfill baixa todos os do índice, com 1 s de pausa. Guarda: o arquivo tem de
  ter assinatura ZIP (`PK`) e pelo menos 200 KB (barra uma página de erro salva como `.xlsx`).
- **`published_at` REAL** (`published_at_is_estimated = false`, base `source`): a data e hora da página, convertidas de
  Brasília (UTC-3 o ano todo desde 2019) para UTC. Sem essa data o levantamento é **inválido** (não se grava vintage
  sem data real). O mês da aba `Suprimento` e da nota "Estimativa em <mês>/<ano>" tem de ser o mês da publicação,
  senão o levantamento é barrado (arquivo trocado ou página com data errada).
- **`observed_at`** = 1º de setembro do ano de início da safra (2025/26 → 2025-09-01): **convenção**, a mesma do WASDE.
- **Séries e unidades (como publicadas, sem conversão):**
  - `CONAB.MILHO.<REGIAO>.<METRICA>_<TIPO>`: `METRICA` = `AREA` (mil ha), `PRODUTIVIDADE` (kg/ha), `PRODUCAO` (mil t);
    `TIPO` = `1A`, `2A`, `3A`, `TOTAL` (abas `Milho 1a/2a/3a/Total`). `REGIAO` = as 27 UFs, as 5 macrorregiões,
    `NORTE_NORDESTE`, `CENTRO_SUL` e `BRASIL` (**todas as linhas**, mesmo critério do WASDE).
  - `CONAB.MILHO.BALANCO.<METRICA>`: estoque inicial e final, produção, importação, suprimento, consumo, exportação e
    demanda total (mil t), só do Brasil (aba `Suprimento`, bloco `MILHO`). A safra em projeção tem duas linhas (mês
    anterior e atual): vale a última.
- **Não extraído, de propósito:** a variação percentual (`VAR. %`, derivada dos dois valores ao lado), o `Estoque de
  Passagem` e os demais produtos da planilha. Célula em branco (produtividade onde a área é zero) é ignorada; **zero
  publicado é mantido**.
- **Leitura pelo texto, nunca pela posição:** o cabeçalho `REGIÃO/UF`, os blocos `ÁREA/PRODUTIVIDADE/PRODUÇÃO (Em <unidade>)`
  e as colunas do balanço são achados por texto. **A unidade esperada de cada bloco é conferida**: se a Conab mudar,
  o levantamento falha em vez de gravar um número na unidade errada.
- **Ordem de carga (a mesma armadilha do WASDE):** a coleta diária lê só o levantamento mais recente; se gravasse uma
  série antes do backfill, os levantamentos antigos não entrariam mais (append-only). Por isso a diária **se recusa a
  gravar séries sem carga histórica** e manda rodar `npm run backfill:conab-milho`. A lógica foi extraída para
  `collectors/base/persist-observations.js::persistirPorEdicao` (com as duas travas: ordem de carga e reingestão); o
  WASDE mantém a cópia própria, sem mudança.
- **Tela** (Observáveis), dois cards, no modelo dos do WASDE: **"Milho por safra e UF (Conab)"** (checkboxes de Região/UF
  e seletor de métrica × tipo de safra, 12 campos; vêm marcados Brasil, MT, PR, GO e MS, só exibição; destaque = Brasil;
  o Brasil e as macrorregiões ficam etiquetados "agregado") e **"Milho - balanço nacional (Conab)"** (8 métricas, só
  Brasil). Para isso a dimensão "região" do serviço foi generalizada (`porRegiao.descritor`: `wasde` ou `conab`); o
  WASDE não mudou.

## Resultado (banco de dev, 2026-09-21)

| Item | Resultado |
|---|---|
| Layout | As **15 planilhas** do índice (fev/2025 a set/2026, safras 2024/25 e 2025/26) foram lidas sem erro: 0 inválidos, mês da nota = mês do balanço = mês da publicação |
| Backfill (`npm run backfill:conab-milho`, ~45 s) | 15 levantamentos, **1.227 valores criados, 2.209 revisões, 9.022 iguais ao anterior, 0 falhas** |
| Total gravado | 3.436 linhas, **397 séries**, `published_at` de 2025-02-13 a 2026-09-15, **0 estimadas**, até 10 revisões por valor |
| Coleta diária (`npm run collect -- --coletor=conab`) | 1 levantamento lido, **0 criados, 0 atualizados, 830 ignorados**: idempotente |
| Vintage real | Produção total do Brasil, safra 2025/26 (mil t), por levantamento: 138.603,8 (14/10/2025) → 138.836,9 → 138.879,0 → 138.448,2 → 138.270,3 → 139.571,9 → 140.171,3 → 140.462,8 → 141.728,9 → 142.955,0 → **144.009,6** (15/09/2026): 11 versões |
| Conferência interna | Produção do Brasil na aba `Milho Total` (144.009,6) = produção do balanço na aba `Suprimento` (144.009,6); 2ª safra 2025/26 = 112.130,8 mil t; estoque final 2025/26 = 15.654,0 mil t |

## Consequências e riscos

- **Vintage de fev/2025 em diante.** O índice da Conab só mantém 15 levantamentos, com lacunas (falta o 4º da safra
  2025/26 e vários da 2024/25). Antes disso não há vintage; o histórico longo (séries desde 1976/77, sem vintage) e os
  preços seguem fora (ADR 0016).
- **`published_at` das safras antigas é um limite superior.** Cada levantamento traz a safra corrente, a anterior e (no
  balanço) safras mais velhas já consolidadas. O valor de uma safra antiga entra com o `published_at` do primeiro
  levantamento que o FinMind leu, não com a data em que o mercado o soube. É **conservador** (o dado aparece depois,
  nunca antes: consulta "as of" anterior a fev/2025 devolve vazio), mas não é a data original.
- **A planilha baixada é a versão atual de cada levantamento.** Várias páginas foram "atualizadas" meses depois de
  publicadas. Uma correção posterior pode já estar nos valores, com o `published_at` da publicação original (um
  pequeno viés de antecipação). A data de atualização da página vai no `metadata.paginaAtualizadaEm` para medir isso.
- **Republicação com correção do mesmo levantamento mantém a 1ª versão gravada** (o modelo append-only não guarda
  duas versões no mesmo `published_at`), como no WASDE.
- **Sem API nem dicionário de dados:** se a Conab mudar a URL, o nome do arquivo, uma aba ou uma unidade, o coletor
  falha com mensagem clara (não grava errado). Tratar como fonte frágil.
- **Não confirmados:** licença dos XLSX (a página de preços cita "sem derivações"; uso atual: interno), limite de
  uso do site (o backfill fez ~30 requisições com pausa de 1 s, sem problema) e quantos levantamentos antigos o índice
  manterá no futuro.
- **Servidor:** o backfill **já foi executado no servidor** (2026-09-21, informado pelo usuário; o log mostra 15
  levantamentos lidos, 1.227 criados, 2.209 revisões, 9.022 iguais e 0 falhas, em 88 s contra ~45 s no ambiente de
  desenvolvimento). Ou seja, o site da Conab **é acessível a partir do servidor**. Um sucesso não prova estabilidade: o
  AgroMind documenta que o site da Conab pode ficar instável e, por isso, o conector de conhecimento (texto do boletim)
  de lá tem a Agência Gov como reserva; o coletor deste ADR não tem reserva (e não deve usar IA para o dado). A coleta
  diária repete o download 3 vezes por dia (~1 MB), e uma falha aparece em `collection_execution` (tela
  `/dados-mercado/execucoes`). Em qualquer banco novo, o backfill vem antes da coleta diária. Sem variável de ambiente
  nova; a dependência `xlsx` já existia (WASDE).
