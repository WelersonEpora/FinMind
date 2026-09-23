# 0021 — Indicador do Milho CEPEA/ESALQ obtido da B3 (arquivo `Indic`)

## Contexto

O relatório FEL 1 do David lista o **Indicador CEPEA/ESALQ do milho** (M4 em
`docs/analise-critica-fel1-milho-ouro.md`: preço físico de referência do mercado interno e base de
liquidação do futuro CCM) como fonte **essencial**, e diz "scraping viável; sem API oficial". O
AgroMind já tinha reprovado a automação pelo site da CEPEA em 2026-08-08: desafio do Cloudflare em
todo o domínio, licença CC BY-NC e proibição de "transmitir séries de preços". Lá o dado só entra por
exportação manual de `.xls` (`AgroMind/docs/reconhecimento-fontes/cepea-precos-automacao.md`, ADR 0023
do AgroMind). Por isso a CEPEA estava como "bloqueada" no `STATUS_DO_PROJETO.md` (§3, item 1) e
virou a pergunta 7 do David ("export manual é aceitável em produção?").

Em 2026-09-23 o reconhecimento foi refeito (conversa com o usuário) e encontrou o **mesmo indicador
divulgado pela B3**, num arquivo público. O usuário **decidiu** no mesmo dia: é o mesmo índice, só
buscado em outro lugar; não depende da pergunta 7; o card pode se chamar CEPEA/ESALQ, desde que diga
claramente que a origem do dado é a B3. Mesmo padrão de autorização pontual dos ADRs 0001, 0013, 0015,
0017–0020.

## Evidência (chamadas reais, 2026-09-23)

### Site da CEPEA: o problema existe, mas mudou desde o AgroMind

| | AgroMind (2026-08-08) | 2026-09-23 |
|---|---|---|
| Página do indicador (`/br/indicador/milho.aspx`) | 403 (desafio Cloudflare) | **200**, tabela HTML com os ~15 últimos pregões |
| Ferramenta de exportação (histórico) | 403 | **403 `cf-mitigated: challenge`** |
| `robots.txt` | Content-Signal; `ClaudeBot` bloqueado | Regenerado em 2026-09-03: lista longa de agentes de IA, **incluindo `Claude-Code` e `Claude-User`**, com `Disallow: /`; `User-agent: *` liberado |
| Licença | CC BY-NC | CC BY-NC 4.0 (citada na própria página do indicador) |

Com o agente nomeado no `robots.txt`, as requisições ao domínio da CEPEA pararam ali (2 downloads: a
página do milho e o próprio `robots.txt`). O histórico só sai pela ferramenta de exportação, que segue
bloqueada.

### A B3 divulga o mesmo indicador

- A antiga página "Indicadores agropecuários" da B3 (`www2.bmf.com.br/.../lum-indicadores-agropecuarios`)
  hoje redireciona para o Boletim Diário. **O BDI em PDF não traz o indicador**: procurado nos
  capítulos 03-1 e 03-4 e no boletim completo (`BDI_00`, 1.704 páginas em 2026-09-22, 672 em
  2024-06-03); o único "CEPEA" é o ticker de uma debênture.
- Ele está no arquivo **"Mercado de Derivativos - Indicadores Econômicos e Agropecuários - Final"
  (`Indic`)**, da seção "Pesquisa por pregão" (a B3 descreve: "contém os valores de alguns indicadores
  utilizados pela BM&FBOVESPA, sendo divulgado no encerramento do sistema de registro"):
  `GET https://www.b3.com.br/pesquisapregao/download?filelist=ID<aammdd>.ex_,` → zip → `ID<aammdd>.ex_`
  (outro zip) → `Indic.txt`, texto de largura fixa, ~560 KB, ~5.000 linhas.
- **Layout oficial** (`Indica.xls`, do zip "Layout ... Indicadores Econômicos e Agropecuários - Final"
  na página de layouts da B3): tipo de registro (10-11, `01`), data AAAAMMDD (12-19), grupo (20-21,
  `IA` = agropecuários), código (22-46), valor com sinal (47-71), número de decimais (72-73).
- Códigos do milho: `IAMIL-AV-R$`, `IAMIL-AV-US$`, `IAMIL-MD-R$`, `IAMIL-PZ-R$`, `IAMIL-PZ-VPZ`. O
  arquivo do pregão D traz o valor de D **e o de D-1**.
- Sem chave, sem captcha, sem desafio do Cloudflare para o `fetch` do Node; `robots.txt` da B3 é só
  `User-agent: *`, sem `Disallow`. (O `curl` local falhou por certificado; é a cadeia do Windows, o
  `fetch` do Node funciona, mesmo caso do USDA e da Conab.)
- Dia sem pregão (fim de semana, feriado como 2026-09-07) e pregão ainda não fechado devolvem um **zip
  vazio (22 bytes)**, não erro HTTP.

### É o mesmo número da CEPEA

- Página da CEPEA em 2026-09-23: 22/09 = **69,74**, 21/09 = **69,62** (R$/saca). `Indic` da B3:
  `IAMIL-AV-R$` 22/09 = **69,74**, 21/09 = **69,62**.
- Amostra de 33 arquivos (jun/2018 a jul/2026, 66 datas) contra o histórico diário exportado do site
  da CEPEA (os `.xls` do AgroMind, 2.408 dias de 2016-12 a 2026-07): **66 de 66 iguais ao centavo em
  R$**.
- Em **US$** a B3 difere por 1 a 9 centavos em 47 das 66 datas (ex.: 2022-06-15: CEPEA 17,16, B3 17,07):
  o câmbio de conversão é outro. Guardado como a B3 divulga, com a ressalva no card.
- A metodologia oficial (PDF "Metodologia do Indicador de Preços do Milho ESALQ/BM&FBOVESPA",
  hospedado na B3) confirma: região de referência **Campinas/SP** (§2.15), valor à vista (preços a
  prazo são convertidos para à vista).

### Histórico e revisão

- O arquivo `Indic` existe desde pelo menos 2000, mas **o milho só aparece a partir de 2018-06-08**
  (ausente em 2018-06-04; presente em 2018-06-08, 06-11, 06-12...). Em 2010, 2016 e até 2018-06-01 o
  arquivo tem boi, etanol, soja e `IAACF`, sem milho.
- **Revisão:** em 16 arquivos consecutivos (2026-08-31 a 2026-09-22), o valor de D-1 no arquivo de D
  é sempre igual ao valor de D no arquivo anterior (85 pares, 0 diferenças). Não há sinal de revisão.
- Antes de 2018-06-08 o indicador só existe na exportação manual da CEPEA (diário desde 2010, mensal
  desde 2004), que continua fora deste ADR.

## Decisão

1. **Coletor `b3-milho-esalq`** (`backend/src/collectors/b3/b3-milho-esalq.collector.js`), na
   **coleta diária**: janela de 7 dias corridos, um arquivo por dia útil, só a linha do próprio pregão
   (a de D-1 é a mesma já lida). Zip lido por um leitor mínimo sem dependência
   (`shared/utils/zip.js`, `zlib`), pelo diretório central (o arquivo da B3 usa o bit 3 e zera o
   tamanho no cabeçalho local).
2. **Duas séries** em `observation` (tabela GLOBAL já existente; sem migration):
   `B3.MILHO_ESALQ.AVISTA_BRL` (R$/saca) e `B3.MILHO_ESALQ.AVISTA_USD` (US$/saca), `source_code`
   `B3`. Os códigos `MD`, `PZ` e `PZ-VPZ` **ficam de fora**: o arquivo não diz o que são e a CEPEA só
   publica o valor à vista. Nada é inventado a partir deles.
3. **`published_at` ESTIMADO** no fim do dia do pregão em Brasília (`lag_rule`), a mesma regra do CCM.
   A B3 não informa a hora de publicação no download.
4. **Robustez:** dia sem arquivo e arquivo sem o milho não são erro. Falha de leitura (HTTP 4xx, zip
   ou layout inválido) é item inválido (`partial_success`). Uma janela de 4+ dias úteis sem **nenhum**
   valor do milho falha a execução (a fonte mudou: arquivo sumiu ou o código `IAMIL` mudou).
5. **Backfill** `npm run backfill:b3-milho-esalq` (`scripts/backfill-b3-milho-esalq.js`): de
   2018-06-08 (início e limite inferior) até hoje, pelo mesmo coletor e runner.
6. **Card `MILHO_CEPEA_ESALQ`**, "Milho — Indicador CEPEA/ESALQ", com seletor de métrica (R$ por
   padrão, US$). A fonte exibida é **"B3 - Indicadores Agropecuários (Indicador CEPEA/ESALQ)"** e a
   descrição diz que o número é calculado pela CEPEA e obtido da B3.

## Resultado (2026-09-23)

- Coleta diária validada em dev contra a fonte real: 4 pregões, 8 observações, 0 falhas (o feriado de
  2026-09-07 e o pregão do dia, ainda não publicado, saem como "sem arquivo").
- **A B3 leva ~20-30 s por arquivo, fixo** (medido com 1 e com 10 pedidos simultâneos; o `filelist` com
  vários arquivos devolve só o último). A coleta diária (5 pregões, 3 simultâneos) fica em ~40 s; o
  backfill usa 10 simultâneos e grava **um ano por execução**, do mais recente para o mais antigo
  (~10-15 min por ano, ~2 h no total), para o dado aparecer aos poucos e uma falha perder só o bloco.
- Carga histórica (2018-06-08 em diante): em andamento em dev; a rodar no servidor. Números a
  registrar aqui quando terminar.

## Consequências e riscos

- **Pergunta 7 do David deixa de ser necessária** para o milho (decisão do usuário, 2026-09-23): o
  indicador diário existe por via automatizada desde 2018-06-08. Continua em aberto só se o histórico
  **antes** de 2018 for exigido (exportação manual da CEPEA).
- **Licença:** o número é da CEPEA (CC BY-NC 4.0, sem uso comercial nem retransmissão de séries sem
  autorização); a B3 o divulga num arquivo público, e os Termos de Uso da B3 pedem autorização para
  reprodução/distribuição comercial. Mesma situação das demais fontes da B3 no FinMind: uso interno,
  sem distribuição prevista (decisão de 2026-09-21, pergunta 6). **Passa a travar se houver
  distribuição a terceiros.**
- **Sem documentação da URL de download:** o layout do arquivo é oficial, mas o endpoint
  `pesquisapregao/download` não é documentado como API. Se mudar, a execução falha alto (regra 4).
- **Dependência de convênio:** o indicador está no arquivo porque liquida o CCM (convênio Fealq/B3).
  Se o convênio ou o contrato mudarem, a B3 pode deixar de divulgá-lo.
- US$ difere da CEPEA por centavos; quem precisar do valor em US$ "oficial CEPEA" deve converter o R$
  pela PTAX (já coletada, ADR 0001) e declarar a escolha.
