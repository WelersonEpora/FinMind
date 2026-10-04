# 0057 — Milho de MT: paridade de exportação (IMEA, Boletim Semanal)

## Contexto

O fator 4 do milho, "Dólar (USDBRL) e paridade de exportação" (peso Médio), pede a paridade de exportação: o
preço interno contra Chicago, mais o frete e o câmbio. A pergunta 16 do `STATUS_DO_PROJETO.md` deu três caminhos:
a paridade pronta do IMEA, a paridade com os componentes, ou nada. O David escolheu a **opção 1, a paridade já
calculada pelo IMEA**, sem os componentes (2026-10-03, ADR 0055). Ressalvas dele:

- é a paridade de Mato Grosso, não a de Campinas, e o Comitê declara a praça;
- a série quebra na troca do contrato de referência;
- o porto do prêmio é ambíguo.

Sem essa série, o F4 da proposta do David (Motor do Milho v0, ADR 0056) não tem como ser calculado.

**Autorização:** o usuário autorizou a coleta em 2026-10-04 ("pode fazer a coleta do IMEA para F4"). O limite é a
aquisição do dado e o uso dele na simulação do F4, só na tela de metodologia (ADR 0056). O milho continua fora do
prompt diário, do Centro de Decisão e da IA até a aprovação do Comitê.

## Evidência (chamadas reais, 2026-10-04)

- **Catálogo do IMEA:** a rota é `api1.imea.com.br/api/arquivo?cadeia=3&nome=Boletim Semanal`, a mesma do ADR 0019.
  Lista 573 edições do **"Boletim Semanal - Milho"**, de 2015-02-02 a 2026-09-28, uma por semana, em PDF público.
- **A tabela diária existe desde a edição de 2021-06-07**, quando o boletim passou de cerca de 12 páginas para 3.
  - Fica na página 3, no bloco "DIÁRIO".
  - Tem uma coluna para cada dia útil da semana anterior à edição, com a data no cabeçalho.
  - A linha que interessa é "Paridade Exportação - jul/AA | MT | R$/sc | Imea".
  - Antes de 2021, a paridade só aparece num gráfico ou numa linha semanal com o texto espaçado letra a letra. Nos
    dois casos não há número legível.
- **As 258 edições desde 2021-06-07 foram baixadas e lidas por coordenada,** com o mesmo agrupamento de linhas do
  balanço (ADR 0019): 1.215 dias lidos em 255 edições.
- **Contratos de referência:** jun/21, depois jul/22 (de julho de 2021), jul/23 (de maio de 2022), jul/24 (de maio
  de 2023), jul/25 (de julho de 2024) e jul/26 (de julho de 2025).
  - **O rótulo pode estar atrasado.** A edição de 2026-09-28 ainda diz "jul/26", mas a média dos 5 dias (44,73) é a
    "Paridade Ex. jul/27" do resumo da página 2.
- **Defeitos da fonte, tratados sem adivinhar:**
  - **Datas com formato irregular no cabeçalho:** espaço dentro da data ("31/ 05/ 21"), dia com 1 dígito
    ("5/12/22"), ano truncado ou digitado errado ("02/05/202", "7/12/222"). O dia e o mês valem. O ano é o que põe a
    data na semana anterior à edição.
  - **Data fora da semana anterior:** "01/11/21" numa edição de 2021-12-06, e um sábado e um domingo de abril numa
    edição de 2024-05-13. O dia é recusado.
  - **Paridade zero:** "0,00" em 2025-04-25. O dia é recusado. A regra entrou depois da 1ª carga do servidor, que
    gravou esse zero (ver o adendo).
  - **A mesma data em duas colunas:** "29/11/22" duas vezes em 2022-12-05. Os dois dias são recusados.
  - **Tabela velha com as datas antigas:** a edição de 2026-02-16 repete a de 2026-02-09. Recusada pela janela de
    datas.
  - **Tabela velha com as datas novas:** em 2021-07-19, 2022-10-31 e 2023-06-26, a edição repete os 5 valores da
    semana anterior. A edição é pulada, com aviso.
  - **Cabeçalho de datas em outra página:** 2021-06-21, 2021-06-28 e 2025-10-06 ficam de fora.
- **Distância entre o dia e a edição:** de 3 a 7 dias em quase todas as datas, até 9 nas edições de quarta-feira de
  2021. A janela aceita de 1 a 9 dias.
- **Licença:** o boletim é público e gratuito. Não há termo de uso específico; o uso é pessoal, e as licenças só serão
  revistas se o projeto virar comercial, como nas outras fontes do IMEA.

## Decisão

1. **Leitor por coordenada** (`imea-paridade-milho.parser.js`). Acha a linha "Paridade Exportação" que tem o
   cabeçalho de datas acima dela, na mesma página. Liga cada número à data mais próxima em x, dentro de um raio, e
   aplica as regras de datas acima.
2. **Coletor** `imea-paridade-milho` (fonte `IMEA_MILHO_PARIDADE`).
   - Série: `IMEA.MILHO.PARIDADE_EXPORTACAO`, em R$/sc.
   - `observed_at` é o dia da coluna.
   - `published_at` é a data real da edição no catálogo, no fim do dia em UTC, ou o instante da coleta se ela roda no
     mesmo dia.
   - A metadata leva o contrato de referência como a tabela o escreve.
   - A coleta diária lê as 2 últimas edições, para comparar com a anterior.
   - O backfill (`npm run backfill:imea-paridade`) faz uma execução só desde 2021-06-07. Não usa blocos: um corte de
     bloco esconderia a edição anterior da comparação.
3. **Card** "Milho de MT - paridade de exportação (IMEA)", diário, com a tolerância de 12 dias, porque o boletim é
   semanal.
4. **Só a paridade.** Ficam de fora:
   - o diferencial de base, porque a unidade muda entre edições (cUS$/bu, US$/bu e R$/sc);
   - o prêmio portuário (de Santos, atribuído à Esalq);
   - os fretes;
   - o resto do boletim.

## Consequências

- O F4 do milho ganha a matéria-prima da paridade, desde 31/05/2021. São cerca de 5 anos, menos do que os 10 anos
  da comparação da proposta do David (o percentil de 10 anos da paridade e da base).
- **A base da proposta mistura praças:** o Indicador ESALQ é de Campinas e a paridade é de MT. A pergunta do F4
  sobre a praça continua com o Comitê.
- A troca do contrato de referência é uma quebra na série, uma vez por ano. Qualquer variação calculada que cruze a
  troca mistura dois contratos.

## Adendo (2026-10-04): o zero de 2025-04-25 e a 1ª carga do servidor

A análise do F4 achou mais três defeitos da série:
- a paridade **0,00** em 2025-04-25;
- uma semana fora da série (18 a 22/07/2022: cerca de R$ 85 entre semanas em torno de R$ 60);
- um salto de nível (R$ 28 → R$ 39) em 2025-08-11, três semanas depois de o rótulo mudar para jul/26.

O que mudou:
- **No leitor:** o zero passou a ser recusado. O dev foi recarregado com 1.199 dias.
- **No servidor:** a carga rodou antes da correção e gravou os 1.200 dias, com o zero. O usuário apagou essa
  linha em 2026-10-04, com um `DELETE` só dela, conferido antes por um `SELECT` que trouxe 1 linha. A exceção à
  regra append-only se justifica porque o zero era um não-valor lido da fonte, não uma revisão. O servidor ficou com
  os mesmos 1.199 dias do dev.
- **A semana de 2022 e o salto de 2025 ficam como publicados:** não há como provar o erro. O F4 os trata pela trava
  de quebra da série (ADR 0056, adendo do F4).

## Fora do escopo

O cálculo do F4 (ADR 0056); o diferencial de base, o prêmio e os fretes; a paridade antes de 2021-06-07; a paridade
de Campinas (nenhuma fonte gratuita encontrada).
