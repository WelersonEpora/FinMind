# 0092 — Eventos de mercado: o que os números ainda não mostram, nove fontes novas e a repetição

**Status:** aceita (2026-10-06).

## Contexto

De 02/10 a 06/10/2026, a tela Eventos do servidor mostrou só o petróleo, quase sempre o mesmo tipo de fato (um
navio-tanque atingido em Ormuz), em dias seguidos, e nada de milho e café. O ouro apareceu uma vez. O usuário perguntou
se a busca estava rígida demais e perdia o que importa para o preço. A revisão do prompt (v13) e das fontes (ADR 0049)
encontrou quatro causas:

1. **"Safra não é evento" valia para o mundo todo.** O prompt excluía "produção, safra, área ou produtividade, mesmo
   quando um relatório as revisa" e "relatório periódico, qualquer que seja o número". A regra existe porque o FinMind
   coleta esses números, mas só do Brasil e dos EUA (Conab, IMEA, USDA, WASDE), uma vez por mês ou por semana. Ficavam
   de fora a quebra confirmada antes do próximo relatório, a safra dos países sem série no FinMind (Argentina, Ucrânia,
   café da Ásia e da América Central) e a mudança de status do El Niño.
2. **O clima extremo, na prática, era só geada.** A única fonte de clima era o INMET, e a regra de rotina só aceitava o
   aviso de geada ou de onda de frio. Nenhuma fonte cobria o furacão no Golfo do México, que paralisa a produção de
   petróleo.
3. **A demanda não tinha fonte.** Os mandatos de etanol (EPA nos EUA, CNPE no Brasil) estavam como "talvez" no ADR 0049.
4. **O mínimo de pesquisa consumia as buscas.** A chamada de milho e café faz 2 a 5 buscas; o mínimo (política
   comercial ou regulação; a AP sobre o Mar Negro) leva quase todas.

E uma causa da repetição: não há identidade de evento entre dias (ADR 0047, decisão do usuário) e "recente" vale 24 a
48 horas. Um fato reaparecia em dias seguidos, e às vezes duas vezes na mesma leitura.

A tela também não mostrava os rejeitados: a API aceitava `situacao=rejeitados`, mas a tela pedia sempre os aceitos.
Não dava para saber se a conferência da fonte estava descartando eventos reais.

**Decisão do usuário (Welerson, 2026-10-06):** ajustar a régua do prompt, incluir as fontes novas que passarem no teste
de acesso, tratar a repetição de forma simples (sem sistema de acompanhamento de eventos) e mostrar os rejeitados na
tela. Fonte nova nesta lista é do ADR 0049 ("só com autorização do usuário registrada aqui"); esta é a autorização, com
o mesmo limite de lá: fonte de busca da leitura diária, não aquisição de dado.

### Teste de acesso (2026-10-06)

Mesmo método do ADR 0049: uma chamada ao Gemini com busca por candidata, restrita ao site, pedindo publicações de
2026-09-20 a 2026-10-06, e contadas as páginas daquele site que a pesquisa de fato leu (pela URL final). Todas
pesquisaram na 1ª tentativa, com a chave paga.

| Fonte | Escopo | Páginas lidas | O que trouxe | Decisão |
|---|---|---|---|---|
| CENTCOM | `centcom.mil` | 9 | Bloqueio dos EUA ao Irã, 130ª embarcação interceptada (05/10) | Entra |
| NOAA NHC | `nhc.noaa.gov` | 23 | Sistema AL92 no sudoeste do Golfo do México, 90% de chance de formação (06/10) | Entra |
| BSEE | `bsee.gov` | 5 | Nada desde 2024: só publica quando há tempestade (fonte de exceção, como o UKMTO) | Entra |
| Bolsa de Comercio de Rosario | `bcr.com.ar` | 11 | "70% da região núcleo entre escassez e seca", plantio do milho travado (24/09) | Entra |
| Governo da Argentina | `argentina.gob.ar`, `boletinoficial.gob.ar` | 5 | Decreto 423/2026 de redução das retenciones (junho) | Entra |
| EPA | `epa.gov` | 7 | Acordo judicial sobre o RFS (30/09) | Entra (era "talvez" no ADR 0049) |
| MME/CNPE | `gov.br/mme` | 6 | Resolução do E32, consulta das metas do RenovaBio (15/09) | Entra (era "talvez" no ADR 0049) |
| Canal do Panamá | `pancanal.com` | 6 | Avisos de navegação (o de 05/10 é tarifário: rotina) | Entra |
| NOAA CPC (ENSO) | `cpc.ncep.noaa.gov` | 4 | Status "El Niño Advisory" (10/09); a próxima discussão sai em 08/10 | Entra |
| Federação de Cafeteiros da Colômbia | `federaciondecafeteros.org` | 11 | Notícias institucionais e páginas de listagem; nenhum choque | Fora por ora |
| PIB Índia | `pib.gov.in` | 5 | Nada no período; o imposto do ouro só aparece no orçamento (fevereiro) | Fora por ora |

Os textos da Bolsa de Rosario e do NHC mostram que, nesses dias, havia evento de milho (seca na Argentina) e de
petróleo (sistema no Golfo) que a v13 não tinha como encontrar.

## Decisão

1. **Prompt v14** (`backend/src/ai/prompts/geopolitica-diaria.md`):
   - "não é evento" passa a valer para o **número** de um relatório que o FinMind coleta, com a lista deles;
   - nova seção "O que os números ainda não mostram (pode ser evento)": o fato de safra ou de clima que os relatórios
     ainda não refletem, a safra e o clima dos países sem série no FinMind, a mudança de status do El Niño ou da La
     Niña, a tempestade que ameaça a produção no Golfo do México e a decisão que muda a demanda (mandato de etanol);
   - a rotina de cada fonte nova (a perspectiva tropical diária do NHC, o boletim semanal de Rosario, o que a EPA e o MME
     publicam fora dos biocombustíveis, os avisos tarifários do Canal do Panamá, o CPC só na mudança de status);
   - cumprido o mínimo de pesquisa, as buscas restantes vão para o que ele não olha (clima, safra fora do Brasil e dos
     EUA, logística, demanda);
   - a lista dos eventos já registrados (item 4) e a regra de só repetir um desdobramento novo.
   A régua continua conservadora ("na dúvida, não é evento") e provisória (é do David).
2. **Nove fontes novas** em `collectors/geopolitica/fontes-autorizadas.js`, com papel, tipos, ativos e sugestões de
   busca: CENTCOM (geopolítica; petróleo e ouro), NHC e BSEE (clima extremo; petróleo), Bolsa de Comercio de Rosario
   (clima extremo e choque logístico; milho), governo da Argentina (política comercial; milho), EPA e MME/CNPE
   (regulação; milho), Canal do Panamá (choque logístico; milho e petróleo) e NOAA CPC (clima extremo; milho e café). São
   20 fontes no total.
3. **Piso do petróleo:** passa a exigir uma fonte de **geopolítica ou de oferta** do petróleo (UKMTO, Tesouro, OPEP, AP,
   Casa Branca ou CENTCOM). As de furacão e de rota cobrem o petróleo, mas um dia sem tempestade não diz nada sobre
   Ormuz ou a OPEP+. O texto do piso do milho e do café deixa de listar as fontes pelo nome (a lista diz os tipos e os
   ativos de cada uma); a regra é a mesma, e a EPA, o MME e o governo da Argentina passam a cumpri-la no milho.
4. **Repetição**, em duas medidas, sem identidade de evento entre dias (a decisão do ADR 0047 continua):
   - o prompt de cada frente traz os eventos **aceitos** dos ativos dela nos 3 dias anteriores (data, ativos e título;
     um fato com vários ativos numa linha só). Os do próprio dia não entram: refazer o dia substitui a leitura dele;
   - o coletor rejeita como **repetição** (`aceito = false`, motivo "Repetição: a página que sustenta este evento já
     sustentou ... em dd/mm" ou "nesta mesma leitura") a linha cujas páginas de sustentação (origem "pesquisa") **todas**
     já sustentaram um evento aceito do mesmo ativo nesses 3 dias, ou antes na mesma leitura. Uma página nova basta para
     não ser repetição. A URL é comparada sem a barra do fim e sem o `#`. As fontes que reescrevem a mesma URL
     (`paginaAtualizada`: a perspectiva tropical do NHC, a discussão do ENSO do CPC) não contam.
   A conferência é por ativo: um fato que já foi do petróleo e agora entra também no ouro segue aceito no ouro.
5. **Tela Eventos:** filtro **Situação** (Aceitos, o padrão; Rejeitados; Todos), marca "Rejeitado" na linha e o motivo
   no detalhe do evento. O Centro de Decisão continua só com os aceitos.

## Alternativas consideradas

- **Sistema de eventos com identidade entre dias:** descartado de novo, como no ADR 0047. A lista no prompt e a
  conferência pela página resolvem o caso comum com uma consulta e uma regra.
- **Repetição pelo título:** a IA reescreve o título a cada dia ("Navio-tanque é atingido...", "Petroleiro sofre
  princípio de incêndio..."). A página que sustenta o fato é objetiva.
- **Tipo novo "safra":** a causa do fato (clima, sanidade, logística, política) já tem tipo; um tipo novo exigiria
  migration nos CHECKs e não mudaria o que a IA procura.
- **Federação de Cafeteiros e PIB da Índia:** acessíveis, mas o teste não trouxe nada que mudasse a leitura. Ficam para
  rever olhando os rejeitados.
- **Afrouxar "na dúvida, não é evento":** os eventos vão ao prompt da análise de tendência. A régua continua
  conservadora; o que mudou é o que pode ser procurado e onde.

## Consequências

- Mais eventos de milho e de petróleo (seca na Argentina, tempestades no Golfo, mandatos de etanol). O café continua com
  uma lacuna: o clima no Brasil fora dos avisos de geada do INMET (por exemplo, a seca na florada) e a safra do Vietnã não
  têm fonte oficial legível na pesquisa.
- O prompt fica maior (20 fontes, as sugestões de cada uma e a lista dos eventos recentes) e a leitura pode gastar mais
  tokens. Acompanhar pelo bloco "IA" da tela Execuções.
- Um desdobramento real publicado na mesma página de um evento anterior (uma matéria da AP atualizada no mesmo
  endereço) é rejeitado como repetição. Ele fica visível no filtro de rejeitados; se for frequente, a fonte ganha
  `paginaAtualizada`.
- A leitura continua não reproduzível e sem backtest (ADR 0047). As leituras até a v13 não mudam.
