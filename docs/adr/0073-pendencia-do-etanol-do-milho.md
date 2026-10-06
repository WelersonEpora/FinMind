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

## Adendo (2026-10-06): as fontes brasileiras do etanol (UNEM e ANP) não foram aprovadas

**Contexto.** No Motor do Milho v0 (próximos passos), o David pediu para corrigir a fonte do F5 no FEL 1: "etanol com
fontes brasileiras (UNEM, ANP)". Com a delegação do David ao usuário para seguir com os ajustes do FEL 1 no milho, foi
feito um estudo preliminar das duas fontes (2026-10-06), com chamada real:

| Fonte | O que publica | Viável? |
|---|---|---|
| UNEM (`etanoldemilho.com.br/dados-setoriais/`) | Gráficos em imagem (produção, moagem, DDG) e um mapa das usinas; os números saem como projeções anuais em notícias | **Não**: nenhum arquivo, tabela ou série para baixar |
| ANP (Painel Dinâmico de Produtores de Etanol, `pb-da-etanol.zip`) | CSV mensal da matéria-prima processada por estado, com o milho separado, de jan/2017 a ago/2026 (atualizado em 2026-09-22, cerca de 3 semanas de atraso); a produção e a capacidade por usina, sem a matéria-prima | **Sim** (nível 4, o padrão do coletor de petróleo da ANP, ADR 0041); sem versões (sobrescreve) |

O milho moído para etanol no Brasil, pela ANP: 0,95 Mt em 2017, 5,8 Mt em 2020, 13,3 Mt em 2023 e 21,5 Mt em 2025; em
2026, cerca de 2,2 Mt por mês, 60% em Mato Grosso.

**Por que a ANP sozinha não basta.** A regra de alta do David (R-ETA-01) pede a margem no percentil 70 ou acima **e** a
moagem crescendo contra o ano anterior. A moagem da ANP cresceu contra o ano anterior em **104 de 104 meses** (2018 a
2026): a condição é sempre verdadeira e não distingue nada. Quem decide a regra é a margem, que pede o preço do etanol e
do DDG (outra fonte nova, o Cepea, com licença não comercial). A queda mensal da moagem (parte da R-ETA-02) não foi
testada.

**Decisão (usuário, Welerson, 2026-10-06):** no estudo preliminar, as duas fontes **não foram aprovadas**: a UNEM não tem
dado para coletar, e a ANP, apesar de viável, não é capaz de ligar a regra sozinha. O F5 continua só com a EIA, e a
correção da fonte no FEL 1 fica registrada como pedida e não aprovada. A pergunta sai das pendências; a metodologia do
milho vai à v19. Voltar a discutir pede uma demanda nova (por exemplo, a margem com uma fonte de preço autorizada).
