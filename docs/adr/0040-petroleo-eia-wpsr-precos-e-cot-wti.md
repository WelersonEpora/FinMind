# 0040 — Petróleo: estoques, produção, refino e preço à vista (EIA) e posição dos fundos no WTI (CFTC)

## Contexto

O petróleo é o 2º ativo na ordem do FEL 1 (Café → Petróleo → Milho → Ouro) e não tinha nenhuma fonte coletada. A
planilha `controle_fatores.xlsx` lista 10 fatores do petróleo; o FEL 1 lista 12 fontes (§6.2, tabela 5) e, como
obrigatória, uma série histórica de preço (§6.5.2). O reconhecimento das fontes está em
`docs/reconhecimento-fontes/petroleo.md`.

**Autorização:** o usuário autorizou a onda do petróleo em 2026-10-01 ("Sim, pode seguir"), **só aquisição de
dados**, como na onda do café. Que números entram nos fatores, e como, é decisão do David. A licença não foi tratada:
uso pessoal, decisão do usuário do mesmo dia.

## Evidência (chamada real, 2026-10-01)

- **EIA:** as 16 planilhas candidatas (`/dnav/pet/hist_xls/<sourcekey><w|d>.xls`, sem chave) responderam, com o nome
  oficial da série na linha de cabeçalho; detalhe por série no reconhecimento. Todas tinham `Last-Modified` de quarta
  2026-09-30, 14:42–14:45 UTC, logo depois do WPSR (10:30 ET): **os preços diários também saem uma vez por semana**,
  com os dias até a terça anterior (2026-09-29). A série de futuros da NYMEX (RCLC1) parou em 2024-04-05.
- **CFTC:** o WTI da NYMEX (código 067651) existe no mesmo dataset do COT, desde 2006-06-13 (1.059 semanas).

## Decisão

1. **Coletor `eia-petroleo`** (`collectors/eia/eia-petroleo.collector.js`), fonte `EIA`, sobre a mesma planilha e a
   mesma regra de divulgação do etanol (ADR 0024). O código comum dos dois (download, feriados dos EUA, calendário
   oficial de feriados, leitura da planilha) foi para `collectors/eia/eia-wpsr.js`; o etanol não muda de comportamento.
   15 séries, em 3 grupos (3 cards):
   - `EIA.PETROLEO_ESTOQUES.*` (semanal, mil barris): petróleo sem a SPR, na SPR e em Cushing; gasolina; destilados;
   - `EIA.PETROLEO_FLUXOS.*` (semanal, mil barris/dia, utilização em %): produção, entrada nas refinarias, utilização
     das refinarias, importação, exportação, derivados fornecidos;
   - `EIA.PETROLEO_PRECOS.*` (diário): WTI e Brent (US$/barril), gasolina convencional e diesel S10 de Nova York
     (US$/galão).
2. **`published_at` estimado, fim do dia:** semanal, a regra do etanol (quarta; quinta com feriado; o calendário
   oficial vence); diário, a divulgação da semana cuja terça de fechamento é a 1ª terça igual ou posterior ao dia
   (a sexta dessa semana = terça − 4).
3. **Preço pode ser negativo** (WTI de 2020-04-20, −36,98); estoques e volumes recusam negativo.
4. **COT:** o WTI entra como mais um contrato do coletor existente (`cftc-cot-crude`, séries `CFTC.CRUDE_WTI.*`), com
   card próprio, como o café (ADR 0028).
5. A primeira coleta já é a carga histórica (as duas fontes baixam a série inteira): **não há backfill**.

## Fora do escopo (de propósito)

- **Futuros (CL, Brent):** pagos; a EIA deixou de publicar os da NYMEX. O preço à vista é o físico, não o contrato.
- **Margem de refino (crack spread):** é um cálculo sobre os preços (fator do David). Gravamos os preços.
- **ANP, JODI, Baker Hughes, OPEP:** passo 2 da onda (reconhecimento no documento acima). IEA, API e Platts: pagos.
- Estoques por região (PADD), outros derivados e os dados mensais da EIA.

## Resultado (2026-10-01, banco de dev)

| Coletor | 1ª execução | Reexecução |
|---|---|---|
| `eia-petroleo` | 54.282 criados, 0 inválidos, 0 falhas | 0 criados, 54.282 ignorados |
| `cftc-cot-crude` | 3.177 criados (1.059 semanas × 3), 0 falhas | 0 criados, 3.177 ignorados |

Conferência com fatos conhecidos: WTI de US$ 145,31 em 2008-07-03 (o recorde) e de −36,98 em 2020-04-20; estoque de
petróleo sem a SPR de 427.320 mil barris na semana de 2026-09-25.

## Consequências e limitações

- **O petróleo é o único dos quatro ativos com preço diário longo e grátis** (40 anos de WTI e Brent), relevante para
  as perguntas 2 e 8 (§4 do status). Mas é o preço à vista, só o fechamento (sem abertura, máxima, mínima e volume), e
  a EIA o obtém de um fornecedor comercial: a série pode sair da EIA como saíram os futuros.
- `published_at` dos preços diários medido numa divulgação só; a regra de feriado é a do etanol (13 de 14 exceções).
- A planilha só traz o valor atual: o vintage começa na 1ª coleta.
- No servidor, a 1ª coleta diária depois do deploy faz a carga (~54 mil valores; o banco da VM é mais lento).
