# 0066 — Agregação determinística do café: famílias, peso por horizonte e score em código

**Status:** aceita (2026-10-05), **em produção** por decisão do usuário, a validar pelo Comitê. Os pesos e os limiares
são proposta do FinMind, não do David.

## Contexto

O Motor do Café v1 do David (ADR 0060) descarta os pesos fixos e a matriz do v0: "devem ser zerados e recalibrados sob
protocolo de simulação fora da amostra". Hoje a IA combina os 8 fatores sozinha, guiada pelas regras transversais do
estudo como texto no prompt (ADR 0062), sem fórmula. Isso não é auditável nem testável no histórico sem chamar a IA de
novo.

O estudo não tem peso, mas diz **em que prazo cada fator age** (o campo "Sazonalidade e Horizonte" de cada fator) e
**como os fatores se relacionam** (§5, regras transversais; §8, relações por par). O FEL 1 dá a magnitude de cada fator
(Alto, Médio, Baixo), e esse é o único peso aprovado no café.

**Decisão do usuário (Welerson, 2026-10-05):**

- montar a agregação em código a partir desses insumos, com a contraproposta do assistente (discutida na conversa de
  2026-10-05, depois de uma primeira proposta do usuário com sete famílias e outros pesos);
- **separar o que veio do David do que foi proposto para operacionalizar a metodologia**;
- não otimizar nenhum número no histórico;
- **levar a agregação à produção já** (decisão do mesmo dia, depois de ver os exemplos do histórico em dev): ela vai ao
  prompt diário do café e aparece no Centro de Decisão e na Qualidade da IA, ao lado da leitura da IA. A validação fica
  com o Comitê, depois, sobre os resultados em produção. Sem chave de liga e desliga.

**Limite:** só o café. O David e o Comitê podem rever tudo; uma decisão diferente vira versão nova da agregação ou do
prompt. A agregação em código é a etapa 5 do status, e este ADR é a primeira versão dela.

## Decisão

### Arquitetura

```
fatores (parte C de cada um, calculada pelo motor)
  -> score do fator
  -> score da família (a Oferta junta F1 + F2 + F3 por precedência e confirmação)
  -> peso da família no horizonte
  -> score agregado S, cobertura, conflito
  -> tendência, faixa e confiança (o F7 só modifica a confiança)
```

O código está em `backend/src/factors/agregacao/agregacao-cafe.js`. É uma função pura sobre o que
`metodologia-ativo.service.js::simularFatores` já devolve (point-in-time, os mesmos fatores da tela e do prompt). A
versão é a `cafe-agregacao-v1 (2026-10-05)`, situação `PROPOSTA`. O script `scripts/agregacao-cafe-historico.js` roda a
agregação em qualquer data ou intervalo, sem IA e sem gravar nada (`npm run agregacao:cafe`).

### Origem de cada regra

Três classes, registradas também no código (`ORIGEM_DAS_REGRAS`):

- **DAVID**: insumo do estudo (Motor do Café v1, 2026-10-04) ou do FEL 1, sem mudança.
- **DERIVADA**: regra tirada diretamente do estudo, na forma operacional do FinMind.
- **PROPOSTA**: parâmetro introduzido por esta proposta. **Não foi definido pelo David e não foi validado.**

| Regra | Origem | De onde |
|---|---|---|
| Horizonte de cada fator (tabela abaixo) | DAVID | "Sazonalidade e Horizonte" de cada fator no estudo |
| Magnitude de cada fator: Alto, Médio, Baixo | DAVID | FEL 1 |
| F7 sem voto, só modificador de risco | DAVID | §5 e o F7: "sem voto fundamental independente" |
| Neutro com dado faltando ou em conflito | DAVID | §5, neutralidade mandatória |
| Clima → safra → estoques como **um** voto (família Oferta) | DERIVADA | §5 (dupla contagem) e §8 (pares F1-F2 e F2-F3) |
| F1 e F2: o maior módulo, sem somar; opostos: soma líquida | DERIVADA | §8, filtro de precedência F1 → F2 |
| F3 confirma, contradiz ou define | DERIVADA | §8: "F3 atua como confirmação de F2" |
| F5 sem peso nos quatro horizontes | DERIVADA | §8: F5 restrito a mais de 90 dias; o Longo do FinMind tem 90 dias corridos (~63 pregões) |
| F7 só no Curto e no Médio, só no extremo | DERIVADA | Horizonte do F7 no estudo; o extremo (percentis 10 e 90) é a calibração do FinMind (ADR 0060) |
| Composição da Oferta por horizonte (abaixo) | DERIVADA | Horizonte de cada membro no estudo |
| **Pesos por horizonte** (60/40; 50/33/17; custos 0) | **PROPOSTA** | Derivação do FinMind (abaixo) |
| **Score do fator:** forte ±2, moderada ±1, neutra 0 | **PROPOSTA** | Escala sobre a intensidade que o motor já calcula |
| **Limiares de S: 0,5 e 1,25** | **PROPOSTA** | Parâmetros desta proposta |
| **Cobertura mínima de 50%** | **PROPOSTA** | Parâmetro desta proposta |
| **Conflito: 75%** | **PROPOSTA** | Operacionaliza a neutralidade mandatória (§5) |
| **Confiança: cobertura < 80%; família ≥ 25% contra** | **PROPOSTA** | Parâmetros desta proposta |
| **Teto de confiança MÉDIA** | **PROPOSTA** | Decisão metodológica desta proposta |
| **Conab "recente" = até 2 pregões** | **PROPOSTA** | O "recente" é do estudo; os 2 pregões são desta proposta |
| **Imediato sem Oferta: faixa até LEVE, confiança até BAIXA** | **PROPOSTA** | Parâmetro desta proposta |

Nenhum número da classe PROPOSTA deve ser atribuído ao David.

### 1. Horizonte de cada fator (DAVID)

| Fator | No estudo | Horizontes do FinMind |
|---|---|---|
| F1 Clima | Curto a médio (7 a 30 dias) | Curto, Médio |
| F2 Safra | Médio a longo (30 a 90); impacto concentrado nos dias seguintes à publicação | Imediato (só com publicação recente), Curto, Médio, Longo |
| F3 Estoques ICE | Curto a médio (7 a 30), para os dados diários da ICE | Curto, Médio |
| F4 Câmbio | Imediato a curto (mesmo dia a 7) | Imediato, Curto |
| F5 Custos | 90 dias ou mais, defasagem de 1 a 3 temporadas | nenhum |
| F6 Demanda | Médio a longo (30 a 90) | Médio, Longo |
| F7 Fundos | Curto a médio (7 a 30); amplificador de volatilidade | Curto, Médio (modificador) |
| F8 Juros | Médio a longo (30 a 90) | Médio, Longo |

Os horizontes do FinMind são de 1, 7, 30 e 90 dias **corridos** (ADR 0062). O estudo conta em pregões.

### 2. Famílias e composição da Oferta

- **Oferta = F1 + F2 + F3**, um voto. Membros por horizonte (DERIVADA):
  - Imediato: só o F2, e só com publicação recente;
  - Curto e Médio: F1, F2 e F3;
  - Longo: só o F2, porque F1 e F3 são de 7 a 30 dias no estudo.
- **Câmbio** (F4), **Demanda** (F6), **Juros** (F8) e **Custos** (F5): um fator cada.
- **Fundos** (F7): fora das famílias, sem peso.

### 3. Pesos por horizonte (PROPOSTA, derivados por regra)

Os pesos não foram escolhidos: saem de uma regra com três entradas, calculada em código (`derivarPesos`). Um teste
garante que a regra reproduz a tabela.

1. A família está no horizonte quando um membro dela está (tabela 1, DAVID).
2. A magnitude da família é o peso do FEL 1 (Alto 3, Médio 2, Baixo 1) do **maior** membro, nunca a soma: a Oferta vale
   3, e não 3 + 3 + 3.
3. As magnitudes das famílias do horizonte são normalizadas para 100%.

| Família | Imediato | Curto | Médio | Longo |
|---|---:|---:|---:|---:|
| Oferta (F1 + F2 + F3) | 60%¹ | 60% | 50% | 50%² |
| Câmbio (F4) | 40% | 40% | 0 | 0 |
| Demanda (F6) | 0 | 0 | 33% | 33% |
| Juros (F8) | 0 | 0 | 17% | 17% |
| Custos (F5) | 0 | 0 | 0 | 0 |
| Fundos (F7) | sem peso | modificador | modificador | sem peso |

¹ Só com levantamento da Conab publicado há até 2 pregões. Fora disso, a Oferta fica inativa no Imediato e o Câmbio
fica com 100% do peso efetivo (renormalizado), com a faixa no máximo LEVE e a confiança no máximo BAIXA.
² Só o F2.

### 4. Score do fator e da Oferta

- **Fator (PROPOSTA):** forte ±2, moderada ±1, neutra 0, sem dado 0 marcado como **ausente**. Nenhuma classificação
  nova: é a intensidade que o motor já calcula.
- **F1 + F2 (DERIVADA):**
  - mesmo sinal, ou um deles neutro: vale o maior módulo, sem somar;
  - sinais opostos: soma líquida, com a marca de conflito. Entre junho e novembro, o F1 (geada, florada) fala da
    próxima safra e as revisões do F2 da safra atual: a oposição não é ruído, por isso a soma líquida, e não zero.
- **F3 (DERIVADA):**
  - mesmo sinal: mantém e marca "confirmado";
  - sinal oposto: o módulo cai 1;
  - base F1/F2 zero ou sem dado: o F3 define, limitado a ±1.
- A Oferta é ausente só quando todos os membros do horizonte estão sem dado.

### 5. Score agregado, cobertura, conflito, faixa e confiança

- **S** = Σ (peso efetivo × score da família), de −2 a +2. Uma família ausente contribui com 0.
- **Cobertura** = a soma dos pesos efetivos das famílias com dado. **< 50%: INSUFICIENTE** (PROPOSTA). Uma família fora
  do horizonte não é ausência; a Oferta inativa no Imediato também não.
- **Conflito** (PROPOSTA, operacionaliza a §5): as duas maiores contribuições com sinais opostos e a menor com 75% ou
  mais da maior → LATERAL, confiança BAIXA.
- **Faixa** (PROPOSTA):
  - |S| < 0,5: LATERAL;
  - 0,5 ≤ |S| < 1,25: LEVE;
  - |S| ≥ 1,25: FORTE.
- **Confiança** (PROPOSTA): começa no teto, **MÉDIA**, e desce um nível com:
  - cobertura < 80%;
  - uma família com peso efetivo de 25% ou mais contra a direção;
  - o F7 em extremo contra a direção.

  O piso é BAIXA. **O teto MÉDIA existe para o sistema não declarar ALTA confiança antes da validação fora da
  amostra.** Com teto MÉDIA e piso BAIXA, um motivo já leva a BAIXA, e todos ficam registrados.

### 6. F7 (fundos)

O F7 não tem peso e não muda S, a direção nem a faixa. Só age no Curto e no Médio, e só no extremo (a intensidade forte
do cálculo, percentis 10 e 90 por padrão). A comparação é com a leitura C do F7, que é de reversão (comprados em
extremo pressionam para baixa):

| Caso | Papel | Efeito |
|---|---|---|
| Pressão do F7 oposta à direção agregada (ex.: leitura de ALTA com os fundos comprados em extremo) | RISCO_DE_REVERSAO | Confiança −1 nível |
| Pressão do F7 na mesma direção (ex.: leitura de ALTA com os fundos vendidos em extremo) | EXCESSO | Nenhum; a confiança nunca sobe |
| Fora do extremo, fora do horizonte ou leitura LATERAL | SEM_PAPEL | Nenhum |

**Evolução registrada, não implementada:** exigir um catalisador (F1 ou F2 na mesma direção do F7) para o rebaixamento,
como pedem as regras candidatas do estudo.

### 7. Dupla contagem

| Par | Tratamento |
|---|---|
| F1 → F2 → F3 | Uma família, um voto (seção 4) |
| F4 ↔ F7 (5 a 15 pregões) | O F7 não vota |
| F5 → F2 (plurianual) | O F5 não tem peso |
| F8 ↔ F3 (custo de carregar estoque) | **Risco conhecido, não resolvido.** O estudo pede a curva a termo, que o FinMind não tem. O juro pesa 17%, só no Médio e no Longo, e só no Médio os dois se cruzam (no Longo o F3 está fora). |
| Eventos da IA × dados | Os eventos não entram na agregação: nem como voto, nem como gatilho do Imediato (só a publicação oficial da Conab ativa a Oferta) |

### 8. Em produção: prompt, Centro de Decisão e Qualidade da IA

- **Prompt do café v2** (`ai/prompts/cafe-analise-diaria.md`) e **configuração v2** (`shared/analise-diaria-cafe.js`,
  `AGREGACAO`): a agregação é calculada sobre os mesmos fatores do prompt, na montagem dele
  (`prompt-diario.service.js`), e vai no bloco **3B. Leitura agregada do motor**: por horizonte, a leitura, o score, a
  cobertura, a confiança, a contribuição de cada família, o papel do F7 e os motivos.
- **As regras vão inteiras ao prompt,** no cabeçalho do bloco 3B, com a mesma frase que a tela de metodologia mostra na
  coluna "Hoje no FinMind" do card da agregação (`ORIGEM_DAS_REGRAS[].prompt`). Uma regra sem frase não passa na
  validação, e um teste confere que toda regra da tela está no prompt.
- **A IA a recebe como evidência, não como resposta** (item 5 do bloco 4): compara a sua leitura com a do motor e, se
  divergir, diz por quê em "forcasDominantes", citando o que a agregação não pesa (um evento, a idade de um dado, o preço,
  a relação entre fatores). Não recalcula o score nem cria pontuação. O item 2 diz que os pesos do bloco 3B são das
  famílias, não de cada fator.
- **Gravada com a leitura,** sem tabela nova: a entrada de cada leitura (`analise_diaria.entrada.agregacaoMotor`) guarda o
  que foi calculado naquele dia. O Centro de Decisão e a Qualidade da IA leem dali, nunca um recálculo (um parâmetro do
  Comitê que mude depois não muda o que foi mostrado).
- **Centro de Decisão:** em cada horizonte, uma linha "Motor" com a leitura agregada e a marca "diverge da IA" quando as
  direções diferem; no detalhe do horizonte, o que formou a leitura (cada família com peso e contribuição, o F7 e os
  motivos), com o selo "em código, proposta do FinMind a validar pelo Comitê".
- **Qualidade da IA:** o motor é um previsor a mais ("Motor"), medido nas linhas da métrica em que ele leu o horizonte
  (INSUFICIENTE fica fora), com o próprio n. A síntese continua sendo a IA contra o melhor dos dois benchmarks. A
  configuração v2 separa as leituras com e sem a agregação no filtro de versão.

### 9. Validação, sem otimização

- **Os números desta versão ficam como estão.** Revisá-los é uma versão nova da agregação, com o motivo, nunca um ajuste
  para o histórico ficar melhor.
- **O backtest vem depois.** Ele compara, nas mesmas datas e com o realizado do ADR 0063:
  - esta proposta;
  - pesos iguais entre as famílias do horizonte;
  - a leitura atual da IA;
  - outras alternativas.
- **O teste tem pouca potência.** O ICF existe desde 2022, o F2 tem cerca de 11 revisões e o F6, poucas publicações. Ele
  derruba um erro grosseiro, mas não distingue 30% de 35%.

## Consequências

- **O café tem uma leitura agregada determinística, explicável linha a linha:** o score de cada família, a contribuição,
  a cobertura, o conflito e cada motivo de rebaixamento. Ela roda no histórico sem chamar a IA.
- **A leitura do café passa a ter duas camadas a partir de 2026-10-05:** a agregação em código e a leitura da IA, que a
  recebe como evidência. A Qualidade da IA mede as duas nas mesmas linhas.
- **A tela de metodologia mostra a agregação** num card próprio da seção "Pesos e relações" ("Agregação em código: proposta
  do FinMind", com o selo "a validar pelo Comitê"): os pesos por horizonte, a composição da Oferta, o F7 e a origem de cada regra. Tudo
  vem do agregador (`resumoParaTela`), para a tela e o cálculo não divergirem. No mesmo ajuste, as quatro regras do estudo
  passaram a "Orientação no prompt", o que estavam desde o ADR 0062 e a tela não dizia, e o resumo da seção deixou de
  dizer "fora do prompt" para o milho (calendário no prompt, ADR 0065) e para o café.
- **Limitações conhecidas:**
  - a agregação não olha a idade do dado: um fator com decisão antiga conta como presente (a defasagem segue com a IA,
    pela tabela 2.3 do prompt);
  - os pregões desde a Conab contam de segunda a sexta, sem os feriados da B3;
  - o F3 só tem histórico completo no servidor (em dev, a ICE só desde ago/2026).
- **Riscos aceitos ao ir direto à produção:**
  - os dados do servidor (o F3 com a ICE completa) não passaram pela agregação antes; o histórico no servidor
    (`npm run agregacao:cafe`) deve rodar logo depois do deploy;
  - a IA pode copiar a conta; a medida separada do motor na Qualidade da IA mostra se isso acontece;
  - números que não são do David aparecem no Centro de Decisão, sempre com o selo de proposta a validar e como
    tendência, nunca recomendação.
- **Próximos passos:** o histórico no servidor, o backtest (seção 9) e a validação do Comitê.

## Primeira rodada no histórico (dev, 2026-10-05)

197 segundas-feiras, de 2023-01-02 a 2026-10-05, no banco local, com os parâmetros desta versão e sem nenhum ajuste
(`npm run agregacao:cafe -- --desde=2023-01-02 --passo=7`). Não houve comparação com o preço: isso é o backtest.

| Horizonte | LATERAL | LEVE | FORTE | INSUFICIENTE | Confiança MÉDIA / BAIXA | F7 risco / excesso |
|---|---:|---:|---:|---:|---:|---:|
| Imediato | 142 | 52 | 1 | 2 | 8 / 187 | — |
| Curto | 104 | 85 | 5 | 3 | 167 / 27 | 22 / 4 |
| Médio | 115 | 79 | 0 | 3 | 6 / 188 | 24 / 4 |
| Longo | 56 | 76 | 0 | 65 | 8 / 124 | — |

Exemplos:

- **A seca de set/2024 (2024-09-30):** F1 e F2 em alta forte viram um voto +2, e não +4. Com o câmbio moderado, o Curto
  fica em ALTA_FORTE (S = 1,6). Os fundos comprados em extremo levam ao papel RISCO_DE_REVERSAO e à confiança BAIXA.
- **Conflito F1 × F2 (2024-06-17):** o clima em +1 e a safra em −1 dão a Oferta 0 no Curto e no Médio. No Longo só o F2
  conta, e a leitura é BAIXA_LEVE.
- **Imediato com a Conab recente (2024-05-27):** o levantamento saiu 1 pregão antes, e a Oferta entra com 60%.
- **Imediato sem a Conab (2025-04-21):** o câmbio forte (−2) sozinho fica em BAIXA_LEVE, com confiança BAIXA.

O que a rodada mostrou (registrado, **sem mudança nesta versão**):

- **O F6 só tem decisão a partir de 2026:** as versões antigas do PSD reconstroem menos de 60 países. No histórico, o
  Médio e o Longo rodam quase sempre sem a Demanda: cobertura de 67%, logo confiança BAIXA. O backtest desses horizontes
  vai medir, na prática, a Oferta e o Juro.
- **O F2 fica sem decisão de fevereiro a maio de cada ano:** o 1º levantamento da safra não tem revisão. Sem o F6, o
  Longo fica INSUFICIENTE nesses meses (65 semanas). Com o F6, a cobertura do Longo nesse período é de exatamente 50%.
- **O F3 não roda em dev** (a ICE só desde ago/2026). As regras de confirmação e de contradição só se exercitam no
  servidor, que tem a ICE desde 2016.
- **A regra de conflito (75%) não disparou nenhuma vez.** Com 60/40, no Curto ela só é alcançável com a Oferta em ±1
  contra o Câmbio em ±2.
- **O conflito F1 × F2 não rebaixa a confiança:** em 2024-06-17, o Curto sai LATERAL com confiança MÉDIA. A regra
  aprovada não prevê esse rebaixamento.

## Fora do escopo

Calendário mensal de pesos; o refinamento do catalisador no F7; a curva a termo; a agregação nos outros ativos; tabela
nova (a leitura do motor vai na entrada gravada de cada leitura).
