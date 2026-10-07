# 0103 — As pendências da oferta não-OPEP do petróleo (F10): somada, como leitura da situação

**Status:** aceita (2026-10-07).

## Contexto

O F10 do petróleo ("Oferta não-OPEP (Brasil, Guiana, Noruega)", FEL 1: "alta com oferta menor; baixa com crescimento de
produção") é calculado desde 2026-10-03 (ADR 0050, §5c): a produção somada de Brasil (ANP), Noruega e Canadá (JODI; o
Canadá por decisão do usuário, e sem os EUA, que têm fator próprio), na média de 3 meses contra os mesmos meses do ano
anterior; crescendo mais de 3%, pressão de baixa; forte a partir de 7%. A Guiana não reporta a nenhuma fonte coletada.
Duas perguntas estavam abertas:

1. Os países são lidos um a um ou somados num bloco?
2. O fator mede a situação (não antecipa o preço, como a demanda): serve assim, ou a oferta não-OPEP só importa quando
   surpreende (o que exigiria a projeção da IEA ou da EIA, não coletada)?

Validação contra o Brent futuro contínuo (ADR 0097), 2011 a 2026, 187 meses, contando ~3 meses do mês do dado até a
divulgação, sem gravar nada:

| Crescimento anual (3 meses) | Brent 6 meses antes | 91 dias depois | 182 dias | 365 dias | 182 dias, sem 2014-16 e 2020-21 |
|---|---|---|---|---|---|
| Total (o fator) | −0,21 | +0,07 | +0,10 | +0,05 | +0,36 |
| Brasil | −0,24 | −0,03 | −0,01 | +0,07 | +0,19 |
| Canadá | −0,09 | −0,10 | −0,18 | −0,35 | +0,14 |
| Noruega | +0,01 | +0,31 | +0,51 | +0,52 | +0,39 |

| Total, crescimento anual | Meses | Brent subiu 91 dias depois | 182 dias depois | Variação média em 182 dias |
|---|---|---|---|---|
| ≤ −3% | 13 | 54% | 54% | +5,5% |
| Neutro (±3%) | 73 | 53% | 41% | −1,0% |
| +3% a +7% | 56 | 50% | 55% | +3,2% |
| ≥ +7% | 45 | 38% | 46% | +4,7% |
| Todos | 187 | — | 48% | — |

- O total não antecipa o preço; sem as crises, o sinal é o contrário do especialista. As faixas não se separam da base.
- Lidos um a um, os países se contradizem: a Noruega no sentido oposto (provavelmente coincidência: a produção caiu nos
  anos 2010 e voltou com o Johan Sverdrup), o Canadá no do especialista, mas instável sem as crises, e o Brasil perto
  de zero.
- A surpresa contra a projeção exigiria coletar no STEO da EIA (ADR 0091) as séries não-OPEP e as projeções, que hoje
  não são guardadas; não haveria histórico de projeções para validar.
- Em jul/2026: o total +7,83% no ano, puxado pelo Brasil (+16,5%); o Canadá +4,6% e a Noruega −2,7%. O fator dá
  pressão de baixa forte.

## Decisão (usuário, Welerson, 2026-10-07, pelo mesmo poder de decisão do David)

1. **Somados num bloco**; cada país continua na medida (A).
2. **Leitura da situação, com a direção do especialista**, o mesmo papel dos estoques e da demanda (ADRs 0097 e 0099):
   o texto D diz à IA que o fator não antecipa o preço e que, sem as crises, o histórico aponta o contrário. As
   alternativas (contexto sem pressão, como o refino no ADR 0093; ou só a surpresa contra o STEO) ficaram de fora.

## Implementação

- **Metodologia do petróleo v10:** o F10 sem perguntas, com as duas decisões e o texto D com a validação contra o Brent
  futuro. O cálculo (`oferta_nao_opep_br_no_ca` v1) não muda. Com isso, nenhum dos 10 fatores do petróleo tem pergunta
  pendente; seguem as do ativo (formato da leitura, peso e agregação, validação dos eventos e a confirmação do Brent
  futuro), para a conversa com o David.
- **Prompt diário do petróleo v9:** com as validações dos 10 fatores feitas contra o Brent, o bloco 1 deixa de dizer
  que parte delas é do WTI; só o COT dos fundos é medido no WTI. O aviso previsto no ADR 0097 se encerra aqui.

## Consequências

- Os fatores do petróleo têm três papéis: pressão que antecipa (dólar, juros e, apoiada em poucos episódios, produção
  dos EUA), pressão como leitura da situação (estoques, demanda e oferta não-OPEP) e sem pressão própria (refino como
  contexto, fundos como informação), mais a OPEP+, calculada com eventos (ADR 0091), e a geopolítica, fator de evento
  (ADR 0098).
- As leituras já gravadas não mudam.
