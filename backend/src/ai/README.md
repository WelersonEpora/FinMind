# Integração com IA

`provider.interface.js` documenta o contrato que um provedor de IA precisa implementar. `null-provider.js` continua
sendo o padrão de tudo que ainda não tem definição: falha explicitamente, nunca simula uma resposta.

**Única integração real até agora: a leitura diária de geopolítica do ouro e do petróleo** (ADR 0047).
`gemini-search.provider.js` chama o Gemini com busca na web (API REST, sem SDK) e devolve o texto como veio; o prompt
fica versionado em `prompts/geopolitica-diaria.md` (carregado por `carregar-prompt.js`) e quem interpreta a resposta é o
parser do coletor `collectors/geopolitica/`. A leitura é **contexto** para o prompt do ativo, não regra nem sinal.

Para qualquer outro uso, continuam faltando as definições do especialista David: como avaliar a saída da IA e em que
condições ela pode influenciar um sinal operacional (ver `STATUS_DO_PROJETO.md`, §4). Uma resposta de IA nunca deve
gerar ordens automaticamente - essa é uma decisão de arquitetura permanente, não um placeholder temporário.
