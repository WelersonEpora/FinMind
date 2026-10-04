# Integração com IA

`provider.interface.js` documenta o contrato que um provedor de IA precisa implementar. `null-provider.js` continua
sendo o padrão de tudo que ainda não tem definição: falha explicitamente, nunca simula uma resposta.

**Integrações reais: a leitura diária de eventos de mercado do ouro, do petróleo, do milho e do café**
(ADR 0047, estendida pelo ADR 0049; a geopolítica é um dos sete tipos de evento).
`gemini-search.provider.js` chama o Gemini com busca na web (API REST, sem SDK) e devolve o texto como veio; o prompt
fica versionado em `prompts/geopolitica-diaria.md` (carregado por `carregar-prompt.js`) e quem interpreta a resposta é o
parser do coletor `collectors/geopolitica/`. A leitura é **contexto** para o prompt do ativo, não regra nem sinal.

**E a leitura diária de tendência do petróleo e do ouro** (ADRs 0051, 0052 e 0054): o prompt de cada ativo
(`prompts/petroleo-analise-diaria.md`, com os 10 fatores e o WTI; `prompts/ouro-analise-diaria.md`, com os 8 fatores e
o GLD), montado por `services/prompt-diario.service.js` com a configuração do ativo (`shared/analise-diaria.js`), vai
ao Gemini **sem busca** e com a resposta em JSON (`gemini-search.provider.js::gerarJson`), por um coletor por ativo
(`collectors/analise/`). A resposta é validada por `shared/resposta-analise-diaria.js` (fora do formato, nada é
gravado) e aparece no Centro de Decisão do ativo: **leitura de tendência em quatro horizontes, não recomendação**.

Para qualquer outro uso, continuam faltando as definições do especialista David: como avaliar a saída da IA e em que
condições ela pode influenciar um sinal operacional (ver `STATUS_DO_PROJETO.md`, §4). Uma resposta de IA nunca deve
gerar ordens automaticamente - essa é uma decisão de arquitetura permanente, não um placeholder temporário.
