# 0114 — Soja, fase 1: a soja da Conab (Boletim da Safra de Grãos)

**Status:** aceita (2026-10-08).

## Contexto

A fase 1 da soja, só aquisição de dados, foi autorizada pelo usuário em 2026-10-08 (ADR 0109), com as fontes da §2.13
da proposta (`docs/proposta-ativo-soja.md`). Na proposta, a Conab é a confirmação da safra brasileira no F2 (oferta da
América do Sul); a estimativa do fator é o WASDE (ADR 0111). Nada vai ao motor.

O milho da Conab já é coletado (ADR 0017), da mesma planilha mensal de cada levantamento, que traz também a soja.

## Reconhecimento (`docs/processo-reconhecimento-fontes.md`)

A fonte passou pelo reconhecimento no ADR 0017 (e no 0016); as 11 perguntas não mudam com outras abas da mesma planilha.
Conferido de novo nos 15 levantamentos do índice (fev/2025 a set/2026), em 2026-10-08:

- **Aba "Soja":** o layout das abas do milho (região/UF, três blocos de área, produtividade e produção, com duas safras
  e a variação), uma safra só (a soja não tem 1ª, 2ª e 3ª). O leitor das abas do milho a lê sem mudança.
- **Aba "Suprimento - Soja":** o balanço da soja NÃO está no bloco da aba "Suprimento" do milho: tem aba própria,
  **transposta** (as safras nas colunas, de 2020/21 até a corrente; um item por linha), em três blocos numerados: "1.
  Soja em grão" (estoque inicial, produção, importação, sementes/outros, exportação, processamento e estoque final), "2.
  Farelo" e "3. Óleo". Todas as safras da aba são reestimadas a cada levantamento. A nota "Estimativa em <mês>/<ano>"
  do rodapé confere com o mês da publicação nos 15.
- A produção do Brasil é a mesma nas duas abas (180.406,6 mil t em set/2026). Os 15 lidos sem erro.

## Decisão

1. O parser ganha o produto (`PRODUTOS` em `conab-milho.parser.js`: as abas de safra, a aba do balanço e o leitor dela)
   e um leitor novo, `extrairBalancoSoja`, para a aba transposta (só o grão, como no WASDE). O coletor vira fábrica
   (`criarColetorConab`). O do milho não muda: o mesmo código, a mesma fonte e as mesmas séries. O script de carga
   aceita `--produto` (padrão milho); `backfill:conab-soja` é o da soja. Os nomes dos arquivos continuam com "milho"
   (como o café, que tem coletor próprio, a Conab de grãos fica onde está).
2. **Soja:** coletor `conab-soja`, fonte própria `CONAB_LEVANTAMENTO_SAFRAS_SOJA` (pelo motivo do ADR 0111), séries
   `CONAB.SOJA.<REGIAO>.<METRICA>_TOTAL` e `CONAB.SOJA.BALANCO.<ITEM>`, em mil t, mil ha e kg/ha, como publicadas.
3. Dois cards: "Soja por UF (Conab)" e "Soja - balanço nacional (Conab)".

## Consequências

- Dois cards novos (82 no total). Nenhum fator, nenhuma regra: a soja continua fora do motor (ADR 0109).
- No servidor, a carga é `npm run backfill:conab-soja` (15 levantamentos, ~1 minuto), **antes da 1ª coleta diária
  depois do deploy** (a mesma trava do milho).
- Com isto, a fase 1 tem todas as fontes de dados da §2.13; falta a frente dos eventos (a leitura diária por IA), que
  precisa de configuração própria (fontes e tipos de evento da soja) e será discutida antes.
