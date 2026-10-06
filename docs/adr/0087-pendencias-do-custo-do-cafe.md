# 0087 — As pendências do custo do café (F5): a mediana dos municípios e o custo operacional como COE

**Status:** aceita (2026-10-06).

## Contexto

O F5 do café ("Custo de produção e margem do arábica", ADR 0060) compara o ICF em reais com a mediana do custo por saca
do arábica entre os municípios da Conab: 4 semanas com a margem em 0% ou menos pesa para alta (moderada sobre o custo
total, forte sobre o operacional). Duas perguntas estavam abertas: a mediana dos municípios representa as "praças
produtoras padrão" do estudo, ou se escolhem municípios? O custo operacional da Conab serve como o "Custo Operacional
Efetivo" (COE) do estudo?

O custo da Conab só é conhecido na base desde a 1ª coleta (2026-10-01), então o fator point-in-time começa agora. Para
olhar o histórico, o FinMind comparou o preço do grupo Brazilian Naturals da ICO (2011 a 2026; o arábica "Other Mild"
do FMI fica sempre acima do custo brasileiro), em reais por saca pela PTAX, com a mediana do custo do ano anterior, sem
gravar nada.

| Custo | Meses com o preço abaixo | Anos | Preço 12 meses depois |
|---|---|---|---|
| Variável | nenhum (margem mínima +2%, em 2013) | — | — |
| Operacional | 2 | 2013 | +78% |
| Total | 6 | 2013 e 2014 | +59% |

Um episódio só em 15 anos, e a alta seguinte coincidiu com a seca de 2014. Hoje a margem vai de +76% a +157%, conforme o
custo.

Sobre os municípios: só Sul de Minas e Cerrado (Guaxupé, Três Pontas e Patrocínio) dariam R$ 1.113 por saca de custo
total em 2025, contra R$ 1.051 da mediana (6%). A Conab muda a lista de um ano para outro (10 municípios com custo de
arábica em 2024, 7 em 2025).

Sobre o COE: no conceito usual, é o desembolso, sem depreciação. O "custo operacional" da Conab inclui a depreciação e
outros custos fixos; o mais perto do COE estrito é o custo variável da Conab (de 74% a 94% do operacional).

## Decisão (usuário, Welerson, 2026-10-06)

1. **Praças produtoras:** fica a mediana dos municípios de arábica da Conab. A troca da lista entre os anos fica como
   ressalva do fator.
2. **COE:** fica o custo operacional da Conab, com a ressalva de que ele fica um pouco acima do COE estrito. Com o
   variável, a regra não teria disparado em 15 anos; com o operacional, disparou na única crise de margem.
3. **Validação histórica:** o resultado vai ao prompt (bloco D do fator): o fator raramente pesa, e o histórico não
   basta para validá-lo.

## Consequências

- O cálculo do F5 não muda; a metodologia do café vai à v8, e o F5 não tem pergunta pendente.
