# 0083 — As pendências do clima do café (F1): o VHI na v1, as janelas do estudo e o INMET depois

**Status:** aceita (2026-10-06).

## Contexto

O F1 do café ("Clima nas regiões de arábica", ADR 0060) mede o estresse da lavoura pelo VHI da NOAA STAR sobre a área
de café de MG, SP, ES e BA (ADR 0031), ponderado pela produção de arábica da Conab, contra a mesma semana dos 30 anos
anteriores. Só decide nas janelas críticas do Motor do Café v1: junho a agosto (geada) e setembro a novembro (florada e
pegamento). O estudo pede as variáveis do INMET (chuva, temperatura mínima, horas de frio, balanço hídrico), fonte
não coletada; o ADR 0061 deixou o INMET à espera do índice.

Três perguntas do fator e uma do ativo estavam abertas: o VHI serve como medida da v1? O enchimento dos grãos (dezembro
a março) entra como janela crítica, já que a seca de jan-fev/2014 ficou neutra? O INMET entra como fonte nova? Com qual
índice?

Para a segunda, o FinMind rodou o F1 no histórico (sem gravar nada): a decisão do fator semana a semana, contra o
preço mensal do arábica do FMI (FRED `PCOFFOTMUSDM`, 2002 a 2026), 3 e 6 meses depois.

| Janela | Semanas | Pressão de alta | Preço 3 meses depois: subiu (após alta / todas) | 6 meses depois (após alta / todas) |
|---|---|---|---|---|
| Junho a novembro (a do estudo) | 626 | 82 (13%) | 78% / 56% (média +10,1%) | 80% / 62% (+17,9%) |
| Dezembro a março (o enchimento) | 400 | 63 (16%) | 44% / 46% (−0,7%) | 52% / 47% (+3,5%) |

Na janela do estudo o fator separa; no enchimento, não acrescenta: depois da pressão de alta o preço sobe na mesma
proporção que em qualquer semana. A pior semana do enchimento foi seguida de queda em 2012, 2014, 2015 e 2017. Em 2014 o
preço subiu durante a seca, não depois, o que um teste mensal para frente não capta.

## Decisão (usuário, Welerson, 2026-10-06)

1. **Medida da v1:** o VHI da NOAA, sem o INMET. A geada, que o VHI não mostra na semana (jul/2021: −24 pontos), vem da
   leitura diária de eventos (ADR 0049).
2. **Janelas críticas:** ficam as do estudo, junho a novembro. O enchimento não entra; a seca de verão chega pelos
   eventos.
3. **INMET:** fica para depois da v1, como os fatores ausentes do milho (ADR 0080). Volta com uma demanda e uma
   autorização próprias; o índice (geada ou balanço hídrico) se decide então, e a pergunta do ativo sai junto.

As perguntas saem da metodologia do café, que vai à v4; o cálculo do fator não muda.

## Consequências

- O F1 do café não tem pergunta pendente; as decisões ficam no fator, na tela de metodologia.
- O ADR 0061 (fontes novas do café) deixa de esperar o índice do INMET: a fonte fica fora da v1.
- Abril e maio mostraram algum sinal no mesmo teste (71% de alta em 3 meses depois da pressão, contra 40% em todas as
  semanas), com poucas semanas: fica registrado, sem mudança.
