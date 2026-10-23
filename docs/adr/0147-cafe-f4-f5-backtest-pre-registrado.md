# 0147 — Café, F4 + F5 e a regra do F5: o backtest pré-registrado

## Contexto

O Comitê, na resposta de 2026-10-22 à análise do café de 2026-10-19 (`STATUS_DO_PROJETO.md`, §0):

- **E8:** "A regra combinada F4 + F5 só entra após backtest." A fonte do preço físico, o Cepea, já está na base (ADR 0146).
- **E9:** a regra do F5 (ADR 0138) "aprovada só após backtest; a regra de venda com a margem acima de 200% se apoia num
  único episódio, a amostra é insuficiente".

**Quem decidiu:** o usuário (Welerson), em 2026-10-23, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind:

- um teste só, para o E8 e o E9, porque os dois usam o mesmo custo da Conab, no mesmo período, e o Cepea anda com o KC
  em reais (o Cepea é, na mediana de cada ano de 2000 a 2026, de 0,62 a 0,89 vezes o KC em reais; cerca de 0,80);
- a regra do E8 é só a do nível (R1). A regra com a queda (R2: margem até 15% e queda de 10 p.p. em 4 semanas) foi
  cortada: os dois números eram escolha do FinMind, e cada regra a mais é mais uma chance de um "passa" por acaso;
- o lado da baixa do E8 fica fora: o limiar de 200% é da escala do KC, e convertê-lo para o físico seria inventar um
  número;
- este documento é escrito **antes** de rodar o teste, e nada aqui muda depois do resultado.

## O limite da amostra, declarado antes de rodar

**Este backtest não é uma validação fora da amostra.** O custo da Conab só é utilizável de 2004 em diante (o 1º custo é de
2003, e conta como conhecido 12 meses depois, ADR 0137). Esse período inteiro já foi usado para calibrar a regra do F5 com
o KC (ADR 0138), então repetir o teste no KC é circular: o resultado do E9 com o KC é esperado como "coerente", e não
prova nada novo. O que há de novo é o **preço**: o físico do Cepea, um preço diferente do KC, mas muito correlacionado com
ele. A independência é fraca. Os episódios de preço abaixo do custo são poucos (o ADR 0138 achou 2013).

**A expectativa, registrada antes:** "coerente no histórico, não validável com a amostra que existe". A recomendação ao
Comitê, a menos que o resultado surpreenda: o F4 e o F5 seguem como informação, e a sombra fica registrada.

## As regras, congeladas

As semanas são as do F5 (`custos-cafe.factor.js`, `derivarCustosCafe`): o último pregão de cada semana, o custo da Conab
com a mediana dos municípios do ano mais novo e a data estimada do ADR 0137. Só o preço muda.

| Regra | Preço | Sinal | Escore |
|---|---|---|---|
| **R1 (E8)** | O Cepea, Indicador do Café Arábica, em R$/saca (ADR 0146) | Alta: o físico abaixo do custo total por 4 semanas seguidas (forte se abaixo do operacional) | Alta forte +3, moderada +2; sem sinal 0 |
| **F5 (E9)** | O KC de Nova York em reais (KC × PTAX), como no ADR 0138 | A regra do ADR 0138 como está: alta forte (abaixo do custo operacional por 4 semanas), moderada (abaixo do total por 4 semanas), fraca (margem total até 15%); baixa moderada (margem total acima de 200%) | Alta forte +3, moderada +2, fraca +1; neutra 0; baixa moderada −2 |

## O critério

- **O resultado:** o retorno do preço do 1º pregão depois da semana até **62 pregões** depois (o horizonte LONGO). Dois
  preços medidos, cada um com o seu resultado: o KC contínuo ajustado pela rolagem (como nos ADRs 0138 e 0145) e o Cepea
  (o físico, sem rolagem).
- **Por lado.** A alta: as semanas com sinal de alta contra as semanas sem sinal (neutras). A baixa (só a regra do E9): as
  semanas com sinal de baixa contra as neutras.
- **Um lado passa** se cumprir os três:
  1. a diferença a favor da regra é de **10 p.p. ou mais** na fração de semanas em que o preço subiu (na alta, mais
     semanas de subida com o sinal; na baixa, menos);
  2. o **IC** (Spearman entre o escore e o retorno, em todas as semanas com retorno) é **maior que zero**;
  3. há **3 episódios ou mais**. Um episódio é uma sequência de semanas com o sinal daquele lado; uma semana com sinal
     só abre um episódio novo se a última semana com sinal do mesmo lado ficou **26 semanas ou mais** para trás.
- **Não passa** se a diferença for negativa ou o IC for zero ou menor, com 3 episódios ou mais. Com menos de 3 episódios,
  **inconclusivo**: a amostra não basta. Com a diferença entre 0 e 10 p.p. e o IC positivo, também **inconclusivo**: o
  sentido certo, sem a força pedida (a mesma regra do ADR 0145).
- As semanas se sobrepõem (62 pregões é mais que uma semana), e por isso o número de episódios conta mais do que o número
  de semanas.

## A sombra (daqui para frente)

As duas regras são calculadas a cada semana publicada depois de 2026-10-23, com o mesmo critério. **1ª avaliação:
2027-04-23.** Uma ressalva já registrada: hoje a margem do KC em reais é de +99%, e a do físico fica perto de +60%. Um
sinal de alta da R1 exigiria uma queda do café de cerca de 40%, então o mais provável é nenhum sinal em 6 a 12 meses.

## O resultado (rodado em 2026-10-23, banco de dev; `npm run validacao:f4f5`)

1.151 semanas com o resultado de 62 pregões, de 2004 a 2026.

| Regra | Lado | Preço medido | Com sinal: subiu | Sem sinal: subiu | A favor | IC | Episódios | Veredito |
|---|---|---|---|---|---|---|---|---|
| **R1 (E8)**, o Cepea abaixo do custo | Alta | KC | 66,3% (83 semanas; média +15,8%) | 49,1% (média +1,5%) | +17,2 p.p. | +0,125 | 5 | **PASSA** |
| **R1 (E8)** | Alta | Cepea | 73,5% (média +12,7%) | 54,0% (média +2,8%) | +19,5 p.p. | +0,123 | 5 | **PASSA** |
| F5 (E9), o KC em reais | Alta | KC | 58,6% (70 semanas) | 51,2% | +7,4 p.p. | +0,139 | 4 | Inconclusivo |
| F5 (E9) | Alta | Cepea | 65,7% | 56,9% | +8,8 p.p. | +0,191 | 4 | Inconclusivo |
| F5 (E9) | Baixa (acima de 200%) | KC | 37,7% (106 semanas) | 51,2% | +13,4 p.p. | +0,139 | 2 | Inconclusivo |
| F5 (E9) | Baixa | Cepea | 34,9% | 56,9% | +22,0 p.p. | +0,191 | 2 | Inconclusivo |

Os episódios da R1: 2008-08 (2 semanas), 2009-07 (3), 2010-02 a 06 (15), 2013-03 a 2014-02 (41) e 2019-01 a 09 (22). Os da
alta do F5: 2008-05, 2010-02, 2012-12 e 2019-02. Os da baixa: 2021-10 e 2024-11.

**O diagnóstico (descritivo, feito depois do veredito; não muda o veredito):**

| R1, alta | KC: com sinal × sem | Cepea: com sinal × sem |
|---|---|---|
| Por episódio (semanas em que subiu) | 2008: 0 de 2 (−22%); 2009: 3 de 3; 2010: 15 de 15; 2013-14: 21 de 41; 2019: 16 de 22 | 2008: 2 de 2; 2009: 3 de 3; 2010: 15 de 15; 2013-14: 22 de 41; 2019: 19 de 22 |
| 2004 a 2015 | 64% × 45% | 69% × 53% |
| 2016 a 2026 | 73% × 53% | 86% × 55% |
| Sem 2013 | +33,9 p.p. | +38,9 p.p. |
| Sem 2008 a 2010 | +10,5 p.p. | +12,9 p.p. |

- **A R1 passa e é a mais estável das regras de preço testadas no café:** o sinal fica do mesmo lado nos dois períodos (o
  F4 e a margem em percentil se inverteram, ADRs 0136 e 0137), e o resultado não depende do episódio mais longo (sem 2013,
  a diferença sobe). Ela não tem limiar ajustado: "abaixo do custo por 4 semanas" é a hipótese do estudo.
- **A fragilidade:** os episódios de 2008 e 2009 são pequenos (2 e 3 semanas, a margem a −2%); os que pesam são 3 (2010,
  2013-14 e 2019). O de 2013-14 tem a seca de 2014 no meio (a alta que segue o sinal pode ser o clima). E não há período
  fora da amostra no tempo (o limite declarado acima).
- **A regra do F5 (E9) não passa:** a alta fica abaixo dos 10 p.p. (a "alta fraca", margem até 15% no KC, dilui o sinal),
  e a baixa tem só 2 episódios: confirma o que o Comitê disse.
- **Hoje:** o Cepea a R$ 1.619,85 contra o custo total de R$ 1.050,74 (custo de 2025, mediana): margem física de **+54%**.
  A R1 está neutra; um sinal exigiria o físico abaixo de R$ 1.050, uma queda de cerca de 35%.

**A recomendação ao Comitê:**

1. **E8:** a R1 passou no critério pré-registrado. Ela pode entrar como a regra do fator combinado F4 + F5 (o incentivo do
   produtor): **só alta, só no LONGO, com peso Baixo**, enquanto a sombra acompanha. Ou pode seguir como informação. Como
   está neutra hoje e deve seguir assim por meses, adotá-la não muda a leitura atual.
2. **E9:** a regra do ADR 0138 não é adotada, nem a alta nem a baixa. A alta do F5 passaria a ser a da R1, e a baixa fica
   fora até haver episódios.
3. **A sombra** das duas regras segue, com a 1ª avaliação em 2027-04-23 (`npm run validacao:f4f5 -- --sombra`).

Até a decisão do Comitê, nada muda no prompt: o F4 e o F5 seguem como informação.
