# 0068 — A previsão do NOAA/CPC na regra de clima do milho (F1)

**Status:** aceita (2026-10-05).

## Contexto

A regra de alta do fator "Clima e safra nos EUA" do milho (R-CLI-01 v0 do David, ADR 0056) pede, além da lavoura boa +
excelente abaixo da média, a "previsão CPC de calor acima e chuva abaixo do normal em 8–14 dias"; a de baixa (R-CLI-02
v0) pede "sem previsão adversa". Sem o dado, o cálculo rodava sem essa condição, declarando a lacuna, e a pergunta "a
regra pode rodar sem a previsão, ou ela é condição necessária?" ficou com o David.

A previsão passou a ser coletada em 2026-10-05 (ADR 0067), num ponto de cada um dos 5 maiores estados de milho (Iowa,
Illinois, Nebraska, Minnesota, Indiana). A regra do David fala do Corn Belt, sem dizer como juntar os estados.

**Decisão do usuário (Welerson, 2026-10-05):** aplicar a condição do CPC como o David a escreveu, com a previsão adversa
na **maioria dos 5 estados**. Fecha a pergunta do F1. O "3 de 5" é do FinMind, não do David.

## Decisão

1. **Previsão adversa** = calor acima **e** chuva abaixo do normal, na previsão de 8 a 14 dias, em `estadosMinimos` ou
   mais dos 5 estados (padrão **3**). É um parâmetro da camada C, ajustável pelo Comitê no card C. Num estado, "acima"
   e "abaixo" são a categoria mais provável do CPC. As chances iguais não contam como nenhuma das duas.
2. **Alta** (a condição da lavoura do David): só com a previsão adversa. Sem ela, **neutra**, e o passo da explicação
   diz que a alta não foi confirmada. **Baixa**: só sem a previsão adversa. Com ela, **neutra** ("bloqueada"). O resto
   da regra não muda (limiares, janela de junho a agosto, acréscimos do FinMind).
3. **Qual previsão vale para cada semana do Crop Progress:** a emissão mais recente publicada antes de a semana
   seguinte sair. A da última semana é a mais recente até a data da análise (o prompt diário usa a de hoje). Uma
   emissão de mais de 6 dias antes do fim da semana não conta.
4. **Sem previsão** (as semanas antes de 2026-10-05, ou a coleta parada): a condição **não é aplicada**, como antes, e
   o texto do fator diz isso. Por isso o histórico do fator até 2026-10-05 não muda e a validação histórica (parte D)
   continua valendo para ele. A condição em si não tem como ser testada no passado.
5. **No prompt e na tela:** um quadro da camada A com quantos estados estão com a previsão adversa e, na linha
   seguinte, a previsão de cada estado e a data da emissão. A regra aplicada, na parte B, traz a condição. Para isso,
   o `texto-prompt.js` ganhou o campo opcional `detalhe` do quadro (uma linha de texto do ponto), mostrado também na
   tela (`CalculoFator.vue`, numa linha inteira).
6. **Versões:** o cálculo `clima_milho_eua_crop_progress` passa a v2, e a metodologia do milho, a v4.

## Consequências

- A pergunta do F1 sobre o CPC sai das Pendências da metodologia e vira uma decisão do fator, com quem decidiu e quando.
- De junho a agosto, uma pressão de alta pela lavoura sem a previsão adversa passa a dar neutra. Fora dessa janela, a
  previsão vai ao prompt só como informação: a regra do David não vale fora dela.
- O U.S. Drought Monitor, que a regra de alta também cita, continua sem coleta (fonte nova). Fica como lacuna.
- O David e o Comitê podem rever o limite de estados pelo parâmetro, ou a decisão inteira por um ADR novo.
