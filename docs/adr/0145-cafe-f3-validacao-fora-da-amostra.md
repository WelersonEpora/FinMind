# 0145 — Café, F3: a validação fora da amostra da regra proposta (pré-registro) e o F3 como informação até lá

## Contexto

O ADR 0143 propôs ao Comitê uma regra nova para o F3 (estoques certificados da ICE): só no horizonte LONGO, a queda do
estoque fora do normal pesa para **baixa** (moderada abaixo do percentil 10 da variação em 4 semanas, fraca do 10 ao
20), e a entrada fora do normal fica neutra. A regra foi calibrada no diário da ICE do servidor, de 12/2019 a 10/2026.

O Comitê, na resposta recebida em 2026-10-22: "E3 (sentido do F3 só no LONGO, entrada neutra): APROVADO CONDICIONADO a
validação fora da amostra. Não criar fator de curva por ora."

O horizonte, o sentido e os limiares da regra foram escolhidos olhando a amostra inteira, então o "positivo nas duas
metades" do ADR 0143 mostra estabilidade, não validação. **Há evidência contrária:** no mensal da ICO de 2012 a 2026, 3
meses seguidos de queda do estoque foram seguidos de alta em 61% das vezes, contra 49% na base (ADR 0085), com outra
definição. Se o sinal invertido só existir no aperto de 2022 a 2026, a regra é de um regime.

**Quem decidiu:** o usuário (Welerson), em 2026-10-23, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
proposta do FinMind: os desenhos A e C, o critério abaixo e o F3 como informação até a validação.

## Decisão: o pré-registro

Escrito **antes** de rodar o teste. O desenho e o critério não mudam depois de ver o resultado. Uma mudança seria uma
decisão nova, registrada aqui, e o resultado de antes dela continua valendo.

### A regra testada (congelada)

A do ADR 0143, sem ajuste: o percentil da variação do estoque contra o próprio histórico. Abaixo do 10, **baixa
moderada** (escore −2); do 10 ao 20, **baixa fraca** (−1); do resto, **neutra** (0). Medida contra o retorno do KC de
Nova York nos **62 pregões** seguintes (o LONGO). O código está em `factors/regra-f3-validacao.js`.

### Desenho A: histórico independente (ICO, mensal, até 2019)

- **Dado:** o estoque certificado de Nova York do relatório mensal da ICO (`ICO.CAFE.ESTOQUE_NOVA_YORK`, desde 10/2012),
  outra fonte e um período anterior à calibração. A série vem com a data de publicação de cada relatório.
- **Medida:** a variação do mês contra o mês anterior (1 mês, no lugar das 4 semanas). O percentil é contra os 60 meses
  anteriores (as 260 semanas da regra), com um **mínimo de 36 meses**, uma adaptação ao histórico mais curto.
- **Quando o sinal vale:** na publicação do relatório. O retorno do KC parte do 1º pregão depois dela.
- **Amostra:** os meses com o sinal conhecido até **31/08/2019**, para os 62 pregões seguintes terminarem antes de
  12/2019, quando começa a amostra da calibração.
- **O KC:** `YAHOO.KC_CONTINUO.SETTLE`, com o retorno do dia da troca de vencimento zerado (o mesmo ajuste do momentum,
  ADR 0139).

### Desenho C: daqui para frente (sombra)

- A regra congelada, no diário da ICE (a variação em 4 semanas contra as 260 semanas anteriores, mínimo de 200), em
  cada semana **depois de 23/10/2026**, contra o KC nos 62 pregões seguintes.
- **Fora do prompt e do Centro de Decisão:** só medida, pelo comando `npm run validacao:f3 -- --desenho=C`, junto da
  revisão mensal da §6 (ADR 0141).
- **Primeira avaliação formal em 23/04/2027** (6 meses), depois a cada mês, até haver pelo menos 3 episódios com o
  resultado vencido ou até 23/10/2027.

### O critério (vale para os dois desenhos)

- **Passa** se, na amostra: (1) depois do sinal de baixa, o KC subiu em menos casos do que sem sinal, com diferença de
  **pelo menos 10 pontos percentuais**; (2) o **IC** da leitura da regra (a correlação de postos entre o escore e o
  retorno) é **positivo**; e (3) há **pelo menos 3 episódios** separados de sinal (meses ou semanas seguidos com sinal
  contam como um episódio).
- **Não passa** se o sentido sair o oposto ou igual ao da base (diferença menor que zero, ou IC zero ou negativo, com
  pelo menos 3 episódios). Nesse caso, a regra não é adotada, e o F3 segue sem a pressão nova.
- **Inconclusivo** em qualquer outro caso: menos de 3 episódios, ou diferença entre 0 e 10 pontos com o IC positivo.
  Nesse caso, vale só o C.
- **Sem exigência de significância estatística:** com essa amostra, ela reprovaria qualquer regra. "Passou" quer dizer
  que o sentido se repetiu fora da amostra com uma diferença que importa, não que é estatisticamente provado.

### Até a validação: o F3 como informação

A regra atual do F3 (queda fora do normal = alta) deu o sinal invertido em 2022 a 2026 (ADR 0131). Até a validação, o F3
vai ao prompt como **INFORMAÇÃO**, como o F4 e o F7: sem pressão própria, fora dos fatores a favor e contra (a resposta
que o citar é recusada), com a medida, o nível e o contexto como estão. A regra atual continua calculada na tela.

### Curva

"Não criar fator de curva por ora": a curva do ICF segue no prompt como informação (bloco 2.2).

## Resultado do desenho A (2026-10-23): não passa

Rodado no banco de dev com `npm run validacao:f3 -- --desenho=A`, depois do pré-registro acima. São 48 meses com o
sinal e o resultado, publicados de 14/09/2015 a 14/08/2019 (o percentil precisa de 36 meses, então a amostra começa em
2015). O KC vem do Yahoo, de 2000 a 19/10/2026.

| | Meses | O KC subiu em 62 pregões | Retorno médio |
|---|---|---|---|
| Com sinal de baixa (percentil abaixo de 20) | 12 | 75,0% | +4,3% |
| Sem sinal | 36 | 30,6% | −4,2% |

- **Diferença a favor da regra:** −44,4 pontos percentuais (o mínimo era +10).
- **IC:** −0,32 (precisava ser positivo).
- **Episódios:** 4 (o mínimo era 3): 09/2015 (um mês só), 11/2015 a 05/2016, 07 a 08/2016 e 04 a 05/2018.
- **Veredito: NÃO PASSA.** O sentido saiu o oposto do da calibração, com episódios suficientes. Pelo critério
  pré-registrado, a regra não é adotada, e o F3 segue sem a pressão nova.

**Leitura.** De 2015 a 2019, a queda rápida do estoque de Nova York veio antes de **alta** do KC. De 2022 a 2026, veio
antes de baixa (ADR 0143). O mensal da ICO de 2012 a 2026 já apontava para a alta (ADR 0085). A variação do estoque não
tem um lado estável: o sinal depende do regime. O F3 como informação, sem voto, é o papel que o histórico sustenta.

**Ressalvas.** O dado é mensal (a média do mês) e não diário, e a base do período (2017 a 2019) foi de queda do café. Em
alguns relatórios, mais de um mês saiu na mesma publicação (2016-12, 2017-03, 2018-03, 2018-11): cada mês entra com a
data em que foi publicado, como no pré-registro.

**O que segue.** O desenho C (`npm run validacao:f3 -- --desenho=C`, no servidor) segue como acompanhamento, com a 1ª
avaliação em 23/04/2027. Como o A não passou, um resultado favorável no C não adota a regra sozinho: adotar exige uma
decisão nova do Comitê, com os dois resultados à vista.
