# 0062 — Leitura diária de tendência do café (prompt, IA e Centro de Decisão)

## Contexto

O café tinha os 8 fatores calculados na tela Metodologia do Ativo, com o Motor do Café v1 do David e os limiares
calibrados pelo FinMind (ADR 0060). Ele ficava fora do prompt diário, da IA e do Centro de Decisão até a aprovação do
Comitê. Os outros três ativos seguiram o mesmo caminho: o petróleo (ADRs 0050 a 0052), o ouro (ADRs 0053 e 0054) e o
milho (ADRs 0056 e 0058).

**Aprovação (registrada pelo usuário em 2026-10-05):** o Comitê aprovou o café em 2026-10-05, e o usuário autorizou
seguir. As decisões abaixo seguem o molde do milho (ADR 0058) e respondem às perguntas que estavam abertas na tela do
ativo. Uma decisão diferente do Comitê muda a configuração ou o prompt numa versão nova.

- **O que foi aprovado:** o Motor do Café v1 como está na tela, com as regras candidatas do estudo e os limiares
  calibrados pelo FinMind (a posição de cada medida no próprio histórico). Os ajustes daqui em diante são pelos
  parâmetros. O estudo recomendava aprovar só a arquitetura e o protótipo: a leitura de tendência da IA é o protótipo,
  e nenhuma regra opera ordem.
- **Formato da IA:** leitura de tendência, como nos outros ativos, e não recomendação de compra ou venda. A restrição
  permanente do `CLAUDE.md` continua valendo.
- **Preço de referência:** o ICF da B3 (US$/saca), no vencimento mais próximo negociado. O KC da ICE (Nova York) fica
  fora, porque é pago.
- **Horizontes:** em dias corridos (1, 7, 30 e 90), contados da data da análise, como nos outros ativos. O estudo conta
  em pregões.
- **Eventos sem validação humana, por ora:** como no milho, cada fator recebe os eventos da leitura diária por IA
  marcados com ele (7 dias de janela; 30 na demanda). A decisão pode ser revista.

## Decisão

1. **Configuração** `shared/analise-diaria-cafe.js` (versão 1), no molde da do milho.
   - **Horizontes:** os quatro dos outros ativos.
   - **Faixas:** T1 e T2 são os percentis 40 e 80 da variação absoluta do ICF no vencimento mais próximo negociado de
     cada data (2022-03-21 a 2026-10-02, 948 pregões).

     | Horizonte | T1 | T2 |
     |---|---|---|
     | Imediato (1 dia) | 1% | 2,7% |
     | Curto (7 dias) | 2,5% | 6% |
     | Médio (30 dias) | 5% | 14% |
     | Longo (90 dias) | 11% | 25% |

     **Por que o ICF, e não uma série mais longa:** o café não tem preço diário longo na base. Com todos os vencimentos
     do ICF, as faixas saem quase iguais (30 dias: 4,6 e 13,3%; 90 dias: 10,4 e 23,3%). O preço mensal do FMI (desde
     1992) é uma média e varia menos: 3,2 e 8,3% em 1 mês, 6,5 e 16,1% em 3 meses.

     **Por que as faixas são tão largas:** o período do ICF inclui a alta de 2024 e 2025, e o café varia cerca do dobro
     do milho. As faixas são provisórias.
   - **Preço:** o futuro ICF da B3, em US$/saca, no vencimento mais próximo negociado, sem emendar contratos. O preço
     também aparece em reais, pela PTAX, como no GLD do ouro. A linha em reais deixou de ter "por onça" escrito à mão:
     a unidade vem da configuração.
   - **Curva:** fora desta versão. Os vencimentos do ICF por horizonte, com a liquidez mínima, são pergunta do ativo.
2. **Prompt** `ai/prompts/cafe-analise-diaria.md` (versão 1).
   - **O que não muda:** a mesma estrutura e o mesmo formato de resposta (JSON) dos outros ativos.
   - **O que é do café** (tirado das regras transversais e das relações por par do estudo; fica como orientação à IA,
     não como cálculo):
     - o ICF como ativo, com Nova York só como referência externa;
     - o peso do FEL 1 como o único peso na base, porque o estudo descartou os pesos fixos e não definiu peso novo;
     - as regras como hipóteses sem backtest, o que entra na confiança;
     - neutralidade com dado faltando, e o conflito sem prioridade objetiva reduzindo a confiança;
     - clima, safra e estoques como um choque só, com defasagem, e os estoques confirmando a safra;
     - a revisão da Conab sem a expectativa do mercado, com menos firmeza direcional;
     - o câmbio como incentivo do produtor a vender, sem repasse mecânico;
     - os fundos como modificador de risco, sem voto, com o catalisador de clima ou de safra que a regra pede;
     - o custo só no horizonte longo;
     - a geada recente, que o VHI ainda não mostra, chegando pelos eventos.
   - **Sem números na instrução do sistema:** as faixas e os horizontes vêm da configuração, no bloco 2.4.
3. **Eventos:** nada muda no código. Os fatores do café já eram calculados e com eventos (ADR 0060), e o mecanismo do
   milho (ADR 0058) leva os eventos ao prompt depois do cálculo.
4. **Centro de Decisão:** o ICF já era a 1ª série do café. O coletor `cafe-analise-ia-diario` roda depois dos outros
   coletores, uma vez por dia.
5. **Ajuste no texto do fator de custo:** o ano do custo da Conab saía "2.025", na tela e no prompt. Os formatadores
   ganharam a opção `agrupar: false` (sem o separador de milhar).

## Evidência (dev, 2026-10-05)

- O prompt de 2026-10-05 foi montado com o ICFZ26 a US$ 351,90 (02/10), os 8 fatores e os 8 blocos de eventos.
- Uma chamada real ao Gemini (`gemini-3.8-flash`, chave paga, 46.523 tokens) passou na validação. A 1ª resposta foi
  recusada porque citava uma evidência que não existia, e a 2ª passou:

  | Horizonte | Tendência | Confiança | Papel do COT |
  |---|---|---|---|
  | Imediato | Lateral | Baixa | Risco de reversão |
  | Curto | Baixa leve | Baixa | Enfraquece |
  | Médio | Baixa leve | Média | Enfraquece |
  | Longo | Baixa leve | Média | Sem papel |

- **O que domina a leitura:** a safra de arábica revista para cima (+5,33%, 48.213 mil sacas) e o clima favorável
  (VHI de 64,3). A demanda e os fundos vendidos amortecem.
- **O que a IA foi além do motor:** no horizonte longo, ela usou a margem alta do produtor (+74,59% sobre o custo
  total) como incentivo a vender. O motor deixa o fator de custo neutro: a regra de baixa pede 2 anos de margem, e o
  custo só é conhecido desde 2026-10-01. É o mesmo tipo de desvio do milho (a sazonalidade). Vale acompanhar se o
  prompt precisa dizer, para fator neutro por falta de histórico, que a medida não sustenta pressão própria.

## Consequências

- O café passa a ter leitura de tendência diária no Centro de Decisão e na tela de metodologia (aba do prompt). Com
  ele, os quatro ativos do FEL 1 têm a cadeia inteira.
- A IA recebe os eventos sem validação humana, como nos outros ativos. A pressão de um evento é leitura de outra IA, e
  o prompt pede menos firmeza para ela do que para um dado medido.
- No servidor, o fator de estoques usa o histórico da ICE desde 2016. No dev, ele não decide, porque o histórico só
  começa em ago/2026.
- **Continuam abertos:**
  - as faixas (o período do ICF é de alta forte);
  - os vencimentos do ICF por horizonte e a curva;
  - a agregação em código das regras transversais;
  - as janelas críticas do clima e o índice do INMET;
  - como as sacas pendentes de classificação e os portos europeus entram nas regras.

## Fora do escopo

Recomendação de compra ou venda; o KC da ICE; a agregação dos fatores em código; a curva do ICF; a validação humana
dos eventos.

## Adendo (2026-10-07): os eventos saem dos fatores

O item 3 (os fatores do café calculados e com eventos, no mecanismo do milho) foi revisto pelo usuário: os eventos do
café vão a uma seção só da base do prompt, com a condição que cada um afeta; nenhum fator do café é de evento. A janela
de 30 dias da demanda continua, na seção. Detalhe: ADR 0095.
