# 0074 — As pendências dos insumos do milho (F6): a relação de troca com a ureia importada e a margem confortável

**Status:** aceita (2026-10-05).

## Contexto

O fator "Custos de produção e insumos" do milho (F6, ADR 0056) calculava só a parte da margem da regra do David: o
Indicador ESALQ contra o custo total por saca do IMEA (MT), com margem de 0% ou menos pesando para alta. Faltavam a
relação de troca (sacas de milho por tonelada de adubo), que é metade da R-INS-01 e toda a R-INS-02, e o limiar da
"margem confortável" da regra de baixa. As perguntas ao David eram: a v1 roda só com a margem? E qual é a margem
confortável?

**Autorização da coleta.** O usuário (Welerson) autorizou em 2026-10-05 a coleta da importação de fertilizantes pelo
Comex Stat, com um limite: só a aquisição de dados para a relação de troca do F6. É uma demanda específica (a pendência
do fator), e o Comex Stat está no FEL 1 (a fonte da exportação de milho e de café, ADRs 0013, 0028 e 0034). Nenhuma
outra série, ativo ou regra vem com esta autorização.

**A fonte, conferida antes de codificar** (API do Comex Stat, `POST https://api-comexstat.mdic.gov.br/general`, fluxo
de importação, detalhe por NCM): os NCMs valem desde 1997, sem troca de código.

| NCM | Produto | 2024: volume | 2024: preço médio FOB |
|---|---|---|---|
| 31021010 | Ureia | 8,31 milhões de t | US$ 323/t |
| 31042090 | Cloreto de potássio (KCl) | 13,65 milhões de t | US$ 264/t |
| 31054000 | Fosfato monoamônico (MAP) | 4,21 milhões de t | US$ 564/t |

Em 2008, no pico do adubo, a ureia importada custou US$ 549/t.

**Os limites do histórico.** A importação existe desde 1997, mas o Indicador ESALQ (o preço do milho do fator) só
existe na base desde 2018-06 (ADR 0021). O percentil de 10 anos da proposta só seria possível em 2028.

## Decisão (usuário, Welerson, 2026-10-05)

- **A relação de troca entra no F6.** Um coletor novo do Comex Stat (`comex-adubo-importacao`, séries
  `COMEX.ADUBO.<UREIA|KCL|MAP>.IMPORT.<KG|FOB_USD>`, mensal) reaproveita o coletor da exportação, e o card
  `ADUBO_IMPORTACAO` mostra as séries. A carga desde 1997 roda com `npm run backfill:comex-adubo`.
- **A ureia decide; o cloreto de potássio e o MAP são contexto** (vão ao prompt, não à regra). A ureia na regra
  é escolha do FinMind, para a relação de troca usar um adubo só; o Comitê pode trocar.
- **A relação de troca** = o preço médio da ureia importada no último mês publicado (FOB em dólar ÷ volume, em R$/t pela
  PTAX média do mês) ÷ o Indicador ESALQ médio do mesmo mês, em sacas por tonelada.
- **O percentil** compara o mês com todos os meses anteriores disponíveis, no mínimo 60 e no máximo 120 (os 10 anos da
  proposta). O mínimo de 60 é escolha do FinMind, por causa do ESALQ curto.
- **As regras, com o David:** o percentil no P75 ou acima nos 2 últimos meses pesa para alta (R-INS-01); no P25 ou
  abaixo, com a margem confortável, para baixa (R-INS-02). Se a margem pede alta e o adubo barato pede baixa, fica
  neutra. Do FinMind: forte com as duas condições de alta, ou com a margem e o preço no custo operacional ou abaixo.
- **Margem confortável** = a margem de hoje acima da média das margens das até 5 safras anteriores. A margem de uma
  safra é o ESALQ médio de julho do ano seguinte a junho do outro (a comercialização) ÷ o custo total da safra do IMEA − 1;
  só entram as safras com a janela completa. A média é do FinMind, escolhida pelo usuário; o Comitê pode ajustar.

As duas perguntas saem das Pendências do F6 e viram decisões. O cálculo vai à v2 e a metodologia do milho, à v10.

## Validação (dev, 2026-10-05)

Com o percentil a partir de jul/2023 (154 semanas até set/2026), contra o Indicador ESALQ 13 semanas depois:

| Direção | Semanas | ESALQ subiu | Variação média |
|---|---|---|---|
| Alta (adubo caro por 2 meses) | 50 | 31 | +1,0% |
| Neutra | 104 | 63 | +3,0% |
| Baixa | 0 | — | — |

A relação do percentil com o ESALQ 13 semanas depois é +0,16. Não há antecipação no curto prazo, o que bate com a
proposta: o sinal é defasado (6 a 12 meses, sobre a área da safra seguinte). A baixa ainda não disparou porque pede a
margem, e o custo do IMEA só está na base desde 2026-09-15. Leitura de 25/09/2026: 31,8 sacas por tonelada de ureia em
ago/2026 (P74,5), depois do pico de 47,2 em jun/2026, com a ureia a US$ 586/t; margem de +18,5%, abaixo da média de
+41,9% das 4 safras anteriores. Direção: neutra.

## Consequências

- O F6 não tem mais pendências com o especialista. O percentil fica abaixo dos 10 anos da proposta até 2028.
- O preço é o de importação (FOB): não inclui o frete interno nem a margem da revenda. O nível não é o que o produtor
  paga; a comparação com o próprio histórico é.
- O diesel (ANP) e o custo do milho da Conab seguem fora; só entram com uma demanda e uma autorização próprias.
- No servidor, a carga roda uma vez pelo Portainer (`npm run backfill:comex-adubo`, ~15 min pelo limite da API); depois,
  a coleta diária mantém o mês novo.
