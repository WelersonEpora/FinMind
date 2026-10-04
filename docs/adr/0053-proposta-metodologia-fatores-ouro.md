# 0053 — Proposta de metodologia dos fatores do ouro, no molde do petróleo

**Status:** aceita (2026-10-03).

## Contexto

Na reunião de 2026-10-03 em que aprovou as decisões dos fatores do petróleo (ADR 0052), o David pediu o mesmo
tratamento para o ouro. No mesmo dia, o usuário (Welerson) pediu para montar a página do ouro na Metodologia do Ativo
reaproveitando o máximo do que foi feito no petróleo.

**Limite (o mesmo do ADR 0050):** proposta de metodologia para o David validar. Não é regra, não alimenta o prompt
diário, o Centro de Decisão nem a IA e não gera sinal. O ouro só passa a ter prompt diário e leitura de tendência
depois da aprovação do David, como no petróleo.

## Decisão

1. **Reaproveitamento antes do ouro, sem mudar o petróleo.** O que se repete entre os ativos virou molde, e o petróleo
   passou a usá-lo:
   - `shared/metodologia-base.js`: o formato de uma definição (fel1, dados, proposta, perguntas, nome, evento) e a
     montagem com o nome e o peso do FEL 1. Cada ativo tem só as definições (`metodologia-<ativo>.js`);
   - `factors/modelos/`: os cálculos que valem para mais de um ativo. `fundos-cot.js` (a posição dos fundos no COT
     contra os 3 anos anteriores, com a leitura configurável: reversão ou amplifica), `dolar-economias-avancadas.js`
     (o desvio do índice do Fed contra a média de 52 semanas) e `juro-variacao-semanal.js` (a variação de uma taxa
     em 26 semanas, com o ciclo da meta do Fed como contexto). Cada fator de um ativo só configura o molde: as séries,
     o id, os parâmetros e os textos;
   - a conferência de unidade do FMI saiu do coletor para `shared/fmi-ouro-conferencia.js`, usada pelo coletor (que
     marca) e pelo fator dos bancos centrais (que deixa de fora).

   **Prova de que o petróleo não mudou:** a metodologia do petróleo rodada com dados sintéticos fixos (os 10 fatores
   simulados em 3 datas e o cálculo completo de cada fator calculado: pontos, explicação, exemplos e texto do prompt)
   saiu idêntica, byte a byte, antes e depois.
2. **Os 8 fatores do ouro** (`shared/metodologia-ouro.js`), com a tabela "Fatores de Influência de Preço: Ouro" do
   FEL 1 v1.1 copiada sem reescrever. Um de evento e sete calculados, todos no molde do ADR 0050 (camadas A e B
   calculadas, C simulada pela decisão por faixa, parâmetros do FinMind ajustáveis pelo Comitê):

   | Fator | Medida (A) e comparação (B) | Leitura (C) | Cálculo |
   |---|---|---|---|
   | Juros reais | TIPS de 10 anos, variação em 26 semanas | subindo = baixa | molde dos juros |
   | Dólar | índice do Fed das economias avançadas contra a média de 52 semanas | forte = baixa | molde do dólar |
   | Inflação | CPI cheio sem ajuste sazonal em 12 meses, menos a meta de 2% do Fed | acima = alta | `inflacao-ouro` |
   | Geopolítica | fator de evento, janela de 30 dias | com a IA do ativo | o da geopolítica do petróleo |
   | Bancos centrais | compras do WGC em 4 trimestres (com as não declaradas) contra a média dos 3 anos anteriores; as declaradas ao FMI como contexto | acima do ritmo = alta | `bancos-centrais-ouro` |
   | ETFs | ouro nos ETFs (WGC), fluxo em 13 semanas, em % | entradas = alta | `etfs-ouro` |
   | Fundos (COT) | posição dos fundos no ouro da COMEX contra os 3 anos anteriores | comprados = alta | molde do COT |
   | Mineração | produção das minas (WGC) em 4 trimestres, contra um ano antes | crescendo = baixa | `mineracao-ouro` |

3. **Validação histórica contra o ouro da LBMA** (PM, em US$), o histórico mais longo na base, até 2026-09-28 (a LBMA
   saiu em 2026-10-01, ADR 0044). Cada fator foi medido no banco de dev contra a variação do ouro nas 26 semanas
   anteriores e nas 13, 26 e 52 seguintes, contadas da data em que o dado ficou disponível, em três períodos
   (2006 a 2014, 2015 a 2022, 2023 a 2026). O resultado vai na parte D de cada fator (`dados.avaliacao`) e é o mesmo
   do petróleo: os fatores medem a situação e andam com o preço, mas nenhum antecipa de forma estável.
   - **Juros reais:** a variação anda com o ouro em sentido contrário (-0,52; -0,64 em 2023 a 2026, os anos do
     "descolamento" do FEL 1, que é do nível). O nível tem correlação POSITIVA com o ouro seguinte (+0,51), o contrário
     do FEL 1: por isso a variação.
   - **Inflação:** a relação do FEL 1 não aparece (-0,04 com o ouro 26 semanas depois; -0,38 em 2023 a 2026), nem no
     histórico desde 1970, com os anos 1970 (+0,06; com a inflação acima de 8%, o ouro subiu em 45% dos casos, menos
     que nos meses comuns), nem com a inflação implícita de mercado ou a aceleração do CPI (trocam de sinal). Nenhuma
     medida da base serve; as de fora (PCE, inflação esperada de 5 anos daqui a 5 anos) seriam fonte nova. A avaliação
     diz "não basta" e a pergunta vai ao David: o efeito da inflação parece passar pelo juro real (-0,52), e ela pode
     virar contexto do fator de juros reais.
   - **Fundos (COT):** a leitura do FEL 1 ("amplifica") se sustenta melhor que a de reversão do petróleo: com os fundos
     no topo dos 3 anos, o ouro subiu em 76% dos casos 26 semanas depois, contra 63% fora dos extremos. Por isso a
     leitura do ouro é o contrário da do petróleo, no mesmo molde.
   - **Bancos centrais:** as compras DECLARADAS ao FMI não antecipam o ouro (-0,14), mas as do World Gold Council, com a
     estimativa das não declaradas, sim: as compras de 4 trimestres contra a média dos 3 anos anteriores têm +0,26 com
     o ouro 26 semanas depois e +0,47 com 52 (2013 a 2026), nas duas metades do período. É a única medida do ouro com
     relação para frente, e a medida do fator; o FMI fica como contexto (mensal e com quem comprou). Ressalvas: 51
     trimestres, parte da relação é a alta de 2022 a 2025, o WGC revisa a estimativa e é de uso interno. A comparação
     com os 3 anos anteriores (e não com zero) é a pergunta ao David: com as compras altas desde 2022, comprar 800 t
     por ano hoje lê como pressão de baixa.
4. **Dados com defeito conhecido ficam de fora, sem regra nova.** No FMI (o contexto dos bancos centrais), só entra o par (país, mês) conferível e
   conferido pela regra que o coletor já usa (volume e valor positivos, preço implícito dentro de 3× a mediana do mês):
   isso tira o Brasil e Angola (volume 1.000× maior), o Chile (em quilos), o Cazaquistão (volume zero em mar/2026) e
   Ruanda, Bósnia e Kosovo (só o volume, em escala impossível). A soma das compras é país a país, só entre os que
   reportam nos dois meses comparados, e o mês só entra com 90% dos países dos 12 meses anteriores.
5. **A tela é a mesma.** O ouro aparece no seletor da Metodologia do Ativo com os 8 fatores, a simulação numa data e
   os parâmetros de cada fator, sem código de tela novo. O que mudou: a periodicidade trimestral (mineração) nos textos
   do período e do prompt, e o botão "Ver prompt completo" só aparece para ativo com prompt diário aprovado
   (`metodologia-ativo.service.js::ATIVOS_COM_PROMPT_DIARIO`, hoje só o petróleo; `prompt-diario.service.js` usa a mesma
   lista).

## Consequências

- O ouro tem a metodologia proposta na tela, com o histórico de cada fator, para o David reagir. Cada fator tem as
  perguntas dele; as principais: a leitura do COT (amplifica ou reversão), a inflação como fator próprio (com a relação
  ausente no histórico desde 1970) ou contexto do juro real, a fonte dos bancos centrais (WGC estimado ou FMI
  declarado) e a comparação deles (com os 3 anos anteriores ou com zero) e o preço de referência do ouro
  no dia a dia (a LBMA saiu; o futuro da B3, o GLD, só existe desde 2025-07).
- O FMI e o World Gold Council não informam quando publicaram: a disponibilidade é a da 1ª coleta (2026-10-01). Numa
  simulação anterior a essa data, os fatores de bancos centrais, ETFs e mineração ficam sem dado (o mesmo caso do JODI
  no petróleo).
- Os bancos centrais, os ETFs e a mineração usam dado do World Gold Council, de uso interno (ADR 0037).
- Hoje (2º tri de 2026) os bancos centrais leem pressão de baixa moderada: 780 t em 4 trimestres contra a média de
  1.024 t dos 3 anos anteriores, o ritmo recorde de 2022 a 2024.
- O milho e o café seguem o mesmo caminho: um arquivo de definições, os moldes onde o conceito se repete (o COT e o
  dólar valem para os dois) e um fator próprio onde não.

## Não implementado (de propósito)

O prompt diário, a leitura de tendência e o Centro de Decisão do ouro (só depois da aprovação do David); a escolha do
preço de referência do ouro; uma medida nova de inflação (fonte nova); a reciclagem na oferta.
