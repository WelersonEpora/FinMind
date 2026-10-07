# Conversa com o David — pontos em aberto das respostas ao FEL 1 e do Motor do Milho v0

**Data:** 2026-10-04
**Para:** David e Comitê Gestor
**Base:** o documento "Respostas FEL1 FINMIND" (recebido em 2026-10-03), registrado no ADR 0055.

O que você confirmou já está registrado no status do projeto. Entre as respostas e o que já está rodando, encontramos
**10 pontos em que precisamos de uma decisão sua** ou em que o próprio documento traz duas versões. Cada ponto traz o
que você escreveu, o que o FinMind faz hoje, a pergunta e a nossa sugestão. A resposta pode ser só "sugestão aceita".

| # | Ponto | O que depende dele | Urgência |
|---|---|---|---|
| 1 | Qual instrumento é operado (ouro e petróleo) | O preço que o ouro e o petróleo já usam todo dia | **Petróleo resolvido** (Brent, 2026-10-04); ouro **alta** |
| 2 | Formato da leitura da IA (faixas ou percentual) | O prompt do milho e os que já rodam | **Alta** |
| 3 | Peso por mês e agregação dos fatores | O motor do milho; talvez o petróleo e o ouro | Média |
| 4 | Validação humana dos eventos antes da IA | O fator 8 do milho e a geopolítica do petróleo e do ouro | Média |
| 5 | Paridade de exportação: praça e fórmula | O fator 4 do milho | Média |
| 6 | Insumos na v1 | O fator 6 do milho | Baixa |
| 7 | Critérios de aprovação do backtest (P10) | O primeiro backtest | **Alta** |
| 8 | Fontes novas citadas na proposta do milho | Orçamento e prazo | Média |
| 9 | Leitura de tendência → recomendação | O que a IA entrega hoje e depois | Média |
| 10 | Como seguimos com o Motor do Milho v0 | O próximo trabalho do FinMind | **Alta** |

---

## 1. Qual instrumento é operado no ouro e no petróleo?

> **Petróleo resolvido em 2026-10-04:** o David confirmou o **Brent**. A leitura diária já passou do WTI ao Brent,
> com as faixas recalibradas (ADR 0052, adendo). **Falta o ouro.**

**O que você escreveu.** O preço de referência é o do instrumento operado (P2). Na P3, a análise gráfica será "na B3
(café, milho) e na **Pepperstone (ouro e Brent)**"; na P8, os dados diários de "ouro e petróleo no TradingView".

**O que o FinMind faz hoje.**
- Petróleo: a leitura diária usa o **WTI** à vista (EIA).
- Ouro: usa o **futuro GLD da B3**, como decidimos em 2026-10-03.
- O **Brent à vista** já é coletado (EIA: preço diário, publicado uma vez por semana, como o WTI).

**A pergunta.** Se a operação será na Pepperstone, o instrumento é o Brent e o ouro à vista (XAUUSD)?

**Nossa sugestão.**
- Petróleo: trocar o preço de referência para o **Brent**. Já temos a série, e os fatores não mudam.
- Ouro: se a operação for no XAUUSD, o preço à vista é melhor referência que o GLD. A LBMA fechou o feed público; o à
  vista diário sem custo é uma questão a resolver, talvez o próprio TradingView ou a Pepperstone.
- O GLD fica como referência em reais.

**Resposta:** Petróleo: Brent (2026-10-04); desde 2026-10-07, o Brent **futuro**, um vencimento por horizonte, por decisão do usuário, a confirmar com você (ADR 0052, adendo de 2026-10-07). Ouro:

---

## 2. Formato da leitura da IA: faixas calibradas ou percentual com classes fixas?

**O que você escreveu.** O prompt do milho (seção 6) pede, em cada horizonte, uma **variação central em %**, uma faixa
favorável e desfavorável e uma de **6 classes fixas**, iguais para todos os horizontes: abaixo de 1% irrelevante,
1–3% fraco, 3–5% moderado, 5–7% forte, 7–10% muito forte e acima de 10% excepcional. O mesmo prompt diz: "se não
houver método calibrado, declare isso".

**O que o FinMind faz hoje** no petróleo e no ouro:
- A IA não escreve um percentual livre: escolhe uma de **três faixas** por horizonte.
- As faixas são calibradas no histórico do próprio ativo (percentis 40 e 80 da variação). No ouro, 1 dia vai até 0,4%
  e de 0,4% a 1,2%; 90 dias vai até 4% e de 4% a 10%.
- Os quatro horizontes (1, 7, 30 e 90 dias), a confiança e o "dados insuficientes" são iguais aos seus.

**Por que importa.** Com classes fixas, 3% em um dia (raro) e 3% em 90 dias (comum) recebem o mesmo nome. E um
percentual escrito pela IA é a "precisão artificial" que o seu prompt proíbe. As nossas faixas são o "método calibrado"
que ele pede.

**A pergunta.** Podemos manter as faixas calibradas por ativo e horizonte, mostrando também os seus nomes (fraco,
moderado, forte...) como rótulo?

**Nossa sugestão.**
- Manter as faixas calibradas.
- Adotar do seu prompt a parte de **cenários** (altista, neutro e baixista, sem probabilidade), que o nosso formato
  ainda não tem.

**Resposta:** Petróleo: ficam as faixas calibradas; os cenários ficam para depois, como pergunta comum aos quatro ativos (decisão do usuário, 2026-10-07, ADR 0104). Milho e café: faixas calibradas (Comitê; ADR 0079). Ouro:

---

## 3. Peso por mês e agregação dos fatores: só no milho ou também no petróleo e no ouro?

**O que você escreveu.** No milho:
- **Peso.** O peso separa-se da direção: peso-base × mês (mapa sazonal) × força do sinal. Você reponderou o dólar (F4)
  para Alto e os insumos (F6) para Baixo-Médio.
- **Agregação:**
  - clima, safrinha e estoques formam um **bloco de oferta**, com teto de peso;
  - os fundos (COT) **multiplicam** o peso e não votam;
  - os estoques servem de **filtro de confirmação**;
  - blocos em conflito reduzem a confiança;
  - a cobertura de dados entra na confiança.

**O que o FinMind faz hoje** no petróleo e no ouro:
- O peso é o do FEL 1, sem variar por mês.
- Não há regra de agregação: a IA explica as forças a favor e contra, sem pontuar.
- O COT já é tratado como qualificador, não como voto, o que bate com a sua proposta.

**A pergunta.**
1. O mapa sazonal e as regras de agregação valem só para o milho, ou também para o petróleo e o ouro?
2. A reponderação do F4 e do F6 entra no FEL 1 revisado (previsto para 15/10)?

**Nossa sugestão.**
- Aplicar no milho como você propôs.
- No petróleo e no ouro, esperar o FEL revisado. O ouro tem pouca sazonalidade; no petróleo, só a temporada de
  gasolina dos EUA pesaria.

**Resposta:** Petróleo: fica o peso do FEL 1, sem agregação, até o teste contra os benchmarks com as leituras do Brent futuro (decisão do usuário, 2026-10-07, ADR 0104). Ouro:

---

## 4. Eventos precisam de validação humana antes de ir à IA?

**O que você escreveu.** No fator 8 do milho: "o evento só entra após confirmação oficial, não por rumor" e "evento
exige validação humana antes de ir ao prompt". Na P12, você pede para avaliar o fator de eventos também no milho e no
café.

**O que o FinMind faz hoje.**
- Uma leitura diária por IA, com busca só em fontes autorizadas, registra os eventos de ouro, petróleo, milho e café,
  cada um com o link da página oficial.
- No petróleo e no ouro, esses eventos já vão ao prompt **sem validação humana**.
- Tarifas, USTR, MOFCOM e MAPA já estão entre as fontes.

**A pergunta.** A validação humana vale para todos os eventos, ou só para os de política comercial do milho?

**Opções.**
- (a) Uma tela em que alguém aprova cada evento antes de ele ir ao prompt.
- (b) Sem aprovação, mas só eventos com link de fonte oficial.
- (c) (a) para o fator 8 do milho e (b) para a geopolítica.

**Nossa sugestão:** (c). A geopolítica do ouro e do petróleo muda todo dia e travaria esperando aprovação. A política
comercial do milho é rara e de alto impacto, o caso certo para uma pessoa conferir.

**Resposta:** Petróleo: a geopolítica e a OPEP+ seguem sem aprovação humana, só com os filtros automáticos (decisão do usuário, 2026-10-07, ADR 0104). Fator 8 do milho e ouro:

---

## 5. Paridade de exportação: qual praça e qual cálculo?

**O que você escreveu.**
- Na P16: a **paridade pronta do IMEA** (MT), sem coletar os componentes, "para o FinMind não inventar uma fórmula".
- Na tabela do fator 4: a fórmula `(ZC + prêmio FOB) × 2,3622 × USDBRL − frete e porto` e a base interna = Indicador
  ESALQ (Campinas) − paridade.

**O que o FinMind tem.** O dólar PTAX e o Indicador ESALQ pela B3. Não tem o ZC (pago), o prêmio em Paranaguá nem o
frete. A paridade do IMEA ainda não é coletada.

**A pergunta.**
1. Na v1, vale a paridade do IMEA (a sua P16)?
2. Qual praça importa para o CCM: MT (onde está a paridade do IMEA) ou Campinas (onde o CCM liquida)? A base "ESALQ −
   paridade" mistura as duas.

**Nossa sugestão.**
- Na v1, a paridade do IMEA e a variação dela.
- A base contra Campinas fica para quando houver o prêmio e o frete.

**Resposta:**

---

## 6. Insumos na v1: o custo do IMEA basta?

**O que você escreveu.**
- Na confirmação da §5: o custo agregado do IMEA atende a v1, e o preço isolado de fertilizante exige fonte comercial.
- Na tabela do fator 6: a relação de troca (sacas por tonelada de ureia, MAP e KCl), o Banco Mundial (Pink Sheet) e o
  diesel da ANP.

**Nossa sugestão.**
- Na v1, a margem do produtor (Indicador ESALQ − custo do IMEA).
- A relação de troca depois, se o Comitê quiser decompor (o Pink Sheet é gratuito, mas é fonte nova).
- Como você mesmo diz, é um fator lento para o swing trade.

**Resposta:**

---

## 7. Critérios de aprovação do backtest (P10): o que falta fixar antes do primeiro teste

Os números estão propostos: Sharpe ≥ 0,5 / 0,3; drawdown ≤ 15%; 100 operações; profit factor ≥ 2,0; degradação ≤
20%. Para serem verificáveis, falta:

1. **Drawdown:** o limite operacional é 10% e o do backtest, 15%. O de 15% é só uma triagem histórica, ou a regra
   também precisa respeitar os 10%?
2. **Sharpe:** calculado com os retornos líquidos de custos (corretagem, slippage e rolagem do CCM)? Anualizado? Sobre
   o CDI?
3. **Degradação de 20%:** de qual métrica (o Sharpe?) e como se calcula a queda?
4. **100 operações na Fase 1:** o CCM tem dados de 2022 a 2026, com o buraco de 9 meses de 2023, cerca de 940 pregões.
   Num swing de 7 a 21 dias, mesmo posicionado o tempo todo, são **no máximo cerca de 90 operações**. Qual mínimo vale
   para a Fase 1?
5. **Profit factor ≥ 2,0:** no seu exemplo (50% de acerto, risco × retorno 2:1), o profit factor é **exatamente 2,0
   antes dos custos**. Com os custos, a regra do exemplo reprova. O limite é 2,0 bruto ou líquido?
6. **CDI (P9):** o FinMind tem a Selic. Usamos a Selic como aproximação declarada, ou coletamos o CDI (mesma fonte,
   o BCB)?

**Nossa sugestão:**
- custos sempre descontados;
- Sharpe anualizado sobre o CDI;
- degradação medida no Sharpe;
- na Fase 1, 30 operações como mínimo de triagem, com os 100 na Fase 2;
- profit factor de 1,5 líquido;
- coletar o CDI (é o BCB, que já usamos).

A decisão é do Comitê e precisa ficar fixada antes de qualquer resultado.

**Resposta:**

---

## 8. Fontes novas citadas na proposta do milho

A proposta do milho cita fontes que o FinMind não tem. Seguindo a P3 (premissa gratuita e só o que for **fator de
sucesso**) e a regra de não abrir fonte sem pedido, levantamos as que você citou:

| Fonte | Fator | Gratuita? |
|---|---|---|
| Paridade de exportação do IMEA | F4 | Sim. **Já aprovada (P16)** |
| NOAA/CPC (previsão 6–10 e 8–14 dias) e U.S. Drought Monitor | F1 | Sim |
| INMET/CPTEC (chuva e temperatura no Brasil) | F2 | Sim |
| UNEM, ANP (etanol e diesel), Cepea (etanol hidratado) | F5, F6 | Sim (o Cepea com as restrições de licença da P6). **UNEM e ANP no etanol: não aprovadas no estudo preliminar (usuário, 2026-10-06, ADR 0073, adendo)** |
| Banco Mundial (Pink Sheet, fertilizantes) | F6 | Sim |
| USDA Export Sales, ANEC, Secex semanal | F8 | Sim |
| Posição no CCM por tipo de investidor (B3) | F7 | A validar |
| Prêmio de exportação em Paranaguá | F4 | Em geral pago |
| ZC (CME) | F4 | Pago (Fase 2 da P8) |
| Expectativa dos analistas antes do WASDE, da Conab e da EIA (Reuters, Bloomberg, consultorias) | F1, F2, F3, F5 | Pago |

**Sobre a "surpresa contra a expectativa".** Nas camadas B de quatro fatores, a surpresa contra a expectativa dos
analistas é o que mais pesa, e é a fonte mais cara. Sem ela, usamos a **revisão contra o relatório anterior** (que já
temos) e declaramos a lacuna.

**A pergunta.** Quais 2 ou 3 dessas fontes são fator de sucesso para a v1?

**Nossa sugestão.**
- Rodar a v0 primeiro com o que temos e deixar a sua regra de cobertura mostrar onde o buraco pesa.
- Na fila: a paridade do IMEA (já aprovada); depois a previsão do NOAA/CPC (F1 na polinização) e o USDA Export Sales
  (F8), as duas gratuitas.

**Resposta:**

---

## 9. Da leitura de tendência à recomendação

**O que você escreveu.**
- A IA gera a recomendação (P11). A recomendação deve ser comprado, vendido ou fora (§5).
- As entradas terão stop, dois alvos e risco × retorno mínimo de 2:1, com a análise gráfica (Price Action, SMC, Fibo).
- Mas o prompt do milho proíbe ordem, stop e alvo "a menos que esteja expressamente previsto".

**O que o FinMind faz hoje.** No petróleo e no ouro, só **leitura de tendência**. Nunca recomendação, e nenhuma ordem
automática.

**A pergunta.** Confirma a sequência abaixo?
1. **Agora:** leitura de tendência.
2. **Depois do backtest aprovado (P10):** recomendação comprado, vendido ou fora.
3. **Junto:** stop e alvos vindos da sua camada de análise técnica.

**A pergunta sobre a análise técnica.** Quem a define e por qual fonte de dados? O FinMind não cria indicador técnico
por conta própria.

**Resposta:**

---

## 10. Como seguimos com o Motor do Milho v0

A proposta tem o formato que já usamos no petróleo e no ouro (Coleta → Medir → Ler → Decidir) e, com regras de alta e
de baixa por fator, vai além do que propusemos. **A conferência que você pediu:** os dois números estão no nosso banco:

- 11º levantamento (13/08/2026): **111.030,9 mil t**.
- 1ª estimativa (14/10/2025): **110.460,4 mil t**.

Seguindo a sua regra de comparar no mesmo estágio, o 12º levantamento de 2025/26 (112.130,8) contra o 12º de 2024/25
(112.032,8, de 11/09/2025) dá **+0,1%**, não −1,0%. O resultado das suas regras não muda (neutro), mas mostra por que
a regra é necessária.

**O que podemos fazer já, sem a aprovação do Comitê.** Montar o milho na tela de metodologia, com as suas regras
marcadas como "proposta do David v0":
- os fatores calculados com os dados que temos: clima, estoques, fundos, safrinha, política comercial, o etanol dos EUA,
  o dólar e a margem do IMEA;
- cada fator validado no histórico do **Indicador ESALQ pela B3 (desde 2018)**, que é mais longo que o CCM e é o preço
  em que o CCM liquida.

**O que espera a aprovação.** Ligar o milho à IA e ao Centro de Decisão, como foi feito no petróleo e no ouro.

**A pergunta.** Podemos começar a montar o milho na tela de metodologia com as suas regras v0? E a aprovação para ir à
IA vem depois de o Comitê ver a validação histórica?

**Resposta:**
