# 0001 — Fonte da cotação do dólar: API SGS do Banco Central

## Contexto

O FinMind ainda não tinha nenhum coletor real (ver
`docs/pendente-especialista-david.md`, item 2 — mercados e fontes de dados
seguem indefinidos). O usuário do projeto pediu explicitamente a primeira
integração real de dados: coleta, armazenamento e apresentação da cotação do
dólar, usando a arquitetura de coleta do AgroMind como referência. Esse
pedido é, na prática, a definição que faltava — mas só para este caso
específico (ativo = USD/BRL). Nenhum outro ativo, mercado ou fonte foi
decidido por este ADR.

## Decisão

Coletar USD/BRL pela **API SGS (Sistema Gerenciador de Séries Temporais) do
Banco Central do Brasil**, série **1** — confirmada por chamada real à API
(`GET https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/5?formato=json`)
e pela busca do nome oficial da série no Portal de Dados Abertos do BCB:
**"Taxa de câmbio - Livre - Dólar americano (venda) - diário"**.

Isso é o fechamento diário do câmbio livre (a "taxa PTAX" de venda,
calculada como média das taxas efetivas do mercado interbancário) — **não**
é uma cotação intradiária/tempo real. Um novo dia útil só aparece na série
depois do fechamento do câmbio, uma vez por dia. A API é pública, sem
autenticação/chave.

Não usamos IA (busca via LLM/web search) para obter esse valor: existe fonte
oficial estruturada e confiável, então buscar via IA seria adicionar risco
(alucinação, dado não verificável) sem necessidade — mesmo critério adotado
pelo AgroMind, que só usa IA como fallback para ativos sem fonte estruturada
confiável (ver levantamento no início desta conversa).

## Alternativas consideradas

- **Série 10813 (compra)** — descartada por ora; o modelo de dados já
  reserva um campo `modality` (`venda`/`compra`) para adicioná-la no futuro
  sem alterar o esquema (ver ADR 0003), mas não é coletada nesta etapa.
- **PTAX via API Olinda (`/odata/CotacaoDolarDia`)** — endpoint diferente
  do BCB, usado tipicamente para fins fiscais/contábeis; não escolhido por
  não ser necessário no momento e por a série SGS 1 já ser o padrão adotado
  pelo AgroMind para o mesmo propósito.
- **IA com busca na web (Gemini/Claude + web search)** — descartada para o
  dólar pela mesma razão do AgroMind: existe fonte oficial estruturada, e
  IA nunca deve ser responsável pela "verdade" de um dado quando uma API
  confiável já resolve o problema.

## Justificativa

- Fonte pública, oficial, gratuita, sem chave.
- Mesma série já usada e validada em produção pelo AgroMind para o mesmo
  propósito (cotação do dólar).
- Column `modality` no modelo de dados deixa a porta aberta para a série de
  compra (10813) sem retrabalho de schema.

## Consequências

- O endpoint `GET /api/v1/cotacoes/dolar` sempre retorna, explicitamente,
  `periodicidade: "diaria"` e `tempoReal: false`, e o frontend exibe essa
  informação junto ao valor — nunca like uma cotação ao vivo.
- Coleta roda no máximo uma vez por dia útil de forma útil (reexecuções no
  mesmo dia são idempotentes — ver ADR 0003).
- Nenhum outro ativo, mercado ou fonte fica desbloqueado por este ADR; os
  demais itens de `docs/pendente-especialista-david.md` continuam
  pendentes do especialista David.

## Atualização (2026-09-21) — carga histórica

Verificado por chamada real: a API do BCB responde **406** a um pedido com intervalo maior que 10 anos
(uma janela de exatamente 10 anos funciona), então `backfill-dolar.js`/`backfill-selic.js` dividem o
intervalo em janelas de até 10 anos (uma execução em `collection_execution` por janela) e usam um timeout
de 60 s por janela (o de 15 s da coleta diária estourou duas vezes numa lentidão passageira da API).
**Início recomendado: 01/07/1994** (Plano Real): a série começa em 28/11/1984, mas antes do Real está em
moedas antigas (a primeira linha vale 2828) e a unidade "BRL" só é verdadeira depois. Carga completa feita
no banco de dev: 8.088 linhas do dólar (1994-07-01 → 2026-09-21), 4 janelas, 0 falhas. Mesma convenção do
AgroMind (`docs/convencao-backfill.md`).

## Em aberto

- Se/quando adicionar a série de compra (10813) ou outra fonte cambial.
- Fontes/ativos além de USD/BRL continuam bloqueados até definição do
  especialista de mercado (David).
