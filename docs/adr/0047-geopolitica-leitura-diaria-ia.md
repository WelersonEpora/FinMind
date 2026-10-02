# 0047 — Geopolítica do ouro e do petróleo: leitura diária por IA com busca na web

**Status:** aceita (2026-10-01). Em dev e no servidor desde 2026-10-02 (1ª leitura no servidor: success, 38 s, 0 falhas).
**Estendida pelo ADR 0049 (2026-10-02):** o mesmo coletor passou a ler eventos de mercado de quatro ativos (ouro,
petróleo, milho e café) em sete tipos, dos quais a geopolítica é um. Mudaram a lista de fontes (sai o World Gold Council,
entram USTR, Casa Branca, MOFCOM, Comissão Europeia, MAPA, USDA FAS e INMET), a regra de aceite (a página da fonte tem
de estar ligada ao texto do evento; a citação não basta), o fim da cobertura mínima por site e o formato da resposta.
O que segue descreve a decisão original; onde divergir, vale o ADR 0049.

## Contexto

O FEL 1 tem um fator de geopolítica de peso Alto no ouro ("geopolítica e risco sistêmico") e no petróleo
("geopolítica e conflitos"). Eram os 2 únicos fatores sem nenhum dado (`STATUS_DO_PROJETO.md`, §1): são eventos, não
séries numéricas.

**Autorização:** o usuário (Welerson) autorizou em 2026-10-01, depois de discutir a arquitetura nesta mesma data, uma
leitura diária de geopolítica **só para o ouro e o petróleo**, com as fontes listadas abaixo. É uma demanda específica do
usuário para um fator do FEL 1, como exige a regra da aquisição encerrada. **Limite:** aquisição de contexto. A leitura
não é regra, nem sinal, nem cálculo de fator: o peso dela na análise é da IA do ativo e das regras do David e do Comitê.
Não é precedente para outra fonte nem para outro uso de IA.

**Revisão das fontes (2026-10-02, autorizada pelo usuário):** depois de um teste de 14 sites com a própria pesquisa do
Gemini (§4), o usuário autorizou trocar a lista por uma **lista única** de 5 sites confiáveis para os dois ativos:
UKMTO/JMIC, Tesouro dos EUA (`treasury.gov`, que inclui a OFAC), OPEP, **AP News** (nova) e World Gold Council. Sai a
Reuters. Mesmo limite da autorização inicial.

O usuário descartou de propósito um sistema de gestão de eventos (identidade de evento entre dias, ciclo de vida,
fusão, cadeia de evidências, point-in-time por atualização). A pergunta é uma só, todo dia: "existe hoje alguma situação
geopolítica fora do normal que deva ser considerada na análise do ouro ou do petróleo?".

**Precedente:** o AgroMind passou pelo mesmo problema e chegou a este desenho nos ADRs 0025, 0026 e 0027 de lá. Primeiro
tentou duas chamadas (busca + estruturação em JSON) com um protocolo NOVO/ATUALIZAR/ENCERRAR. Abandonou porque o JSON
junto com a busca falhou de forma persistente (raciocínio vazando para dentro das strings, grounding desligado sem
erro). Ficou com uma chamada só, texto com rótulos fixos e parser determinístico, apagando e recriando o dia.

## Decisão

1. **Uma chamada diária ao Gemini com Google Search** (`ai/gemini-search.provider.js`, API REST, sem SDK), cobrindo os
   dois ativos: os fatos se sobrepõem (Oriente Médio, Rússia, sanções), custa metade e o nível dos dois sai coerente.
   **Duas chaves, como no AgroMind (ADR 0024 de lá):** a gratuita (`GEMINI_API_KEY_FREE`) é tentada primeiro; um 5xx
   repete até 3 vezes na mesma chave (esperas de 2 s e 5 s); a paga (`GEMINI_API_KEY`) só entra quando a gratuita
   esgota a cota (429) ou continua com 5xx. Outros erros (chave inválida, rede, timeout) não gastam a paga. A chave que
   respondeu fica gravada na leitura (`chave`: gratuita ou paga). Com uma só configurada, usa essa.
2. **Prompt versionado em arquivo** (`backend/src/ai/prompts/geopolitica-diaria.md`, `**Versão:**` gravada com cada
   resposta). A resposta é **texto com rótulos fixos**, sem saída estruturada: duas seções obrigatórias (OURO e
   PETRÓLEO), cada uma com `Nível` (NORMAL, ATENÇÃO, RELEVANTE, EXCEPCIONAL), `Resumo` e blocos `EVENTO N` (`Título`,
   `Resumo`, `Canal de transmissão`, `Pressão sobre o preço` (desde a v2), `Intensidade`, `Confiança`, `Fontes`).
3. **Parser determinístico** (`collectors/geopolitica/geopolitica-boletim.parser.js`): falta uma seção ou o nível está
   fora da escala, nada é gravado (item inválido, execução "failed") e uma leitura anterior do mesmo dia fica como
   estava.
4. **Sites confiáveis** (`collectors/geopolitica/fontes-autorizadas.js`), **uma lista para os dois ativos** desde
   2026-10-02 (prompt v5):

   | Site | Papel |
   |---|---|
   | UKMTO/JMIC (`ukmto.org`) | Incidentes marítimos: ataques, ameaças e desvios em Ormuz, Mar Vermelho, Bab el-Mandeb |
   | Tesouro dos EUA (`treasury.gov`: OFAC e comunicados) | Sanções a produtores, à frota, a reservas e a pagamentos |
   | OPEP (`opec.org`) | Decisões de produção da OPEP+ (raras, mas decisivas) |
   | AP News (`apnews.com`) | Escalada militar e ataques em terra: o que nenhuma instituição publica em tempo real |
   | World Gold Council (`gold.org`) | Interpretação: se o mercado de ouro precifica o risco (semanal, não é notícia) |

   O núcleo são fontes que só publicam quando algo acontece (um aviso do UKMTO já é uma anomalia), mais uma agência para
   a lacuna que nenhuma delas cobre. A lista é única porque o canal decide o ativo: um ataque em Ormuz (UKMTO) conta para
   o petróleo (rota) e para o ouro (risco, inflação via energia); com listas por ativo, o ouro ficou sem nenhuma fonte
   diária legível.

   **Teste de 2026-10-02** (pesquisa do Gemini restrita a cada site, publicações de 28/09 a 02/10): UKMTO (avisos
   143-26, 144-26 e 147-26), Tesouro (sanções ao Irã de 01/10) e AP (Oriente Médio todo dia) produziram fatos que mudam a
   leitura; a OPEP não publicou nada no período (não houve reunião); a **IEA** publicou conferência, podcast e comentário
   sobre minerais (fora do núcleo); **Fed, BCE, BIS e FMI** publicaram política monetária e regulação (outro fator, já
   coberto por FRED e FMI); o **State Dept.** aparece mal na pesquisa; a **Reuters não aparece** (nenhuma página do
   `reuters.com` nos resultados: paywall e bloqueio de robôs). CENTCOM e ONU (`press.un.org`) apareceram e às vezes
   trazem fato relevante: ficam como opcionais, a decidir olhando os rejeitados. Kitco fica de fora (opinião de analista).

   A API do Gemini (Developer API) não restringe a busca por domínio (a Vertex AI só exclui domínios). Por isso a lista
   orienta a busca pelo prompt (com `site:`) e passa por uma **dupla conferência** no parser: uma fonte só sustenta o
   evento se (a) for um site da lista (com URL, decide o domínio: a notícia republicada em outro site não conta; sem URL,
   ou com o redirecionamento do grounding do Google, decide o nome) **e** (b) esse site **apareceu nos resultados da
   pesquisa daquela chamada** (o título de cada resultado do grounding é o domínio). A conferência (b) entrou porque, no
   teste, a IA citou "Reuters" com a página inicial do site sem ter lido nenhuma página dele. O evento rejeitado é gravado
   (`aceito = false`, com o motivo) para a tela e vira aviso da execução, não falha.

   **Link direto (2026-10-02, pedido do usuário):** o grounding diz quais páginas a pesquisa leu (com um link de
   redirecionamento do Google, que expira) e quais trechos da resposta se apoiam em cada uma. Na coleta, o FinMind segue
   cada link e grava a URL final (`web.urlFinal` no grounding); depois, cada evento recebe como fontes (`origem:
   "pesquisa"`) as páginas de sites confiáveis que apoiam trechos do bloco dele - o aviso do UKMTO em PDF, o comunicado do
   Tesouro, a matéria da AP -, no lugar da citação da IA do mesmo site, que costuma vir sem URL ou com a página inicial
   (`collectors/geopolitica/paginas-da-pesquisa.js`). O AgroMind não faz esse cruzamento (ADR 0027 de lá, por achar
   frágil); aqui ele só acrescenta: sem correspondência, fica a fonte citada pela IA (`origem: "citada"`). Na leitura de
   2026-10-02, os 6 eventos saíram com link direto.

   **Só os sites confiáveis (prompt v3, decisão do usuário em 2026-10-01):** o prompt manda usar SOMENTE as notícias dos
   sites da lista; um fato achado só em outro site não é relatado e outros sites não são citados. Até a v2, o prompt
   dizia que material de fora podia complementar. Como a busca não é travável, a conferência no parser continua sendo a
   garantia; uma fonte de fora que ainda apareça num evento aceito fica marcada "fora da lista" na tela e não vai ao
   Motor (o bloco do Motor só lista as fontes confiáveis). A tela Eventos explica esse fluxo na seção "Fonte e
   metodologia" (mesmo formato do detalhe de um observável), com a lista vinda do mesmo catálogo do prompt e do parser.
5. **Persistência simples** (escopo GLOBAL, ADR 0007): `geopolitica_leitura` (uma por dia: nível e resumo de cada ativo,
   resposta bruta, instrução do sistema e prompt como foram enviados, versão, modelo, tokens e grounding) e
   `geopolitica_evento` (por ativo, com as fontes e se foi aceito). Reexecutar o dia **apaga e recria** a leitura numa
   transação. A instrução do sistema é gravada por leitura (não só a versão) para a auditoria mostrar exatamente o que foi
   enviado: na tela Eventos, cada evento abre o modal "Prompt e resposta da IA" (`GET /api/v1/geopolitica/leituras/:id/ia`),
   o mesmo para todos os eventos do dia, porque uma chamada gera todos eles.
6. **Coletor comum** (`geopolitica-ia-diario`), no pipeline e no cron de sempre (`npm run collect`, execução em
   `collection_execution`). Só é registrado com ao menos uma chave do Gemini. A data de referência é o dia em São Paulo.
7. **Entrega ao Motor:** `geopolitica.service.js::obterGeopoliticaDoDia(ativo, data)` devolve o bloco
   "GEOPOLÍTICA — OURO/PETRÓLEO" (nível, resumo, eventos aceitos com canal e fontes autorizadas). **Sem leitura na data,
   o bloco diz "indisponível", nunca "normal"**: uma coleta que falhou não pode virar um sinal de calmaria. A leitura de
   ontem não substitui a de hoje.

## Sem pesquisa, sem leitura

**Achado de 2026-10-02:** entre 12h27 e 12h31 (horário de Brasília), o Gemini respondeu **sem pesquisar** e sem erro:
nenhuma página no grounding, e nível, resumo e eventos escritos de memória, citando AP, UKMTO e Tesouro. Aconteceu na 1ª
leitura do servidor e em duas do dev; as chamadas seguintes pesquisaram normalmente (5 a 7 buscas cada). A dupla
conferência rejeitou todos os eventos, mas o **nível e o resumo** teriam ido ao Motor como uma leitura válida.

**Decisão (usuário, 2026-10-02):** uma resposta sem nenhuma página lida no grounding **não é leitura**. O download tenta
mais uma vez; se de novo vier sem pesquisa, falha (`UpstreamServiceError`): nada é gravado, a execução fica "failed" e
uma leitura anterior do mesmo dia continua valendo. Sem leitura no dia, o Motor recebe "leitura indisponível". Não existe
opção para desligar a "memória" do modelo: o prompt proíbe usá-la, mas a garantia é a conferência pelo grounding.

A variação no número de eventos entre execuções do mesmo dia (5, 3) é outra coisa: o julgamento da IA sobre o que é
relevante não é determinístico; a conferência garante que cada evento aceito foi lido numa fonte confiável.

## Uma leitura por dia

**Decisão (usuário, 2026-10-02):** o cron roda a coleta 3 vezes por madrugada (01h, 03h e 05h em Brasília, ADR 0004).
Vale a **primeira leitura que der certo**: se já existe leitura do dia, a execução pula a chamada à IA (sem custo) e fica
como "ignorado" (`registrosIgnorados: 1`, status `success`). As execuções seguintes só servem de nova tentativa quando a
anterior falhou (por exemplo, a IA sem pesquisar). Antes, cada execução chamava a IA de novo e substituía a leitura: 3
chamadas pagas por dia e uma leitura que mudava ao longo da madrugada.

Para trocar a leitura do dia por uma nova, só manualmente: `GEOPOLITICA_REFAZER=1 npm run collect --
--coletor=geopolitica` (variável no comando, não no `.env`). A coleta manual pela tela de Execuções segue a regra de
pular. A tela Eventos mostra o comando em "Fonte e metodologia".

## Assunto e tipo do evento (prompt v6)

**Decisão do usuário (2026-10-02):** cada evento tem um **assunto** e um **tipo**.

- **Assunto** é o fator: hoje só `GEOPOLITICA`, preenchido pelo coletor, nunca pela IA. Prepara outros assuntos no
  futuro (ex.: política comercial), que reaproveitam o **mecanismo** (coletor, parser, tabelas, tela, modal, dupla
  conferência), **cada um com o próprio prompt versionado e as próprias fontes** - não o mesmo prompt: um prompt único
  para vários assuntos dilui as instruções e mistura critérios de ativos e fontes diferentes. Cada assunto novo é uma
  fonte nova, com a autorização registrada no seu ADR. Na tela, a coluna e o filtro de assunto só aparecem quando houver
  mais de um assunto com evento.
- **Tipo** é a categoria dentro do assunto, escolhida pela IA numa lista fechada (rótulo `Tipo:`): conflito militar,
  rota marítima, infraestrutura, sanção, decisão de produção, diplomacia, outro. Um valor fora da lista vira `OUTRO`;
  sem o rótulo, fica vazio. Coluna e filtro na tela; o tipo também entra no bloco do Motor.

## Escala de níveis: provisória

A régua (o que é ATENÇÃO, RELEVANTE ou EXCEPCIONAL) e a definição de "fora do normal" estão no prompt como **rascunho**;
são interpretação e cabem ao David (CLAUDE.md, "Restrições permanentes"). O bloco entregue ao Motor diz que a escala é
provisória. Quando o David definir a régua, ela entra no prompt numa versão nova.

## Pressão sobre o preço (prompt v2)

**Decisão do usuário (2026-10-01):** cada evento traz a **pressão do fato sobre o preço** do ativo: alta, baixa ou
ambígua. É para que lado o fato, **sozinho e com o resto constante**, empurra o preço pelo canal de transmissão.
**Não é tendência nem previsão do preço:** o preço depende de juros, dólar e dos demais fatores, que a IA da busca não
vê (em 2026-10-01 a tensão no Oriente Médio estava alta e o ouro caía pelos juros). "Ambígua" é resposta válida (o
mesmo conflito pode aumentar a busca por proteção e fortalecer o dólar). O nome "pressão", e não "tendência", foi
escolhido por isso; o critério é o mesmo do AgroMind ("raciocínio econômico do próprio fato, nunca previsão").

A pressão vai ao Motor dita como **leitura da IA sobre o fato isolado** ("Pressão do fato sobre o preço: alta
(leitura da IA, com o resto constante)"), e quem a pesa junto com os outros fatores é o prompt do ativo. Continua
valendo o limite da autorização: é contexto, não sinal nem regra. Na tela, é a coluna "Pressão" (seta). Leituras do
prompt v1 ficam sem o dado.

## Limitações aceitas

- **Não é reproduzível nem point-in-time** (ADR 0008): a busca ao vivo lê a internet do dia. A leitura só vale da
  primeira coleta em diante e **não serve para backtest** (o mesmo já registrado para eventos na §4 do status, e no
  ADR 0010 para notícias).
- As URLs citadas não são abertas pelo FinMind; a conferência é só do domínio (como no AgroMind).
- Intensidade e confiança são autodeclaradas pela IA.
- Um site primário mal indexado (o `ukmto.org` bloqueia robôs) tende a aparecer pela Reuters citando-o.
- Custo: uma chamada por dia, de 30 s a 2 min (medido no AgroMind); `tentativasRetry: 2`.

## Alternativas consideradas

- **Sistema de eventos com identidade, evidências e avaliações append-only:** descartado pelo usuário (excesso de
  engenharia para a pergunta do dia).
- **Saída em JSON junto com a busca:** falhou no AgroMind (ADR 0026 de lá).
- **Duas chamadas (uma por ativo):** o dobro do custo, sem ganho; reavaliar só se uma seção vier sempre fraca.
- **AI-GPR (Iacoviello e Tong) como fonte:** é uma série numérica em CSV (diária, desde 1960, com Oil Threats e Oil
  Acts), não publicações para a busca; chega com semanas de atraso. Se for coletado, seria um coletor comum em
  `observation`, num ADR próprio. Fora deste escopo.
- **WGC como universo de busca diária:** publica uma vez por semana (Weekly Markets Monitor). Entra na lista do ouro
  como confirmação semanal, não como fonte do dia.

## Consequências

- Primeira integração real com IA no FinMind (`backend/src/ai/README.md` atualizado). A IA não decide nada: a leitura é
  contexto, e nenhuma resposta dispara ação.
- Variáveis novas: `GEMINI_API_KEY_FREE` e `GEMINI_API_KEY` (ao menos uma, para registrar o coletor), `GEMINI_MODEL` (padrão
  `gemini-flash-latest`) e `GEMINI_TIMEOUT_MS` (padrão 180000).
- Tela "Eventos" (`/dados-mercado/eventos`, só leitura, `GET /api/v1/geopolitica/eventos` e `/leituras/ultima`): no topo, a última leitura (nível e resumo de cada ativo; desde 2026-10-02 no Centro de Decisão, ADR 0048); abaixo, os eventos expandíveis no estilo da tela do AgroMind, só com os aceitos por padrão (os rejeitados, com o filtro).
