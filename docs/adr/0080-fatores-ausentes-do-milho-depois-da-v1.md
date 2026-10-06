# 0080 — Os fatores ausentes do milho ficam para depois da v1

**Status:** aceita (2026-10-05).

## Contexto

No Motor do Milho v0 (2026-10-02, ADR 0055), o David listou fatores que a tabela do FEL 1 não tem: a demanda interna de
ração, o frete e a base MT→porto, o prêmio de exportação em Paranaguá, a soja (janela de plantio e relação de preços) e
o clima brasileiro como fator próprio. A pendência do ativo perguntava se entram na v1 ou depois.

Todos pedem fonte nova, e a aquisição de dados está encerrada desde 2026-10-01 (`STATUS_DO_PROJETO.md`, §1): fonte nova
só com uma demanda específica, se estiver no FEL 1, e com autorização registrada num ADR. Parte do que eles medem já
chega por outro caminho:

| Fator ausente | O que já existe |
|---|---|
| Clima brasileiro | O VHI da NOAA sobre o milho de MT e do PR, como contexto do F2 (ADR 0070); geada e chuva excepcional pelos eventos do INMET na leitura diária por IA (ADR 0049) |
| Frete e base MT→porto | O frete está dentro da paridade de exportação do IMEA, que o F4 usa (ADRs 0057 e 0072); os componentes não são coletados |
| Ração, prêmio em Paranaguá, soja | Nada |

## Decisão (usuário, Welerson, 2026-10-05)

Os fatores ausentes ficam para depois da v1. Cada um volta com uma demanda e uma autorização próprias, como qualquer
fonte nova. A pergunta sai das pendências do milho; a metodologia vai à v16.

## Consequências

- A v1 do milho fica com os 8 fatores do FEL 1.
- O pedido continua registrado aqui e na seção dos ajustes do FEL 1 do status, para a próxima reunião com o David.
