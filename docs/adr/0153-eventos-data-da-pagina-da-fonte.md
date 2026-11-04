# 0153 — Eventos: a data da página da fonte, e a página antiga não sustenta o evento

## Contexto

O item **E8** do "Relatório de oportunidades de melhoria: sistema de sinais do ouro (prompt ouro-v3)", de 2026-11-01
(resposta no `STATUS_DO_PROJETO.md`, §0), aponta que a fonte do evento de Ormuz da leitura de 2026-10-30 (três
petroleiros atingidos por minas), uma página da AP, tem um endereço que fala de outro tema (eleições em Israel). Pede
que o coletor confira título, endereço e data da página contra o fato, rejeite a fonte quando não batem e registre a
URL final e a data de acesso.

O que o FinMind tinha (ADRs 0047 e 0049): o evento só é aceito se o **grounding** da busca do Gemini liga o texto do
evento a uma página de fonte autorizada que a pesquisa de fato leu; a citação da IA não basta. A URL final de cada
página é gravada (os links do Google expiram), e a data de acesso é a da leitura.

**O que a conferência mostrou (servidor, 2026-11-04):**

- A página citada é uma **página ao vivo da AP** ("Mideast latest", de 28/10), com vários assuntos do dia; o endereço
  leva o título do primeiro. O grounding ligou o texto do evento a ela. A leitura de 31/10 registra o 4º petroleiro com
  outra página ao vivo da AP (de 30/10) e o aviso do UKMTO de 29/10: o fato bate com a data. O site da AP recusa a
  leitura automática, então o conteúdo não pôde ser relido.
- **Nenhum evento aceito citou página antiga:** dos 38 eventos aceitos desde 2026-10-02, com 55 páginas, 25 têm a data
  no endereço, todas de 0 a 2 dias antes da leitura (17 de 1 dia).
- Conferir título e endereço contra o fato recusaria as páginas ao vivo, que sustentam eventos corretos.

**Quem decidiu:** o usuário (Welerson), em 2026-11-04, com o mesmo poder de decisão do David (`CLAUDE.md`), sobre a
recomendação do FinMind.

## Decisão

1. **A data da página vai com a fonte** (`dataPagina`), quando o endereço a traz: "/2026/10/28/", "2026-10-28",
   "october-282026" (as páginas ao vivo da AP) ou "20261029" (os avisos do UKMTO)
   (`paginas-da-pesquisa.js::dataDaUrl`). A tela do evento a mostra ao lado do link.
2. **Uma página com a data mais de 7 dias antes da leitura não sustenta o evento** (`origem: "antiga"`): a leitura
   registra o fato novo das últimas 24 a 48 horas. Sem outra página, o evento é recusado, com o motivo e a data. A folga
   de 7 dias cobre um boletim agrícola de alguns dias antes. Vale para a leitura de eventos dos seis ativos (o coletor é
   um só).
3. **A conferência de título e endereço não é adotada:** o grounding já liga o texto à página lida, e a regra recusaria
   as páginas ao vivo.

## Consequências

- No histórico, nenhum evento mudaria: é uma proteção, não uma correção.
- Sem a data no endereço, nada se conclui (30 das 55 páginas). Ler a data de dentro da página exigiria baixar cada uma,
  e a AP recusa a leitura automática.
- Uma sequência de 8 dígitos que forme uma data válida num endereço que não é data seria lida como data; a regra só age
  se ela estiver mais de 7 dias antes da leitura.
