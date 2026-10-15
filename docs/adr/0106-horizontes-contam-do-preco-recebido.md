# 0106 — Os horizontes da leitura diária contam do último preço que a IA recebeu

**Status:** aceita (2026-10-07).

## Contexto

Desde 2026-10-03 (ADR 0052, adendo), os horizontes da leitura diária de tendência contam da **data da análise**: a
leitura do dia D roda de madrugada, depois da coleta, e a IA recebe o último ajuste, o de D−1; a avaliação (ADRs 0063 e
0064) mede a variação do preço de D (a base, que a IA não viu) ao fim do horizonte. O motivo era o Brent à vista da
EIA, que chegava de 1 a 8 dias atrasado: contando do último preço, o imediato caía num dia que já tinha passado, com
eventos de depois dele.

Olhando a Qualidade da IA no servidor, o usuário viu a expectativa do café, e depois a do ouro, "um dia adiantada" em
relação ao realizado. A causa é a regra: o pregão de D−1 a D, o primeiro que a IA pode antecipar, não é avaliado em
nenhum horizonte, e o imediato mede D a D+1. Na leitura do café de segunda, 2026-10-05, o preço recebido era o de sexta,
02/10; o imediato media a terça. Se a IA lê alta "para o próximo pregão", a alta acontece num dia e é cobrada no
seguinte. O efeito é grande no imediato e no curto, e pequeno em 30 e 90 dias.

O motivo da regra deixou de existir: os quatro ativos têm o preço do pregão anterior (o ICF, o CCM e o GLD da B3; o
Brent futuro pelo Yahoo, ADR 0096).

## Decisão (usuário, Welerson, 2026-10-07; a metodologia da avaliação é dele, ADR 0064)

1. **Os horizontes contam do último preço que a IA recebeu** (`DATA_DO_PRECO_RECEBIDO`), nos quatro horizontes e nos
   quatro ativos. A base da avaliação é esse preço (num horizonte com contrato próprio, ADR 0078, o dele) e a
   data-alvo é a data dele mais os dias do horizonte.
2. **O imediato é o próximo pregão:** a data-alvo nunca fica antes da data da análise. Com o preço de sexta, o 1 dia
   cairia no sábado; vale a segunda da leitura.
3. **Só com o preço do pregão anterior:** sem nenhum dia útil entre a data do preço e a da análise (o do próprio dia
   também serve). Com um preço mais velho (feriado, fonte atrasada, defasado) ou sem preço, os horizontes contam da data
   da análise, como antes, e isso fica gravado com a leitura.
4. Não há olhar para o futuro: a leitura roda antes da abertura de D, e o pregão de D−1 a D ainda não aconteceu. Os
   eventos depois do último preço ainda não estão nele e podem mover o próximo pregão.

## Implementação

- `shared/analise-diaria-base.js`: `REFERENCIA_HORIZONTES` (a nova, a da data da análise e a da v1 do petróleo),
  `dataAlvoDoHorizonte` e `precoDoPregaoAnterior`, usadas pelo prompt, pela leitura gravada e pelo realizado.
- Configurações: petróleo v5, milho v4, café v5 e ouro v2 (`REFERENCIA_HORIZONTES = "DATA_DO_PRECO_RECEBIDO"`).
- `prompt-diario.service.js`: a referência efetiva (a do ativo ou, sem o preço do pregão anterior, a da data da
  análise), gravada em `entrada.referenciaHorizontes`; o bloco 2.1 diz de onde os horizontes contam; a tabela 2.4 traz a
  data-alvo de cada horizonte; o contrato de cada horizonte é escolhido pela data-alvo nova.
- Prompts: petróleo v11, milho v9, café v9 e ouro v4 (o item do preço em "Como analisar").
- `realizado-analise.service.js`: com a regra nova, a base é o preço recebido (`doPrecoRecebido`), confirmada.
- `qualidade-ia.service.js` e `leque-leituras.js`: a regra nova entra na métrica; a leitura de fim de semana fica fora
  (`SEM_PREGAO_NA_DATA`), porque recebeu o mesmo preço da de sexta. O Centro de Decisão diz que o imediato é o próximo
  pregão.

## Consequências

- O pregão que a IA pode antecipar passa a ser o que se avalia.
- As leituras gravadas antes continuam com a regra delas (gravada na entrada); a Qualidade da IA as separa pela versão
  da configuração.
- Num feriado no meio da semana, a leitura do dia seguinte recebe um preço de dois pregões atrás e conta da data da
  análise; a do próprio feriado tem o imediato sem pregão (`SEM_PREGAO`).
- O script de backtest da agregação (`scripts/agregacao-acerto.js`) continua medindo da data da análise.

## Adendo (2026-10-15): sem deslocar o horizonte; a série de preços decide depois

**Decisão do usuário (Welerson), 2026-10-15; a metodologia da avaliação é dele (ADR 0064).**

### Contexto

Na apresentação das carteiras ao Comitê (2026-10-14), a Qualidade da IA do servidor mostrava dois imediatos do milho com
alvo em 14/10. O banco tinha uma leitura por ativo e dia (nenhuma duplicata, nada gerado pela rotina das carteiras). A
causa foi o item 3 desta decisão: a leitura de 13/10 recebeu o preço de sexta, 09/10, por causa do feriado de segunda,
12/10. A regra só conhecia sábado e domingo como dias sem pregão, viu a segunda como um dia útil sem preço (como se a
fonte tivesse atrasado) e contou os horizontes da data da análise. O imediato dela foi para 14/10, com a base no
fechamento de 13/10, que a IA não viu: a mesma janela da leitura de 14/10. O pregão que ela podia antecipar (sexta a
terça) ficou sem avaliação. É o defeito que esta decisão corrigiu, voltando num caso só. Aconteceu em todos os ativos da
B3 e na PTAX (café, milho, ouro, soja e dólar); o petróleo escapou, porque a NYMEX abriu em 12/10.

A tabela 2.4 do prompt diz à IA a data-alvo: a leitura de 13/10 foi perguntada sobre 14/10. O defeito nasce no prompt,
não na avaliação.

Às 01h, quando a leitura roda, um feriado e uma fonte atrasada não se distinguem: a prova é o preço do pregão seguinte,
que ainda não existe. Um calendário de feriados por bolsa resolveria no prompt, ao custo de uma lista mantida a cada ano
(ou de uma fonte nova). Na avaliação, a própria série de preços já responde: os dias com preço são os dias com pregão.

### Decisão

1. **Os horizontes contam sempre do preço recebido** (o item 3 deixa de valer): com qualquer preço, mesmo mais velho que
   o pregão anterior, sem voltar à data da análise. O piso do item 2 continua: a data-alvo nunca fica antes da data da
   análise. Na terça depois do feriado, com o preço de sexta, o imediato é a própria terça. Sem preço, da data da
   análise, como antes (a leitura fica sem base).
2. **A Qualidade da IA decide depois se a leitura entra**, pela série de preços da leitura, **nos quatro horizontes**:
   - fora se **não houve pregão na data da análise** (`SEM_PREGAO_NA_DATA`): fim de semana e, agora, feriado. A leitura
     do feriado recebeu o mesmo preço da do dia útil seguinte e repetiria a janela dela;
   - fora se **houve pregão entre o preço recebido e a data da análise** (`PRECO_DEFASADO`, motivo novo): a fonte
     atrasou, e a IA estaria prevendo um pregão que já aconteceu.

   Fica uma leitura avaliada por pregão, sem buraco nem sobreposição. A regra é conhecida assim que a série chega à data
   da análise; até lá, só o fim de semana é sabido.
3. **As leituras de 2026-10-07 a 2026-10-14 que contaram da data da análise por falta do preço do pregão anterior** (as
   de 13/10 de café, milho, ouro, soja e dólar) ficam gravadas como estão e saem da métrica com um motivo próprio,
   `HORIZONTE_DESLOCADO`, nos quatro horizontes. São reconhecidas pela regra gravada (`DATA_DA_ANALISE`) numa versão da
   configuração que já contava do preço recebido (petróleo v5, ouro v2, milho v4, café v5, soja e dólar desde a v1).

### Implementação

- `prompt-diario.service.js`: a referência é a do ativo sempre que há preço; `precoDoPregaoAnterior` saiu de
  `shared/analise-diaria-base.js`. O texto dos prompts não muda (o caso de feriado passa a dizer que os horizontes
  contam do último preço, como nos outros dias), e as versões das configurações e dos prompts também não: a regra
  efetiva continua gravada em cada leitura (`entrada.referenciaHorizontes`).
- `realizado-analise.service.js`: cada leitura devolve `pregoes` (`naDataDaAnalise`, `entreOPrecoEADataDaAnalise`), da
  série do preço dela.
- `qualidade-ia.service.js`: os motivos `HORIZONTE_DESLOCADO` e `PRECO_DEFASADO`, e o `SEM_PREGAO_NA_DATA` pela série,
  verificados antes da situação do horizonte (ADR 0064, §5). No frontend, os rótulos e o esmaecimento no gráfico.

### Consequências

- Conferido com os dados do servidor (2026-10-15): nos seis ativos, só mudam as leituras de 12/10 (fora em todos os
  horizontes, menos no petróleo) e as de 13/10 (deslocadas). Nenhuma leitura do histórico teve a fonte atrasada.
- A janela de 09/10 a 13/10 fica sem leitura avaliada desta vez; no próximo feriado, a leitura do dia seguinte a cobre.
- Um pregão que a fonte nunca entregou parece um feriado: a leitura daquele dia sai da métrica. Raro (o coletor da B3
  falha alto quando falta um arquivo que deveria existir).
- O item "Num feriado no meio da semana..." das consequências acima deixa de valer.
