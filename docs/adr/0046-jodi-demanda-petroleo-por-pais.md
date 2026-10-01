# 0046 — Petróleo: demanda de derivados por país (JODI)

## Contexto

A análise de cobertura dos 34 fatores do FEL 1 (2026-10-01) achou o fator do petróleo "Demanda global e atividade
econômica" (peso Alto; fontes "IEA, OPEC"; indicador "OMR, PMI, crescimento China") como o único de peso Alto sem dado
fora dos EUA que tinha fonte gratuita. A IEA é paga, o PMI é licenciado e o MOMR da OPEP não foi localizado por acesso
automático (`docs/reconhecimento-fontes/petroleo.md`). A demanda dos EUA já vem, semanal, da EIA (derivados
fornecidos, ADR 0040).

O JODI foi implementado só com a produção (ADR 0042), com "a demanda por país fica para depois" no escopo autorizado.

**Autorização:** o usuário autorizou em 2026-10-01 ("Sim"), em resposta à proposta de implementar a demanda de
petróleo do JODI, **só aquisição de dados**. Não é precedente para outra fonte nem para qualquer regra.

## Evidência (chamada real, 2026-10-01)

- **Arquivo:** a demanda não está no `world_primary_csv.zip` (petróleo bruto: produção, estoques, comércio, entrada
  nas refinarias), e sim no `world_secondary_csv.zip` (derivados): 58 MB, `Last-Modified` 2026-09-22 07:16 UTC, um CSV
  de 650 MB com as mesmas colunas do primary. Mensal de 2002-01 a 2026-07.
- **Derivados:** GLP, nafta, gasolina, querosene, querosene de aviação, diesel, óleo combustível, outros e o total
  (`TOTPRODS`), cada um com produção das refinarias, comércio, estoques e demanda (`TOTDEMO`), em várias unidades.
- **Filtro:** `TOTPRODS` / `TOTDEMO` / `KBD` (mil barris por dia): 34.656 linhas, 24.474 com valor, **105 países**.
- **Cobertura no arquivo de setembro:** 50 países até 2026-07. EUA, China (desde 2004-01), Japão, Coreia, Alemanha,
  Canadá, França, Reino Unido e Arábia Saudita até 2026-07; México até 2026-06; Índia até 2026-03.
- **Lacunas da fonte:** **Rússia sem nenhum valor**, Brasil até 2022-02, Irã até 2018-07; sem agregado mundial.
  China e Índia com código de avaliação 3 (não avaliado).
- **Conferência:** EUA em jul/2026, 21.160 mil barris/dia no JODI; a EIA semanal dá 21.050 a 21.500.

## Decisão

1. **Coletor `jodi-demanda-petroleo`** (`collectors/jodi/jodi-demanda-petroleo.collector.js`), fonte `JODI`. O coletor
   da produção virou uma base comum (`collectors/jodi/jodi-base.js`, `criarColetorJodi`), sem mudar o comportamento
   (reexecução no dev: 34.656 lidos, 0 criados, 0 falhas); a demanda é a segunda configuração.
2. Séries `JODI.PETROLEO_DEMANDA.<PAIS>.DEMANDA`, observed_at no 1º dia do mês, em mil barris/dia, o código de
   avaliação nos metadados. `published_at` = `Last-Modified` do ZIP, como na produção (ADR 0042).
3. **Um card**, "Petróleo - demanda por país (JODI)" (`PETROLEO_DEMANDA_JODI`), com o país como item (China em
   destaque; EUA, China, Índia, Japão e Arábia Saudita no padrão).
4. Valor "-" não é gravado (aviso), como na produção.
5. A primeira coleta é a carga histórica: **não há backfill**.

## Fora do escopo (de propósito)

- Cada derivado separado (gasolina, diesel, querosene de aviação...), a produção das refinarias, os estoques e o
  comércio de derivados: estão no mesmo arquivo, e entram só se o David pedir.
- Somar países ou montar a demanda mundial: é cálculo (e faltam a Rússia e o Brasil recente).
- PMI e crescimento da China: licenciado ou outra fonte; o David diz o que espera.

## Resultado (2026-10-01, banco de dev)

1ª execução: 34.656 linhas lidas, **24.474 gravadas** (as 10.182 sem valor ficaram de fora, com aviso), 0 falhas,
~10 s, **pico de memória de 838 MB** (o CSV de 650 MB descompactado inteiro). Reexecução: 0 criadas, 24.474 ignoradas.

## Consequências e limitações

- O pico de memória é maior que o da produção (~600 MB) e o arquivo cresce todo mês. Se o servidor apertar, o caminho
  é descompactar em fluxo, filtrando por pedaço, sem guardar o CSV inteiro.
- A Rússia, um dos grandes consumidores, não reporta demanda ao JODI; o Brasil vem parado desde 2022 (a ANP publica as
  vendas de derivados: não reconhecida).
- A qualidade varia por país (código de avaliação); China e Índia são "não avaliado".
- Sem versões na fonte: a revisão vira versão nova com o `Last-Modified` do arquivo que a trouxe.
