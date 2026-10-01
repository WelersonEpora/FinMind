# 0043 — Café: custo de produção por município (Conab); preço mínimo bloqueado por reCAPTCHA

## Contexto

O fator do café "Custo de produção e preço mínimo" (peso Médio, fontes "Conab, MAPA", indicador "Preço mínimo, custos
de insumos") da planilha `controle_fatores.xlsx` era o único dos 8 fatores do café sem nenhum dado (`STATUS_DO_PROJETO.md`,
§3, levantamento de 2026-10-01). O MAPA só republica (reconhecimento de 2026-10-01).

**Autorização:** o usuário pediu em 2026-10-01 para seguir com a próxima fonte ("vamos seguir, pode escolher"), dentro
da onda do café (decisão de 2026-09-26), **só aquisição de dados**.

## Evidência (chamada real, 2026-10-01)

- **Custo de produção:** a página "Planilhas de Custos de Produção - Agrícolas" da Conab lista
  `seriehistoricacustoscafearabica2003a2025.xls` (2,4 MB, 198 abas) e `seriehistoricacustoscafeconilon2007a2025.xls`
  (1,1 MB, 89 abas). O nome do arquivo traz o último ano (muda a cada ano). Uma aba por município e ano; o "Índice"
  lista 11 municípios em cada tipo, entre agricultura familiar e empresarial.
- **Layout:** os itens do custo mudam de numeração e de nome ao longo dos anos (21 assinaturas diferentes); os 4
  totais (custo variável A+B+C=D, fixo E+F=G, operacional D+G=H e total H+I=J) existem em todas as abas, com R$/ha e
  R$/60 kg nas duas primeiras colunas numéricas. Exceção: Ji-Paraná e Rolim de Moura (RO) em 2014 param no custo
  operacional.
- **Data:** nenhuma data de publicação (nem na página, que mostra "Publicado em" vazio, nem no cabeçalho HTTP). Cada
  aba traz o mês dos preços usados: "Mês/Ano: Outubro/2025" (novas), "A PREÇOS DE: 24.07.2003", "Jun/2010" ou uma data
  serial do Excel (antigas); 3 abas não trazem.
- **Grafias:** "SP-Franca 2019" a 2025 (antes "Franca-SP-2018"); variantes "-S.Mec" e "-Mec" em Guaxupé e São Sebastião
  do Paraíso.
- **Anomalia da fonte:** Patrocínio-MG-2017 tem custo operacional de R$ 24.616/ha (R$ 1.021/saca de custo total),
  contra 10.688 em 2016 e 13.405 em 2018.
- **Preço mínimo (PGPM):** a página da Conab redireciona para `sistemas.conab.gov.br/consulta-precos-pgpm`, um
  aplicativo cujas consultas e exportações (CSV, XLS, PDF) enviam um token de **reCAPTCHA**. Contornar captcha não é
  aceitável: **não é coletado**.
- Licença do site: Creative Commons Atribuição-SemDerivações 3.0 (rodapé).

## Decisão

1. **Coletor `conab-custo-cafe`** (`collectors/conab/conab-custo-cafe.collector.js`), fonte `CONAB`: acha os links dos
   dois arquivos na página (não monta a URL) e lê todas as abas, menos o "Índice".
2. Séries `CONAB.CAFE_CUSTO.<ARABICA|CONILON>.<LOCAL>.<VARIAVEL|FIXO|OPERACIONAL|TOTAL>_<HA|SACA>`, observed_at em 1º de
   janeiro do ano da aba, valores arredondados a 2 casas (como a planilha mostra). O local é o nome da aba sem o ano
   ("Patrocínio-MG" → `PATROCINIO_MG`; a variante de sistema vira série própria). Dois cards (arábica e conilon), com
   o local como item e o total no seletor de métrica.
3. **Sem `published_at`:** vale a data da coleta (estimado). O mês dos preços vai nos metadados (`mesReferenciaPrecos`)
   para quem quiser aplicar uma defasagem.
4. Aba sem algum total grava os demais e vira **aviso** da fonte; aba sem nenhum total, fora do padrão de nome ou
   repetida é inválida.
5. Valores como publicados, inclusive a anomalia de Patrocínio-2017.
6. A primeira coleta é a carga histórica: **não há backfill**.

## Fora do escopo (de propósito)

- Os itens do custo (fertilizantes, mão de obra...) e a produtividade (em kg/ha nas abas novas e sacas/ha nas antigas).
- O preço mínimo (reCAPTCHA). Alternativa a reconhecer, se o David pedir: as portarias do MAPA que fixam o preço.

## Resultado (2026-10-01, banco de dev)

1ª execução: 285 abas lidas, **2.276 valores** (25 locais), 0 inválidos, 2 avisos (RO, 2014), 0 falhas. Reexecução:
0 criados, 2.276 ignorados.

## Consequências e limitações

- Sem data de publicação: o histórico só vale para leituras a partir da 1ª coleta, como o FMI (ADR 0036).
- A Conab troca de município ao longo do tempo: várias séries terminam quando outra começa na mesma região.
- O parser depende dos rótulos dos totais; uma mudança vira inválido ou aviso, nunca valor errado.
- O fator continua pela metade: falta o preço mínimo.
