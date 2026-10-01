# 0036 — Ouro nas reservas dos bancos centrais (FMI, IRFCL)

## Contexto

O fator 5 do ouro na planilha `controle_fatores.xlsx`, "Demanda de bancos centrais (reservas)", tem peso **Alto** e
pede "Compras de reservas", com fonte "World Gold Council, IMF, BCB". Até aqui o FinMind só tinha as reservas totais
do Brasil (ADR 0023), que não medem compra de ouro: era um dos 2 fatores de peso Alto do ouro sem nenhuma fonte.

O reconhecimento de 2026-10-01 (`docs/reconhecimento-fontes/fmi-irfcl-ouro.md`) achou o ouro no **IRFCL**, o relatório
de reservas que cada banco central entrega ao FMI todo mês, pela API SDMX nova do FMI. Também concluiu que não há
alternativa robusta e independente: o World Gold Council compila a partir do próprio FMI; o DBnomics (espelho aberto)
parou em ago/2025; e ir a cada banco central exigiria dezenas de fontes.

**Autorização:** o usuário autorizou em 2026-10-01 ("Sim, pode seguir"), **só aquisição de dados**: medir as compras é
trabalho do David (decisão do usuário, 2026-10-01).

**Licença:** a página de termos do FMI bloqueia acesso automático (403); o que segue vem dos trechos oficiais mostrados
por uma busca, não do texto completo. Uso livre, **inclusive comercial**, com a citação *"Source: International
Monetary Fund, International Reserves and Foreign Currency Liquidity"* e **sem alterar o dado**. Os termos restringem o
**download em massa por tecnologia automatizada** sem permissão. Não está claro se isso vale para a API pública, que o
FMI oferece justamente para acesso automatizado. O coletor faz **uma consulta por dia** a essa API, e o usuário aceitou
o risco, como fez com a ICE (ADR 0032). O texto completo dos termos deve ser lido à mão antes de exibir os dados a
terceiros.

## Evidência (chamadas reais, 2026-10-01)

- API: `api.imf.org/external/sdmx/3.0`, sem chave. A antiga (`dataservices.imf.org`) não responde mais.
- Indicadores: `IRFCLDT1_IRFCL56V_FTO` (volume de ouro) e `IRFCLDT1_IRFCL56_USD` (valor), setor `S1XS1311`
  (autoridades monetárias), o único que todos reportam.
- **88 países** (80 com dado em 2026) e 2 agregados (área do euro, BCE), mensal desde **dez/1999**, numa chamada só
  (~3 s). Não há total mundial.
- **Escala:** a API devolve o número em unidades e declara `SCALE = 6` em todas as séries (o FMI publica em milhões; o
  nome do indicador diz "gold volume in millions of fine troy ounces"). Os EUA: 261.499.000 onças, o número oficial.
- **Conferência de unidade** (valor ÷ volume = preço implícito, contra a mediana dos países no mês): 69 de 79 países
  consistentes em ago/2026. **Volume em unidade errada:** Brasil (1.000× maior, **desde mar/2026**; antes, certo),
  Angola (1.000×, desde out/2020) e Chile (aparentemente em quilos, desde fev/2026). **Valor contábil, volume certo:**
  EUA e Arábia Saudita (preço legal de US$ 42,22), Singapura, Coreia do Sul, Tunísia (até 2013) e Eslováquia (até
  2001).
- A resposta não informa data de atualização nem guarda versões.

## Decisão

1. **Coletor** `fmi-irfcl-ouro` (`collectors/fmi/fmi-irfcl-ouro.collector.js`), fonte `IMF_IRFCL`: uma consulta por
   dia com a série inteira dos 88 países. Séries `IMF.IRFCL.OURO.<PAIS>.VOLUME_MI_OZT` (milhões de onças troy) e
   `.VALOR_MI_USD` (US$ milhões), com o código de país do FMI (ISO alfa-3).
2. **Na escala que a fonte declara** (`SCALE`, lida de cada série, nunca fixada no código), arredondado às 6 casas da
   coluna `value`. Em unidades, o ouro da área do euro em US$ (~1,4 trilhão) estoura a coluna (até 10¹²). Uma escala
   diferente da conferida (6) vira item inválido.
3. **Defeito de unidade marcado, nunca corrigido:** o mês cujo preço implícito sai de 3× para cima ou para baixo da
   mediana do mês (com ao menos 5 países) é gravado como publicado, com `metadata.conferenciaPreco`, e um aviso por país
   vai para o detalhe da execução. Corrigir a escala seria alterar o dado, o que a licença proíbe e o FinMind não faz.
4. **Sem `published_at`:** vale o instante da coleta (ADR 0008), como na PSD do USDA (ADR 0031). O histórico desde 1999
   entra com a data da 1ª coleta; daí em diante, cada revisão vista vira versão nova.
5. **Card** "Ouro nas reservas dos bancos centrais (FMI)", com um item por país (seletor, como o da PSD do café) e o
   volume ou o valor no seletor de métrica. Destaque: a China; marcados, os maiores compradores recentes (China,
   Polônia, Índia, Turquia, Cazaquistão).

## Fora do escopo (de propósito)

- **Compras (variação do volume), soma mundial, ranking**: são medidas, e cabem ao David.
- **As demais linhas do IRFCL** (moedas, DES, posição no FMI) e os outros setores.
- **Corrigir** Brasil, Angola e Chile, ou buscar o volume certo deles em outra fonte.

## Resultado (2026-10-01, banco de dev)

- 1ª coleta: **43.513 valores**, 180 séries (88 países e 2 agregados, volume e valor), de dez/1999 a ago/2026, 0
  falhas; 10 avisos de conferência (2.176 valores marcados). 2ª coleta: **0 criados, 0 revisões**, 43.513 ignorados.
- O card responde "em dia": China, 76,08 milhões de onças em jul/2026.
- **Dois erros achados na validação, corrigidos antes do commit:** a 1ª versão gravava em unidades e estourou a coluna
  (`numeric field overflow`) depois de gravar 14.000 linhas, apagadas; a 2ª arredondava diferente do banco e gerava
  93 revisões falsas na 2ª coleta, também apagadas.

## Consequências e limitações

- **Sem vintage do passado:** uma leitura "o que se sabia em D" anterior à 1ª coleta não enxerga o dado.
- **A conferência só pega erro de unidade que aparece no preço implícito.** Um país que errasse volume e valor na mesma
  proporção passaria. E o preço contábil (EUA, Arábia Saudita) é marcado junto, embora ali o volume esteja certo: o
  aviso diz as duas possibilidades.
- **Cada país reporta no seu ritmo** (a China costuma vir um mês depois dos demais): o mês mais recente nunca está
  completo.
- **Licença:** ver "Contexto". Antes de exibir os dados a terceiros, ler os termos à mão e citar a fonte.
