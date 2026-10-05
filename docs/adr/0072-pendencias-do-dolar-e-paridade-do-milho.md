# 0072 — As pendências do dólar e da paridade do milho (F4): a base contra a própria mediana

**Status:** aceita (2026-10-05).

## Contexto

O fator "Dólar (USDBRL) e paridade de exportação" do milho (F4, ADRs 0056 e 0057) tinha quatro perguntas ao David:

1. qual praça importa para o CCM: MT, onde está a paridade do IMEA, ou Campinas, onde o CCM liquida?
2. sem o ZC e o prêmio, a paridade pronta do IMEA substitui a fórmula, com a parte do câmbio aproximada?
3. a base Campinas − MT é quase sempre positiva e a alta não dispara: qual saída?
4. reponderar o fator para Alto entra no FEL 1 revisado?

Pelo CLAUDE.md, a decisão do usuário vale como a do David quando registrada num ADR.

**O problema da base.** A regra do David compara o preço interno com a paridade (base = ESALQ − paridade, contra
zero). O ESALQ é de Campinas e a paridade é de MT. Por causa do frete, a base foi negativa em 1 de 251 semanas, com
mediana de R$ 26/saca, e a regra de alta nunca disparou.

**O teste da base contra a própria mediana** (o desvio da base contra a mediana dela nas 52 semanas anteriores; ESALQ
13 semanas depois, 2021 a 2026):

| Regra | Alta | Baixa | Neutra |
|---|---|---|---|
| Base contra zero (a do David) | 0 semanas | 86 semanas, média −3,1% | média −0,3% |
| Base contra a mediana de 52 semanas | 7 semanas, média +3,5% (subiu em 3) | 62 semanas, média −4,3% (subiu em 28) | média −0,5% |

O desvio da base tem −0,15 com o ESALQ 13 semanas depois: com a base alta, o preço cai depois. É a convergência que a
regra descreve. As 7 semanas de alta são de 2022 (abril a junho e novembro) e de 2024 (julho e novembro). Em março de
2022 (guerra da Ucrânia) a leitura segue neutra pela regra: a paridade subiu por Chicago, não pelo câmbio (a regra
pede 50% ou mais vindo do câmbio).

## Decisão (usuário, Welerson, 2026-10-05)

1. **A praça é Campinas**, onde o CCM liquida. A paridade de MT é a referência da base, e a mistura de praças se
   resolve com o item 3.
2. **A paridade pronta do IMEA substitui a fórmula**, como o David escolheu na P16 (ADR 0055). A parte do câmbio é a
   paridade em reais decomposta em dólar × câmbio (a variação do dólar ÷ a da paridade). O frete e o porto ficam na
   parte em dólar e subestimam a parte do câmbio. Fica declarado.
3. **A base passa a ser comparada com a própria mediana nas 52 semanas anteriores.** "Preço interno abaixo da
   paridade" vira a base abaixo da mediana dela (o desvio abaixo do `limiarBaseRs`, 0), e "acima" vira acima. A
   mediana precisa de pelo menos metade da janela. A janela (`semanasBase`, 52) é do FinMind e é ajustável no card
   C. A base absoluta, a mediana e o desvio aparecem na tela e no prompt. Não precisa de fonte nova (a linha "Milho
   Disponível" do IMEA).
4. **O peso:** a pergunta sai do fator. Fica só a do ativo, sobre as correções do FEL 1 revisado, documento do
   Comitê. O calendário do David já dá peso Alto ao F4 de julho a janeiro no prompt (ADR 0065).

As quatro perguntas saem das Pendências do F4 e viram decisões. O cálculo `dolar_paridade_milho` vai à v2, e a
metodologia do milho, à v8.

## Consequências

- O F4 não tem mais pendências com o especialista. A regra de alta passa a disparar (raramente) e a de baixa fica um
  pouco mais seletiva.
- Com 5 anos de paridade, a validação é curta. A janela de 52 semanas pode ser revista quando houver mais histórico.
- A decomposição exata (ZC × câmbio + prêmio − frete) continua dependendo do ZC e do prêmio, que não são coletados.
