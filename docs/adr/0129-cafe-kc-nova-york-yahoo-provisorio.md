# 0129 — Café arábica de Nova York (ICE KC) pelo Yahoo, fonte não oficial e provisória

## Contexto

Em 2026-10-19 chegou a análise "ANÁLISE CAFÉ 19out26" (*Por que o FinMind indica baixa e o café está em alta?*), com
11 erros apontados no motor do café. A resposta do FinMind, item a item, está no `STATUS_DO_PROJETO.md`, §0. Três
itens pedem o preço diário do café em Nova York, o KC da ICE, que o FinMind não tinha:

- **E1:** conciliar o ICF da B3 com Nova York e acompanhar o basis B3 × NY com o percentil histórico;
- **E3:** a inclinação da curva (1º contra 2º vencimento) como sinal de aperto, ao lado dos estoques certificados, que
  são de Nova York;
- **E10:** a estrutura a termo e o basis como fatores novos, e um histórico diário longo para a sazonalidade e os
  testes fora da amostra (o ICF só tem dado desde 2022).

O FinMind só tinha a média mensal de Nova York da ICO (ADR 0061). O diário oficial da ICE é pago: no reconhecimento de
2026-10-04, ficou "só com orçamento e licença" (`docs/reconhecimento-fontes/cafe-fontes-novas-motor-v1.md`, §6).

**Autorização:** o usuário autorizou o KC pelo Yahoo em 2026-10-20, nos mesmos moldes do Brent futuro (ADR 0096).
**Só aquisição de dados**: o basis, a curva como fator e qualquer uso do KC na leitura são decisões à parte (§0 do
status). A aquisição está encerrada desde 2026-10-01: esta é uma demanda específica, da análise do café.

## Evidência (chamada real, 2026-10-20)

- **ICE:** os dados atrasados do site respondem 403 (Cloudflare); a API de gráficos, uma lista vazia.
- **Yahoo** (`query1.finance.yahoo.com/v8/finance/chart`, o endpoint do Brent): 200, JSON, sem chave, com o user-agent
  do FinMind. Moeda `USX` (centavos de dólar por libra-peso), bolsa `NYB`.
- **Por vencimento:** `KCZ26.NYB` a `KCH28.NYB` (7 vencimentos: março, maio, julho, setembro e dezembro, ~18 meses à
  frente), cada um desde a listagem (2024-01-02 a 2025-04-01). O vencido some ("Not Found": `KCU26.NYB`).
- **Contínua:** `KC=F`, o 1º vencimento encadeado pelo Yahoo, desde 2000-01-03. Rola no pregão depois do último negócio
  do vencimento, sem ajuste (21/09/2026: de 294,55 no KCU26, em 18/09, para 276,40 no KCZ26).
- **O fechamento diário é o ajuste**, não o último negócio: o pregão fecha às 13:30 de Nova York, e no KCH27 o diário de
  15, 16 e 19/10/2026 (285,35, 294,50 e 302,25) difere do último negócio das 13:25 (287,25, 294,60 e 299,80).
- **A barra do dia aparece com o pregão aberto**, e **o volume tem dias repetidos** (15 e 16/10/2026), como no Brent.

## Decisão

1. **Um molde para os futuros do Yahoo** (`collectors/yahoo/yahoo-futuro.collector.js`, `criarColetorFuturoYahoo`),
   com o Brent e o KC como produtos; o `yahoo-brent-futuro` passa a ser o produto `brent` do molde, sem mudança de
   comportamento.
2. **Coletor `yahoo-kc-futuro`**, em `observation`, fonte `YAHOO`:
   - séries `YAHOO.KC.<TICKER>.SETTLE`, `.HIGH` e `.LOW` por vencimento, no formato das da B3 (o decodificador de ticker
     passa a aceitar `KC`), e `YAHOO.KC_CONTINUO.SETTLE`, a contínua do Yahoo, guardada à parte. O FinMind não encadeia
     vencimentos (ADR 0044);
   - em **centavos de dólar por libra-peso** (`US¢/lb`), a unidade da bolsa, com duas casas. A conversão para US$/saca
     (× 1,3228) é um cálculo, fora do coletor;
   - a coleta diária pede o último mês dos vencimentos do mês atual até 18 meses à frente, só nos meses do KC, e da
     contínua: 8 pedidos, com pausa de 300 ms. Vencimento inexistente é ignorado; nenhum vencimento encontrado é falha;
   - só pregões **encerrados**; `published_at` **estimado** no fim do dia do pregão em Nova York.
3. **Backfill** `npm run backfill:yahoo-kc` (o script passa a ser `backfill-yahoo-futuro.js --produto=...`; o
   `backfill:yahoo-brent` continua o mesmo). Em dev: 16.668 valores, 0 falhas; a contínua tem 6.718 pregões (2000-01-03
   a 2026-10-19); repetido, 0 criados; a coleta diária logo depois, 0 criados e 448 iguais.
4. **Cards** `KC_FUTURO_PRECOS` (por vencimento) e `KC_FUTURO_CONTINUO`.

## Riscos aceitos pelo usuário

Os mesmos do Brent (ADR 0096): **fonte não oficial**, que pode mudar ou fechar sem aviso (a coleta falha alto e nada é
gravado errado); **termos de uso** que não preveem coleta automática, com o dado da ICE redistribuído: exceção
consciente, para **uso pessoal**; se o FinMind virar comercial, a fonte troca.

## Fora do escopo (de propósito)

- **O basis B3 × Nova York, a curva de Nova York e qualquer fator novo** (E1, E3 e E10): cálculos a decidir no item de
  cada um.
- **Trocar o preço de referência da leitura do café** (hoje o ICF da B3, ADR 0062).
- **Coletar a versão gratuita do site da ICE automaticamente**: rejeitado pelo mesmo motivo do ADR 0096 (contornaria a
  barreira da ICE e arriscaria o IP da VM, que coleta os estoques certificados no `ice.com`).

## Consequências

- O FinMind passa a ter o café de Nova York por vencimento e um histórico diário de 26 anos, sem custo.
- O KC depende de uma fonte não oficial, como o Brent.
- Reconhecimento: `docs/reconhecimento-fontes/cafe-kc-yahoo.md`.
