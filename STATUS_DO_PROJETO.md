# FinMind — Status do projeto

Painel de uma página: o que está **pronto**, o que **falta** e o que está
**bloqueado** por decisão do especialista de mercado (David) ou do Comitê.
Serve para retomar o trabalho sem reconstruir o contexto.

**Última atualização: 2026-09-21.**

> **Regra de manutenção:** ao fechar uma entrega, atualize este arquivo **no
> mesmo commit**. Aqui só entra o estado (pronto / falta / bloqueado) e o link
> de onde está o detalhe — nunca cópia de conteúdo. Em caso de conflito,
> vale o documento apontado: `CLAUDE.md` (regras e convenções), os ADRs em
> `docs/adr/` (decisões e evidências por fonte) e
> `docs/pendente-especialista-david.md` (o que depende do David).

## 1. Onde estamos

A **infraestrutura de dados** para ouro e milho está pronta: coleta,
armazenamento point-in-time (com data de publicação) e exibição nos
Observáveis. **Nada interpreta esses dados ainda** — motor analítico, IA,
sinais, backtest e execução de ordens seguem como contratos vazios, à espera
das definições do David (ver `CLAUDE.md`, "Restrições permanentes").

## 2. Pronto

### Plataforma

| Item | Detalhe |
|---|---|
| Autenticação e papéis (`admin`/`user`) | Cookie JWT httpOnly, revalidação a cada request, gestão de usuários |
| Espaços (`workspace`) | Espaço pessoal + compartilhados, seletor na sidebar. **Ainda sem dado privado** — ADR 0007 |
| Pipeline de coleta | Download → parse → normalize → persist, retry, log em `collection_execution` — ADR 0002 |
| Camada point-in-time | Tabela `observation` append-only + `asOf()` — ADR 0008 |
| Fator versionado | `backend/src/factors/juro-real-10a.factor.js` (`DGS10 − T10YIE`), validado contra DFII10. Não exposto na tela |
| Tela "Status do projeto" | `/status-projeto` (menu Sistema): renderiza este arquivo, via `GET /api/v1/status-projeto`. Visível a **todo usuário autenticado** — temporária, a retirar depois da fase de desenvolvimento. O `deploy.yml` copia o arquivo para a imagem do backend |
| Telas de dados | `/dados-mercado/observaveis` (11 cards) e `/dados-mercado/execucoes` — ADR 0005 |
| Agendamento | Dev: Agendador do Windows às 22:00. Produção: cron do usuário `deploy` (04:00, 06:00, 08:00 **UTC**, **não versionado**) — ADR 0004 |
| CI/CD | Lint + testes + build em toda branch; deploy por push na `main`, que já roda as migrations automaticamente (`scripts/deploy.sh`, passo 4/6) |

### Dados coletados

Status de cada fonte, evidências e ressalvas: **ADR 0009**.

| Fonte | Séries | Histórico | `published_at` | Status |
|---|---|---|---|---|
| BCB SGS | Dólar (PTAX venda), Selic meta e realizada | Longo na fonte; **carga atual ~60 dias** (backfill disponível, ver §3 item 7) | — (`market_quote`, não revisa) | ✅ ADRs 0001, 0006 |
| FRED | DGS10, T10YIE, DFII10, DTWEXBGS | DGS10 desde 1962; DFII10/T10YIE 2003; DTWEXBGS 2006 | Estimado | ✅ Coleta pela API, CSV de reserva — ADR 0012. Vintage real (ALFRED) provado via teste — ADR 0011 |
| LBMA | Ouro PM (USD/oz) | Desde 1968 | Estimado | ✅ Licença da IBA exigida p/ exibir/redistribuir — adiada (uso interno) |
| CFTC COT | Ouro e milho (open interest, MM long/short) | Desde 2006 | Real desde 2022-08; estimado antes | ✅ |
| USDA NASS | Crop Progress do milho (12 séries) | Desde 1980 (piso real da API; cada série começa no seu ano) | Estimado (regra não validada p/ 1980–2005) | ✅ Validado em 2026-09-21 (6.758 linhas) |
| B3 CCM | Futuros de milho, por vencimento | ~15 meses, janela rolante | Estimado | ✅ 10+ anos **não existem de graça** |

### Como tratamos as fontes de dados

Nenhuma fonte entra sem **reconhecimento técnico prévio**: um checklist de 11
perguntas (API, chave, formato, histórico, revisões, data de publicação, limite
de uso, **licença**, riscos), respondido com **chamada real** e não com suposição.
O que não foi confirmado fica registrado como **incerteza declarada**. O relatório
FEL 1 catalogou 42 fontes sem testar nenhuma; este processo (portado do AgroMind)
é o que separa "catalogada" de "confirmada". Cada fonte tem um **nível de
maturidade** de 0 a 5: 0 identificada · 1 reconhecimento concluído · 2 modelo
definido · 3 coletor implementado · 4 coleta validada · 5 histórico carregado.

Nível **não** significa "sem ressalvas" — uma fonte no nível 5 ainda pode ter
licença pendente. Por isso a coluna de ressalvas é a que importa na reunião:

| Fonte | Nível | Ressalva principal | Depende de |
|---|---|---|---|
| BCB dólar / Selic | 4 | Só ~60 dias carregados | Nós (item 7) |
| FRED | 5 | Licença lida: 3 de 4 séries domínio público c/ citação; `T10YIE` não confirmada. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| LBMA (ouro) | 5 | **Exige licença da IBA** p/ usar/redistribuir o histórico. **Adiada** (uso interno) | Retomar antes de exibir a terceiros |
| CFTC COT | 5 | Data de publicação estimada antes de 2022-08 | — |
| USDA Crop Progress | 5 | Data de publicação estimada, não validada p/ 1980–2005 | — |
| B3 CCM | 5 (limitado) | **Só ~15 meses de histórico grátis** | David/Comitê (pergunta 3, orçamento) |
| CEPEA, Conab, IMEA, WASDE, NOAA, CPI, WGC | 0 | Candidatas, fora do escopo; CEPEA bloqueada para automação | David (pergunta 7) |

Processo: `docs/processo-reconhecimento-fontes.md`. Uma linha por fonte, com
evidência: `docs/reconhecimento-fontes/README.md` (checklist completo de FRED e
LBMA em arquivos próprios, por causa da licença).

## 3. Falta fazer (não depende do David)

| # | Pendência | Observação |
|---|---|---|
| ~~1~~ | ~~Backfill de vintages via ALFRED~~ | **Feito (2026-09-21):** `DGS10`/`DFII10`/`T10YIE` não revisam de fato (confirmado por chamada real, 0 revisões em ~2.100 observações); `DTWEXBGS` revisa e foi usado pra provar `asOf()` com dado real num teste isolado — ver ADR 0011. Backfill de produção fica para quando uma série revisável de verdade entrar (ex.: CPI) |
| ~~2~~ | ~~Profundidade do USDA~~ | **Feito (2026-09-21):** o QuickStats começa em 1980 (pedir desde 1900 devolve as mesmas linhas); padrão do coletor passou de 2006 para 1980 — ADR 0009. Em produção o histórico entra na próxima coleta |
| ~~3~~ | ~~Reconhecimento de fontes (níveis 0–5)~~ | **Feito (2026-09-21):** processo portado do AgroMind + índice com as 7 fontes implementadas (registro retroativo) e as candidatas em nível 0; regra agora em `CLAUDE.md` — ver "Como tratamos as fontes" (§2) |
| ~~4~~ | ~~Licenças de LBMA e FRED~~ | **Lido e registrado (2026-09-21); adiado por decisão:** sem distribuição nem comercialização prevista, uso interno. Nota de licença nos cards dos Observáveis; detalhe no ADR 0009 e em `docs/reconhecimento-fontes/`. Retomar **antes de exibir a terceiros** (FRED: citar a fonte e o aviso da API; LBMA: consultar a IBA ou trocar de fonte). A migração do FRED para a API foi feita (ADR 0012) |
| ~~5~~ | ~~Cron de produção~~ | **Confirmado por SSH (2026-09-21):** servidor em **UTC** (04/06/08 UTC = 01/03/05 em Brasília); o cron disparou nos 3 horários e as 3 execuções do dia terminaram com todos os coletores em `success` — ADR 0004. A produção ainda roda o código anterior (USDA de 2006, FRED por CSV): muda no próximo deploy |
| 6 | Permissões granulares e refresh token | Só se houver necessidade real |
| 7 | **Carga histórica do BCB** (dólar e Selic) | Achado do item 3: o banco de dev tem só ~60 dias. `npm run backfill:dolar -- --dias=N` e `backfill:selic` já existem; falta rodar (e em produção) |
| 8 | **`FRED_API_KEY` na VM de produção** | A coleta do FRED já usa a API quando há chave (ADR 0012); sem ela segue no CSV, sem erro. Falta incluir a chave no `.env` da VM e reiniciar o backend — ação manual, o deploy não faz |

## 4. Bloqueado — depende do David / Comitê

Itens 4 a 8 de `docs/pendente-especialista-david.md` continuam sem definição:
regras e cálculos do motor, formato de apresentação, avaliação da IA,
condições de sinal e execução de ordens.

Perguntas da análise crítica (`docs/analise-critica-fel1-milho-ouro.md`, §H).
Preencher a resposta e a data quando o David responder.

| # | Pergunta | Trava? | Resposta / data |
|---|---|---|---|
| 1 | Milho + Ouro como **prova de arquitetura** (sem mudar a ordem CAFÉ→PETRÓLEO→MILHO→OURO) é aceitável? | | — |
| 2 | Milho: **CCM (B3)** ou **ZC (CME)**? Ouro: **GC** ou preço de referência? | | — |
| 3 | Existe **orçamento para dados de preço**? Sem isso não há backtest | ⛔ | — |
| 4 | Confirmam que o **COTAHIST não atende CCM/ICF**? Qual a alternativa? (o ADR 0009 já confirma que não atende) | | — |
| 5 | **Vintage do agro:** backtest com dado revisado e viés declarado, ou acumular a partir de agora? | ⛔ | — |
| 6 | Quem responde por **licença e redistribuição** das fontes? Não trava hoje (sem distribuição prevista, decisão de 2026-09-21); passa a travar se isso mudar | | — |
| 7 | **CEPEA** está bloqueada para automação. Export manual é aceitável em produção? | | — |
| 8 | Backtest de **1–5 anos** (§4) ou **10–15 anos** (§12.1)? Qual vale? | | — |
| 9 | Qual o **benchmark** do Sharpe mínimo? | | — |
| 10 | Os limiares da §12.2 serão deliberados **antes** dos testes? | | — |
| 11 | A **IA propõe hipóteses e narra, mas não gera o sinal**? | ⛔ | — |
| 12 | IA Search só para descoberta de fonte e evento qualitativo, **vedada** como origem de número? | | — |
| 13 | As **Seções 15 e 16** (Registro de Revisão) do relatório existem? | | — |
| 14 | **WASDE impacta café** (planilha) ou não (texto revisado)? Qual prevalece? | | — |

## 5. Fora do escopo por enquanto

Não implementar sem autorização explícita registrada em ADR:

- Café, petróleo e qualquer ativo além de USD/BRL, Selic, ouro e milho.
- CEPEA (bloqueada por Cloudflare), Conab, IMEA, WGC, WASDE/PSD, clima, CPI.
- Série contínua de futuros, rolagem e backtest.
- Qualquer sinal, limiar, indicador técnico ou regra de compra/venda.
- IA em qualquer ponto (o ADR 0010 é só proposta de desenho futuro).
- Execução automática de ordens e corretora.
