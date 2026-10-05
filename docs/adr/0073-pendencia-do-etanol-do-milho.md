# 0073 — A pendência do etanol do milho (F5): só a parte dos EUA

**Status:** aceita (2026-10-05).

## Contexto

O fator "Demanda de etanol e milho para biocombustível" do milho (F5, ADR 0056) calcula só a parte dos EUA: a produção
semanal de etanol da EIA 3% ou mais abaixo da média de 4 semanas pesa para baixa (parte da R-ETA-02 v0 do David). A
regra de alta (R-ETA-01) e o resto da de baixa pedem a margem do etanol de milho e a moagem do Brasil (UNEM, ANP,
Cepea), que não estão na base. A pergunta ao David era: sem o etanol brasileiro, a v1 roda só com a parte dos EUA,
declarando a lacuna?

**A margem sem fonte nova:** não dá. A margem precisa do preço do etanol, e a EIA publica a produção e os estoques, não
o preço. Seria fonte nova (USDA AMS ou Cepea).

**Validação contra Chicago** (o preço mensal do milho americano do FMI, ADR 0069; cerca de 840 semanas, 2010 a 2026):

| Medida | Junto com o preço (3 meses até o mês) | 1 mês depois | 3 meses depois |
|---|---|---|---|
| Produção contra a média de 4 semanas | +0,03 | 0,00 | +0,01 |
| Produção contra o ano anterior | +0,07 | +0,05 | −0,10 |

Pela regra, 3 meses depois, o preço subiu em 47% das semanas com pressão de baixa e em 49% das neutras. Diferente do
clima e dos estoques (ADRs 0069 e 0071), o F5 não tem relação nem junto com o preço. A queda semanal da produção de
etanol é, na maior parte, ruído (frio, feriados, manutenção das usinas).

## Decisão (usuário, Welerson, 2026-10-05)

- **A v1 roda só com a parte dos EUA**, como o cálculo já faz, declarando a falta do etanol brasileiro e da margem.
- **A validação histórica do fator** (a parte D do prompt) passa a dizer o resultado contra Chicago: sem relação.
- **O peso do David não muda.** Uma redução seria um número do FinMind, sem base, como no F1 (ADR 0069).

A pergunta sai das Pendências do F5 e vira decisão. O cálculo não muda. A metodologia do milho vai à v9.

## Consequências

- O F5 não tem mais pendências com o especialista. A regra de alta continua sem dado (a margem).
- A margem e o etanol brasileiro só entram com uma demanda e uma autorização próprias (fonte nova).
