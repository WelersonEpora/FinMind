# 0059 — Pesos e relações entre os fatores na Metodologia do Ativo

**Status:** aceita (2026-10-04). O limite "só na tela" caiu para o milho em 2026-10-05: o calendário de pesos e as
regras de agregação vão ao prompt diário (ADR 0065).

## Contexto

O FEL 1 dá a todos os fatores de todos os ativos um peso relativo: Alto, Médio ou Baixo. É esse peso que vai ao prompt
diário do petróleo, do ouro e do milho. No milho, o Motor do Milho v0 do David (ADR 0056) vai além.

- **Sugestão de peso-base:** o F4 passa a Alto e o F6 a Baixo-Médio.
- **Peso por mês:** cada regra tem o seu (ex.: o F2 é Alto de março a julho e o F4 é Alto de julho a janeiro).
- **Pesos condicionais:** o F5 é Alto na base de MT durante a colheita.
- **Matriz de correlações 8×8.**
- **Nove regras de agregação:** bloco de oferta com teto, fundos como multiplicador, F3 como filtro, conflito entre
  blocos, entre outras.

Nada disso aparecia na tela além de frases soltas no texto de cada fator. O prompt não levava nada disso: ele proíbe a
IA de criar um peso por mês. A consequência aparece em outubro. Pelo calendário do David, o F1 e o F2 têm peso Baixo e o
F4, peso Alto. O prompt diz o contrário, pelo peso do FEL 1. O ADR 0058 deixou o mapa sazonal e a agregação em aberto.

**Pedido do usuário (Welerson, 2026-10-04):** uma área na tela de metodologia que mostre os pesos e as relações entre
os fatores, com o mesmo desenho para os outros ativos. **Limite:** só na tela. O prompt continua com o peso do FEL 1 até
o Comitê aprovar o mapa sazonal.

## Decisão

1. **Dados estruturados:** `pesos` em `shared/metodologia-<ativo>.js`, validado e montado em `metodologia-base.js`.
   Hoje só o milho tem esse campo, transcrito das Seções 3 e 4 do Motor v0.
   - **Peso do fator:** a sugestão de peso-base do especialista e uma de três formas:
     - o calendário (o peso de cada mês);
     - um peso fixo, sem calendário (o F3, o F6 e o F8);
     - um papel no lugar do peso (o F7: não vota, multiplica o peso dos outros).
     As condições e as notas vêm ao lado.
   - **Mês não definido** fica sem peso, nunca completado por inferência. São o F1 de janeiro a maio e o F2 em janeiro e
     fevereiro. Os dois buracos viraram pendência do ativo, junto com a divergência do F7: a tabela do fator dá peso
     Médio, e a agregação diz que ele não vota.
   - **Matriz de relações:** a legenda de símbolos do David. A validação exige a matriz completa e simétrica: um
     símbolo diferente entre A×B e B×A é erro de transcrição.
   - **Regras de agregação:** cada uma diz como está hoje no FinMind. São três situações: orientação no prompt, em
     parte, ou fora do motor.
2. **A API entrega `metodologia.pesos` para todo ativo.** O peso do FEL 1 vem sempre, numerado de F1 a Fn. A
   `situacao` é `PROPOSTA` quando há definição do especialista e `null` quando não há. A `versao` da metodologia não
   muda, porque nada disso vai ao prompt.
3. **A tela ganha a seção "Pesos e relações"** (`components/metodologia/PesosRelacoes.vue`), depois dos fatores, com
   três blocos:
   - **Peso por fator e por mês:** o peso do FEL 1 ao lado da sugestão do especialista, com o mês de referência
     destacado (hoje, ou a data simulada).
   - **A matriz de relações:** com a legenda e a leitura do David.
   - **As regras de agregação:** com a situação de cada uma no FinMind.

   Num ativo sem definição do especialista (o ouro e o petróleo), a seção mostra só o peso do FEL 1 e diz que o resto
   não foi definido. Quando houver, entra só como dado, sem código de tela. A seção diz, nos dois casos, que o prompt
   usa só o peso do FEL 1.

## Consequências

- **O Comitê ganha uma visão única:** o calendário, as relações e o que falta decidir, inclusive onde o prompt diverge
  da proposta.
- **Para o ouro e o petróleo**, a pergunta ao David já estava na metodologia: o mapa sazonal e a agregação do milho valem
  para eles? No ouro, o FEL 1 sugere peso por regime, não por mês. A estrutura aceita o peso fixo com condições, sem
  calendário.
- **Levar o peso do mês ao prompt** é o passo seguinte, depois da aprovação do Comitê. A tela e o prompt vão ler o mesmo
  dado.

## Fora do escopo

O peso por mês no prompt; a agregação em código; os pesos e as relações do ouro, do petróleo e do café.
