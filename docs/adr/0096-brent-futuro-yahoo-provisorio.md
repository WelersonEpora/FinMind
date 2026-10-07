# 0096 — Brent futuro (NYMEX BZ) pelo Yahoo, fonte não oficial e provisória

## Contexto

Desde 2026-10-04 o preço de referência da leitura do petróleo é o **Brent à vista da EIA** (ADR 0052, adendo). Em
2026-10-07, ao ler o gráfico da Qualidade da IA, o usuário perguntou por que o último preço era o de 29/09. Dois
problemas apareceram:

1. **Defasagem.** A EIA publica os preços diários uma vez por semana, na quarta, com os dias até a terça anterior
   (ADR 0040): o realizado fica de 1 a 8 dias atrás.
2. **Instrumento.** O Brent da EIA é o **físico** (Dated Brent, carga para embarque nos próximos dias). O David
   respondeu que o preço de referência é o do **instrumento operado** (P2, ADR 0055), e a operação será na Pepperstone,
   cujo Brent acompanha o **futuro**. Em mercado apertado os dois se afastam: o Brent físico menos o WTI foi de US$ 3 a
   6 de out/2025 a fev/2026, mas de US$ 11,8 a 17,7 em mar–abr/2026 e de 17,2 em set/2026 (média do mês; até 30,8). Em
   29/09/2026 o físico estava a 113,96 e o 1º vencimento do futuro a 102,59.

Não havia o Brent futuro em nenhuma coleta: a EIA parou de publicar os futuros da NYMEX em 2024-04 (ADR 0040).

**Autorização:** com o levantamento abaixo em mãos, o usuário escolheu o Yahoo em 2026-10-07 e respondeu "sim" à
proposta de (1) registrar a fonte num ADR e (2) implementar o coletor, com o histórico e o card. **Só aquisição de
dados**: a troca do preço de referência da leitura e o gráfico com as duas linhas são decisões à parte (abaixo). A
aquisição está encerrada desde 2026-10-01: esta é uma demanda específica do usuário, para o preço que o David pediu.

No mesmo dia, por decisão do usuário, as leituras do petróleo feitas ainda com o WTI foram apagadas, para que a
Qualidade da IA mostre só o Brent: a de 2026-10-03 em dev e as de 2026-10-03 e 2026-10-04 no servidor (a troca para o
Brent entrou às 14:14 de 04/10, depois da leitura do dia).

## Evidência (chamada real, 2026-10-07)

| Fonte | Resultado |
|---|---|
| ICE (bolsa do Brent), Report Center, relatório "Futures" de fim de dia | A página é pública; a API do relatório (`/marketdata/api/reports/10/criteria`) responde **409** fora do navegador; a cotação atrasada do site, **403** do Cloudflare. A política de dados da ICE (§2.6) diz que o relatório de fim de dia é gratuito **no site** e que a entrega **automática** é a assinatura paga |
| ICE paga (EOD, ICE Futures Europe – Commodities) | **US$ 2.500/ano** (diário) e **US$ 50 por trimestre** de histórico desde 2013-Q2, por contrato de uso de dados e fatura corporativa (tabela oficial, de 2022) |
| CME (BZ) | **403**: "This IP address is blocked due to suspected web scraping activity" |
| Stooq | Desafio de JavaScript |
| **Yahoo Finance** (`query1.finance.yahoo.com/v8/finance/chart`) | **200**, JSON, sem chave, com o user-agent do FinMind (com o do curl, 429) |
| Pepperstone (o instrumento operado) | Não testado: exige conta e credenciais |

No Yahoo:

- **Por vencimento:** `BZZ26.NYM`, `BZF27.NYM`... com o histórico desde a listagem (2018 a 2020 nos vencimentos
  ativos). O vencimento **some no dia seguinte ao vencimento**: `BZX26.NYM` deu "Not Found" em 01/10/2026.
- **Contínua:** `BZ=F`, o 1º vencimento encadeado pelo Yahoo, desde 2007-07-30 (4.776 pregões com fechamento, 58
  sem). Rola no dia seguinte ao vencimento, sem ajuste (01/10/2026: 103,53 no X26, 102,31 no Z26).
- **O fechamento diário é o ajuste**, não o último negócio: em 21 pregões de set–out/2026, nos dias em que o preço das
  17:00 se afastou do das 14:30 de Nova York (até US$ 1,19), o diário bateu com o das 14:30 (a janela do ajuste é
  14:28–14:30); nos outros, os dois ficaram a no máximo US$ 0,12 e o teste não distingue.
- **A barra do dia aparece com o pregão aberto** (preço do momento).
- **O volume tem dias repetidos** (25 e 28/09/2026 com o mesmo número).

## Decisão

1. **Coletor `yahoo-brent-futuro`** (`collectors/yahoo/`), em `observation`, fonte `YAHOO`:
   - séries `YAHOO.BZ.<TICKER>.SETTLE`, uma por vencimento, no formato das da B3 (o decodificador de ticker passa a
     aceitar `BZ`), e `YAHOO.BZ_CONTINUO.SETTLE`, a contínua do Yahoo, guardada à parte como o único histórico dos
     vencimentos que saíram. O FinMind não encadeia vencimentos (ADR 0044);
   - só o ajuste, em US$/barril, com duas casas. Abertura, máxima, mínima e volume ficam de fora;
   - a coleta diária pede o último mês dos 13 meses de vencimento seguintes ao atual (o 1º vencimento e um ano de curva)
     e da contínua: 14 pedidos, com pausa de 300 ms. O vencimento já vencido ("Not Found") é ignorado; nenhum
     vencimento encontrado é falha;
   - só pregões **encerrados**: o dia de hoje em Nova York entra na coleta seguinte;
   - `published_at` **estimado**: o fim do dia do pregão em Nova York. Uma correção do Yahoo vira versão nova (ADR
     0008).
2. **Backfill** `npm run backfill:yahoo-brent`: o histórico inteiro de cada símbolo (14 pedidos, segundos). Dev e
   servidor: 26.672 valores, 0 falhas; em dev, a coleta diária logo depois: 0 criados, 273 iguais.
3. **Cards** `BRENT_FUTURO_PRECOS` (por vencimento, o mesmo formato dos futuros da B3) e `BRENT_FUTURO_CONTINUO`.

## Riscos aceitos pelo usuário

- **Fonte não oficial:** endpoint sem documentação nem garantia; pode mudar ou fechar sem aviso. A coleta falha alto
  (a tela Execuções mostra), nada é gravado errado e o Brent da EIA continua sendo coletado.
- **Termos de uso:** o Yahoo não prevê coleta automática, e o dado é da CME, que a proíbe. Este projeto já tinha
  descartado o Yahoo para o ouro por isso (ADR 0044). Aqui é uma exceção consciente, para **uso pessoal**, como a
  regra das licenças adiadas; se o FinMind virar comercial, a fonte troca.
- **NYMEX, não ICE:** o BZ liquida pelo ICE Brent e anda junto, mas o ajuste pode diferir em centavos. A conferência
  é manual, pelo Report Center da ICE (gratuito no navegador).

## Fora do escopo (de propósito)

- **Trocar o preço de referência da leitura** para o Brent futuro (com o contrato por horizonte, como no milho e no
  café, ADR 0078, e as faixas recalibradas pelo critério do ADR 0051): decisão à parte, num adendo ao ADR 0052; sugerido
  confirmar com o David pela diferença de nível.
- **O gráfico da Qualidade da IA com as duas linhas** (o futuro como preço da avaliação, o físico da EIA como
  contexto): depois da troca.
- **Coletar a versão gratuita da ICE automaticamente** (navegador automatizado): rejeitado. Contornaria a barreira que
  separa a consulta gratuita do produto pago e arriscaria o bloqueio do IP da VM, que também coleta os estoques do café
  no `ice.com`.
- **A assinatura da ICE:** gasto do caixa para aquisições (P3, ADR 0055), decisão do Comitê. Se aprovada, a ICE vira
  a série principal e o Yahoo só completa os dias ainda não publicados.

## Consequências

- O Brent que se opera passa a existir no FinMind, sem defasagem (um pregão atrás), por vencimento e com histórico.
- O FinMind passa a depender de uma fonte não oficial para o preço que vai medir a IA, até a decisão sobre a ICE.
- Reconhecimento: `docs/reconhecimento-fontes/brent-futuro.md`.
