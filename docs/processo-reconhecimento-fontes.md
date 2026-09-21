# Processo de reconhecimento de fontes

Processo operacional (não é ADR), portado do AgroMind
(`AgroMind/docs/processo-reconhecimento-fontes.md`). Existe para evitar
escolher uma fonte e só depois descobrir que ela está bloqueada, é paga ou não
tem o histórico que se supunha — o caso da CEPEA. O relatório FEL 1 classifica
42 fontes por modo de acesso **sem ter testado nenhuma** (declarado na p. 9);
este processo é o que transforma "catalogada" em "confirmada".

**Regra:** nenhum coletor novo é escrito antes de a fonte ter uma linha no
índice (`docs/reconhecimento-fontes/README.md`) e o nível 1 concluído. Isso
complementa `CLAUDE.md` ("Convenções para novos coletores") e não substitui a
exigência de autorização do David para ativo/fonte novos.

## Checklist (nível 1)

Cada resposta vem de **evidência real** (requisição feita, página lida). Se não
foi confirmada, registra-se como **incerteza explícita** — nunca preenchida por
suposição.

1. Existe API oficial?
2. É pública ou exige autenticação?
3. Exige cadastro ou chave?
4. Qual o formato (JSON, CSV, XLSX, HTML, PDF…)?
5. Existe documentação oficial?
6. Existe histórico? Até quando?
7. A fonte **revisa** valores publicados (vintage)? Medido, não presumido.
8. Qual o fuso / sistema temporal, e quando o dado é **publicado** (`published_at`)?
9. Existe limite de requisições?
10. Existe licença ou restrição de uso?
11. Quais os principais riscos técnicos?

## Níveis de maturidade

| Nível | Significado | Critério |
|---|---|---|
| 0 | Identificada | Aparece como candidata |
| 1 | Reconhecimento concluído | As 11 perguntas têm resposta com evidência (ou incerteza declarada) |
| 2 | Modelo definido | Campos, chave natural, fuso e exemplo de payload real, no papel |
| 3 | Coletor implementado | `download`/`parse`/`normalize`/`persist` escritos e testados |
| 4 | Coleta validada | Rodou contra a fonte real; reexecução idempotente (0 duplicatas) |
| 5 | Backfill concluído | Histórico relevante coletado, não só o ponto mais recente |

Nenhuma fonte pula do 0 ao 2 sem concluir o 1. **Nível não é sinônimo de "sem
ressalvas"**: uma fonte no nível 5 pode ter licença ou `published_at`
pendentes — isso fica na coluna de incertezas do índice.

## Onde registrar

- `docs/reconhecimento-fontes/README.md` — uma linha por fonte: nível, principais
  incertezas e onde está a evidência.
- `docs/reconhecimento-fontes/<fonte>.md` — checklist completo, **só quando há
  lacuna relevante** (hoje: FRED e LBMA, por licença). Para as demais, a
  evidência já está nos ADRs apontados no índice; não se copia conteúdo.

## Retroativo

Em 2026-09-21 as 7 fontes já implementadas (BCB dólar e Selic, FRED, LBMA,
CFTC, USDA, B3 CCM) foram registradas retroativamente a partir das evidências
dos ADRs 0001, 0006, 0009 e 0011. Onde a resposta não existia, ficou como
incerteza declarada, não como preenchimento por adivinhação.
