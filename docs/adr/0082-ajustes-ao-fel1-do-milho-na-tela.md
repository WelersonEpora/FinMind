# 0082 — Os ajustes ao FEL 1 do milho na tela de metodologia, sem revisão do documento

**Status:** aceita (2026-10-06).

## Contexto

Na resposta às perguntas do FinMind (ADR 0055, P13), o David ficou de revisar o FEL 1 e enviar ao Comitê até
2026-10-15. No Motor do Milho v0 (2026-10-02, próximos passos), ele pediu correções na tabela dos fatores do milho
("Copea" para "Cepea"; câmbio com fonte BCB; etanol com fontes brasileiras, UNEM e ANP; reponderar o F4 para Alto e o
F6 para Baixo-Médio). As decisões do usuário de 2026-10-05 (ADRs 0067 a 0079) acrescentaram outras, e o status
reunia tudo em "Ajustes do FEL 1 no milho", para a próxima reunião com o David.

Em 2026-10-06, o David pediu ao usuário para seguir com isso: **ele não revisa o documento**. O usuário não quis um
documento formal fora do projeto (um `.docx` revisado): as mudanças devem estar definidas e visíveis na própria tela
de metodologia.

## Decisão (usuário, Welerson, 2026-10-06, por delegação do David)

1. **O FEL 1 fica como o David escreveu** (relatório v1.1 e `controle_fatores.xlsx`). Não há v1.2.
2. **Cada ajuste vive no fator, na tela de metodologia** (`/dados-mercado/metodologia/milho`): o card ganha a marca
   "Ajustado ao FEL 1", e a definição mostra o texto original riscado, o novo e a origem (quem decidiu, quando e o
   ADR). No código, `ajustesFel1` em `shared/metodologia-milho.js`, validado em `metodologia-base.js`: o texto
   original tem de ser o do `fel1` (ou, no peso, o do catálogo), senão é erro. Só na tela: não vai ao prompt, e o
   peso do FEL 1 que o prompt cita como referência não muda.

| Fator | Campo | No FEL 1 | Ajuste | Origem |
|---|---|---|---|---|
| F4 Dólar e paridade | Fonte | Cepea, Comex Stat | + BCB (PTAX) e IMEA (paridade de MT) | David (câmbio); P16 (paridade); ADRs 0057 e 0072 |
| F4 Dólar e paridade | Peso | Médio | Alto | David; ADRs 0065 e 0072 |
| F5 Etanol | Fonte | EIA, USDA | Sem mudança: UNEM e ANP não aprovadas | Usuário; ADR 0073, adendo |
| F6 Insumos | Fonte | Conab, IMEA | + Comex Stat (ureia importada) | Usuário; ADR 0074 |
| F6 Insumos | Peso | Médio | Baixo (Médio para vencimentos de 6 meses ou mais, com margem ≤ 0) | David ("Baixo-Médio"), na escala do FEL 1 pelo usuário; ADR 0065, adendo |
| F7 Fundos | Direção e mecanismo | "Amplifica" | Reversão nos extremos (P10 e P90 de 10 anos); fora deles, não vota | David (R-FUN v0); usuário; ADRs 0065 e 0075 |

   O "Copea" já estava corrigido no v1.1. Os meses que o calendário do David não definia (o F1 de janeiro a maio, o F2
   em janeiro e fevereiro, ADR 0077) ficam no card de pesos, marcados com †.
3. **As inconsistências do documento (P13 e P14)** não são corrigidas no arquivo: o status registra como o FinMind lê
   cada uma (seção "Como tratamos as considerações do FEL 1", em "Pronto"). A Seção 16 citada e inexistente deixa de
   ser pendência: o registro das mudanças são este ADR e os da metodologia.
4. **A pergunta sai.** A metodologia do milho vai à v20, sem pergunta do ativo pendente. A seção "Ajustes do FEL 1 no
   milho" sai da §4 do status (bloqueado) e vira a seção explicativa em "Pronto".

## Consequências

- Quem lê o FEL 1 precisa da tela para saber o que vale no milho; a seção do status aponta para ela.
- Um ajuste novo é uma entrada em `ajustesFel1` com a origem. Se o texto do `fel1` mudar, o teste acusa o ajuste que
  ficou sem chão.
- O campo é genérico (`metodologia-base.js`): o café, o petróleo e o ouro podem usá-lo quando houver ajuste ao FEL 1.
