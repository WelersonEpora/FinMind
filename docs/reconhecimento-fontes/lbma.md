# LBMA Gold Price PM — reconhecimento

Nível **5** (coletado, histórico completo), **com ressalva de licença**. Linha do
índice: `docs/reconhecimento-fontes/README.md`. Evidência: ADR 0009. Série:
`LBMA.GOLD_PM.USD`. Coletor: `collectors/lbma/lbma-gold-pm.collector.js`.

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | **Incerteza:** usamos o feed JSON do site da LBMA (`prices.lbma.org.uk/json/gold_pm.json`); não foi confirmado como API oficial suportada | ADR 0009 |
| 2 | Pública ou autenticada? | O feed é público. O histórico tabulado "oficial" exige licença da IBA (portal MyLBMA) | coletor |
| 3 | Cadastro/chave? | Feed: não | ADR 0009 |
| 4 | Formato | JSON: `{ d: "AAAA-MM-DD", v: [USD, GBP, EUR] }`; só o USD é coletado | coletor |
| 5 | Documentação oficial | **Não confirmada** para o feed | — |
| 6 | Histórico | 1968-04-01 → hoje, 14.686 pontos (verificado em 2026-09-20) | ADR 0009 |
| 7 | Revisões (vintage) | **Não medido.** O fixing PM é um preço fixado; revisão não é esperada, mas não foi testada | — |
| 8 | Fuso / `published_at` | Fixing às 15:00 de Londres. A fonte não informa a publicação: estimada como 15:00 Londres do mesmo dia (limite otimista de poucos minutos) | coletor |
| 9 | Limite de requisições | **Não verificado** | — |
| 10 | Licença | Lida em 2026-09-21 (LBMA e IBA; resumo automático, não parecer jurídico). A IBA exige licença "to obtain, use or redistribute real-time or historical benchmark data": tipos de uso, redistribuição e acesso a histórico, com tabela de taxas (PDF **não lido**, valores desconhecidos). O feed é público mas isso não é licença; as FAQs não dizem se uso interno precisa de uma. Uso atual: pesquisa interna | ADR 0009 |
| 11 | Riscos técnicos | Feed sem contrato de estabilidade; risco jurídico de exibir/redistribuir; `published_at` estimado | ADR 0009 |

**Licença (item 4 de `STATUS_DO_PROJETO.md`) — adiada por decisão de 2026-09-21:** não há
distribuição nem comercialização prevista. Antes de exibir a terceiros, usar em avaliação ou
basear sinal: consultar a IBA (tipo de licença e custo) ou trocar de fonte. Risco hoje: baixo
(pesquisa interna).
