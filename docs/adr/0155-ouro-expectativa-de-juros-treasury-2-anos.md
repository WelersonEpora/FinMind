# 0155 — Ouro: a expectativa de juros (o Treasury de 2 anos), fator fora do FEL 1, com peso Baixo no MEDIO e no LONGO

## Contexto

O item **M1** do "Relatório de oportunidades de melhoria: sistema de sinais do ouro (prompt ouro-v3)", de 2026-11-01
(resposta no `STATUS_DO_PROJETO.md`, §0), pede um fator novo de expectativa de política monetária, com prioridade Alta:
o preço reage à surpresa de política monetária, não ao nível do juro, e o F1 mede o juro observado, que chega depois do
movimento. Propõe as probabilidades implícitas do CME FedWatch por reunião, com o IC nos quatro horizontes.

O CME FedWatch é fonte nova e paga para uso automático. O **Treasury de 2 anos** (FRED.DGS2, diário desde 1976) já é
coletado, desde a fase 1 do dólar (ADR 0119): é o prazo da curva que mais reage ao que o mercado espera do Fed, e é o que
o dólar usa no lugar do FedWatch (ADR 0126). Depois das decisões do E1 e do E4 (ADRs 0150 e 0154), o ouro ficou sem
nenhum fator com voto no CURTO além das minas, e com os bancos centrais e as minas no MEDIO e no LONGO.

## Evidência (banco de dev, ouro da LBMA)

O IC por horizonte (`npm run ic:ouro`, o método do ADR 0150), no sentido do documento (a expectativa de juros subindo =
pressão de baixa). Entre colchetes, o intervalo de 90% do bootstrap em blocos; `*`, o intervalo exclui o zero.

| Medida, 2006 a 2026 | 1 pregão | 5 | 21 | 62 |
|---|---|---|---|---|
| 2 anos, variação de 1 semana | **+0,05** `*` | **+0,06** `*` | +0,04 | +0,06 |
| 2 anos, variação de 4 semanas | +0,02 | +0,01 | +0,07 | **+0,12** `*` |
| **2 anos, variação de 13 semanas** | +0,03 | **+0,06** `*` | **+0,12 [+0,02; +0,21]** `*` | **+0,17 [+0,04; +0,31]** `*` |
| 2 anos menos a meta do Fed (desde 2008-12) | **+0,06** `*` | +0,06 | +0,07 | +0,12 |

A variação de 13 semanas é a única consistente: positiva nas duas metades (+0,11 e +0,13 em 21 pregões) e em 48 de 79
janelas de 12 meses. A distância até a meta troca de sinal entre as metades (−0,20 e +0,21 em 21 pregões).

**Fora da amostra, 1977 a 2005** (o período que não entrou em nenhuma escolha), a variação de 13 semanas: +0,00, −0,01,
+0,04 e +0,05, o mesmo lado e cerca de um terço do tamanho, sem significância. A relação é do regime pós-2006, em que o
Fed domina o ouro. É também a diferença para o F1: o juro real de 10 anos observado não antecipou o ouro em nenhum
horizonte (ADR 0150); a expectativa de 2 anos, sim, em 30 e 90 dias.

**O fator, com as faixas** (os limites abaixo), mede o mesmo: +0,06, +0,05, **+0,10** `*` e **+0,17** `*` de 2006 a 2026
(+0,10 e +0,11 nas duas metades, em 21 pregões); de 1977 a 2005, −0,03, +0,00, +0,03 e +0,04.

## Decisão

**Quem decidiu:** o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind. A alternativa conservadora (só informação, decidindo o voto depois de um ano) foi descartada:
um fator de informação não muda a leitura (o validador recusa citá-lo a favor ou contra), e um ano a mais (~52 semanas,
com margem de erro de ±0,14 no IC) não resolveria a dúvida do regime.

1. **Fator novo, fora do FEL 1: "Expectativa de juros do Fed (Treasury de 2 anos)"** (`OURO_EXPECTATIVA_JUROS`;
   `factors/expectativa-juros-ouro.factor.js`, no molde dos juros, com a janela de 13 semanas). A medida: o 2 anos na
   média da semana; a comparação: o mesmo 13 semanas antes; a leitura: subindo além de 0,15 p.p. pressiona o ouro para
   baixo, caindo, para cima, forte a partir de 0,5 p.p. (os percentis 40 e 80 de |variação| de 2006 a 2026, 0,12 e 0,47
   p.p., arredondados); a meta do Fed como contexto.
2. **Peso Baixo e voto só no MEDIO e no LONGO**, onde está o sinal. O peso Baixo, pela fraqueza fora da amostra.
3. **Validação própria do fator** (`validacao`, nova em `metodologia-base.js`): validado pelo usuário em 2026-11-04,
   não pelo Comitê em 2026-10-07 como o resto do motor do ouro. No catálogo, com `origem: "ADR 0155"`.
4. **O prompt do ouro, v8:** o item 4 diz que ele tem voto, ao contrário do juro real, e que os dois falam do Fed (não
   contar duas vezes). Metodologia ouro-v6.
5. **O acompanhamento:** o `npm run ic:ouro` (agora com `--ate`, para o teste fora da amostra) mede o fator; se o sinal
   sumir, ele volta a ser informação.

## Consequências

- Votam no ouro: no IMEDIATO, a geopolítica (Baixo) e as minas; no CURTO, só as minas; no MEDIO e no LONGO, os bancos
  centrais, as minas e a expectativa de juros.
- O sinal é modesto (IC de +0,10 a +0,17): melhora a margem das leituras de 30 e 90 dias, não as torna certeiras. Se a
  relação for do regime pós-2006 e o regime acabar, o fator erra até o acompanhamento mostrar; o peso Baixo limita o
  efeito.
- O molde dos juros (`modelos/juro-variacao-semanal.js`) aceita a janela da variação (`semanasVariacao`, padrão 26).
- A leitura diária de eventos passa a poder marcar um fato com o fator novo (a lista de fatores do prompt de eventos vem
  do catálogo): uma decisão do Fed fora do esperado, por exemplo. Esses eventos vão à seção de eventos do ouro (2.5), sem
  voto, como os dos outros fatores calculados (ADR 0095).
