# 0054 — Leitura diária de tendência do ouro pela IA, no Centro de Decisão

**Status:** aceita (2026-10-04).

## Contexto

Os 8 fatores do ouro têm proposta (ADR 0053), no molde do petróleo, mas o ADR 0053 deixou o prompt diário, a leitura
de tendência e o Centro de Decisão do ouro para depois da aprovação do David, como no petróleo (ADRs 0050 a 0052).
Ficaram cinco escolhas em aberto: o preço de referência do ouro no dia a dia (a LBMA fechou o feed em 2026-09-30,
ADR 0044, e o futuro GLD da B3 só existe desde 2025-07-21), a inflação (a relação do FEL 1 não aparece no histórico,
nem desde 1970), a leitura do COT (amplifica ou reversão) e a fonte e a comparação das compras dos bancos centrais.

**Autorização (Welerson, 2026-10-04):** em conversa em 2026-10-03, o **David deu o sinal verde para os fatores do ouro**
e concordou com as recomendações levadas a ele (as cinco escolhas abaixo). Com isso, o usuário autorizou a
implementação do ouro no molde do petróleo: o prompt diário, a coleta diária que o envia à IA e a leitura no Centro de
Decisão. O limite é o do ADR 0052: **só o ouro** (milho e café seguem como estão) e **leitura de tendência, não
recomendação**. No mesmo dia, o usuário pediu a janela de 7 dias na geopolítica do ouro, o mesmo ajuste feito no
petróleo (ADR 0050).

**As decisões do David (2026-10-03):**

1. **Preço de referência: o futuro GLD da B3**, o vencimento mais próximo negociado, sem emendar contratos (o critério
   do Centro de Decisão, ADR 0048). A LBMA fica só como histórico: é contra ela que os fatores foram validados (ADR 0053).
   O preço também em reais, pela PTAX de venda, só como referência.
2. **A inflação vira contexto do juro real.** O fator continua calculado e vai ao prompt (A, B e D), mas sem pressão
   própria: ele explica o juro real, por onde o efeito da inflação passa no histórico (-0,52), e não conta a favor nem
   contra.
3. **O COT segue a leitura do FEL 1 ("amplifica")**, a que o histórico favorece, e é tratado como **qualificador**, como no
   petróleo: confirma, indica excesso ou risco de reversão, ou enfraquece a leitura; não é um voto.
4. **Bancos centrais: o World Gold Council** (com a estimativa das compras não declaradas), com o FMI como contexto.
5. **Bancos centrais: contra o ritmo dos 3 anos anteriores**, não contra zero; o prompt diz as duas coisas (compras
   historicamente altas abaixo do ritmo recorde são desaceleração, não venda).

## Decisão

1. **A cadeia do petróleo virou genérica por ativo, sem mudar o petróleo.** O que era do petróleo passou a vir da
   configuração do ativo:
   - `shared/analise-diaria.js`: o registro dos ativos com leitura diária (`PETROLEO`, `OURO`) e a configuração de cada
     um; `shared/analise-diaria-base.js`: as faixas e a classificação do realizado, comuns aos dois;
   - a configuração do ativo (`analise-diaria-<ativo>.js`) ganhou o arquivo do prompt, o código do coletor e os textos
     do bloco de preço (nome, unidade, avisos da fonte, se há curva e se há o preço em reais);
   - `prompt-diario.service.js`, o coletor (`criarColetorAnaliseDiaria(ativo)`, um por ativo, os dois registrados por
     último), a validação (`shared/resposta-analise-diaria.js`, antes `-petroleo`) e `analise-diaria.service.js` leem a
     configuração do ativo.

   **Prova de que o petróleo não mudou:** o prompt do petróleo de duas datas (2026-10-03 e 2026-09-15), gerado com o
   banco de dev pelo código anterior e pelo novo sobre a mesma base, saiu idêntico byte a byte (instrução, prompt,
   entrada estruturada e hash).
2. **Configuração do ouro** (`shared/analise-diaria-ouro.js`, v1): os mesmos quatro horizontes do petróleo (1, 7, 30 e 90
   dias, contados da data da análise) e as faixas pelo mesmo critério (percentis 40 e 80 da variação absoluta), medidas
   no ouro da LBMA de 2010 a 2026-09-28 (4.196 pregões): 1 dia 0,4% e 1,2%; 7 dias 1% e 2,5%; 30 dias 2% e 6%; 90 dias
   4% e 10% (cerca de metade das do petróleo). A LBMA, e não o GLD, porque o GLD tem só 14 meses e liquida pela LBMA.
   **Provisórias**, como as do petróleo.
3. **Prompt do ouro** (`ai/prompts/ouro-analise-diaria.md`, v1), no molde do v2 do petróleo e com o mesmo formato de
   resposta. O que muda: analista de ouro; o bloco de preço com o contrato do GLD, o preço em reais e os avisos do
   futuro (fica ~0,8% acima do à vista; uma variação SEM DADO é falta de histórico do contrato); **sem curva futura**
   (o futuro do ouro é o à vista mais o carregamento e não traz expectativa de mercado: o bloco 2.2 diz que não se
   aplica e a falta dela não é lacuna); regras para o fator de contexto, para os bancos centrais (o ritmo, não zero) e
   para o COT (amplifica, como qualificador).
4. **Fator de contexto** (`contextoDe` em `shared/metodologia-base.js`): um fator do ativo pode ser contexto de outro. O
   texto dele no prompt (`factors/base/texto-prompt.js`) traz A, B e D como os outros, sem a regra da pressão, e em C só
   o papel e a tendência; a tabela 2.3 o marca como CONTEXTO; a entrada gravada leva `leitura: { papel: "CONTEXTO" }`;
   a validação **recusa** a resposta que o liste em `fatoresAFavor` ou `fatoresContra` (ele pode ser evidência ou pouco
   relevante). A camada C simulada continua na tela de metodologia, só como referência ao Comitê.
5. **Metodologia do ouro v2** (`shared/metodologia-ouro.js`, 2026-10-04): a inflação com `contextoDe: "OURO_JUROS_REAIS"`;
   as decisões registradas por fator (campo novo `decisoes`, mostrado na tela como "Decidido"), e as perguntas
   respondidas fora da lista de pendências (COT e bancos centrais ficam sem pendência); a geopolítica com a janela de 7
   dias. Os fatores seguem marcados como proposta no código até as respostas por escrito, como no petróleo.
6. **Motivos das respostas recusadas** no detalhe da execução (`detalhes.ia.motivosRecusa`, na tela Execuções), para
   os dois ativos: antes só a contagem ficava registrada.
7. **Centro de Decisão:** o ouro mostra a leitura do dia como o petróleo (ADR 0052), sem código de tela novo: o contrato
   do GLD aparece junto da série nas evidências e o fator de contexto aparece como "Contexto".

## Consequências

- O ouro tem a cadeia completa: coleta → fatores (A, B, C) → prompt → IA → leitura no Centro de Decisão. A primeira
  leitura (2026-10-04, em dev) foi gravada na segunda chamada (a primeira resposta foi recusada; os motivos não eram
  registrados ainda); refeita com o registro dos motivos, passou de primeira, com ~22 mil tokens. A inflação foi
  tratada como contexto e os bancos centrais, contra a média de 3 anos.
- Custo: mais uma chamada por dia (duas, se a primeira for recusada), ~20 a 35 mil tokens.
- **O horizonte de 90 dias fica muitas vezes sem a variação de 90 dias:** o GLD negocia pouco por vencimento (cada um
  tem semanas ou poucos meses de histórico) e nada é emendado. A IA vê `SEM DADO` e o registra; uma série contínua do
  GLD é um cálculo que continua com o David (ADR 0044).
- As faixas comparam a variação do vencimento mais próximo: na troca de vencimento, a comparação com o realizado mede
  contratos diferentes (diferença de carregamento, ~0,8% ao longo de meses). A comparação com o realizado não existe
  ainda; quando vier, isso entra nela.
- Os parâmetros dos fatores e as faixas continuam provisórios; cada mudança é versão nova, gravada com a leitura do dia.

## Não implementado (de propósito)

Recomendação de compra ou venda; síntese entre horizontes; série contínua do GLD; comparação com o realizado; leitura
retroativa; o milho e o café.
