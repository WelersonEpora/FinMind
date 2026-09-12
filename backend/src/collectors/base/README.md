# Coleta de dados (placeholder)

Nenhuma fonte financeira está integrada nesta fase. `collector.interface.js`
documenta o contrato que um coletor precisa seguir (`fetch` / `parse` /
`persist`) e mantém um registro vazio de coletores disponíveis.

O que falta para implementar o primeiro coletor real depende inteiramente
das definições do especialista David: quais ativos, quais mercados, quais
fontes de dados e quais informações coletar (ver
`docs/pendente-especialista-david.md`). Não crie um coletor "de exemplo"
com dados inventados - isso seria uma estratégia fictícia disfarçada de
código de infraestrutura.
