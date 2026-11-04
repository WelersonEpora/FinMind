# 0150 — Ouro: o IC de cada fator por horizonte e o script da revisão

## Contexto

O "Relatório de oportunidades de melhoria: sistema de sinais do ouro (prompt ouro-v3)", versão 3 revisada, emitido em
2026-11-01 sobre a leitura de 2026-10-30 (resposta no `STATUS_DO_PROJETO.md`, §0), aponta no **E1** que todas as
validações do motor do ouro (a parte D de cada fator) medem o ouro 26 semanas à frente, enquanto a leitura sai em quatro
horizontes (1, 7, 30 e 90 dias): "um fator pode ser útil em seis meses e inútil em uma semana". Pede o IC (correlação
de Spearman entre o escore do fator e o retorno futuro) em cada horizonte, em janelas de 12 meses, com erros robustos
(Newey-West ou bootstrap em blocos), por fator e por horizonte, com o intervalo de confiança.

Pelo mesmo teste, o documento pede ainda o **E2** (o F1 está invertido? separar variação e nível do juro real), o
**M2** (o momentum do preço), o **M4** (janelas curtas para o F1 e o F2 nos horizontes curtos), o **M5** (o papel do F6
por horizonte) e o **M6** (o F7).

O método já existe no café (ADR 0141): `factors/base/ic-fatores.js`, com o escore da leitura C (alta positiva, baixa
negativa; forte 2, moderada 1, fraca 0,5, neutra 0), o bootstrap em blocos e as janelas de 12 meses.

**Quem decidiu:** o usuário (Welerson), em 2026-11-02, com o mesmo poder de decisão do David (`CLAUDE.md`): começar a
resposta pelo E1, com o script do IC do ouro.

## Evidência (banco de dev, 2026-11-02)

`npm run ic:ouro` (`scripts/ic-fatores-ouro.js`): cada fator calculado no histórico inteiro, de 2006 a 2026-09 (o período
da validação dos fatores), com a leitura valendo do pregão seguinte à disponibilidade, contra o ouro da LBMA (PM, US$/onça,
até o fim do feed em 2026-09-30, ADR 0044) depois de 1, 5, 21 e 62 pregões. Entre colchetes, o intervalo de 90% do
bootstrap em blocos de 13 semanas (de 4 trimestres nos trimestrais); `*`, o intervalo exclui o zero.

| Fator | Pontos | 1 pregão | 5 | 21 | 62 |
|---|---|---|---|---|---|
| F1 Juro real (Alto) | 1.082 semanas | −0,00 | +0,03 | +0,01 | −0,02 [−0,15; +0,10] |
| F2 Dólar (Alto) | 1.034 semanas | +0,05 | **+0,06 [+0,01; +0,11]** `*` | +0,05 | +0,06 |
| F3 Inflação (Alto, contexto) | 247 meses | +0,06 | +0,02 | +0,01 | −0,04 |
| F5 Bancos centrais (Alto) | 51 trimestres | −0,03 | +0,07 | **+0,23 [+0,02; +0,40]** `*` | **+0,45 [+0,21; +0,55]** `*` |
| F6 ETFs (Médio) | 1.007 semanas | −0,01 | −0,00 | +0,03 | +0,02 |
| F7 Fundos, COT (Médio) | 895 semanas | +0,01 | +0,00 | +0,04 | +0,09 [−0,08; +0,23] |
| F8 Minas (Baixo) | 59 trimestres | +0,05 | −0,06 | +0,18 | +0,26 [−0,04; +0,46] |

As variantes, todas no sentido do FEL 1 (escore positivo = pressão de alta):

| Variante | 1 pregão | 5 | 21 | 62 |
|---|---|---|---|---|
| Juro real, nível (mais baixo, alta) | −0,04 | **−0,09** `*` | **−0,21 [−0,30; −0,12]** `*` | **−0,36 [−0,48; −0,22]** `*` |
| Juro real, variação de 26 semanas (a do F1, sem faixas) | +0,03 | +0,02 | +0,00 | −0,01 |
| Juro real, variação de 4 semanas | +0,01 | +0,00 | +0,03 | −0,00 |
| Juro real, variação de 1 semana | −0,01 | +0,03 | −0,00 | +0,01 |
| Dólar, variação de 4 semanas | +0,02 | +0,01 | +0,01 | −0,00 |
| Dólar, variação de 1 semana | −0,01 | +0,00 | −0,01 | −0,01 |
| Momentum do ouro (a média dos z de 5, 20 e 60 pregões, como no café) | +0,02 | +0,03 | +0,01 | +0,05 |

- **E1:** só o F5 tem relação clara, e só em 30 e 90 dias. O F2 tem um sinal fraco em 7 dias. O F1, o F3, o F6 e o F7 ficam
  perto de zero em todos os horizontes. Nenhum fator calculado tem IC negativo com o intervalo excluindo o zero.
- **E2:** a variação do juro real não está invertida: fica perto de zero em todos os horizontes, nas duas metades do
  período. O nível tem a relação contrária à do FEL 1, crescente com o prazo e estável nas duas metades (−0,23 e −0,20 em
  21 pregões): juro real alto veio seguido de ouro em alta. É o efeito das tendências longas que o F1 já descarta (o
  cálculo usa a variação, e não o nível, por isso).
- **M4:** as janelas curtas (1 e 4 semanas) do juro real e do dólar também não têm sinal.
- **M2:** o momentum do ouro fica perto de zero em todos os horizontes.
- **M5 e M6:** o F6 e o F7 não têm sinal em nenhum horizonte.

**Duas escolhas do teste:**

1. **A disponibilidade dos dados do World Gold Council.** O WGC não informa quando publicou, e o histórico dos bancos
   centrais, dos ETFs e das minas foi carregado de uma vez, com a data da coleta (2026-10-01) como publicação estimada
   (`wgc-ouro.collector.js`). No teste, cada ponto fica disponível na data de referência mais o atraso típico da fonte:
   7 dias nos ETFs; 130 dias depois do início do trimestre nos trimestrais (o trimestre sai ~1 mês depois do fim dele: o
   2º de 2026, em 2026-07-30). O ponto vai junto com o E5 do documento (a idade dos dados).
2. **O período começa em 2006** (`--desde` troca). Com todo o histórico da LBMA (desde 1968), a inflação dava IC de +0,32
   a +0,37 até 21 pregões, só pelos anos 1970; de 2006 em diante, perto de zero.

## Decisão

1. **O IC de cada fator do ouro por horizonte fica registrado** (aqui e no status, §0) e é refeito por `npm run ic:ouro`.
   Não chama a IA e não grava nada.
2. **Nenhuma mudança no prompt, nos pesos nem no Centro de Decisão** por este ADR: o que fazer com os fatores de IC
   indistinguível de zero é decisão do Comitê ou do usuário. No café, a regra aprovada pelo Comitê em 2026-10-22 foi
   rebaixar o peso ou desligar o fator (ADR 0141, adendo).
3. **Com o Comitê:** o F1 (peso Alto) e o F2 (peso Alto, com sinal fraco só em 7 dias); o F3, que já é contexto; o F6
   e o F7; e o F5, o único com sinal claro, só em 30 e 90 dias.

## Consequências

- O E1 do documento fica respondido com o IC por horizonte; o E2, o M2, o M4, o M5 e o M6, pelo mesmo teste.
- A validação de cada fator (parte D) continua com as 26 semanas; o IC por horizonte fica no script e no status.

## Adendo (2026-11-04): a decisão sobre os fatores sem sinal

**Quem decidiu:** o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind, com o acompanhamento depois da mudança. O F5 fica para depois do E5 (abaixo).

**O critério:** o mesmo que o Comitê aprovou para o café em 2026-10-22 (ADR 0141, adendo): o fator com IC indistinguível
de zero é rebaixado ou desligado. Aqui, desligado como voto: nenhum dos cinco tem um horizonte que justifique manter o
voto só nele.

| Fator | Peso no FEL 1 | IC (1 / 5 / 21 / 62 pregões) | A base da decisão | O que mudou |
|---|---|---|---|---|
| F1 Juro real | Alto | −0,00 / +0,03 / +0,01 / −0,02 | A amostra é grande (1.082 semanas) e o IC é zero nos quatro horizontes, nas duas metades do período e nas janelas de 26, 4 e 1 semana (M4): não é falta de dado nem de especificação. O fator explica o movimento que já aconteceu (−0,52 no mesmo período), não o antecipa. Com o peso Alto, empurrava a IA para um lado com convicção (em 30/10, "baixa forte"). O nível, com o sinal contrário ao do FEL 1 (−0,21 e −0,36 em 21 e 62), não é adotado: é o efeito de duas séries em tendência, e trocar uma regra sem sinal por uma com sinal espúrio seria pior | **Informação, sem peso** |
| F2 Dólar | Alto | +0,05 / **+0,06** / +0,05 / +0,06 | O único resultado significativo passa por pouco (+0,01 a +0,11) e é pequeno; entre os 28 testes (7 fatores e 4 horizontes), cerca de 3 passariam a 90% só por acaso. O sinal é do mesmo lado nos quatro horizontes, o que fica em acompanhamento | **Informação, sem peso** |
| F3 Inflação | Alto (contexto do F1) | +0,06 / +0,02 / +0,01 / −0,04 | O peso Alto de um fator sem voto confundia a leitura (E3); a surpresa do CPI, a alternativa do E3, depende de um consenso pago. Era contexto do F1, que perdeu o voto | **Informação, sem peso**; deixa de ser contexto do F1 e continua a explicá-lo no prompt |
| F6 ETFs | Médio | −0,01 / −0,00 / +0,03 / +0,02 | O fluxo segue o preço (+0,48 no mesmo período) e não o antecipa em nenhum horizonte (M5) | **Informação, sem peso** |
| F7 Fundos (COT) | Médio | +0,01 / +0,00 / +0,04 / +0,09 | IC zero, e a relação muda de regime: amplifica em 2009 a 2014 e em 2023 a 2026, reverte em 2015 a 2022 (M6). Na prática, o prompt já mandava não contá-lo como voto | **Informação, sem peso**, lido como risco de posição concentrada, sem sentido (como o F7 do café); o `posicionamentoCot` continua |

**O que segue votando:** a geopolítica (F4, Alto, por eventos; a validação é o E4), os bancos centrais (F5, Alto, só no
MEDIO e no LONGO, abaixo) e as minas (F8, Baixo). **A consequência, aceita na decisão:** no IMEDIATO e no CURTO quase nada vota (a geopolítica e as
minas, trimestrais); as leituras curtas tendem a LATERAL, INSUFICIENTE ou confiança baixa. É o resultado honesto: hoje
não há, no ouro, preditor validado para 1 a 7 dias. O café chegou ao mesmo ponto (ADR 0141, adendo).

**O F5 (decidido no mesmo dia, depois do E5, ADR 0151):** o voto **só no MEDIO e no LONGO**, com o peso Alto
(`soNosHorizontes`). É o único fator com sinal: +0,23 e +0,45 em 21 e 62 pregões, com o intervalo excluindo o zero; em 1 e
5, −0,03 e +0,07. Um dado trimestral, publicado um mês depois do fim do trimestre, não informa 1 a 7 dias. O E5 não
mudou o teste: o `ic:ouro` já usava o atraso típico de publicação do WGC. Ressalvas, que ficam no acompanhamento: 51
trimestres, com parte da relação no ciclo de compras de 2022 a 2025. No IMEDIATO e no CURTO, votam só a geopolítica e
as minas.

**Como fica no sistema:**
- `metodologia-ouro.js`, v4: os cinco com `informativo` e o peso "Sem peso" (`ajustesFel1`, com o peso do FEL 1 ao lado);
  as perguntas que a decisão respondeu saem dos fatores. `metodologia-base.js` aceita "Sem peso" só num fator sem voto.
- O prompt do ouro, v6: os itens 4, 7 e 8 de "Como analisar" e a legenda do bloco 3. A resposta que citar um desses
  fatores a favor ou contra é recusada (o validador já recusa os fatores de informação).
- A tela de metodologia e o Centro de Decisão mostram "Sem peso".
- A Qualidade da IA separa as leituras pela versão do prompt.

**O acompanhamento:** a Qualidade da IA do ouro, as leituras da v6 contra as anteriores e os benchmarks; e o
`npm run ic:ouro` na revisão. Volta ao voto o fator que mostrar IC com o intervalo excluindo o zero, estável nas duas
metades, num horizonte. O M1 (a expectativa de juros, pelo Treasury de 2 anos já coletado) é o próximo candidato para
os horizontes curtos.
