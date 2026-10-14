# Manual das carteiras virtuais

Como funciona uma carteira virtual do FinMind, para quem a acompanha na tela. As regras e o porquê de cada decisão estão
no ADR 0127; este manual só explica o funcionamento.

## 1. O que é

Uma carteira virtual é uma **simulação**: nenhuma ordem real é enviada, e nenhuma corretora está ligada ao FinMind. Ela
aplica as regras da Cartilha de Operações v1.0 do Comitê (risco por operação, stop, alvos e travas) para responder uma
pergunta: **a recomendação da IA agrega valor sobre uma regra fixa?**

Na criação, a carteira recebe a conta (hoje, só a B3), o capital inicial, a data de início e os ativos (na B3: milho,
café e soja). Os parâmetros começam nos padrões da Cartilha e só mudam por uma versão nova, registrada com motivo, na aba
Configuração.

## 2. Como criar uma carteira do zero

**Quem pode criar:** só o **proprietário** do espaço. Os outros membros veem as carteiras do espaço, mas não criam nem
mudam nada. Para uma carteira só sua, crie no seu espaço pessoal; num espaço compartilhado, todos os membros a veem.

**Passo a passo:**

1. No menu lateral, no grupo **Espaço**, escolha o espaço no seletor e clique em **Carteiras**.
2. Clique em **Nova carteira**.
3. Preencha os campos:

| Campo | O que colocar |
|---|---|
| **Nome** | Um nome que identifique a carteira (ex.: "B3 – Cartilha v1.0"). Não pode repetir outro do mesmo espaço. |
| **Conta** | **B3** (em reais). A conta internacional (ouro e petróleo, em dólar) aparece como "em breve". |
| **Capital inicial** | O valor simulado. O padrão é **R$ 10.000**, o da Cartilha. O resultado é medido em % e em R, então o valor não muda a comparação entre as trilhas. |
| **Início (1ª rodada)** | Um dia útil (segunda a sexta) **a partir do próximo dia útil**. A carteira nunca começa no passado nem no próprio dia. |
| **Ativos** | Milho, café e soja vêm marcados. Desmarque os que não quiser; pelo menos um. A Cartilha trata a soja como ativo de observação até o Comitê decidir. |

4. Clique em criar. A carteira abre na hora.

**Antes de criar, saiba que:**

- **Conta, capital, início e espaço não mudam depois.** Não dá para mover a carteira para outro espaço nem excluí-la,
  e um espaço com carteira não pode ser excluído. Confira os campos antes de criar.
- **Os parâmetros começam nos padrões da Cartilha v1.0:** risco por operação, stop, alvos e travas. O custo por contrato
  começa pendente (conta como zero) até chegar o número real.

**Depois de criar:**

- Até o dia do início, a carteira mostra um aviso e as abas ficam vazias. Não precisa fazer nada: a rotina das 06h30
  decide a 1ª rodada no dia do início e segue sozinha a partir daí (seção 4).
- **Para mudar um parâmetro**, use a aba **Configuração** (só o proprietário). Cada mudança vira uma versão nova, com
  motivo, e vale a partir da próxima rodada para as três trilhas. A mudança reinicia a contagem da medição; a exceção é
  o custo por contrato, que vale desde o início e não reinicia nada.

## 3. As trilhas e as referências

Toda carteira tem **três trilhas**, que operam lado a lado com o mesmo capital, a mesma data de início e as mesmas
regras. Muda só **quem decide**:

| Trilha | Quem decide |
|---|---|
| **IA** | A recomendação diária da IA, aplicada automaticamente. |
| **Determinística** | Uma regra fixa sobre as leituras de tendência do dia, sem chamar a IA. |
| **Operador** | Você, pelo diário (ainda em construção). |

Ao lado delas, três **referências**, calculadas pelo mesmo motor e sem nenhuma decisão:

| Referência | O que faz |
|---|---|
| **Só caixa** | O capital parado, rendendo a Selic. |
| **Comprar e segurar** | Fica comprada em todos os ativos o tempo todo. |
| **Persistência** | Segue a direção do preço nos últimos 30 dias. É a única sem nenhuma IA. |

## 4. O dia a dia

A carteira roda sozinha todo dia, às **06h30**, em duas fases:

1. **Decide o dia (D)** com dados até o fechamento da véspera (D−1) e as leituras de tendência da madrugada. A IA recebe
   só as leituras e os eventos de mercado, nunca o estado da carteira.
2. **Liquida o dia (D)** na manhã seguinte (D+1), com o ajuste de D: as entradas, os stops, os alvos, a marcação das
   posições e o rendimento do caixa.

Assim, nenhuma decisão usa um dado que ainda não existia na hora de decidir. Fim de semana e feriado não têm rodada.

## 5. Quanto dinheiro vai em cada ativo

**Na criação, não se define quanto vai para cada ativo, e não existe uma alocação inicial.** Cada trilha começa com o
capital inteiro em caixa e só entra num ativo quando decide entrar.

**A trilha decide só se entra e para que lado** (comprado ou vendido). **O tamanho da posição quem calcula é o motor de
risco**, igual para as três trilhas, pela fórmula da Cartilha:

- **Risco máximo** = patrimônio × risco por operação do ativo (2% no milho, no café e na soja)
- **Quantidade** = risco máximo ÷ (distância até o stop × valor de um ponto do contrato)

O stop fica a 1,5 vez o ATR(14) do contrato (a variação média diária dos últimos 14 pregões). Quanto mais o preço oscila,
mais longe fica o stop e menor fica a posição: a perda, se o stop for atingido, é sempre de cerca de 2% do patrimônio.

**Exemplo** (números ilustrativos): patrimônio de R$ 10.000 e milho com ATR de R$ 1,50 por saca.

- Risco máximo: 10.000 × 2% = **R$ 200**
- Distância até o stop: 1,5 × 1,50 = R$ 2,25 por saca
- Um contrato de milho tem 450 sacas: risco de 2,25 × 450 = R$ 1.012,50 por contrato
- Quantidade: 200 ÷ 1.012,50 = **0,197 contrato**

A quantidade é **fracionária**. Com R$ 10.000, um contrato inteiro da B3 não cabe no risco de 2%. Cada ordem mostra, como
indicador, quantos contratos inteiros caberiam e o capital mínimo para isso. Como o resultado é medido em % e em R
(múltiplos do risco), ele não muda com o tamanho.

**O motor ainda barra entradas:**

- No máximo **2 posições abertas** ao mesmo tempo por trilha.
- **Travas:** perder 4% no dia ou 8% na semana suspende novas entradas até o dia ou a semana seguinte; um recuo de 10%
  pausa a trilha até uma retomada manual; 3 perdas seguidas pausam a trilha por 5 pregões.

**A exceção é a referência "comprar e segurar":** ela entra em todos os ativos no 1º dia, com uma parte igual do
patrimônio em cada um (1/3 com milho, café e soja), sem alavancagem, stop nem alvo, e fica comprada.

Como as três trilhas usam a mesma regra de tamanho, a comparação entre elas mede só a qualidade das decisões de entrar
e sair.
