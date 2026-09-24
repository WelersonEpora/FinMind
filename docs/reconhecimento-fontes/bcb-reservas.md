# BCB — Reservas internacionais: reconhecimento (nível 1) e implementação (nível 5)

**Data:** 2026-09-23. **Situação:** implementada no escopo do FEL 1 ("Banco Central do Brasil — reservas
internacionais brasileiras"; a metade "Reservas" da linha "Relatório Focus e Reservas (BCB)", ouro). Decisão e
resultado: ADR 0023. O Focus está em [bcb-focus.md](bcb-focus.md).

| # | Pergunta | Resposta (evidência de 2026-09-23) |
|---|---|---|
| 1 | API oficial? | Sim: a API do SGS (`api.bcb.gov.br/dados/serie/bcdata.sgs.<série>/dados`), a mesma do dólar e da Selic. Série usada: **13621** |
| 2 | Pública ou autenticada? | Pública |
| 3 | Cadastro ou chave? | Não |
| 4 | Formato | JSON (`[{ "data": "dd/mm/aaaa", "valor": "366890" }]`). Nome, unidade e periodicidade vêm do serviço web do SGS (`getUltimoValorXML`): "Reservas internacionais - Total - diária", US$ (milhões), D |
| 5 | Documentação | Portal de Dados Abertos (descrição do conceito, recursos JSON/CSV). A página de metadados do SGS estava fora do ar ("System unavailable") |
| 6 | Histórico | Diária desde **1998-09-01** (7.046 dias úteis até 2026-09-22). A mensal oficial (3546) vai a 1971. O conceito liquidez (13982) começa em 2008 |
| 7 | Revisa? | **Não medido.** A mensal oficial é o fim de mês da diária em 330 de 336 meses; os 6 diferentes (2007–2010, 1 a 67 US$ milhões) podem ser revisão da mensal |
| 8 | Publicação | O valor de D sai no dia útil seguinte (na quarta, 23/09 à noite, o último era 22/09; uma medição só). A fonte não informa o horário. Só há ponto em dia útil |
| 9 | Limite de requisições | Não verificado. A API recusa pedidos de mais de 10 anos. Uma janela devolveu XML no lugar de JSON uma vez (passou na repetição); respostas de até ~20 s |
| 10 | Licença | ODbL (Portal de Dados Abertos do BCB). Uso interno |
| 11 | Riscos | (a) Três séries parecidas: o "Total" diário (13621), o conceito liquidez (13982, que inclui linhas com recompra e difere desde nov/2024) e o total mensal (3546). (b) Resposta intermitente fora do formato. (c) Ponto isolado num sábado (2000-09-16) |

## Recomendação e o que foi feito

**Adotar a 13621**: é o "Total", e a mensal oficial é o fim de mês dela. Implementada: coletor
`bcb-reservas-internacionais` e backfill `npm run backfill:bcb-reservas`, em `observation`, com `published_at`
estimado pela próxima data da série (ADR 0023). Não coletados: conceito liquidez, mensal e composição (ouro).

## Fontes

- Portal de Dados Abertos — série 13621: https://dadosabertos.bcb.gov.br/dataset/13621-reservas-internacionais---conceito-caixa---total---diaria
- Portal de Dados Abertos — série 13982: https://dadosabertos.bcb.gov.br/dataset/13982-reservas-internacionais---conceito-liquidez---total---diaria
