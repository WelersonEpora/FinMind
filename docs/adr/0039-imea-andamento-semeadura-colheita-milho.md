# 0039 — Milho de MT: andamento da semeadura e da colheita (IMEA)

## Contexto

O bloco 3 da lista de fontes fundamentais do milho (`STATUS_DO_PROJETO.md`, §3) pedia "a intenção de plantio e o
andamento da safra do IMEA (PDF)", o resto do item do IMEA que os ADRs 0018 e 0019 não cobriram. O andamento da
semeadura e da colheita do milho de Mato Grosso, o maior produtor de milho safrinha, é o equivalente brasileiro do
Crop Progress dos EUA (fator 1 do milho, "Clima e safra", e fator 2, "Safrinha brasileira").

**Autorização:** o usuário autorizou em 2026-10-01 ("seguimos", sobre o bloco 3), **só aquisição de dados**: como o
andamento entra nos fatores é decisão do David.

## Evidência (chamadas reais, 2026-10-01)

- O catálogo de arquivos do IMEA (`api1.imea.com.br/api/arquivo?cadeia=3`, a rota do ADR 0019) lista 783 arquivos do
  milho. Os do andamento: **"Informe de Semeadura - Milho - <safra>"** (14, de 2012/13 a 2025/26) e **"Informe de
  Colheita - Milho - <safra>"** (12, de 2014/15 a 2025/26). **Um arquivo por safra**, que o IMEA substitui a cada
  semana (a data do arquivo no catálogo é a da última semana).
- **Não há "intenção de plantio" como documento próprio.** A "Estimativa de Safra - Milho" em PDF tem 71 arquivos, de
  2015 a 2022, e parou; a estimativa atual vem pela API de safra (ADR 0018).
- Cada informe tem 2 páginas; a 2ª traz a tabela **"Acompanhamento da semeadura (colheita) por região"**: uma linha por
  semana com o % acumulado da área em 7 regiões do IMEA e em Mato Grosso, legível por coordenada (`pdf-texto.js`).
- **Os 26 informes foram baixados e lidos.** Layouts variam: a data ("11-jan-19", "1-fev-19", "28/05/2015",
  "13/jan/23"), a ordem das regiões no cabeçalho, a data numa linha e os números na seguinte, linhas que não são semana
  ("Área (ha)", "Produt. Parcial") e, no fim, a comparação com a mesma semana da safra anterior (nas edições novas
  depois de "Δ Semanal"; nas antigas, sem nada antes).
- **Resultado da leitura:** 25 de 26 informes, 2.560 valores, 8 regiões em todos, datas em ordem, nenhum percentual
  caindo de uma semana para a outra e nenhum acima de 100%. **A colheita 2014/15 é recusada:** o cabeçalho da fonte tem
  7 nomes ("Nororeste", sem o Médio-Norte) para 8 colunas de números.

## Decisão

1. **Leitor por coordenada** (`imea-andamento-milho.parser.js`): acha o cabeçalho das regiões, mapeia cada número à
   região mais próxima em x (nunca pela ordem), junta a data com os números da linha seguinte quando estão separados e
   para no primeiro "Δ" ou na primeira data que volta no tempo. Número sem região no cabeçalho recusa o informe.
2. **Coletor** `imea-andamento-milho` (fonte `IMEA_MILHO_ANDAMENTO`): séries `IMEA.MILHO.ANDAMENTO.<REGIAO>.SEMEADURA`
   e `.COLHEITA`, em %, com observed_at = a semana. `published_at` **estimado** no próprio dia da semana (fim do dia em
   UTC). A coleta diária lê só o informe mais recente de cada tipo; o backfill
   (`npm run backfill:imea-andamento`) lê os 26.
3. **Card** "Milho de MT - andamento da semeadura e da colheita (IMEA)", com a região no seletor de itens e semeadura ou
   colheita no de métrica.

## Fora do escopo (de propósito)

- **A colheita 2014/15** (cabeçalho defeituoso na fonte).
- **A área e a produtividade parcial** que alguns informes trazem, o **Informe de Comercialização** e o **Boletim
  Semanal** (este, com a paridade, aguarda a pergunta 16 do Comitê).
- **Comparar com a média de 5 anos** ou com a safra anterior: são medidas, e cabem ao David.

## Resultado (2026-10-01, banco de dev)

- Backfill: **2.560 valores**, 16 séries, de 2013-01-10 a 2026-08-21; status "parcial" com 1 falha (a colheita 2014/15).
- Coleta diária: 216 lidos, 0 criados (idempotente). Card em dia.
- Um erro achado na validação e corrigido antes do commit: a comparação com a safra anterior, que nas edições antigas
  não vem depois de um "Δ", entrava como mais uma semana. A regra "para na primeira data que volta no tempo" a tirou.

## Consequências e limitações

- **Só Mato Grosso** (as 7 regiões do IMEA e o estado), só o milho da 2ª safra.
- **Sem vintage do passado:** o catálogo guarda só a versão final de cada safra. Daqui para frente, cada semana nova
  entra com a sua data; uma correção vista depois vira versão nova com a data da coleta.
- **Algumas safras terminam abaixo de 100%** (o informe parou antes do fim): colheita 2015/16 em 95,8% e semeadura
  2018/19 em 98,9% em MT. É o que a fonte publicou.
- **PDF sem contrato:** uma mudança de layout vira informe recusado (inválido), não dado errado.
