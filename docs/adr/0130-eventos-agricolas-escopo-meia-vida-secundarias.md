# 0130 — Eventos dos agrícolas: NÃO VERIFICADO, o tipo SAFRA, a meia-vida e as fontes secundárias

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (*Por que o FinMind indica baixa e o café está em alta?*), resposta item a item no
`STATUS_DO_PROJETO.md`, §0, aponta no item **E2** que o módulo de eventos foi desenhado estreito para o café: procura
choques (geada, tarifa, rota) e deixa de fora a informação de mercado que estava movendo o preço. Três fatos que a
leitura não viu: os estoques certificados baixos (é tarefa do F3, item E3), a safra colombiana abaixo do esperado (a
Federação de Cafeteiros ficou fora no teste de 06/10, ADR 0092, e as fontes que a publicaram são secundárias) e o risco
de El Niño para a safra 2027/28 (do NOAA CPC só contava a mudança de status). A análise pede também que "NORMAL" só
valha com o escopo pesquisado e que os eventos tenham meia-vida.

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`): a volta da FNC, a busca
do Vietnã no USDA FAS e a mudança de probabilidade do El Niño como evento; a meia-vida em dois valores, curta e longa;
o alcance nos três agrícolas (milho, café e soja); e as fontes secundárias, primeiro testadas e, com o resultado,
autorizadas no mesmo dia como alerta. A fonte nova vem de uma demanda específica (a análise do café), como pede a
regra da aquisição encerrada.

## Decisão

1. **NÃO VERIFICADO.** Quando a IA declara um ativo NORMAL sem cumprir o mínimo de pesquisa dele (o piso, ADR 0049), o
   coletor grava o nível `NAO_VERIFICADO` (antes ficava NORMAL, com um aviso interno). O prompt do ativo recebe "sem
   informação, não calmaria"; a tela mostra um selo tracejado. Vale para todos os ativos: corrige uma informação errada.
   Migration `20261021120000-eventos-nivel-nao-verificado` (os CHECKs de nível das seis colunas e o de tipo).
2. **Tipo SAFRA**, só na leitura principal (milho e café): quebra, revisão relevante ou anúncio de safra que os
   relatórios coletados ainda não mostram, inclusive de país sem série no FinMind (a Colômbia, o Vietnã). Na soja, a
   safra é fator, não evento (`docs/proposta-ativo-soja.md`, §2.9).
3. **Escopo** (prompt `geopolitica-diaria` v15): a **Federação Nacional de Cafeteiros da Colômbia** volta às fontes
   (SAFRA, clima extremo, sanidade; o mês de produção ou exportação que foge do padrão, não o número de rotina); o
   **USDA FAS** ganha a busca do relatório GAIN do café do Vietnã; do **NOAA CPC** conta também a mudança relevante na
   probabilidade prevista do El Niño ou da La Niña.
4. **Meia-vida** nos três agrícolas (`shared/eventos-mercado.js`): o peso do evento no prompt é `0,5^(idade/meia-vida)`,
   com **4 dias** nos fatos pontuais (geopolítica, clima extremo, choque logístico, dado econômico; o "3 a 5 dias" da
   análise para notícia) e **25 dias** nas medidas que seguem valendo e na safra (política comercial, regulação,
   sanidade, política de oferta, SAFRA; o "20 a 30 dias" da análise para relatório). O evento fica no prompt enquanto o
   peso for de pelo menos 0,25 (duas meias-vidas: 8 ou 50 dias); cada linha diz a meia-vida e o peso atual. O ouro, o
   petróleo e o dólar ficam como estavam.
5. **Fontes secundárias, só alerta**, nos três agrícolas: **Safras & Mercado**, **Notícias Agrícolas** e **Trading
   Economics**. Marcadas `[SECUNDÁRIA]` na lista do prompt (principal v15 e soja v3). Um evento sustentado só por
   página delas é aceito com **confiança BAIXA** (o coletor rebaixa, seja qual for a da IA) e vai ao prompt do ativo com
   "ALERTA: só fonte secundária"; com uma página de fonte primária junto, fica como veio. **Não cumprem o piso.** A
   página de commodity do Trading Economics é reescrita todo dia na mesma URL (`paginaAtualizada`, como o CPC).

## Evidência: teste das secundárias (2026-10-21)

O método do ADR 0092: uma chamada do Gemini com busca por candidata, restrita ao site, sobre o café de 06/10 a 21/10, e
as páginas do site que a pesquisa de fato leu (grounding).

| Fonte | Páginas do site lidas | O que trouxe | Decisão |
|---|---|---|---|
| Safras & Mercado (`safras.com.br`) | 8 | Alta em Nova York com o clima, a qualidade da safra 2026 | Entra |
| Notícias Agrícolas (`noticiasagricolas.com.br`) | 8 | Fechamentos de Nova York e Londres; a análise do Cepea republicada ("apesar do bom início da safra 2027/28, clima preocupa") | Entra |
| Cepea (`cepea.esalq.usp.br`, `cepea.org.br`) | 0 | Nenhuma página lida | Fora; o conteúdo chega pelo Notícias Agrícolas |
| Trading Economics (`tradingeconomics.com`) | 11 | A página do café (estoques certificados da ICE na mínima de quase 27 anos, ~240 mil sacas; El Niño) e notícias | Entra, com `paginaAtualizada` |

## Consequências

- A leitura dos agrícolas passa a ver a informação de mercado das secundárias, sempre rebaixada; o peso dela na análise
  continua sendo da IA do ativo, com o alerta explícito.
- NÃO VERIFICADO tende a aparecer mais no começo: é o efeito esperado (antes, o mesmo caso era um NORMAL enganoso).
- **A medir:** a captura de eventos relevantes (o teste de 80% da análise) precisa de uma lista de referência feita à
  mão; o teste honesto é daqui para frente (refazer datas passadas com a busca de hoje é otimista). A lista e os valores
  da meia-vida ficam com o Comitê (`STATUS_DO_PROJETO.md`, §0, E2).
- Leitura não reproduzível, como antes: vale da 1ª coleta com a v15 em diante.
