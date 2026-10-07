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
