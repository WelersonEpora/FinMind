# 0042 — Petróleo: produção mensal por país (JODI)

## Contexto

Passo 2 da onda do petróleo (`STATUS_DO_PROJETO.md`, §3; reconhecimento em `docs/reconhecimento-fontes/petroleo.md`).
Os fatores "Decisões da OPEP+ (cotas de produção)" (Alto) e "Oferta não-OPEP" (Médio) da planilha
`controle_fatores.xlsx` pedem a produção por país. A OPEP (MOMR, PDF) não foi localizada por acesso automático, e a IEA
é paga: o JODI é a única fonte gratuita encontrada com a produção dos países da OPEP.

**Autorização:** o usuário autorizou em 2026-10-01 ("sim"), depois de ver as lacunas da fonte (Brasil até 2022,
Rússia até 2023, sem Guiana), no escopo proposto: **só a produção de petróleo, de todos os países; a demanda por
país fica para depois. Só aquisição de dados.**

## Evidência (chamada real, 2026-10-01)

- `jodidata.org/_resources/files/downloads/oil-data/world_primary_csv.zip`: 23 MB, `Last-Modified` 2026-09-22 07:15
  UTC, ~5 s de download; um CSV de 285 MB com `REF_AREA` (ISO alfa-2), `TIME_PERIOD`, `ENERGY_PRODUCT`,
  `FLOW_BREAKDOWN`, `UNIT_MEASURE`, `OBS_VALUE`, `ASSESSMENT_CODE`, mensal de 2002-01 a 2026-07.
- Petróleo bruto, produção, mil barris/dia (`CRUDEOIL`, `INDPROD`, `KBD`): 34.656 linhas, 24.548 com valor, **104
  países**. Ausente = `-` (o único texto). Avaliação: 1 comparável (14.566), 2 consultar metadados (1.880), 3 não
  avaliado (18.210). A linha `CONVBBL` é o fator de conversão (barris por tonelada), não produção.
- **Lacunas:** Brasil até 2022-12, Rússia até 2023-03, Guiana sem dado; sem agregado mundial.
- Custo medido: descompactar ~0,25 s e ~600 MB de memória; filtrar ~0,08 s.

## Decisão

1. **Coletor `jodi-producao-petroleo`** (`collectors/jodi/jodi-producao-petroleo.collector.js`), fonte `JODI`: baixa o
   ZIP a cada coleta, descompacta com o leitor do projeto (`shared/utils/zip.js`) e acha as linhas pelo trecho
   `,CRUDEOIL,INDPROD,KBD,` direto no Buffer, sem converter o arquivo em texto. Timeout próprio de 3 minutos.
2. Séries `JODI.PETROLEO_PRODUCAO.<PAÍS>.PRODUCAO`, mil barris/dia, observed_at no 1º do mês; o código de avaliação
   vai nos metadados de cada valor. `-` não é gravado (aviso da fonte); zero é valor.
3. **`published_at`: o `Last-Modified` do ZIP**, real. Para os meses já presentes na 1ª coleta é um limite superior.
4. Nome do país pelo `Intl.DisplayNames` do Node (`shared/utils/jodi-pais.js`), sem lista à mão.
5. A primeira coleta é a carga histórica: **não há backfill**. A ideia de pular a leitura quando o arquivo não muda foi
   descartada: o custo medido (~10 s por coleta) não justifica guardar estado.

## Fora do escopo (de propósito)

- Estoques, importação, exportação e refino do mesmo arquivo; a demanda por derivados (arquivo "secondary"); NGL e gás.
- Somar países ou montar o total da OPEP: é cálculo, e a filiação à OPEP muda com o tempo (decisão do David).

## Resultado (2026-10-01, banco de dev)

1ª execução: 34.656 linhas lidas, **24.548 gravadas** (as 10.108 sem valor ficaram de fora, com aviso), 0 falhas, ~10 s.
Reexecução: 0 criadas, 24.548 ignoradas. EUA em jul/2026: 13.817 mil barris/dia (a EIA semanal dá 13.955 em set/2026).

## Consequências e limitações

- O Brasil vem da ANP (ADR 0041); a Rússia e a Guiana ficam sem fonte gratuita até agora (a API da EIA, com chave
  gratuita, traz a produção internacional: não reconhecida).
- A maior parte dos valores é "não avaliada" pelo JODI (código 3): a qualidade varia por país.
- Sem versões na fonte: a revisão vira versão nova com o `Last-Modified` do arquivo que a trouxe.
- **Atualização de 2026-10-01:** a demanda por país foi implementada (ADR 0046), de outro arquivo do JODI; o coletor
  desta produção passou a ser uma configuração da base comum `collectors/jodi/jodi-base.js`, sem mudar o comportamento.
- Licença não lida (uso pessoal, decisão do usuário de 2026-10-01).
- O arquivo cresce todo mês; o pico de memória (~600 MB) deve ser acompanhado no servidor.
- **No servidor em 2026-10-01** (coleta manual, informado pelo usuário): 34.656 lidos, 24.548 criados, 0 falhas, ~7 s, sem problema de memória; os mesmos números de dev.
