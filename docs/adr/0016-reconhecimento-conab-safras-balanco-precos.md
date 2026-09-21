# 0016 — Reconhecimento da Conab (safras 1ª/2ª, balanço, séries históricas e preços): nível 1, sem coletor

## Contexto

O relatório FEL 1 do David pede à Conab a produção por safra (**1ª e 2ª**), o **estoque** e o **balanço** de oferta e
demanda do milho. No AgroMind a Conab está no nível 5 para o balanço, mas ele só leu duas abas da planilha mensal
("Milho Total" e "Suprimento"); a separação em 1ª/2ª safra ficou registrada lá como "outra aba do boletim, não
investigada". Os preços da Conab estão no nível 0 (bloqueados por reCAPTCHA).

Este ADR **só reconhece a fonte** (nível 0 → 1, `docs/processo-reconhecimento-fontes.md`). **Nenhum coletor é
escrito e nada é desbloqueado**: a Conab continua "fora do escopo" até a decisão do David ou autorização explícita
registrada em novo ADR (`CLAUDE.md`). Reaproveita-se o conhecimento do AgroMind (endpoints, layout, armadilhas), não o
código.

## Evidência (chamadas reais, 2026-09-21)

A Conab publica o milho por **três caminhos diferentes**, todos públicos, sem chave e sem captcha. Nenhum tem API
documentada.

### A. Boletim mensal da safra de grãos (XLSX): 1ª/2ª/3ª safra, balanço e vintage

| Pergunta | Resposta | Evidência |
|---|---|---|
| 1–3. API, autenticação, chave | Sem API. Download direto de arquivo, sem login | 200 no arquivo |
| 4. Formato | XLSX, `site_previsao_de_safra-por_produto-<mês>-<ano>.xlsx` (0,97 MB), 76 abas. O índice do boletim (`gov.br/conab/.../safras/safra-de-graos/boletim-da-safra-de-graos`) lista 15 planilhas de levantamentos; a mais recente é o **12º levantamento da safra 2025/26 (set/2026)** | 12º levantamento baixado e aberto |
| 5. O que traz de milho | Abas **`Milho 1a`, `Milho 2a`, `Milho 3a`** e **`Milho Total`**: Região/UF × área (mil ha), produtividade (kg/ha) e produção (mil t), com **2 safras** (24/25 e 25/26) e a variação %. Aba **`Suprimento`** (todos os produtos): estoque inicial, produção, importação, suprimento, consumo, exportação, demanda total e estoque final, por safra, a partir de 2019/20 (o AgroMind registra até 2025/26) | abas abertas |
| 6–7. Histórico e revisão | Cada levantamento mensal é uma nova estimativa da mesma safra: **é o vintage**. O `published_at` sai do nome do arquivo (`...-set-2026.xlsx`, só mês). Cada planilha traz só as safras recentes; o histórico de vintage é o do índice (15 planilhas) | índice e nomes de arquivo |
| 8. Sistema temporal | Ciclo agrícola (safra); ver `published_at` acima | — |
| 9. Limite | Não observado (poucas requisições) | — |
| 10. Licença | **Não verificada** nos XLSX. A página de Preços Agropecuários cita Creative Commons Atribuição-SemDerivações 3.0, e a Conab declara estar fora da Política de Dados Abertos (Decreto 8.777/2016) | páginas gov.br/conab |

**O AgroMind só aproveitou `Milho Total` (produção total) e `Suprimento` (estoque final, exportação, importação).** A
separação 1ª/2ª/3ª safra existe **na mesma planilha** (abas acima) e nunca foi coletada. Leitura direta do 12º
levantamento como conferência: milho 2ª safra, Brasil, 2025/26 = área 17.824,9 mil ha e produção 112.130,8 mil t
(24/25: 113.228,4 mil t, variação -1,0%).

### B. Séries históricas (XLS): 1ª/2ª/3ª safra desde 1976/77

| Pergunta | Resposta | Evidência |
|---|---|---|
| Onde | `gov.br/conab/.../safras/series-historicas/graos/milho/` com `milho1aseriehist.xls`, `milho2aseriehist.xls`, `milho3aseriehist.xls` e `milhototalseriehist.xls`. O download é o mesmo endereço **sem** o `/view` | 1ª, 2ª e total baixados e abertos (a 3ª só aparece na listagem) |
| Conteúdo | Abas `Área`, `Produtividade` e `Produção`, por Região/UF, **safras 1976/77 a 2025/26** (a última marcada "Previsão") | abas abertas |
| Vintage | **Não tem**: é a foto atual da série, sem as edições anteriores | — |

Serve para o **histórico longo** de 1ª e 2ª safra; o vintage vem da fonte A.

### C. Preços agropecuários (TXT): só ~12 meses

| Pergunta | Resposta | Evidência |
|---|---|---|
| Onde | Lista pública `GET https://barramento.conab.gov.br/portal-informacao-api/api/v1/download` (259 arquivos, a mesma chamada que o site faz). Arquivos em `portaldeinformacoes.conab.gov.br/downloads/arquivos/`: `PrecosSemanalUF.txt`, `PrecosMensalUF.txt`, `PrecosSemanalMunicipio.txt`, `PrecosMensalMunicipio.txt`, `PrecoMinimo.txt` | listagem e HEAD de cada um |
| Frescor | Os 5 arquivos foram modificados em **2026-09-21 12:00 GMT** (parecem diários) | `Last-Modified` |
| Formato | TXT, separador `;`, decimal com vírgula, codificação latin1, valor em **R$/kg** (×60 = saca). Semanal e mensal, **não é cotação diária** | `PrecosSemanalUF.txt` (13,6 MB) e `PrecosMensalUF.txt` (3,2 MB) lidos |
| Milho | "Milho em grãos" e "milho de pipoca"; 27 UFs; níveis "preço recebido pelo produtor" e "atacado". Semanal: 2025-09-01 a 2026-09-14; mensal: 2025-09 a 2026-08 | filtro por produto |
| Histórico | **Só cerca de 12 meses.** O histórico longo (a Conab anuncia mais de 30 anos) deve estar nos dois sistemas de consulta, **bloqueados** segundo o AgroMind (`consultaprecosdemercado`, reCAPTCHA; dashboard Pentaho com a rota de dados em 501). Não retestado aqui | `docs/reconhecimento-fontes/conab-preco-farelo-soja.md` do AgroMind |

## O que atende ao relatório do David

| Pedido | Onde está |
|---|---|
| Safra 1ª e 2ª | **A** (abas `Milho 1a/2a/3a`, com vintage) e **B** (histórico desde 1976/77, sem vintage) |
| Estoque e balanço | **A**, aba `Suprimento` (estoque inicial/final, consumo, importação, exportação) |
| Preço do milho pela Conab | **C**, só ~12 meses e semanal/mensal; o histórico longo segue bloqueado |

Os **arquivos de preço (C) não têm** safra, estoque nem balanço; esses vêm do boletim (A).

## Riscos e o que não foi confirmado

- **Sem API nem dicionário de dados:** o coletor depende do padrão de nome do arquivo e do layout das abas; se a Conab
  mudar, quebra (o AgroMind documenta o mesmo risco). O site mudou de `conab.gov.br` para `gov.br/conab` há pouco.
- **Certificado:** o `curl` do Git Bash falha em `barramento.conab.gov.br` (cadeia Let's Encrypt nova, "self signed
  certificate in certificate chain"), mas o `openssl` valida a cadeia e o `fetch` do Node funciona. Problema do
  ambiente, verificação não desligada.
- **Licença:** não verificada nos XLSX/XLS; o texto de preços é "sem derivações". Uso atual: interno.
- **Não confirmados:** o conteúdo da aba `Milho 3a` e do `milho3aseriehist.xls`; os arquivos municipais de preço; se
  `PrecoMinimo.txt` traz milho; o rate limit; quantos levantamentos anteriores o índice mantém no tempo.
- **A janela de 12 meses dos preços** foi inferida dos dados, não de documentação da Conab.

## Decisão

Reconhecimento **concluído no nível 1**, sem coletor. Implementar (começando pelo boletim A, que cobre o pedido do
David) depende da decisão dele ou de autorização explícita registrada em novo ADR. Se for implementado, a ordem
natural é: boletim A (1ª/2ª safra e balanço, com vintage) → séries históricas B (histórico longo) → preços C (se o
David quiser preço da Conab).

## Atualização (2026-09-21)

O caminho **A** (boletim mensal, XLSX) foi **implementado** no ADR 0017, com autorização explícita do usuário. Os
caminhos **B** (séries históricas XLS desde 1976/77) e **C** (preços TXT) seguem **sem coletor**: o usuário deixou o
histórico longo para quando houver uma opção.

Correção sobre a linha "6–7" da tabela A: o `published_at` **não** precisa sair só do nome do arquivo (que dá apenas o mês).
A página de cada levantamento informa **"Publicado em dd/mm/aaaa hhhmm"** (Brasília), nas 15 planilhas do índice. É essa
a data real que o coletor usa.
