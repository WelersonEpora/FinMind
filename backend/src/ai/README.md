# Integração com IA (placeholder)

`provider.interface.js` documenta o contrato que um provedor de IA real
(ex.: Claude, Gemini, GPT) vai precisar implementar. `null-provider.js` é
a implementação padrão hoje: falha explicitamente, nunca simula uma
resposta.

Não há chamada paga a nenhuma IA nesta fase. Antes de integrar um
provedor real, faltam definições do especialista David: como avaliar a
saída da IA e em que condições ela pode influenciar um sinal
operacional (ver `docs/pendente-especialista-david.md`). Uma resposta de
IA nunca deve gerar ordens automaticamente - essa é uma decisão de
arquitetura permanente, não um placeholder temporário.
