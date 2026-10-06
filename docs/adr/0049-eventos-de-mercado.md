# 0049 — Eventos de mercado: a leitura de geopolítica estendida a quatro ativos e sete tipos

**Status:** aceita (2026-10-02). Em dev desde 2026-10-02 (prompt v12, duas chamadas por dia: a última leitura real,
success, 0 falhas, 0 avisos). No servidor desde 2026-10-02 (a migration rodou no deploy; a leitura do dia foi refeita com duas chamadas: success, 56 s,
0 falhas).

## Contexto

A leitura diária de geopolítica (ADR 0047) cobria só o ouro e o petróleo. Numa análise de 2026-10-02, feita a pedido
do usuário, sobre os 16 fatores do milho e do café no FEL 1, a pergunta foi: existe informação externa, relevante para o
preço, que os observáveis do FinMind NÃO captam? A resposta foi "poucas, e quase todas do mesmo tipo": anúncios que o
mercado precifica no dia e que os dados só mostram semanas ou meses depois. São eles: tarifa, embargo e abertura de
mercado (o fator 8 do milho pede "tarifas" pelo nome); geada no café (o FEL 1 pede "alertas e relatórios de geada");
rota marítima bloqueada; guerra num corredor exportador; regulação de importação (a EUDR, que atinge o café, vale a
partir de 2026-12-30). Produção, exportação, estoque, preço e relatórios periódicos ficaram de fora: já são observáveis.

**Autorização:** o usuário (Welerson) autorizou em 2026-10-02 estender o coletor de geopolítica existente, com as fontes
abaixo, depois de ver a lista proposta e o teste de acesso. É uma demanda específica do usuário para fatores do FEL 1,
como exige a regra da aquisição encerrada (`STATUS_DO_PROJETO.md`, §1). **Limite:** aquisição de contexto. O evento não
é regra, nem sinal, nem cálculo de fator: o peso dele na análise é da IA do ativo e das regras do David e do Comitê. Não
é precedente para outra fonte nem para outro uso de IA.

## Decisão

1. **Evento é a entidade genérica; a geopolítica é um tipo.** EVENTO = fato externo relevante para o preço e que ainda
   não está adequadamente capturado pelos observáveis. Sete tipos iniciais (`shared/eventos-mercado.js`):
   `GEOPOLITICA`, `POLITICA_COMERCIAL`, `CLIMA_EXTREMO`, `REGULACAO`, `CHOQUE_LOGISTICO`, `SANIDADE` e
   `POLITICA_OFERTA` (decisões da OPEP+ e cortes ou aumentos extraordinários de produção; não é classificada como
   geopolítica só para evitar um tipo novo).
2. **Quatro ativos:** OURO, PETROLEO, MILHO e CAFE. Um evento pode afetar vários; a IA decide os ativos pelo **canal de
   transmissão, não pela fonte** (ataque no Mar Vermelho: petróleo, ouro e café; tarifa chinesa sobre o milho: milho;
   geada severa: café).
3. **Fator:** para cada ativo afetado, um dos **34 fatores do FEL 1** (`shared/fatores-fel1.js`, a lista da planilha
   `controle_fatores.xlsx`, com um código estável por fator) ou `NAO_SE_APLICA`. Não há classificação paralela, e o
   parser só aceita um fator do próprio ativo. Fator novo entra primeiro na planilha (David e Comitê).
4. **Observável não é evento.** O prompt diz explicitamente que preço, produção, área, exportação, estoque, previsão do
   tempo comum, relatórios periódicos (WASDE, Conab, Crop Progress, COT, EIA, Grain Stocks) e análise de mercado não
   são eventos, e que a IA deve ser conservadora: na dúvida, não é evento, e um dia sem eventos é normal.
5. **Mesmo coletor, mesma chamada, mesmas tabelas.** `geopolitica-ia-diario` continua sendo o único coletor, com uma
   chamada por dia ao Gemini. As tabelas `geopolitica_leitura` e `geopolitica_evento` mantêm o nome da origem (renomear
   só mexeria no que funciona). A migration `20261002120000-eventos-de-mercado` só acrescenta o que faltava:
   - nível e resumo do milho e do café na leitura (nulos nas leituras anteriores);
   - o ativo aceita MILHO e CAFE;
   - o `tipo` passa aos sete tipos;
   - a coluna `fator`;
   - sai o `assunto`, que era sempre GEOPOLITICA e agora repetiria o tipo.

   Os eventos que já existiam foram mapeados: os subtipos da geopolítica (conflito militar, rota marítima/ataque a
   navio, infraestrutura, sanção, diplomacia e outro) viram `GEOPOLITICA`; decisão de produção vira `POLITICA_OFERTA`.
   O fator deles fica nulo (a IA não os classificou). Sem pipeline paralelo e sem tabela nova.
6. **Formato da resposta (prompt v7):** as quatro seções de ativo (nível e resumo) e uma lista única de eventos, cada um
   com título, tipo, ativos, fator por ativo, resumo, canal de transmissão, pressão por ativo, intensidade, confiança e
   fontes. O parser grava **uma linha por (evento, ativo afetado)**, com as mesmas fontes e o mesmo aceite. Um evento sem
   ativo reconhecível é descartado com aviso; um tipo fora da lista fica nulo, com aviso.
7. **A lista de fontes não é checklist.** Sai a "cobertura mínima" (uma busca em cada site) do prompt v4: a IA pesquisa
   onde um evento relevante pode ter sido publicado. Continua **uma chamada**. Só passa a duas se houver evidência
   concreta de que a lista grande prejudica a cobertura ou a qualidade. Para medir isso, a execução registra agora quais
   fontes autorizadas a pesquisa leu (`fontesLidas`, no bloco "IA" da tela Execuções).
8. **Piso por ativo (prompt v8, decisão do usuário em 2026-10-02):** antes de declarar um ativo NORMAL, a IA faz ao
   menos uma busca numa fonte daquele ativo, à escolha dela. No milho e no café, essa fonte tem de ser de política
   comercial ou regulação (o INMET sozinho não basta). O resumo de um ativo NORMAL diz onde ela pesquisou. Não é
   checklist de fontes: é um mínimo por ativo. O coletor confere o piso pelas fontes lidas e, se faltar, registra um
   aviso na execução (não rejeita a leitura nem reescreve o nível). Motivo: a 1ª leitura v7 declarou o milho NORMAL sem
   ter consultado nenhuma fonte do milho (4 buscas: AP, UKMTO e INMET). Uma busca direta nas seis fontes de agro, de
   30/09 a 02/10, confirmou que não houve evento naqueles dias: o resultado estava certo por coincidência, e o processo,
   errado.
9. **Ativo direto e indireto; canal e intensidade por ativo (prompt v9, decisão do usuário em 2026-10-02):** um ativo
   indireto (o ouro pela aversão a risco ou pela inflação via energia) só entra se o fato mudar o risco do sistema
   (escalada entre Estados, ameaça de fechar rota crítica, sanção ampla). O canal dele diz que o efeito é indireto e por
   quê, e a intensidade dele não passa da do ativo direto. Um incidente isolado e contido afeta só o ativo direto. O canal
   de transmissão e a intensidade passam a ser por ativo (como a pressão), cada linha gravada com os do seu ativo, sem
   migration. Motivo: na v8, o navio-tanque atingido em Ormuz (fogo contido, sem vítimas) entrou também no ouro, com o
   canal e a intensidade do petróleo.
10. **Mínimo do milho com o Mar Negro e UE com Comissão e Conselho (v9, autorizado pelo usuário em 2026-10-02):** uma
    busca aberta (sem restrição de site) de 25/09 a 02/10 achou, para o milho, o acordo EUA-China de tarifas (28-29/09;
    nas nossas fontes, mas antes da janela de 48 h), o ataque a Odessa e a trégua no Mar Negro (na AP, que a v8 não
    pesquisou) e a posição do Conselho da UE sobre resíduos de pesticidas nas importações (30/09; só em
    `consilium.europa.eu`, fora do escopo, que era só `ec.europa.eu`). Para o café, nada extraordinário. O mínimo do
    milho passa a exigir também uma busca na AP sobre o Mar Negro, e a fonte da UE passa a cobrir a Comissão e o Conselho
    (o código `COMISSAO_EUROPEIA` ficou, para não quebrar as fontes gravadas).
11. **As fontes lidas vêm do código, nunca da IA (prompt v10):** a v8 pedia que o resumo de um ativo NORMAL dissesse
    onde a IA pesquisou; em duas leituras v9 ela listou fontes que não pesquisou. A v10 proíbe listar fontes no resumo,
    e o bloco do Motor e o card do Centro de Decisão trazem as fontes autorizadas de fato lidas, calculadas do grounding
    gravado.
12. **Duas chamadas, uma por frente (prompt v11, decisão do usuário em 2026-10-02):** ouro e petróleo numa chamada,
    milho e café na outra, em paralelo, no mesmo coletor e na mesma leitura do dia. Revoga o "continua uma chamada" do
    item 7: a evidência pedida ali apareceu (abaixo). Cada chamada decide o nível dos seus ativos e só lista eventos
    deles; um fato que afeta as duas frentes (o Mar Vermelho, para o petróleo e o café) aparece em cada uma, do ponto de
    vista dela. A instrução do sistema é a mesma; o prompt de cada chamada traz os ativos, o piso de cada um, só as
    fontes que os cobrem (a AP entra no milho só pelo Mar Negro, e o UKMTO no café só pelo Mar Vermelho), os fatores
    deles e as sugestões de busca deles. A conferência de cada evento e o piso usam o grounding da própria chamada. A
    leitura grava as duas respostas e os dois prompts (com o nome da frente) e um grounding só, com a frente marcada em
    cada página; as fontes lidas de um ativo (Motor e Centro de Decisão) são as da chamada dele. Se uma chamada falhar,
    nada é gravado (a leitura do dia é uma só).
13. **Piso do ouro na AP ou no Tesouro (v12, decisão do usuário em 2026-10-02):** o ouro só é NORMAL depois de uma busca
    na AP News (escalada entre Estados) ou no Tesouro dos EUA (sanções); o UKMTO, que cobre o ouro só pela rota
    marítima, sozinho não basta. Temperatura: segue a padrão do Gemini (abaixo, a temperatura 0 não reduziu a variação).
14. **Repetição pelo piso (decisão do usuário em 2026-10-02):** se uma chamada declarar um ativo NORMAL sem cumprir o
    piso (conferido pelas páginas lidas, depois de resolvidos os links), só aquela chamada é repetida, uma vez, e fica a
    resposta com menos exigências faltando (no empate, a primeira). Se a repetição falhar, fica a primeira. Os tokens
    da resposta descartada entram na conta da execução (`tokens`), e o detalhe registra quantas chamadas repetiram
    (`repeticoesPeloPiso`, na tela Execuções). Se mesmo assim faltar o piso, o aviso continua. O teto de tempo da
    execução passou a quatro chamadas longas em sequência.
15. **Só uma publicação específica sustenta um fato (2026-10-02, pedido do usuário):** página inicial, página de autor,
    de tag, de tópico, de categoria, de busca ou listagem de notícias e comunicados (`.../press-releases`,
    `.../press-releases/2026`, `.../news/`, `index.html`, `ultimas-noticias`) não é página "pesquisa" do evento, mesmo
    sendo de fonte autorizada e ligada ao texto pelo grounding (`fontes-autorizadas.js::paginaEspecifica`). Motivo: no
    evento do reforço militar dos EUA, a pesquisa ligou ao texto a página do autor na AP (`apnews.com/author/...`), ao
    lado das duas matérias. Essas páginas continuam contando como fonte lida para o piso: mostram que a fonte foi
    consultada.

## Fontes autorizadas

Cada fonte é cadastrada (`collectors/geopolitica/fontes-autorizadas.js`) com o domínio e, quando o domínio é
compartilhado, o caminho da instituição, os tipos de evento que ela costuma trazer e os ativos que costuma cobrir. Os
tipos e os ativos orientam a busca no prompt; não limitam o que a fonte pode sustentar.

**Teste de acesso (2026-10-02):** uma chamada ao Gemini com busca por candidata, restrita ao site, pedindo publicações
de 2026-09-20 a 2026-10-02, e contadas as páginas daquele site que a pesquisa de fato leu (pela URL final). Em 5 sites
a 1ª tentativa veio com **0 buscas**: o modelo respondeu "nada encontrado" sem pesquisar, o defeito que o coletor já
trata com nova tentativa. Repetidas exigindo a busca, todas as candidatas se mostraram acessíveis. Todas as chamadas do
teste usaram a chave paga (a gratuita estava sem cota).

| Fonte | Escopo | Tipos | Ativos | Teste | Decisão |
|---|---|---|---|---|---|
| UKMTO / JMIC | `ukmto.org` | Geopolítica, choque logístico | Petróleo, ouro, café | ADR 0047 | Mantida |
| Tesouro dos EUA (OFAC) | `treasury.gov` | Geopolítica | Petróleo, ouro | ADR 0047 | Mantida |
| OPEP | `opec.org` | Política de oferta | Petróleo | ADR 0047 | Mantida |
| AP News | `apnews.com` | Geopolítica (inclusive a guerra no Mar Negro) | Ouro, petróleo, milho | 13 páginas; nenhuma sobre os temas agrícolas | Mantida, só para geopolítica |
| USTR | `ustr.gov` | Política comercial | Milho, café | 11 páginas | Nova |
| Casa Branca (atos presidenciais) | `whitehouse.gov` | Política comercial, regulação, geopolítica | Milho, café, petróleo | 9 páginas, inclusive a ordem que isentou o café do Brasil da tarifa | Nova |
| MOFCOM (Ministério do Comércio da China) | `mofcom.gov.cn` | Política comercial | Milho | 5 páginas | Nova |
| Comissão Europeia | `ec.europa.eu` | Regulação, política comercial | Café, milho | 15 páginas (EUDR, UE-Mercosul) | Nova |
| MAPA | `gov.br/agricultura` | Política comercial, sanidade, regulação | Milho, café | 10 páginas; achou a abertura do mercado da Argélia ao DDG de milho (29/09) | Nova |
| USDA FAS (relatórios GAIN) | `fas.usda.gov` | Política comercial, sanidade, regulação | Milho, café | 7 páginas | Nova (a única via legível para medidas do México e de outros países; o prompt exclui os relatórios de dados) |
| INMET | `inmet.gov.br` (inclui `avisos.` e `portal.`) | Clima extremo | Café, milho | 11 páginas, com os avisos um a um | Nova (só geada e onda de frio nas regiões do café e da safrinha; os avisos de chuva são rotina) |
| World Gold Council | `gold.org` | — | — | — | **Removida**: é análise, não fato; os fluxos de ETF já são observável (ADR 0037) |

**Fora do MVP ("talvez"):**
- MME/CNPE (`gov.br/mme`, achou a aprovação do CNPE para 32% de etanol na gasolina) e EPA (`epa.gov`): mandatos de
  etanol. O efeito no preço do milho só foi validado no volume.
- Conab (`gov.br/conab`): só serve na geada, e o INMET vem antes.
- MDIC (`gov.br/mdic`): o lado brasileiro de negociações cujo ato sai no USTR e na Casa Branca.

**Descartadas:**
- página de notícias do USDA (rotina; os acordos saem pelo USTR e pela Casa Branca);
- APHIS (quarentenas internas dos EUA);
- alfândega da China (GACC: documentos antigos; a abertura aparece antes no MAPA);
- SENASA (página da cigarrinha de 2024; o efeito chega pelo WASDE);
- Federal Register (republica dias depois o que a Casa Branca e o USTR publicam).

Fonte nova nesta lista só com autorização do usuário registrada aqui.

**2026-10-06:** o usuário autorizou nove fontes novas (CENTCOM, NOAA NHC, BSEE, Bolsa de Comercio de Rosario, governo da
Argentina, EPA, MME/CNPE, Canal do Panamá e NOAA CPC; a EPA e o MME saem do "talvez"), com o teste de acesso de cada uma,
no ADR 0092. Ele também muda o piso do petróleo e trata a repetição entre dias.

## Regra de validação da fonte

Um evento só é aceito quando:

1. uma página de fonte autorizada apareceu nos resultados da pesquisa desta chamada;
2. essa página pertence ao escopo da fonte, conferido pela **URL final** (domínio e, no `gov.br`, o caminho da
   instituição: `gov.br/agricultura` é o MAPA; `gov.br/conab` não é). O título que o Google devolve não serve: para
   MAPA, Conab, MDIC e MME ele é `www.gov.br`;
3. o grounding da pesquisa liga essa página a um trecho do texto **deste** evento (origem "pesquisa").

**A citação da IA não basta**, mesmo de fonte autorizada lida em outro ponto da pesquisa. Ela fica gravada para a tela
("só citada pela IA" ou "não lida na pesquisa"), mas não sustenta o evento. Antes (ADR 0047), bastava a fonte citada
ter aparecido em qualquer resultado da chamada. Nos 5 eventos aceitos até 2026-10-02, todos tinham a página ligada ao
evento: endurecer a regra não perdeu evento bom. O evento rejeitado é gravado (`aceito = false`, com o motivo), vira
aviso da execução e não vai ao Motor.

## Motor e telas

- O Motor recebe, por ativo (`geopolitica.service.js::obterGeopoliticaDoDia`), o bloco "EVENTOS DE MERCADO — <ATIVO>"
  com o nível, o resumo e os eventos aceitos. Cada evento vai com título, tipo, fator do FEL 1, resumo, canal de
  transmissão, pressão, intensidade, confiança e só as fontes que sustentam o evento. Leitura anterior a esta decisão,
  para o milho e o café, vale como "indisponível". Os eventos são uma camada complementar: não mudam nenhum observável.
- Tela Eventos: filtros por ativo (os quatro), tipo (os sete) e período; o detalhe mostra o fator. O Centro de Decisão
  (ADR 0048) passa a mostrar os eventos dos quatro ativos.

## Alternativas consideradas

- **Um coletor (ou uma chamada) por ativo ou por tipo:** dobraria o custo e quebraria o que um evento tem de comum
  entre ativos (o Mar Vermelho afeta três). Descartado; duas chamadas só com evidência (item 7).
- **Tabela nova de eventos de mercado:** o modelo atual já tinha leitura, eventos, fontes e aceite. Bastaram colunas.
- **Manter a cobertura mínima por site:** com 11 fontes, faria a IA gastar buscas para provar que pesquisou, em vez de
  procurar eventos.
- **Um "boletim de milho" e um "boletim de café":** seria quase todo repetição dos observáveis.

## Consequências

- Primeira leitura real (dev, 2026-10-02, prompt v7): 4 buscas, fontes lidas UKMTO, AP e INMET, 2 eventos aceitos (cada
  um no ouro e no petróleo, com o fator do FEL 1), milho e café NORMAL sem nenhuma fonte de comércio consultada (daí o
  item 8).
- Com o piso (dev, 2026-10-02, prompt v8): 10 buscas, 9 das 11 fontes lidas (só a AP e a OPEP ficaram de fora), 2
  eventos aceitos (o navio em Ormuz, no ouro e no petróleo; as sanções do Tesouro, no petróleo), milho e café NORMAL
  dizendo onde pesquisaram, 0 avisos. Continua uma chamada só.
- Com as v9 e v10 (dev, 2026-10-02, três leituras): o ouro deixou de entrar no incidente isolado de Ormuz (o evento ficou
  só no petróleo, canal direto). Mas o mínimo por ativo não se sustentou só pelo prompt: as leituras fizeram 2, 5 e 2
  buscas; em duas, nenhuma fonte de comércio do agro foi lida, e o resumo do milho afirmou ter verificado fontes que não
  pesquisou. A conferência do coletor pegou todos os casos (avisos na execução). Com a v8, que fez 10 buscas, são 4 de 5
  leituras com a cobertura do agro abaixo do mínimo: é a evidência de que a lista de 11 fontes numa chamada só prejudica
  a cobertura (item 7). Entre duas chamadas, repetir a chamada quando faltar o mínimo ou marcar o agro como "não
  verificado", o usuário escolheu duas chamadas (item 12).
- Com duas chamadas (dev, 2026-10-02, prompt v11, duas leituras): a chamada de milho e café leu 6 fontes nas duas (MAPA,
  AP sobre Odessa, USTR, União Europeia, INMET e UKMTO; na 2ª, sem a UE e o UKMTO no piso, mas com o piso cumprido), 0
  avisos; o resumo do milho passou a justificar o NORMAL pelo que foi lido (a abertura do MAPA para a Síria como rotina,
  nenhum ataque novo a portos no Mar Negro). O ouro entrou só na escalada (o terceiro porta-aviões dos EUA), como
  indireto e com intensidade baixa; o navio de Ormuz ficou só no petróleo. Custo: 24 a 33 mil tokens por dia, as duas
  chamadas somadas.
- **Diagnóstico de estabilidade (dev, 2026-10-02, v11, 10 leituras sem gravar: 5 com a temperatura padrão e 5 com
  temperatura 0):** o navio de Ormuz apareceu em 10 de 10 (a mesma página do UKMTO); a trégua no Mar Negro (milho), em 2
  de 10; nenhum evento rejeitado e nenhum aviso. Ouro NORMAL em 10 de 10, petróleo ATENÇÃO em 9 de 10, milho NORMAL em
  8 de 10, café NORMAL em 10 de 10. A temperatura 0 deu a mesma variação. A oscilação vista ao longo do dia veio sobretudo
  das seis versões do prompt numa tarde (a v6, da manhã, era bem mais permissiva), não do acaso. Achado: em 4 das 10, a
  chamada de ouro e petróleo leu só o UKMTO; daí o item 13.
- Com o piso do ouro (v12, 3 leituras sem gravar): a chamada de ouro e petróleo leu a AP nas 3, e o reforço militar dos EUA
  no Oriente Médio entrou nas 3 (ouro ATENÇÃO, como indireto; petróleo RELEVANTE nas 3). O ouro NORMAL de 10 de 10 do
  diagnóstico anterior era uma estabilidade falsa: em várias rodadas ninguém tinha lido as fontes de escalada. No agro, 2
  das 3 leituras ficaram abaixo do piso (avisos): somando as 13 leituras com duas chamadas, a adesão ao piso do agro
  ficou perto de 80%; daí o item 14.
- Com a repetição pelo piso (4 leituras sem gravar): 0 avisos nas 4; ouro e petróleo leram AP, Tesouro e UKMTO em 3 (na
  outra, UKMTO e AP); milho e café, de 4 a 7 fontes. O navio de Ormuz em 4 de 4. O envio de porta-aviões e tropas dos
  EUA entrou em 1 de 4 (4 de 7 contando as 3 leituras anteriores da v12), e o nível do ouro (ATENÇÃO ou NORMAL) segue
  esse fato. A variação que resta é de julgamento num caso de fronteira (escalada nova ou desdobramento?), com as
  mesmas fontes lidas, não de cobertura. Não foi resolvida no prompt de propósito: definir o que é "fora do normal" é a
  régua do David. Caminhos, se ele quiser estabilidade nesse tipo de fato: uma régua explícita (ex.: deslocamento
  militar sem ataque = ATENÇÃO) ou o FinMind baixar ele mesmo as publicações de cada fonte e deixar à IA só o
  julgamento. Custo: 17 a 32 mil tokens por leitura.
- O prompt continua no arquivo `geopolitica-diaria.md` (v7) e o coletor com o código `geopolitica-ia-diario`, para não
  quebrar o histórico das versões e das execuções.
- A escala de níveis e o que conta como evento seguem provisórios: a régua é do David.
