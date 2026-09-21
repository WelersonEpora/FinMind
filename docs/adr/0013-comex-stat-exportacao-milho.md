# 0013 — Exportação de milho pelo Comex Stat (MDIC), a partir de 2005

## Contexto

O relatório FEL 1 do David lista o Comex Stat (MDIC) como fonte de exportações de milho e o inclui na
Fase 1 do plano de integração (§9.2, "API oficial gratuita"). Até aqui não coletávamos. Em 2026-09-21 o
usuário **autorizou explicitamente** a implementação (exceção pontual prevista em `CLAUDE.md`, mesmo
precedente do dólar, ADR 0001), com a cobertura **a partir de 2005** e a possibilidade de estender depois. Nenhuma
outra fonte fica desbloqueada por este ADR. Reconhecimento no AgroMind:
`docs/reconhecimento-fontes/comex-stat-mdic.md` (lá, nível 4).

Esta é uma fonte de dado oficial e público: infraestrutura, não estratégia. Nenhuma regra, limiar ou sinal
é derivado dela.

## Evidência (chamada real, 2026-09-21)

`POST https://api-comexstat.mdic.gov.br/general`, sem chave, exportação, NCM `10059010` ("milho em grão,
exceto para semeadura"), `monthDetail: true`:

| Ano | Exportação (soma dos meses) | Observação |
|---|---|---|
| 2005 | 1,06 Mt | igual ao total anual devolvido pela API |
| 2010 | 10,7 Mt | idem |
| 2012 | 19,8 Mt | idem |
| 2024 | 39,7 Mt | idem |
| 2026 | 8 meses (jan-ago) | dado mais recente: agosto, ~3 semanas depois do fim do mês |

- **Antes de 2005 não está validado.** Em 1997 o NCM devolve 348 mil t, mas em **2000 devolve só 21 t**,
  sinal de que o código NCM do milho mudou no período (mesmo achado do AgroMind com a soja) e exige um
  mapeamento por período que não foi feito. O NCM `10059000` devolve vazio em 2000 e 2005.
- **Rate limit real (HTTP 429):** aparece mesmo com 11 s entre chamadas e, num backfill de 22 anos seguidos
  com 13 s de pausa, o 429 veio 3 vezes seguidas no 17º ano (as próprias tentativas contam no limite). O
  primeiro backfill, feito como um download único, **falhou e perdeu os 16 anos já baixados**.
- **Pedido de vários anos sem detalhe mensal devolve valor errado** (achado do AgroMind, não retestado):
  por isso uma chamada por ano, sempre com `monthDetail: true`.
- **A fonte não informa** se revisa meses já publicados, nem a data de publicação. A licença não tem termo
  explícito (dado de ministério, presunção de dado aberto). Uso atual: interno.

## Decisão

- **Coletor** `comex-milho-exportacao` (`collectors/comex/`), registrado sempre (não exige chave).
- **Só exportação** (é o que o relatório descreve). Duas séries mensais em `observation`:
  `COMEX.MILHO.EXPORT.KG` (kg) e `COMEX.MILHO.EXPORT.FOB_USD` (US$), como a fonte publica, sem conversão.
  `observed_at` é o 1º dia do mês (a fonte é mensal); o mês fica em `metadata.periodo`.
- **`published_at` ESTIMADO** em fim do dia 15 do mês seguinte (conservador: a divulgação costuma sair
  antes, então nunca antecipa o que se sabia). O serviço point-in-time o limita a `collected_at`.
- **Coleta diária:** relê o ano corrente e o anterior (2 chamadas, ~15 s), o que captura meses novos, a virada
  de ano e qualquer revisão tardia; uma revisão vira uma nova versão (append-only, ADR 0008).
- **Rate limit:** pausa de 13 s entre anos e, no 429, espera crescente (20 s, 40 s, 60 s, 80 s), até 5 tentativas.
- **Cobertura a partir de 2005**, documentada na tela (card), no status e no índice de fontes. Estender para
  antes exige mapear o NCM do milho por período (fica como pendência, sem prazo).
- **Backfill** `npm run backfill:comex-milho` (`--anoInicial`, `--anoFinal`; recusa antes de 2005), dividido em
  **blocos de 5 anos, uma execução por bloco**: uma falha só perde o bloco, e ele pode ser repetido isoladamente.
- **Tela:** dois cards nos Observáveis, "Milho - Exportação (volume)" e "(valor FOB)" (unidades diferentes não
  dividem eixo). Frequência mensal, tolerância de 75 dias antes de aparecer como "atrasado".

## Resultado (banco de dev, 2026-09-21)

Backfill de 2005 a 2026 em 5 blocos, ~13 min (a espera do 429 pesa): 260 meses × 2 séries = 520 linhas,
2005-01-01 a 2026-08-01, 0 falhas, todas com `published_at` estimado. A soma mensal de 2005, 2010, 2012 e
2024 bate exatamente com o total anual da API. A coleta diária seguinte leu 20 linhas e criou 0
(idempotente).

## Consequências

- **Produção:** backfill rodado na VM depois do deploy (`npm run backfill:comex-milho`, ~13 min) e conferido por
  consulta ao banco: 260 linhas em cada série, de 2005-01-01 a 2026-08-01, 5 blocos em `success` (4 × 120 e 1 × 40
  linhas criadas). A coleta diária só cobre o ano corrente e o anterior.
- **Revisão não confirmada:** só a coleta repetida ao longo dos meses mostra se o MDIC revisa. Nesse caso
  passa a existir um caso real de vintage (ADR 0011), com `published_at` = `collected_at`.
- **Fora de escopo aqui:** importação, outros NCMs (`10059090` é milho de semeadura, pequeno) e outros produtos.
