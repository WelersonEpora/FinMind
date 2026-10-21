# 0136 — Café, F4: o câmbio como informação, com o peso Baixo e o café em reais como contexto

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E8** que o F4 (câmbio, a
variação da PTAX em 10 pregões contra 5 anos) tem peso Médio acima da evidência: a validação do ADR 0086 não separa o
preço (52% contra 48%), e o próprio FEL 1 descreve o impacto como "misto no KC". Pede o peso Baixo e trocar o câmbio
isolado pelo preço real: o arábica do Cepea em reais contra o ICF em reais ("quando o preço real cai em relação ao custo
de oportunidade, o produtor tende a segurar a oferta").

O Indicador do Café Arábica CEPEA/ESALQ não tem fonte automatizável: o site bloqueia automação e o arquivo `Indic` da
B3, de onde vem o do milho, não traz o café (ADRs 0021 e 0028). O KC de Nova York está na base desde 2000 (Yahoo, fonte
não oficial e provisória, ADR 0129), e a PTAX, desde o Plano Real.

Até aqui, o F4 ia ao prompt com pressão própria: em 21/10/2026, "alta forte" (a PTAX caiu 3,9% em 10 pregões).

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`), entre três opções:
informação com o peso Baixo; só o peso Baixo, mantendo a pressão; ou levar tudo ao Comitê.

## Evidência (banco de dev, 2026-10-21)

O KC de Nova York (Yahoo, `KC=F`, o dia da rolagem zerado) a partir do pregão seguinte ao fim de cada semana.

**O F4 como estava** (933 semanas, de 2008-11 a 2026-10; a fração das semanas em que o KC subiu):

| Pressão do F4 | 10 pregões | 20 pregões | 60 pregões |
|---|---|---|---|
| Alta (176 semanas) | 51% | 50% | 50% |
| Neutra (573) | 48% | 50% | 50% |
| Baixa (184) | 48% | 48% | 49% |
| Todas | 49% | 50% | 50% |

Por período, o resultado se contradiz: de 2008 a 2015, a pressão de alta foi seguida de queda (o KC subiu em 20 pregões
em 40% das semanas, contra 46% em todas); de 2016 a 2026, as duas pressões foram seguidas de alta (56% depois da alta,
52% depois da baixa, 52% em todas). Confirma o ADR 0086 com um preço diário, no lugar da média mensal do FMI.

**O café em reais** (o KC × a PTAX do dia), no percentil dos 1.260 pregões anteriores (5 anos), de 2004 a 2026:

| Percentil do KC em reais | 60 pregões | 120 pregões | Observação |
|---|---|---|---|
| Abaixo de 20 | +7,3%, subiu em 62% | +20,0%, 77% | 3 episódios só: 2013 e 2018-19 |
| De 20 a 80 | +2,5%, 50% | +3,6%, 49% | — |
| 80 ou mais | +1,9%, 50% | +4,6%, 51% | De 2004 a 2015, subiu em 60 pregões em 42%; de 2016 a 2026, em 59%: o sinal se inverte |

O KC em dólar no mesmo percentil dá um quadro parecido: a conversão para reais não acrescenta um sinal estável. Na
semana de 16/10/2026, o café em reais estava em R$ 1.940 por saca, no percentil 65,8.

## Decisão

1. **O F4 vai ao prompt como INFORMAÇÃO** (`informativo`, papel decidido pelo usuário), como os fundos (ADR 0132): sem
   pressão própria e fora de `fatoresAFavor` e `fatoresContra` (a validação da resposta recusa). A regra continua
   calculada e na tela. O item 8 do prompt do café (v12) diz como ler.
2. **O peso passa de Médio a Baixo**, no prompt e na tela, com o do FEL 1 ao lado ("peso Baixo, decidido pelo usuário;
   Médio no FEL 1"). Mecanismo novo em `metodologia-base.js`: um ajuste de peso ao FEL 1 com `noPrompt` vira o peso do
   fator (sem ele, como no milho, o ajuste fica só na tela).
3. **F4 v2:** o café de Nova York em reais (o KC contínuo do último pregão até o fim da semana × a PTAX, em R$/saca) e o
   percentil dele nas 260 semanas anteriores (mínimo de 200), como contexto: o "preço real" possível sem o Cepea, sem o
   diferencial do físico.
4. **Com o Comitê** (perguntas na metodologia do café e no status, E8): buscar uma fonte para o preço físico (o Cepea por
   exportação manual ou assinatura) e decidir se o preço em reais ganha uma regra, com o custo de produção (o F5) como o
   custo de oportunidade, o que juntaria o F4 e o F5 (a sugestão do status para o E8 e o E9).

## Consequências

- A IA deixa de receber "alta forte" do câmbio; recebe a PTAX, a variação, o café em reais e o percentil dele, como
  informação.
- O peso Baixo, sem o calendário de pesos, só muda o rótulo que a IA lê: os pesos numéricos por horizonte são a §3 do
  documento.
- O café em reais usa o KC do Yahoo, fonte não oficial e provisória (ADR 0129); sem o KC da semana (mais de 7 dias sem
  dado), o quadro fica vazio.
