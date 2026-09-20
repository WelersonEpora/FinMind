# 0010 — Desenho futuro: experimento LLM sobre dados point-in-time

**Status: proposta — NADA disto está implementado.** Registrado para que a camada
`observation` (ADR 0008) não seja desenhada de forma a impedir este experimento.
`CLAUDE.md` continua valendo: uma resposta de IA nunca dispara uma ação sozinha e
nenhuma execução de ordens existe.

## Pipeline alvo

```
FONTES → documentos históricos → CORPUS CONGELADO ─┐
observation (asOf) → fatores (versionados) ────────┼→ asOf(D) → LLM → decisão estruturada → avaliação
                                                    ┘
```

## Regras que valem desde já

- **IA por fonte, nunca por observação.** Nº de chamadas de IA cresce com o número de
  fontes, não com o volume de dados.
- **Nunca** usar LLM/AI Search para gerar ou reconstruir séries numéricas, nem para
  substituir uma API estruturada. AI Search serve para descobrir/reconhecer fontes
  (erro barato: confere-se chamando a API).
- Corpus textual: começar por **documentos oficiais arquivados** (WASDE, Crop Progress,
  COT, comunicados do FOMC — têm data de publicação exata e são imutáveis). Notícias de
  imprensa só **daqui para frente**, capturadas com snapshot + hash no dia em que saem;
  busca ao vivo com filtro `before:D` **não** é válida (índice de hoje, páginas editadas,
  viés de sobrevivência).
- O corpus é **construído e congelado pelo FinMind**, com `published_at` próprio — mesma
  regra da tabela `observation` (ver ADR 0008).

## Braços do experimento

A) baseline determinístico · B) LLM + dados estruturados · C) B + documentos oficiais ·
D) futuramente, C + notícias capturadas e congeladas.

## O que cada decisão da IA deve registrar (para reproduzir)

`model_id` (snapshot datado, nunca alias), parâmetros, `prompt_hash`, hash da entrada,
resposta bruta, decisão estruturada (direção, confiança, horizonte, tese, fatores +/-,
condição de invalidação, **magnitude esperada**), observáveis/fatores fornecidos (com
`published_at`), documentos fornecidos e timestamp. Cache por hash da entrada: refazer a
análise não repaga a primeira passada.

## Cuidados metodológicos já conhecidos

- O out-of-sample de um LLM é definido pelo **knowledge cutoff do modelo**, não pela data.
  Testar sempre a ablação *identificada × anonimizada* (sem data absoluta nem nome do ativo);
  se o desempenho cai, é memória e não raciocínio.
- N efetivo ≠ N nominal: espaçar as datas de decisão pelo horizonte.
- Baselines obrigatórios: buy-and-hold, sempre-neutro, regra determinística simples e
  aleatório com a mesma distribuição de direções. Medir calibração (Brier), não só acurácia.
- Separar desenvolvimento do prompt, validação e teste; **contar** as versões de prompt
  testadas e congelar antes do teste final.
- Reportar sempre o modo do `asOf` usado (padrão × `estrito`) e o % de observações estimadas.
