# Motor analítico

O motor do FinMind **não mora neste diretório**: ele já roda para os quatro ativos (petróleo, ouro, milho e café;
ADRs 0052, 0054, 0058 e 0062), espalhado pelas peças abaixo. Este diretório guarda só o contrato da parte que ainda
não existe.

| Peça | Onde | O que faz |
|---|---|---|
| Fatores (camadas A, B e C) | `factors/` (um `*.factor.js` por fator; moldes comuns em `factors/modelos/`, utilitários em `factors/base/`) | Funções determinísticas e versionadas sobre a camada point-in-time (`asOf`, ADR 0008): a medida, a comparação e a direção de cada fator |
| Metodologia do ativo | `services/metodologia-ativo.service.js` + `shared/metodologia-*.js` | Reúne os fatores de um ativo numa data (`simularFatores`), com os parâmetros, os pesos do FEL 1 e os textos de cada camada; alimenta a tela Metodologia do Ativo |
| Prompt diário | `services/prompt-diario.service.js` + `shared/analise-diaria-*.js` + `ai/prompts/<ativo>-analise-diaria.md` | Monta o prompt do dia (fatores, preço de referência, faixas e horizontes e, no milho, a tabela fixa de peso por mês, ADR 0065), sem chamar a IA |
| Leitura de tendência | `collectors/analise/analise-diaria-ia.collector.js` + `shared/resposta-analise-diaria.js` | Envia o prompt ao Gemini, valida a resposta e grava em `analise_diaria`; aparece no Centro de Decisão |
| Realizado e Qualidade da IA | `services/realizado-analise.service.js` + `services/qualidade-ia.service.js` | O que o preço fez em cada horizonte, a partir do preço da data da análise, e as medidas de direção e faixa da IA contra dois benchmarks, sob demanda (ADRs 0063 e 0064); tela `/qualidade-ia` |

**O que falta, e fica aqui (`engine.interface.js`):** a agregação determinística dos fatores em código (o peso por mês
e as relações do milho, as regras transversais do café; ADRs 0059 e 0062) e qualquer condição de sinal. Hoje quem
combina os fatores é a IA, orientada pelo prompt (no milho, com o peso do mês e as regras de agregação em texto, ADR 0065); `runAnalysis()` continua lançando `NotConfiguredError` até o David e o
Comitê definirem essas regras (`STATUS_DO_PROJETO.md`, §4).

Restrições que continuam valendo (`CLAUDE.md`): nenhuma regra, fórmula ou limiar que o David ou o Comitê não tenham
definido (uma proposta fica marcada como `PROPOSTA`, ADR 0050); a leitura da IA é **tendência, nunca recomendação de
compra ou venda**; nenhuma execução automática de ordens.
