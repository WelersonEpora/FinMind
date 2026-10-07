# 0063 — O realizado da leitura diária de tendência (sem nota de acerto)

## Contexto

Os quatro ativos têm a leitura diária de tendência da IA desde a aprovação de cada um: petróleo (ADR 0052), ouro (ADR
0054), milho (ADR 0058) e café (ADR 0062). Cada leitura fica gravada em `analise_diaria`, com o preço-base que a IA
recebeu e as faixas de cada horizonte. Mas nada confrontava a leitura com o que o preço fez depois. A etapa de
simulação do FEL 1 (§12.1, Camada 3: pelo menos 6 meses de leituras registradas e avaliadas) depende disso. Em
`shared/analise-diaria-base.js::classificarNaFaixa`, a classificação de uma variação realizada numa faixa já existia,
"para comparar depois com a faixa da leitura".

**Autorização (usuário, 2026-10-05):** montar a comparação como registro, sem nota de acerto. A métrica de acerto
(horizonte, critério, o que conta como acerto) continua com o David (`STATUS_DO_PROJETO.md`, §4, "Avaliação da saída
da IA"). *No mesmo dia, o David delegou a avaliação ao usuário: ela está no ADR 0064.* Medir o preço que houve e dizer em que faixa ele caiu é infraestrutura; dar nota à leitura seria critério.

## Decisão

1. **O que se mede, por horizonte:**
   - **Base:** o preço que a IA recebeu, gravado com a leitura (`entrada.precoReferencia`). **Substituída pela base da
     data da análise no adendo de 2026-10-05.**
   - **Alvo:** a data de onde os horizontes contam, mais os dias do horizonte (dias corridos). Nas leituras atuais, é a
     data da análise; na configuração v1 do petróleo, o último preço.
   - **Realizado:** o último preço observado até a data-alvo, na versão mais recente (uma revisão conta, porque é o
     preço que de fato houve), e a faixa em que a variação cai.
   - **Faixas:** as gravadas com a leitura, não as da configuração atual. Se as faixas mudarem, as leituras antigas
     continuam medidas pela régua que a IA usou.
2. **Futuros (GLD, CCM e ICF): o mesmo contrato da leitura** (o ticker gravado), nunca o vencimento mais próximo na
   data-alvo. A medida fica sem o salto da troca de vencimento (a diferença de carregamento citada no ADR 0054). O
   preço é o desse contrato. Se ele vencer ou parar de negociar antes da data-alvo, o horizonte fica `SEM_PRECO`. O
   de 90 dias, sobretudo no GLD, vai ficar muitas vezes assim. A alternativa (o vencimento mais próximo na data-alvo,
   sempre com valor) foi descartada pelo usuário em 2026-10-05.
3. **Situações:**

   | Situação | Quando |
   |---|---|
   | `APURADO` | Período completo, com preço novo perto da data-alvo |
   | `A_APURAR` | A data-alvo ainda não chegou |
   | `AGUARDANDO_DADO` | A data-alvo passou, mas o período não está completo |
   | `SEM_PRECO` | Nenhum preço até a data-alvo dentro da tolerância da série (contrato vencido ou série parada) |
   | `SEM_PREGAO` | Nenhum preço novo depois da base até a data-alvo (fim de semana, feriado): sem faixa, para não contar como "lateral" |
   | `SEM_BASE` | A leitura não tem preço-base (ou, num futuro, contrato) |

   **Período completo:**
   - **À vista:** a série já tem dado na data-alvo ou depois dela (adendo de 2026-10-07). O Brent da EIA chega com uma
     semana de atraso.
   - **Futuro:** a mesma condição, ou a data-alvo passou há mais que a tolerância da série (4 dias por padrão), porque
     um contrato vencido nunca terá dado depois dela.
4. **Calculado sob demanda, nunca gravado:** `services/realizado-analise.service.js`, sobre a camada point-in-time,
   como um fator (ADR 0008). Uma consulta por leitura. O Centro de Decisão o devolve em `analise.realizado` e mostra,
   em cada horizonte, a variação realizada e a faixa, ao lado da faixa lida, sem marca de acerto ou erro.

## Consequências

- Cada leitura passa a mostrar o que o preço fez, à medida que os horizontes fecham. Quando o David definir a métrica,
  as semanas já acumuladas podem ser avaliadas sem refazer nada.
- O que fica fora: uma lista de "leituras × realizado" por ativo (o histórico numa tabela, para a avaliação) e
  qualquer agregação (taxa de acerto, matriz de confusão), que depende da métrica do David.
- As faixas atuais são provisórias em todos os ativos. A comparação usa a régua de cada leitura, então uma faixa nova
  não reescreve as antigas.

## Adendo (2026-10-05): a base é a da data da análise

Ao montar a avaliação das leituras (ADR 0064), apareceu um desvio: o realizado media a partir do preço que a IA
recebeu, mas o prompt define a variação "entre a data da análise e o fim de cada horizonte; o preço de cada data é o
do último pregão até ela" (tabela 2.4). Nas leituras das 01h, o preço recebido é o do pregão anterior. Assim, o
horizonte de 1 dia media dois pregões com faixas calibradas para um. No Brent, que a EIA publica com cerca de uma semana
de atraso, media uns oito dias.

**Correção (usuário, 2026-10-05):**

- **Base da avaliação:** o último preço até a data da análise, na série ou contrato da leitura, na versão mais recente
  (conhecido depois da leitura). Ela substitui o preço recebido no cálculo da variação e da faixa. Se esse preço estiver
  mais longe da data da análise que a tolerância da série, o horizonte fica `SEM_BASE`.
- **O preço que a IA recebeu** continua gravado e visível, ao lado da base: responde "o que a IA viu?".
- `SEM_PREGAO` passa a ser contado contra a base da avaliação: nenhum preço novo depois dela até a data-alvo.
- **Exceção:** nas leituras que contavam os horizontes do último preço (petróleo, configuração v1), a base continua
  sendo o preço recebido, que era a referência delas. Elas ficam fora da avaliação (ADR 0064).
- Os horizontes (dias e T1/T2) e a data de onde contam vêm da leitura gravada, não da configuração atual. A série vem
  do `seriesCode` gravado com a leitura ou, nas antigas, de um mapa fixo das séries de preço de referência.

No Centro de Decisão, o detalhe de cada horizonte mostra a base da avaliação ao lado do preço que a IA recebeu.

## Adendo (2026-10-07): o preço na própria data-alvo fecha o período

Na Qualidade da IA do servidor, a leitura do café de 06/10 (Imediato, ICFZ26, base de 05/10 a US$ 356,00 e alvo em
06/10) seguia tracejada ("a apurar") no dia 07/10, com o ajuste de 06/10 (US$ 371,70) já na série e desenhado na linha do
gráfico. O período só contava como completo com um dado **depois** da data-alvo, o ajuste de 07/10, que chega na coleta
do dia seguinte. A regra existe para o caso sem preço na data-alvo (feriado, série atrasada), em que o "último preço até o
alvo" ainda pode mudar; com o preço da própria data-alvo, nada mais o muda, e uma revisão da fonte já entra porque o
realizado é recalculado a cada consulta.

**Correção (usuário, 2026-10-07):** o período está completo quando a série tem dado **na data-alvo ou depois dela**
(no futuro, mantida também a tolerância). A mesma regra confirma a base da avaliação: o preço da data da análise
confirma a base sem esperar o pregão seguinte. Não muda nenhuma leitura já apurada: só antecipa em um pregão as que
esperavam.
