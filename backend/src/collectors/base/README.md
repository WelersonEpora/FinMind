# Coleta de dados

O primeiro coletor real do FinMind é `collectors/bcb/bcb-usd-brl.collector.js`
(cotação do dólar, série 1 do SGS/Banco Central - ver
`docs/adr/0001-fonte-cotacao-dolar-bcb-sgs.md`). Ele implementa o contrato
documentado em `collector.interface.js` (`download`/`parse`/`normalize`/
`persist`) e é registrado via `registerCollector()` na subida do processo
(`collectors/index.js`, importado por `app.js`).

`collector-runner.js` orquestra qualquer coletor que siga o contrato:
download com timeout+retry, parse, normalize (separando itens válidos de
inválidos) e persist, registrando o resultado em `collection_execution`. Uma
falha de comunicação com a fonte marca a execução inteira como `failed`; um
item individual com dado inválido não aborta o restante do lote.

Além do dólar via BCB, **nenhum outro ativo, mercado ou fonte está
integrado**. O que falta para um próximo coletor depende inteiramente das
definições do especialista David: quais ativos, quais mercados, quais fontes
de dados e quais informações coletar (ver
`docs/pendente-especialista-david.md`). Não crie um coletor "de exemplo"
com dados inventados - isso seria uma estratégia fictícia disfarçada de
código de infraestrutura.

## Como adicionar um novo coletor

1. Crie um módulo em `collectors/<fonte>/<nome>.collector.js` exportando um
   objeto que segue o contrato de `collector.interface.js`.
2. Registre-o (chame `registerCollector(...)`) em `collectors/index.js`.
3. Se o coletor persiste um novo tipo de dado (não uma cotação em
   `market_quote`), avalie se precisa de uma nova migration/model/repository
   seguindo o padrão de `market-quote.repository.js`.
4. Documente a decisão de fonte/série/API num ADR novo em `docs/adr/`.
