# 0051 — Prompt diário de análise do petróleo (leitura de tendência em quatro horizontes)

**Status:** aceita (2026-10-03). O prompt é gerado e mostrado; o envio à IA, com a leitura no Centro de Decisão, veio
no mesmo dia com o ADR 0052, depois da aprovação do David.

## Contexto

Os 10 fatores do petróleo têm proposta (ADR 0050): 8 calculados, cada um com um bloco de texto em quatro partes
(A — Medida, B — Leitura, C — Leitura do fator, D — Validação histórica), e 2 de evento (OPEP+ e geopolítica), com os
eventos da leitura diária numa janela. Faltava o prompt que junta tudo para a IA que interpreta os fatores.

O desenho de referência é o prompt do milho, em seis blocos (`STATUS_DO_PROJETO.md`, §5, "Exemplo: do fator à
recomendação da IA"). Uma análise das lacunas do petróleo (2026-10-03) mostrou o que não se transpõe: não há curva
futura do WTI na base (o futuro é pago; a EIA deixou de publicar a NYMEX em 2024-04, ADR 0040), e o WTI à vista da
EIA sai uma vez por semana.

**Decisões do usuário (Welerson, 2026-10-03), fechadas:**

- A IA produz **leitura de tendência**, não recomendação: nada de comprar, vender ou equivalente.
- **Quatro horizontes independentes:** imediato (1 dia), curto (7), médio (30) e longo (90). Sem síntese entre eles:
  leituras diferentes são válidas.
- Em cada horizonte: tendência (ALTA, BAIXA, LATERAL ou INSUFICIENTE), **faixa de magnitude** da metodologia (nunca um
  percentual livre), confiança (alta, média ou baixa, que não é magnitude), fatores a favor e contra, evidências,
  lacunas e a condição que invalida a leitura. A estrutura deve permitir, depois, comparar previsão e realizado
  (direção e faixa), sem score de desempenho agora.
- A base traz o histórico do WTI e a curva futura **quando houver fonte**, como precificação por vencimento, sem regra
  de formato (contango, backwardation), sem tratá-la como previsão e sem associar vencimento a horizonte.
- O peso é o do FEL 1; a validação histórica qualifica a confiança, nunca o peso.
- O COT não é um voto: confirma, indica excesso, risco de reversão ou enfraquece a leitura. Sem camada de correlação
  ou de dupla contagem entre fatores por enquanto (evolução futura).
- Conflito entre fatores: a IA explica as forças, sem contar votos nem criar pontuação.
- A IA não recalcula fatores, não inventa números nem fontes, não cria fatores, não altera pesos e não troca a regra
  do motor por interpretação própria.

## Decisão

1. **O prompt é um arquivo versionado**, `backend/src/ai/prompts/petroleo-analise-diaria.md` (versão 1), carregado pelo
   mesmo `ai/carregar-prompt.js` da leitura de eventos (ADR 0047): os blocos fixos (1. papel e objetivo, 4. como
   analisar, 5. limites, 6. formato da resposta em JSON) na instrução do sistema; os que variam por dia (2. base e 3.
   leitura do motor) no prompt, com placeholders. O texto fixo **não tem nenhum número da metodologia**: faixas e
   horizontes vêm da configuração (item 2). Um teste falha se a instrução trouxer um percentual.
2. **Configuração explícita**, `backend/src/shared/analise-diaria-petroleo.js` (versão 1): os horizontes, as faixas
   (T1 e T2 por horizonte), a referência dos horizontes, a série do preço, o tamanho do histórico, a curva (sem fonte)
   e a classificação de uma variação realizada numa faixa (só classifica, não pontua). Mudar um valor é versão nova,
   gravada em cada prompt.
3. **O serviço monta, não calcula**: `backend/src/services/prompt-diario.service.js` reaproveita os 10 fatores na data
   (`metodologia-ativo.service.js::simularFatores`, point-in-time) e o preço do Centro de Decisão
   (`centro-decisao.service.js::lerPreco`, com as variações de 1, 7, 30 e 90 dias, as mesmas janelas dos horizontes).
   Cada bloco de fator ganha uma linha de identificação: o **código** (o que a IA cita na resposta), o tipo no FEL 1, a
   situação da regra (proposta ou validada) e a versão do cálculo; nos de evento, o peso e a janela. O nome do FEL 1
   não entra no texto quando o título diz um dado mais estreito (ex.: a Guiana na oferta não-OPEP): fica na tela.
4. **Base**: 2.1 o WTI à vista (último preço, data de referência e de publicação, defasagem, variações dos quatro
   horizontes, mínimo e máximo de 90 dias e os últimos 10 pregões); 2.2 a curva futura (hoje `SEM DADO`); 2.3 a
   situação dos dados de cada fator, **só com fatos** (referência, publicação e se é estimada, idade, `SEM DADO`,
   `SEM LEITURA`); 2.4 os horizontes e as faixas.
5. **Auditoria**: a resposta do endpoint traz a versão do prompt, da metodologia e da configuração, o hash SHA-256 da
   entrada (instrução + prompt) e a entrada estruturada (preço de referência, horizontes e faixas, e por fator: tipo,
   situação da regra, cálculo e versão, parâmetros e origem, dados e leitura C). É o que o ADR 0010 pede para
   reconstituir "o que a IA recebeu". A gravação de cada execução vem junto com o envio à IA: sem envio, não há
   resposta a guardar.
6. **Endpoint e tela**: `GET /api/v1/ativos/:ativo/metodologia/prompt-diario?data=` (só o petróleo; outro ativo, 404;
   data futura, 400). Na Metodologia do Ativo, "Ver prompt completo" (com uma data simulada) mostra a instrução do
   sistema e o prompt do dia, com as versões, o hash e o botão Copiar. A simulação deixou de montar um texto próprio.

**Provisórios (a metodologia ajusta, sem mudar código além da configuração):**

- **Faixas:** T1 e T2 são os percentis 40 e 80 da variação absoluta do WTI à vista de 2010 a 2026 (banco de dev),
  arredondados, com a regra de variação do Centro de Decisão: 1 dia 1% e 2,5% (percentis 0,93 e 2,59); 7 dias 2% e
  6% (2,15 e 5,78); 30 dias 5% e 12% (5,00 e 12,00); 90 dias 8% e 20% (7,77 e 20,25). Cerca de 40% dos casos caem em
  LATERAL e 20% em FORTE, nos quatro horizontes: o mesmo critério dos limiares dos fatores.
- **Referência dos horizontes:** a data do último preço do WTI na base, porque a data da análise não tem preço (a EIA
  publica uma vez por semana). Consequência conhecida: quando o último preço tem vários dias, o horizonte de 1 dia já
  passou ao gerar o prompt. Uma fonte com atraso de ~1 dia (provavelmente a mesma da curva) resolve.
  **Substituída em 2026-10-03** (ADR 0052, adendo): os horizontes passaram a contar da data da análise.
- **Defasagem por fator:** não calculada. Os fatores misturam séries com tolerâncias diferentes (ex.: os juros, da meta
  do Fed com 4 dias ao CPI com 75) e o ponto semanal leva a data do fim da semana; criar uma tolerância por fator seria
  regra nova. A IA julga pela idade e pela periodicidade, que a tabela 2.3 dá.

## Consequências

- O prompt é auditável e reprodutível: a mesma data e a mesma base dão o mesmo hash.
- Funciona sem curva futura: o bloco 2.2 diz `SEM DADO` e a IA registra a lacuna (`CURVA_SEM_DADO`).
- Numa data antiga, os fatores de evento ficam `SEM LEITURA` (a leitura diária começa em 2026-10-02) e a oferta
  não-OPEP `SEM DADO` (o histórico do JODI tem a 1ª coleta como publicação, ADR 0042).
- **O envio à IA ficou bloqueado** pela restrição do `CLAUDE.md` e do ADR 0050 (as propostas de fator não alimentam
  a IA) até o ADR 0052, que o autorizou para o petróleo. Enviar exige uma decisão registrada (ex.: experimento registrado, fora do Centro de Decisão) e a gravação de
  cada execução (modelo, versão, hash, entrada e resposta), conforme o ADR 0010.

## Não implementado (de propósito)

Recomendação de compra ou venda; score geral; síntese entre horizontes; correlação ou dupla contagem entre fatores;
ajuste automático de pesos; leitura automática da curva (contango, backwardation); preço-alvo; vínculo entre vencimento
e horizonte; confiança, horizonte e interações por fator no motor; métrica de acerto; aprendizado automático das
faixas; tela de configuração do prompt.
