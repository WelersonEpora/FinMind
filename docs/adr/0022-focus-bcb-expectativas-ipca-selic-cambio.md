# 0022 — Focus (BCB): expectativas de IPCA, Selic e câmbio, uma observação por boletim

## Contexto

O relatório FEL 1 do David lista o **"Relatório Focus e Reservas (BCB)"** como fonte do **ouro**, semanal,
por API, com a anotação "Focus impacta Selic, IPCA e BRL" e o calendário "Focus: segundas" (p. 30 e
tabela de fontes). É o que liga o ouro em dólar ao ouro **em reais**. Até aqui era a linha ❌ de
`docs/cobertura-fatores-fel1-milho-ouro.md` (§5).

Em 2026-09-23 o usuário **autorizou explicitamente** a implementação, com escopo **estritamente limitado ao
que o FEL 1 exige**: só as expectativas de IPCA, Selic e câmbio. Ficam de fora PIB, Top 5, inflação 12/24
meses, os demais indicadores, qualquer fator derivado (surpresa, tendência, dispersão) e qualquer camada de
interpretação. Mesmo padrão de autorização pontual dos ADRs 0001, 0013, 0015 e 0017–0021: vale **só para
aquisição de dados**.

As **Reservas** internacionais, a outra metade da linha do FEL 1, **não** fazem parte desta entrega: foram feitas
logo depois, no ADR 0023.

Reconhecimento (nível 1, 11 perguntas): `docs/reconhecimento-fontes/bcb-focus.md`. O AgroMind já tinha
implementado a Selic por reunião do Copom numa tabela própria (`expectativa_mercado`, ADR 0021 do
AgroMind). O conhecimento da fonte foi reaproveitado; o modelo não, pelos motivos abaixo.

## Evidência (chamadas reais, 2026-09-23)

- **API OData pública do BCB (Olinda)**, sem chave, JSON: `olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata`.
  Tem 13 endpoints. O `ExpectativasMercadoAnuais` traz um registro por (`Indicador`, `Data` da pesquisa,
  `DataReferencia` = ano-alvo, `baseCalculo`).
- **IPCA, Câmbio e Selic desde 2000-01-03**, com 6.702 dias de pesquisa cada. A série inteira de um indicador
  (~32 mil linhas) vem numa requisição de ~2 a 3 s. `IndicadorDetalhe` é sempre nulo e não há registro
  repetido.
- **"Câmbio" e "Selic" do endpoint anual são o valor de fim de ano.** O PDF de 2015-01-02 separa "fim de
  período" (2,80; 12,50) e "média do período" (2,71; 12,47), e a API tem só o primeiro.
- **`baseCalculo`:** 0 = respondentes dos últimos 30 dias, que é o número de destaque do boletim. 1 = últimos
  **5 dias úteis** (legenda do PDF de 2026-09-18), existente desde 2014. O AgroMind registrava "4 dias", sem
  confirmação.
- **Publicação semanal.** Os metadados do conjunto no Portal de Dados Abertos dizem: "Estatísticas calculadas
  diariamente [...] publicadas todo primeiro dia útil da semana". Na quarta, 23/09/2026, a pesquisa mais
  recente na API era a de sexta, 18/09, e o PDF correspondente se chama `R20260918.pdf`.
- **Não revisa.** A API bate com o PDF do boletim ao centavo em 2005-01-07, 2011-04-20, 2015-01-02,
  2026-04-02, 2026-09-11 e 2026-09-18.
- **Licença:** ODbL (Portal de Dados Abertos do BCB).

## Decisão

### Séries e horizonte

Um endpoint (`ExpectativasMercadoAnuais`), três indicadores, `baseCalculo = 0`, **mediana**. As séries são
`BCB_FOCUS.ANUAL.<ANO>.<IPCA|SELIC|CAMBIO>`, em `observation`, com `source_code = "BCB_FOCUS"` e as unidades
`%` (IPCA, variação no ano), `% a.a.` (Selic, fim de ano) e `R$/US$` (câmbio, fim de ano).

**O horizonte é o ano-calendário esperado, e ele vai no código da série.** Os três indicadores são anuais no
destaque do boletim, então há uma dimensão só, comum a todos. A Selic **por reunião do Copom**
(`ExpectativasMercadoSelic`, o que o AgroMind coletava) **não** entra: o FEL 1 não pede esse nível, e ele
exigiria uma convenção de data para cada reunião, que a fonte não informa (o código é só "R6/2028").

### `observed_at` = data da pesquisa do boletim; `published_at` separado e estimado

É o mesmo desenho do COT (ADR 0009): o dado é de terça e sai na sexta. Aqui, a pesquisa é de sexta e sai na
segunda.

- **`observed_at`** = a data da pesquisa do boletim, preservada em coluna própria (e em `metadata.dataPesquisa`).
- **`published_at`** (estimado, `published_at_is_estimated = true`, base `lag_rule`) = fim do dia (UTC) do
  **primeiro dia com pesquisa depois da semana do boletim**. Como só há pesquisa em dia útil do BCB, os
  feriados saem da própria fonte, sem calendário externo. Exemplos: 07/09/2026 caiu numa segunda e foi
  feriado, e o boletim de 04/09 saiu na terça, 08/09. Nas semanas de Carnaval a publicação cai na quarta.
  Nenhum `published_at` cai no dia da pesquisa ou antes; a distância é de 3 a 5 dias.
- **Semana mais recente:** a fonte ainda não tem o dia seguinte, então **nenhuma data é estimada**. O coletor
  não envia `published_at`, e o serviço usa `collected_at` (base `collected_at`, ADR 0008: "nunca uma data
  anterior inventada"). Isso é conservador: o boletim da segunda passa a valer só a partir da primeira coleta
  que o viu (~1 dia depois, com o cron das 04/06/08 UTC). O ADR 0008 não reescreve linha, então esse
  `published_at` fica como está mesmo depois de a fonte ter o dia seguinte.

### Uma observação por boletim, não por dia de pesquisa

A estatística é diária, mas a semana inteira só se torna pública junto, no boletim. Em qualquer instante, o
valor mais recente que alguém podia conhecer é o do **último dia com pesquisa da semana**, que é o dia do
boletim (normalmente sexta; quinta quando a sexta é feriado; quarta em 2011-04-20, com Tiradentes e
Sexta-feira Santa). Os dias anteriores da mesma semana **nunca foram o valor vigente**, então gravá-los não
acrescenta nada ao `asOf()`. Isso também atende a "só o dado necessário".

### Por que em `observation`, sem tabela nova (diferente do AgroMind)

O AgroMind criou `expectativa_mercado` porque a `observacao` de lá não admite observação com data futura. Aqui
o problema não existe: `observed_at` é a data da pesquisa, sempre passada, e o ano esperado é parte da
identidade da série, como o vencimento no CCM (`B3.CCM.<TICKER>.<CAMPO>`). Cada `(série, boletim)` tem **uma
versão só**. Se a fonte um dia revisar um boletim já publicado, a correção vira versão nova pela regra do
ADR 0008, sem código específico.

**Alternativa considerada e rejeitada:** usar o desenho do WASDE, com `observed_at` = 1º de janeiro do ano-alvo
e uma versão por boletim. O serviço trata a 2ª versão em diante de uma fonte com `published_at` estimado como
"revisão descoberta agora" e troca a data por `collected_at` (ADR 0008). Todo o histórico do backfill ficaria
com a data do backfill, e o point-in-time se perderia. Contornar isso exigiria mudar a regra central de
escrita; o desenho escolhido não precisa de mudança nenhuma no serviço.

### Coleta

- Coletor `bcb-focus` (`backend/src/collectors/bcb/bcb-focus.collector.js`), registrado na coleta diária.
  São 3 requisições (uma por indicador) com a janela das **últimas 5 semanas**, que cobre a semana nova e a
  data de publicação da anterior.
- Backfill: `npm run backfill:bcb-focus`, com a série inteira desde 2000-01-03 numa execução (~6 s). A ordem
  de carga não importa, porque cada boletim é uma observação própria e não há trava de "carga inicial" como no
  WASDE.
- `metadata` guarda só a rastreabilidade: fonte, endpoint, indicador, ano de referência, data da pesquisa,
  `baseCalculo`, estatística (mediana), número de respondentes (para conferir com o PDF) e a regra de
  publicação usada. Média, desvio, mínimo e máximo **não** são gravados.
- Card `FOCUS_EXPECTATIVAS` nos Observáveis, com frequência semanal. O item é o ano de referência (dimensão
  nova `porAnoReferencia` em `observation-data.service.js`, com o mesmo comportamento das de vencimento e
  região: ativo = o ano ainda consta do último boletim; destaque = o ano corrente), e as métricas são IPCA,
  Selic e câmbio. Nenhuma mudança de frontend.

## Resultado (2026-09-23, banco de dev)

- **20.258 observações em 93 séries** (3 indicadores × 31 anos-alvo, de 2000 a 2030), **1.394 boletins** por
  indicador, de **2000-01-07 a 2026-09-18**. Por indicador: IPCA 6.767, Selic 6.764, câmbio 6.727. Cada
  boletim traz o ano corrente e até 4 seguintes; no começo do ano, às vezes também o ano que acabou de terminar
  (IPCA de 2004 no boletim de 2005-01-07).
- Publicação: 20.243 datas pela regra do dia seguinte com pesquisa e 15 pela coleta (a semana de 2026-09-18).
  **0 duplicatas** em `(series_code, observed_at)`, 0 revisões, 0 inválidos, 0 falhas.
- Idempotência: a coleta diária logo depois do backfill ignorou 75 de 75; o backfill repetido ignorou 20.258
  de 20.258.
- Conferência com o PDF oficial: iguais em todas as amostras acima (IPCA, Selic e câmbio, ano corrente e
  seguinte).
- `asOf()`: o IPCA de 2026 vale **5,00** até 2026-09-14 (boletim de 04/09) e **4,90** a partir de
  2026-09-15 (boletim de 11/09, publicado em 14/09). Na semana do feriado, o 5,00 só vale depois de 08/09. A
  Selic de 2026 passa de **13,75** para **13,50** com o boletim de 18/09. O IPCA de 2020 passa de 3,2 para 3,1
  no boletim de 13/03/2020, que vale a partir de 16/03.

## Consequências e limitações

- **100% das datas de publicação são estimadas**: a fonte não informa o instante. O horário não é informado; vale
  o fim do dia (UTC), que é o limite conservador.
- **A cada semana, o boletim mais recente entra com `collected_at`**, ~1 dia depois da publicação real. Nunca
  antecipa; atrasa por uma coleta.
- **Pesquisa num sábado (2000-07-08, só no IPCA):** vira o dia do boletim daquela semana para o IPCA, com
  publicação estimada na terça, 11/07 (conservador). É uma peculiaridade do começo da série, não tratada.
- No modo `estrito` do `asOf()`, nada do backfill existe antes da data do backfill. É o comportamento geral
  do ADR 0008 para qualquer fonte estimada.
- **Não implementado (fora do FEL 1 ou fora do escopo autorizado):** PIB e os demais
  indicadores; expectativas mensais e trimestrais; Selic por reunião; inflação 12/24 meses; Top 5; média,
  desvio, mínimo e máximo; base de 5 dias úteis; os dias de pesquisa entre boletins. Também nenhum fator
  (surpresa, variação da expectativa, dispersão): se o Comitê pedir, é um fator em `backend/src/factors/`,
  nunca gravado.
- Licença ODbL: uso interno. Uma redistribuição da base derivada exigiria atribuição e a mesma licença.
