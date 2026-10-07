# 0105 — Evidências de cada leitura no formato da resposta, e o texto das respostas recusadas na execução

**Status:** aceita (2026-10-07).

## Contexto

Na leitura diária de tendência (ADRs 0052, 0054, 0058 e 0062), cada horizonte da resposta tem a sua lista
`evidencias`, e os fatores a favor e contra citam os ids dela ("E1", "E2"...). A validação
(`shared/resposta-analise-diaria.js`) confere os ids dentro da mesma leitura; uma resposta recusada leva a uma nova
chamada e, recusada de novo, a execução falha e nada é gravado.

Em 2026-10-07, ao refazer a leitura do petróleo no servidor com o prompt v9 (`petroleo-analise-ia-diario`, 307 s), as
duas chamadas à chave paga responderam, e as duas respostas foram recusadas: no curto e no médio, fatores citavam
evidências (E1 a E4) que não estavam na lista daquele horizonte; no imediato, não. O padrão sugere que a IA definiu as
evidências no primeiro horizonte e as reaproveitou nos seguintes. O formato só mostrava "E1" e "E2" de exemplo: não
dizia que os ids valem dentro da mesma leitura. Os prompts do milho, do café e do ouro têm o mesmo formato.

O texto das respostas recusadas não ficava gravado: só os motivos. A causa não pôde ser confirmada.

## Decisão (usuário, Welerson, 2026-10-07)

1. **O formato dos quatro prompts diz a regra:** cada leitura tem a sua própria lista `evidencias`, com ids a partir de
   E1; um id citado em `fatoresAFavor` ou `fatoresContra` precisa estar na lista da mesma leitura, e uma evidência que
   vale para mais de um horizonte é repetida em cada um. A validação não muda.
2. **O detalhe da execução guarda o texto de cada resposta recusada**, inclusive a última quando as duas são recusadas,
   e a tela Execuções o mostra, recolhido, no bloco "IA".

## Implementação

- Prompts: petróleo v10, milho v8, café v7 e ouro v3 (a regra depois de "Com tendência INSUFICIENTE", no bloco 6).
- `collectors/analise/analise-diaria-ia.collector.js`: `detalhes.ia.textosRecusados`, uma lista com o texto de cada
  resposta recusada. `frontend/src/views/ExecucoesView.vue`: "Texto das respostas recusadas", um item recolhível por
  resposta.

## Consequências

- Uma próxima recusa pode ser diagnosticada pelo texto da resposta.
- O detalhe de uma execução com resposta recusada fica maior (uma resposta tem ~10 a 20 mil caracteres).
- As leituras já gravadas não mudam; a comparação na Qualidade da IA separa pela versão do prompt (ADR 0064).
