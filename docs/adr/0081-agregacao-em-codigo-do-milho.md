# 0081 — Agregação determinística do milho: o calendário e as regras do David em código

**Status:** aceita (2026-10-06) como proposta na tela de metodologia; **fora do prompt, do Centro de Decisão e da
Qualidade da IA**: o usuário decidiu mantê-la fora em 2026-10-06, depois do histórico (adendo). A escala do score, os
limiares e a confiança são do FinMind, não do David.

## Contexto

A agregação em código era uma das duas pendências restantes do milho. No café, ela foi montada a partir do horizonte de
cada fator e do peso do FEL 1, porque o estudo do David não tinha pesos (ADR 0066). No milho é diferente: o Motor do
Milho v0 (2026-10-02, ADR 0055) já traz o calendário de pesos por mês (ADR 0065, completado pelo usuário no ADR 0077) e
nove regras de agregação (Seção 4). Até aqui, as regras iam ao prompt como orientação em texto, e o motor não calculava
nada.

**Decisões do usuário (Welerson, 2026-10-05):**

- o peso de cada fator é o do mês no calendário do David, com as regras dele que o motor sabe aplicar;
- o F7 multiplica por 1,25 o peso de F1, F3 e F8 alinhados ao extremo dele, em código (o ×1,25 saiu do prompt no ADR
  0065 só porque a IA não faz conta);
- o conflito entre blocos segue o David: mantém a direção, marca o conflito e a confiança vai a BAIXA;
- a agregação só vai à produção depois de o usuário ver o histórico.

## Decisão

O código está em `backend/src/factors/agregacao/agregacao-milho.js`, função pura sobre os mesmos fatores da tela e do
prompt (`simularFatores`), com a mesma saída do café (o prompt, o Centro e a Qualidade da IA servem sem mudança quando
for à produção). Versão `milho-agregacao-v1 (2026-10-05)`, situação `PROPOSTA`. O script
`scripts/agregacao-milho-historico.js` (`npm run agregacao:milho`) roda qualquer data ou intervalo, sem IA e sem gravar
nada; com `--acerto`, mede contra o CCM como a Qualidade da IA mede uma leitura (o contrato de cada horizonte do ADR
0078, o realizado do ADR 0063 e as comparações do ADR 0064).

| Regra | Origem |
|---|---|
| Peso do fator: o do mês no calendário (Alto 3, Médio 2, Baixo 1) | DAVID (o F1 de janeiro a maio e o F2 em janeiro e fevereiro, do usuário, ADR 0077) |
| Pressão de baixa do F1, do F3 e do F5: no máximo Médio; o F1 de baixa forte (polinização concluída) fica com o do mês | DAVID (regras de peso por força do sinal, ADR 0065, adendo); o mês é o teto |
| F1 um nível abaixo de junho a agosto com 50% ou mais da safrinha de MT colhida | DAVID; o "um nível" é do usuário (ADR 0077). O andamento vem do F2 (`camposAgregacao`) |
| Bloco de oferta (F1 + F2 + F3) como um argumento, com o peso do maior membro com dado | DAVID ("Bloco de oferta") |
| No bloco, F1 e F2: o maior módulo; opostos, soma líquida | DERIVADA (a forma do café) |
| F3 como filtro: confirma, contradiz (módulo − 1) ou, sozinho, define | DERIVADA ("F3 como filtro"; o F3 é o hub) |
| F5 contradito pelo F3: um nível abaixo | DERIVADA ("F3 como filtro") |
| F6 fora dos horizontes | DAVID ("Sinais defasados") |
| F7 não vota; alinhado, ×1,25 em F1, F3 e F8; contra, risco de reversão | DAVID ("Fundos como multiplicador") |
| Conflito entre blocos: mantém a direção, marca, confiança BAIXA | DAVID; o limite de 75% é do FinMind |
| Score do fator ±2/±1/0; \|S\| < 0,5 LATERAL, < 1,25 LEVE; cobertura mínima 50%; teto de confiança MÉDIA; rebaixamentos | PROPOSTA (os mesmos números do café, ADR 0066) |

Ficam de fora: a paridade líquida (Chicago × câmbio), sem o ZC; o F3 convexo (o F3 já é Alto o ano todo); o F5 Alto na
base de MT (o F5 não tem direção de alta); o F8 Alto com a China (os eventos não entram no cálculo); o F6 Médio para
vencimentos de 6 meses ou mais (nenhum horizonte passa de 90 dias).

**Limitação:** o Motor v0 não diz em que prazo cada fator age (só o F6). Os pesos são os mesmos nos 4 horizontes, e a
leitura sai igual neles.

## Primeira rodada no histórico (dev, 2026-10-06)

235 segundas-feiras, de 2022-04-04 a 2026-09-28, sem nenhum ajuste
(`npm run agregacao:milho -- --desde=2022-04-04 --ate=2026-09-28 --acerto`). A leitura: 181 LATERAL, 35 ALTA_LEVE, 19
BAIXA_LEVE, nenhuma FORTE; conflito em 29 semanas; confiança MÉDIA em 192.

Contra o CCM, nas linhas avaliáveis (direção certa | faixa exata | distância média):

| Horizonte | Motor | Sempre lateral | Persistência | Motor fora do LATERAL: direção certa |
|---|---|---|---|---|
| Imediato (n = 182) | 33% \| 30% \| 1,09 | 28% \| 28% \| 1,05 | 34% \| 20% \| 1,50 | 42% de 43 |
| Curto (n = 186) | 26% \| 24% \| 1,09 | 26% \| 26% \| 0,99 | 35% \| 25% \| 1,32 | 30% de 44 |
| Médio (n = 177) | 30% \| 28% \| 1,06 | 36% \| 36% \| 0,90 | 30% \| 21% \| 1,43 | 17% de 42 |
| Longo (n = 163) | 32% \| 29% \| 1,07 | 34% \| 34% \| 0,92 | 29% \| 20% \| 1,27 | 18% de 39 |

O motor não supera os benchmarks em nenhum horizonte, e quando sai do LATERAL erra a direção na maior parte das vezes
no Médio e no Longo. É coerente com a validação de cada fator contra Chicago (ADRs 0069 a 0076): o F1 e o F3 acompanham o
preço sem antecipar, o F5 não tem relação e o F8 é inverso à regra. Ressalvas: o CCM de 2022 a 2026 é um período de
queda, as semanas de um mesmo episódio andam juntas, e o F2 (Conab) só tem decisão desde 2025.

## Consequências

- A tela de metodologia do milho mostra a agregação num card próprio, com a origem de cada regra e o aviso de que ainda
  não vai ao prompt. A metodologia do milho vai à v17.
- A ida à produção é decisão do usuário, sobre estes números. Os parâmetros desta versão não se ajustam ao histórico:
  revisar é versão nova, com o motivo.

## Adendo (2026-10-06): fica fora do prompt

**Decisão do usuário (Welerson, 2026-10-06):** com os números da primeira rodada, a agregação em código fica fora do
prompt, do Centro de Decisão e da Qualidade da IA. Segue na tela de metodologia como referência, com o script
`npm run agregacao:milho` para medir de novo. A IA continua combinando os fatores pelo prompt, com o calendário de
pesos como tabela fixa e as regras do David como orientação em texto (ADR 0065).

A pergunta sai das pendências do milho; a metodologia vai à v18. Voltar a discutir pede um motivo novo (mais histórico,
uma revisão das regras pelo David ou uma versão nova da agregação), registrado num adendo ou ADR novo.
