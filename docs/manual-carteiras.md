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
| **Operador** | Você, pelo diário (aba **Diário do operador**, seção 7). |

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

Assim, nenhuma decisão usa um dado que ainda não existia na hora de decidir. Fim de semana não tem rodada.

**Feriado.** O sistema não tem uma lista de feriados: ele descobre pelo dado. No feriado (um dia de semana sem pregão),
a rotina decide como num dia comum, mas na manhã seguinte não há o preço do dia para liquidar. O dia fica **pendente**,
e as rodadas seguintes ficam **sem decisão**, porque cada dia depende do anterior. Nesse intervalo, a aba Diário do
operador mostra "Uma liquidação anterior está pendente". Assim que sai o dado do primeiro pregão depois do feriado (no fim
desse dia), a rotina da manhã seguinte reconhece o feriado: as ordens dele expiram, o caixa não rende, e tudo volta ao
normal. Na prática, um feriado custa **um dia útil sem decisão**: com Finados numa segunda (02/11), a terça fica sem
decisão e a quarta já é decidida normalmente. Se o dado só atrasou, sem nenhum dado posterior, o sistema espera até 4
dias corridos antes de tratar o dia como feriado.

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

## 6. A aba Recomendação IA

A aba mostra, para cada dia, o que a IA recomendou para cada ativo.

**O dia:** a aba abre no dia mais recente. As setas ◀ ▶ vão para o dia anterior e o próximo que têm recomendação; o
calendário pula para qualquer data. Só os dias com recomendação ficam habilitados no calendário. Fim de semana, feriado e
dia em que a rodada não foi decidida não têm recomendação. Um ponto vermelho marca o dia em que a IA falhou (a trilha IA
ficou em "manter") e um ponto amarelo, o dia com alguma recomendação contrária à leitura.

**Os cards, um por ativo, em três situações.** A IA não recebe o estado da carteira: as três trilhas estão em situações
diferentes no mesmo dia (a IA pode estar comprada em milho, a Determinística sem posição e o Operador vendido). Por isso
ela responde as três situações possíveis de uma vez, e nenhum dado da carteira vai ao prompt:

| Linha | Situação da carteira no ativo | Respostas possíveis |
|---|---|---|
| **Sem posição** | Não tem nada no ativo | Entrar comprado, Entrar vendido ou Não entrar |
| **Se comprado** | Já está comprada (ganha se o preço sobe) | Manter, Reduzir ou Zerar |
| **Se vendido** | Já está vendida (ganha se o preço cai) | Manter, Reduzir ou Zerar |

- **Manter:** segue com a posição; o stop e os alvos continuam valendo.
- **Reduzir:** sai de parte da posição (50% no padrão).
- **Zerar:** sai da posição inteira.

Cada linha tem um porquê curto. Abaixo delas, mais duas partes explicam a recomendação:

- **Invalida se:** a condição que, se acontecer, derruba a tese da IA para o ativo (ex.: "a leitura do MÉDIO virar para
  baixa ou o USDA revisar a safra americana para cima"). Serve para acompanhar: se aquilo acontecer, a recomendação
  daquele dia deixa de valer, e a do dia seguinte deve mudar. É só texto: não dispara nada.
- **Evidências:** os dados em que a IA se apoiou, citados por um código:
  - `MILHO.MEDIO`: a leitura de tendência do horizonte MÉDIO do milho no dia (há também `MILHO.CURTO` e `MILHO.LONGO`);
  - `MILHO.EV1`, `MILHO.EV2`...: os eventos de mercado do milho dos últimos 7 dias, na ordem em que foram à IA.

  Cada leitura e cada evento vai ao prompt com o seu código, e a IA precisa citar pelo menos um. Ela não pode citar um
  código que não recebeu: uma evidência inventada faz a resposta ser recusada. Para ver o que cada código é, abra **"O
  que foi à IA"** no fim da aba: no prompt, cada um aparece entre colchetes (ex.: `[MILHO.MEDIO]`).

**Quem usa cada linha:**

- **A trilha IA** aplica a linha da situação dela no dia. O motor de risco ainda confere vagas, travas e tamanho antes
  de executar.
- **O Operador** pode olhar a linha da situação dele como sugestão; ele decide sozinho, no diário.
- **A Determinística** não usa a recomendação: segue a regra fixa dela.

**O selo amarelo "contra a leitura"** marca uma linha que vai contra a tendência da leitura do horizonte MÉDIO (ex.:
entrar comprado, ou manter comprado, com o MÉDIO em baixa). Ela não é recusada: é marcada e medida.

**A prioridade.** Os cards aparecem na ordem de prioridade que a IA dá aos ativos (1 = o primeiro). Ela só pesa quando
falta vaga: com no máximo 2 posições abertas e 3 ativos, num dia em que a recomendação manda entrar em mais ativos do
que há vagas, o motor preenche as vagas pela prioridade e o resto fica de fora. A prioridade não muda o tamanho da
posição. A Determinística tem a ordem dela: a confiança da leitura do MÉDIO, depois a faixa forte antes da leve, e por
fim a ordem fixa dos ativos da carteira.

**O que foi à IA:** o botão à direita, na linha do dia, abre uma janela com abas para o prompt, a instrução do sistema
e cada resposta, exatamente como foram.

**O rodapé:** a réplica semanal (uma vez por semana, a mesma entrada vai de novo à IA, sem decidir nada, para medir se
ela responde igual).

## 7. O diário do operador

Na aba **Diário do operador**, você registra as suas operações: é a trilha Operador, que concorre com a IA e com a
regra fixa nas mesmas condições. Só o proprietário e os editores do espaço registram; os outros membros só veem.

**Quando dá para registrar.** O topo da aba diz se o registro está aberto e para qual dia. Vale o dia da rodada que
ainda não foi liquidada: normalmente o de hoje, desde a rotina das 06h30 até as 06h30 do dia seguinte, quando o dia é
liquidado. Depois disso, aquele dia fecha. Registrar um dia já liquidado (o registro tardio) ainda não está disponível.

**Quando o registro aparece fechado**, o topo da aba diz o motivo:

| Mensagem | O que quer dizer | Quando volta |
|---|---|---|
| **Uma liquidação anterior está pendente** | Um dia anterior ainda não foi liquidado porque falta o dado dele (o preço da B3 ou a PTAX), quase sempre por um **feriado**. Como cada dia depende do anterior, o sistema não sabe ainda o patrimônio e as posições da véspera, e não tem como conferir uma entrada nova. | Na rotina da manhã seguinte ao primeiro pregão depois do feriado: o dado desse pregão prova que o dia vazio foi feriado, e tudo é liquidado em sequência (seção 4). Se o dado só atrasou, sem nenhum dado posterior, até 4 dias corridos. |
| **O dia já foi liquidado** | A rotina das 06h30 já liquidou o último dia, e o dia de hoje ainda não tem rodada (por exemplo, no fim de semana). | Na rotina das 06h30 do próximo dia útil. |
| **A rotina diária está atrasada** | A última rodada é de mais de um dia útil atrás: a rotina não rodou. | Quando a rotina rodar de novo. |
| **A carteira ainda não começou** / **Ainda não há rodada** | Hoje é antes da data de início, ou é o dia do início e a rotina das 06h30 ainda não rodou. | No dia do início, depois da rotina das 06h30. |

Exemplo de feriado: com Finados numa segunda (02/11), o registro fica fechado com "Uma liquidação anterior está
pendente" na terça, e esse dia não recebe registro; na quarta, depois da rotina das 06h30, ele abre normalmente.

**Registrar uma entrada.** Clique em **Nova entrada** e preencha:

- o **ativo** e o **lado** (comprado ou vendido);
- o **preço de entrada**, o preço em que você entrou;
- o **stop**. A janela mostra o contrato, o último ajuste, o ATR(14) e a distância mínima do stop (o piso), e sugere o
  stop no piso a partir do preço digitado. O stop pode ficar mais longe que o piso, nunca mais perto.

A **conferência** roda sozinha enquanto você digita: o stop do lado certo, o piso de ATR, o R:R mínimo, o tamanho pelo
risco, as vagas e as travas. Com tudo certo, ela mostra a quantidade, os dois alvos da Tabela 2 e o risco (1R). A
quantidade e os alvos são calculados pelo sistema, como nas outras trilhas (seção 5); você não os digita.

**O checklist da Cartilha** é o checklist de entrada da Cartilha de Operações do Comitê (Cap. 7.1): oito condições
que a Cartilha diz serem obrigatórias antes de entrar numa operação. No diário, ele serve para a disciplina (você passa
pelos oito pontos a cada entrada) e para a **aderência**, que a Cartilha manda reportar ao Comitê todo mês (Cap. 9.5): o
percentual de operações que cumpriram todos os itens.

| Item | Quem marca | O que quer dizer |
|---|---|---|
| 1. Viés claro do FINMIND | Você | A leitura de tendência do ativo (Centro de Decisão) e a recomendação da IA apontam na direção da sua entrada. |
| 2. Estrutura SMC alinhada | Você | No gráfico, a estrutura confirma a entrada: quebra de estrutura (BOS) ou mudança de caráter (CHoCH), zona de interesse, FVG ou varredura de liquidez (sweep). |
| 3. Dentro da kill zone | Você | A entrada foi feita na janela de maior liquidez (as janelas por ativo da B3 seguem pendentes do Comitê). |
| 4. Stop no piso de ATR(14) | O sistema | O stop está do lado certo e a pelo menos 1,5× o ATR da entrada. |
| 5. Alvos e R:R mínimo | O sistema | Os alvos saem da Tabela 2, e o R:R do alvo 2 fica acima do mínimo. |
| 6. Dimensionamento pelo risco | O sistema | A quantidade arrisca o percentual do ativo (2%). |
| 7. Janela da B3 | Você | Dentro do pregão do agro (09h00 às 15h55, pausa das 12h às 13h) e fora dos 30 minutos antes e depois de um evento. |
| 8. Sem evento de alto impacto | Você | Nenhum relatório (USDA, Conab) ou dado macro relevante nos 30 minutos antes e depois da entrada. |

Os itens 4, 5 e 6 vêm da conferência: se algum falhar, a entrada é bloqueada, por isso eles aparecem marcados e
travados. Os outros cinco dependem do seu julgamento e o sistema não tem como conferir. Um item desmarcado **não impede o
registro**: a entrada fica com o selo **fora da Cartilha** (amarelo) em vez de **aderente** (verde), e o selo aparece
também nas listas de planejadas e encerradas. Se o diário bloqueasse, as entradas fora da Cartilha não apareceriam, e a
aderência não mediria nada.

**O limite do checklist:** os cinco itens manuais são uma declaração do operador, que ninguém confere. A aderência mostra
como o operador trabalha, não se o sistema funciona: a pergunta do experimento (a recomendação da IA agrega valor sobre a
regra fixa?) é medida só entre as trilhas IA e Determinística, sem o operador e sem o checklist.

**Planejada.** A entrada registrada fica **planejada** até a liquidação do dia. Até lá, você pode **editar** (a antiga
é cancelada e uma nova entra no lugar) ou **cancelar**. Na liquidação, o sistema confere o seu preço contra a mínima e a
máxima do contrato no dia: dentro da faixa, a posição abre a esse preço; fora dela, a ordem é rejeitada.

**Com a posição aberta**, três ações:

- **Zerar:** sai da posição inteira, no preço que você informar.
- **Reduzir:** sai de metade da posição (o padrão da carteira), uma vez por operação.
- **Mover stop:** só a favor da posição (para cima, se comprado; para baixo, se vendido) e ainda do lado da perda em
  relação ao último ajuste. O novo stop vale **a partir do pregão seguinte**: no mesmo dia, ele poderia ser escolhido já
  sabendo até onde o preço foi.

Uma saída por posição e por dia; ela também pode ser cancelada antes da liquidação. O stop e os alvos continuam
automáticos, como nas outras trilhas: na liquidação, o sistema confere primeiro se o preço do dia tocou o stop ou um
alvo, e depois executa a sua saída.

**As fases de uma operação:** **planejada** (aguarda a liquidação), **aberta**, **em gestão** (depois do alvo 1, de uma
redução ou de um stop movido), **encerrada**, **cancelada** ou **não executada** (o preço ficou fora da faixa do dia). O
vencimento do contrato também encerra a posição, 15 dias úteis antes do limite, como nas outras trilhas.
