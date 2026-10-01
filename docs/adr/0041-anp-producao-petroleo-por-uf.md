# 0041 — Petróleo: produção mensal do Brasil por UF (ANP)

## Contexto

Passo 2 da onda do petróleo (`STATUS_DO_PROJETO.md`, §3; reconhecimento em `docs/reconhecimento-fontes/petroleo.md`).
O fator "Oferta não-OPEP (Brasil, Guiana, Noruega)" da planilha `controle_fatores.xlsx` aponta "ANP, EIA, IEA" e o
indicador "Produção ANP". O JODI, que também traz o Brasil, **para em dez/2022 no Brasil** (e em mar/2023 na Rússia;
a Guiana não aparece) no arquivo de 2026-09-21: para o Brasil, a fonte é a ANP.

**Autorização:** a onda do petróleo foi autorizada pelo usuário em 2026-10-01 ("Sim, pode seguir"; ADR 0040), e o
passo 2 no mesmo dia ("Sim, pode seguir"), **só aquisição de dados**.

## Evidência (chamada real, 2026-10-01)

- Página de dados abertos `gov.br/anp/.../dados-abertos/producao-de-petroleo-e-gas-natural-por-estado-e-localizacao`:
  "Produção de petróleo (metros cúbicos) 1997-2026 (atualizado em 30/9/2026)" e "atualizados mensalmente até o último
  dia do mês subsequente ao mês de referência". O `robots.txt` do gov.br não restringe a ANP; o acesso com o
  identificador do FinMind responde 200.
- CSV `producao-petroleo-m3.csv` (463 KB, UTF-8 com BOM, `;`, **vírgula decimal**): `ANO;MÊS;GRANDE REGIÃO;UNIDADE DA
  FEDERAÇÃO;PRODUTO;LOCALIZAÇÃO;PRODUÇÃO`. Metadados oficiais (PDF da página): "Petróleo: óleo e condensado. Não inclui
  LGN", fonte "ANP - Boletim Mensal de Produção", m³.
- **Grade completa:** 11 UFs (AL, AM, BA, CE, ES, MA, PR, RJ, RN, SE, SP) × terra e mar × 360 meses (1997 a 2026).
  **Os meses ainda não publicados vêm com 0:** set a dez/2026 na leitura de 2026-10-01. O último mês publicado era
  ago/2026.
- Conferência com o número oficial: a soma de 2019 dá 1.018 milhões de barris (2,79 milhões por dia), e a de 2024,
  3,37 milhões por dia, os totais anuais que a ANP divulga.

## Decisão

1. **Coletor `anp-producao-petroleo`** (`collectors/anp/anp-producao-petroleo.collector.js`), fonte `ANP`: baixa a
   página (pela data de atualização) e o CSV inteiro a cada coleta. Séries `ANP.PETROLEO_PRODUCAO.<UF>.<TERRA|MAR>`,
   m³, observed_at no 1º do mês. Um card, com a UF como item e a localização como métrica.
2. **Meses não publicados:** o último mês publicado é o último com produção no Brasil (soma das linhas maior que 0);
   os seguintes não são gravados e viram um aviso da fonte (ADR 0002). Zeros reais de meses publicados (UF sem
   produção no mar, por exemplo) são gravados.
3. **`published_at`:** o mês mais recente entra com a data de atualização da página (real, só a data); os anteriores,
   com o fim do mês seguinte ao deles, a regra da própria página (estimado). Fim do dia em UTC. Sem a data na página,
   a coleta falha (não adivinha).
4. **O total do Brasil não é gravado:** é a soma das UFs, um cálculo.
5. A primeira coleta é a carga histórica: **não há backfill**.

## Fora do escopo (de propósito)

- Gás natural, LGN, queima e reinjeção (os outros arquivos da mesma página), produção por campo e o pré-sal separado.
- **JODI:** fica para decisão (ver Consequências).

## Resultado (2026-10-01, banco de dev)

1ª execução: 7.920 linhas lidas, **7.832 gravadas** (os 88 valores dos 4 meses zerados ficaram de fora, com aviso),
0 inválidos, 0 falhas. Reexecução: 0 criadas, 7.832 ignoradas.

## Consequências e limitações

- **Sem versões na fonte:** o arquivo é substituído a cada mês; uma revisão de mês antigo vira versão nova com a data
  da coleta (ADR 0008). Se a ANP revisa e quanto, só se saberá coletando.
- A data dos meses anteriores ao último é estimada pela regra da página; antes de a regra existir, o mês pode ter
  saído mais tarde (limite não verificado para o histórico antigo).
- O CSV não tem dicionário de mudanças: coluna, UF, produto ou localização fora do esperado viram falha explícita ou
  item inválido, nunca dado gravado errado.
- **JODI, em aberto:** o arquivo mundial (23 MB compactado, 285 MB) tem a produção dos países da OPEP (Arábia Saudita,
  Iraque, Emirados...) e da Noruega e dos EUA até jul/2026, mas o Brasil para em 2022, a Rússia em 2023 e a Guiana não
  aparece. É o único dado gratuito de produção da OPEP por país encontrado até agora; o custo é processar o arquivo
  grande a cada coleta.
- **No servidor em 2026-10-01** (coleta manual, informado pelo usuário): 7.920 lidos, 7.832 criados, 0 falhas, os mesmos números de dev.
