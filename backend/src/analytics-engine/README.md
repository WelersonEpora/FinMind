# Motor analítico (placeholder)

`engine.interface.js` define o contrato de entrada/saída do futuro motor
de regras e cálculos, deliberadamente separado da camada de IA
(`../ai/`) - a IA nunca decide sozinha, e o motor de regras nunca é
substituído silenciosamente por uma chamada de IA.

`runAnalysis()` sempre lança `NotConfiguredError` hoje. Não implemente
nenhuma regra, fórmula ou heurística de mercado aqui até que o
especialista David forneça as regras e cálculos (ver
`docs/pendente-especialista-david.md`). Em particular: nenhum sinal de
compra/venda pode ser gerado por este módulo enquanto ele não existir de
fato.
