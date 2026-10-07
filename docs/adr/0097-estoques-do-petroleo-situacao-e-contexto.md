# 0097 — As pendências dos estoques do petróleo (F2): a média de 5 anos como o esperado, e os derivados como contexto

**Status:** aceita (2026-10-07).

## Contexto

O F2 do petróleo ("Estoques de petróleo dos EUA (EIA)", peso Alto) é calculado desde 2026-10-02 (ADR 0050): o estoque
de petróleo sem a reserva estratégica (SPR) contra a média da mesma semana nos 5 anos anteriores, a comparação que a
própria EIA publica; abaixo da faixa neutra (3%), pressão de alta ("alta com estoques abaixo do esperado", FEL 1); acima,
de baixa. Duas perguntas estavam abertas:

1. O "esperado" da definição pode ser lido como o normal da época (a média de 5 anos), deixando de lado a reação do dia
   da divulgação?
2. Entram Cushing, gasolina e destilados (também coletados, ADR 0040), ou só o petróleo sem SPR?

Com o preço de referência passado ao Brent futuro (ADR 0052, adendo de 2026-10-07; ADR 0096), as validações dos
fatores que ainda têm pendência passam a ser feitas contra ele. Antes, o FinMind conferiu que a troca não muda as já
feitas contra o Brent à vista (ADRs 0091, 0093 e 0094): de 2011 a 2026 (795 semanas), a variação das duas séries tem
correlação de 0,94, 0,97 e 0,98 em 30, 91 e 182 dias, com o mesmo sentido em 93%, 95% e 96% das semanas; nos 182 dias,
o Brent subiu em 47,4% das semanas nas duas.

A validação do F2 (2026-10-07, sem gravar nada): o desvio de cada semana, na data de publicação, contra o Brent futuro
contínuo do Yahoo (`YAHOO.BZ_CONTINUO.SETTLE`) 30, 91 e 182 dias depois, de 2011 a 2026.

| Estoque | Nível do Brent | Brent 30 dias depois | 91 dias | 182 dias |
|---|---|---|---|---|
| Petróleo sem SPR (o fator) | −0,50 | +0,04 | +0,08 | +0,14 |
| Total (petróleo, gasolina e destilados) | −0,56 | +0,09 | +0,12 | +0,22 |
| Destilados | −0,55 | +0,13 | +0,20 | +0,37 |
| Gasolina | −0,41 | +0,14 | +0,12 | +0,15 |
| Cushing | −0,20 | +0,08 | +0,10 | +0,14 |

| Petróleo sem SPR, desvio | Semanas | Brent subiu 182 dias depois | Variação média |
|---|---|---|---|
| ≤ −10% | 21 | 5% | −16,7% |
| −10% a −3% | 166 | 48% | +8,4% |
| Neutro (±3%) | 217 | 27% | −9,7% |
| +3% a +10% | 180 | 56% | +4,5% |
| ≥ +10% | 211 | 66% | +9,6% |
| Todas | 795 | 48% | +2,2% |

- O desvio descreve a situação: estoque abaixo do normal, preço alto (−0,50 com o nível).
- Não antecipa o preço nos horizontes da leitura (até 90 dias, perto de zero). Em 6 meses, aponta o contrário do FEL 1:
  estoque alto vem com preço baixo, que se recupera depois. O mesmo sem 2014-16 e 2020-21 (+0,27 em 182 dias; acima do
  normal, o Brent subiu em 59%; abaixo, em 32%) e numa amostra sem sobreposição (uma semana a cada 26, em seis fases:
  acima do normal, de 56% a 75%).
- A reação do dia da divulgação também não aparece: com a variação da semana longe da típica (4 milhões de barris ou
  mais), o Brent foi no sentido esperado em 54% das vezes (57% com o total). O mercado reage à previsão dos analistas,
  que é paga e não é coletada.
- Na semana de 2026-09-25, o petróleo sem SPR estava +1,9% contra o normal (neutro); os destilados, −13,0%; a gasolina,
  −7,2%; Cushing, −7,0%; o total, −3,1%.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **O esperado é o normal da época:** a média da mesma semana nos 5 anos anteriores. A reação do dia da divulgação fica
   de fora. A direção do especialista fica, como **leitura da situação**, o mesmo papel da demanda e da oferta não-OPEP;
   o texto D diz que o fator não antecipa o preço até 90 dias e que, em 6 meses, o histórico aponta o contrário, para a
   IA pesar isso na confiança. Das duas saídas (a situação com direção; contexto sem pressão, como o refino no ADR
   0093), foi a recomendada: nos horizontes da leitura a relação para frente é nula, não contrária.
2. **A pressão vem só do petróleo sem SPR.** Cushing, gasolina e destilados vão ao prompt como **contexto**, fora da
   regra: o desvio de cada um contra a mesma média. Das três saídas (os três como contexto; a medida passar ao total;
   só o petróleo), foi a recomendada: hoje o aperto está nos derivados, não no petróleo.

## Implementação

- **Cálculo `estoques_petroleo_eia` v2:** o ponto ganha `desvioCushingPct`, `desvioGasolinaPct` e
  `desvioDestiladosPct` (nulo sem as 5 mesmas semanas, como o do petróleo), e três quadros B "(contexto, fora da regra)",
  que a tela de metodologia e o texto do prompt mostram sem código novo. A decisão (camada C) não muda.
- **Metodologia do petróleo v4:** o F2 sem perguntas, com as duas decisões, a medida com o contexto e o texto D com a
  validação contra o Brent futuro. O prompt do petróleo não muda de versão: a instrução do sistema não muda, e o texto
  do fator traz a versão do cálculo.
- Os scripts da validação ficam fora do repositório (só leem o banco); os números estão aqui e no texto D do fator.

## Consequências

- O F2 não tem pergunta pendente. Os próximos fatores do petróleo (geopolítica, demanda, dólar, produção dos EUA, juros e
  oferta não-OPEP) são validados contra o Brent futuro, um a um.
- O aviso do prompt sobre fatores "validados contra o WTI" continua enquanto algum texto D citar o WTI.
- As leituras já gravadas não mudam.
