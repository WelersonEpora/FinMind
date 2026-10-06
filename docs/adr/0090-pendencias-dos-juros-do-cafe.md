# 0090 — As pendências dos juros do café (F8): o dólar global como condição da baixa e o juro nominal

**Status:** aceita (2026-10-06).

## Contexto

O F8 do café ("Juros e liquidez global", ADR 0060) lê a variação do Treasury de 10 anos em 26 semanas (o molde dos
juros do petróleo): juro caindo pesa para alta, subindo para baixa. As regras do estudo citam o dólar global (o DXY,
licenciado; o substituto é o índice amplo do Fed, `FRED.DTWEXBGS`) e, na baixa, as "taxas reais". Duas perguntas
estavam abertas: o dólar global entra como condição das regras? O juro nominal serve, ou o estudo quer o juro real?

O FinMind rodou o próprio cálculo do F8 (2007 a 2026), o juro real (`FRED.DFII10`, a mesma regra de 0,5 p.p. em 26
semanas) e o índice do Fed em 26 semanas contra o preço mensal do arábica do FMI (FRED `PCOFFOTMUSDM`), sem gravar nada.
Em todas as semanas, o preço subiu em 3 meses em 49% e em 6 meses em 52%.

| Leitura | Semanas | 3 meses / 6 meses |
|---|---|---|
| Nominal caindo (alta) | 189 | subiu em 57% / 63% |
| Nominal subindo (baixa) | 209 | caiu em 57% / 55% |
| Baixa com o dólar subindo | 123 | caiu em 70% / 67% |
| Baixa com o dólar caindo | 86 | caiu em 38% / 38% |
| Alta com o dólar caindo | 70 | subiu em 57% / 54% |
| Alta com o dólar subindo | 119 | subiu em 57% / 69% |
| Real caindo 0,5 p.p. ou mais (alta) | 152 | subiu em 51% / 57% |
| Real subindo 0,5 p.p. ou mais (baixa) | 119 | caiu em 55% / 56% |

O F8 é o fator do café em que o histórico confirma o sentido do estudo, nos dois lados. A condição do dólar é
assimétrica: separa a baixa e não melhora a alta. Ressalva: semanas sobrepostas, preço mensal.

## Decisão (usuário, Welerson, 2026-10-06)

1. **Dólar global, só na baixa:** o juro subindo só pesa para baixa com o índice amplo do Fed subindo em 26 semanas;
   sem isso, neutra. Na alta, sem condição. Sem o índice (antes de 2006), a condição não é aplicada, e o ponto diz isso.
2. **Juro nominal:** fica o Treasury de 10 anos; o real foi pior nos dois lados.
3. **Validação histórica:** o resultado vai ao prompt (bloco D do fator).

## Consequências

- O cálculo do F8 vai à v2 (`juros-cafe.factor.js`: lê também `FRED.DTWEXBGS`; o índice da semana é o último dia
  publicado até o ponto). De 2007 a 2026, 91 das 126 semanas de baixa ficam neutras. Em 2026-10-02 (Treasury +0,93 p.p.,
  dólar −0,27%), a leitura passa de baixa a neutra; isso entra na família Juros da agregação do café (Médio e Longo).
- A metodologia do café vai à v11; o F8 não tem pergunta pendente.
