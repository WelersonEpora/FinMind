# 0132 — Café, F7: os fundos só como informação no prompt e a janela de 10 anos como contexto

## Contexto

A análise "ANÁLISE CAFÉ 19out26" (resposta no `STATUS_DO_PROJETO.md`, §0) aponta no item **E4** que o F7 (posição dos
fundos no COT) vota alta forte porque os fundos estão no percentil 3,9 (vendidos em extremo), enquanto o próprio
histórico não sustenta a regra contrária. Pede: não inverter o sinal agora; rebaixar o fator a modificador
(`S_final = S_base × m`, com `m` entre 0,5 e 1,0); testar fora da amostra, por episódio, três versões (a) desligado,
(b) modificador e (c) sinal direto, seguindo o fluxo; a janela de 10 anos e a variação semanal da posição líquida; e as
posições por tipo de investidor na B3.

O ADR 0089 já tinha decidido que o extremo dos fundos é só informação: não muda a confiança da agregação nem da leitura
da IA. **Mas o prompt não refletia isso:** o bloco do fator ia como os dos fatores que votam, com "C — Leitura do
fator: Pressão: alta / Intensidade: forte" e o peso Médio (leitura do café de 2026-10-21, no servidor). A frase
"modificador de risco, sem voto próprio" ficava na nota, e o item 9 do prompt pedia para não contar o COT como voto. A
validação histórica do fator também tinha um texto fixo desatualizado ("Hoje (29/09/2026) … percentil 7,7").

**Quem decidiu:** o usuário, em 2026-10-21, com o mesmo poder de decisão do David (`CLAUDE.md`).

## Evidência (2026-10-21, banco do servidor)

**A janela.** Na semana de 13/10/2026 (publicada em 16/10), a líquida dos fundos era de +9,3% dos contratos em aberto
(comprados em termos líquidos): percentil **3,8 nos 3 anos** anteriores e **47,7 nos 10 anos**. O "vendido em extremo"
vem da janela de 3 anos, que tem o recorde de compra de fev/2025 (+37,5%).

**As três versões.** A posição publicada (sexta) contra o retorno do KC de Nova York (Yahoo, `KC=F`, ADR 0129; o dia de
cada rolagem zerado) nos 60 pregões seguintes, 2009 a 2026. Extremo = percentil abaixo de 10 ou de 90 para cima;
episódio = a 1ª semana de cada entrada no extremo, com 13 semanas fora dele antes (sem sobreposição).

| Janela de 3 anos | Todas as semanas | Extremo vendido (a regra diz alta) | Extremo comprado (a regra diz baixa) |
|---|---|---|---|
| 2009–2017 | +1,0%, subiu em 43% | −3,1%, 23% | −2,6%, 33% |
| 2018–2026 (fora da amostra) | +3,8%, 57% | +5,6%, 56% | +5,4%, 62% |
| Episódios, 2009–2026 | — | 4: −5,0%, 25% | 9: −1,3%, 44% |

- **(a) Desligado:** tão bom quanto as outras: fora da amostra, depois dos extremos, o retorno é o de todas as semanas.
- **(c) Seguir o fluxo:** aparece em 2009 a 2017 (vendido → caiu) e some em 2018 a 2026; 4 a 9 episódios não sustentam.
- **(b) Modificador:** precisa de um sinal base numérico, que a leitura não tem desde que a agregação em código saiu do
  prompt (ADR 0066, adendo); depende da §3 do documento (os pesos).
- **Janela de 10 anos:** vendido em extremo −1,5% em 60 pregões nas semanas (subiu em 30%), mas +4,9% nos 4 episódios;
  comprado +2,9% nas semanas e −3,2% nos 8 episódios: as semanas e os episódios se contradizem, nada estável. **Variação semanal da líquida:** sem relação (episódios: vendido −0,8%, comprado −2,1%; 23 e 25).

## Decisão

1. **O F7 vai ao prompt como INFORMAÇÃO** (`informativo` na metodologia do café, como os fundos do petróleo): sem a
   regra da pressão nem a pressão ("C — Papel na análise: INFORMAÇÃO, por decisão do usuário: sem pressão própria; não
   conta a favor nem contra"). A resposta da IA que o citar em `fatoresAFavor` ou `fatoresContra` é recusada; o papel
   continua em `posicionamentoCot`. O texto fixo desatualizado sai da validação histórica.
2. **O percentil nos 10 anos anteriores vai ao lado do de 3**, como contexto (fator v2; `anosJanelaContexto` no molde do
   COT, opcional: o milho e os outros ficam como estão). A janela da posição relativa segue 3 anos (ADR 0089).
3. **Prompt do café v10:** o item 9 diz que o F7 é informação, fora de `fatoresAFavor` e `fatoresContra`, e como ler as
   duas janelas (um extremo só na de 3 anos pode ser efeito de um recorde recente).
4. **Fora:** as posições por tipo de investidor na B3 (fonte nova, e o ICF é pouco líquido); o modificador numérico
   fica com a §3 do documento.

## Consequências

- A IA deixa de receber "alta forte" do F7. A leitura diária do café muda a partir da primeira depois do deploy.
- A agregação em código, só na tela de metodologia (ADR 0066), continua com o F7 como modificador.
