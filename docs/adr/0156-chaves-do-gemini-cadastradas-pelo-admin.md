# 0156 — As chaves do Gemini cadastradas pelo admin, no banco e cifradas

## Contexto

Desde o ADR 0047, as duas chaves do Gemini, a gratuita (`GEMINI_API_KEY_FREE`, tentada primeiro) e a paga
(`GEMINI_API_KEY`, a reserva e a única da recomendação das carteiras, ADR 0127), ficavam no `.env` do servidor. Trocar
uma chave pedia acesso à VM e um novo deploy, e a cobrança da IA ficava com quem tinha montado o `.env`.

Em 2026-11-13, o usuário pediu que o admin de plataforma cadastre a chave na tela e que a cobrança da IA vá para ele,
com **uma chave para toda a plataforma** por enquanto. Decisões do usuário, na mesma data:

1. **Duas chaves**, uma gratuita e uma paga, como hoje.
2. **O modelo e os preços continuam no `.env`** (`GEMINI_MODEL`, `GEMINI_MODEL_RECOMENDACAO` e os preços da
   recomendação): trocar o modelo da recomendação abre um segmento novo da medição (ADR 0127), e a troca não deve
   ficar a um clique.
3. **Sem reserva no `.env`:** o banco é a única fonte das chaves. Com a reserva, uma chave removida na tela continuaria
   em uso, cobrada de quem montou o `.env`, sem que a tela mostrasse isso. Para a transição, uma importação única copia
   as chaves do `.env` para o banco.

A cobrança não passa pelo código: o Google cobra o projeto do Google Cloud dono da chave. Trocar a chave paga troca quem
paga.

## Decisão

- **Onde ficam:** na tabela GLOBAL `system_setting` (já existente, sem uso até aqui; ADR 0007), uma linha por tipo
  (`gemini.api_key_free` e `gemini.api_key`), sem migration. O valor é um JSON com a chave **cifrada** (AES-256-GCM,
  `shared/utils/cifra.js`), os 4 últimos caracteres e o id de quem cadastrou; o `updated_at` da linha diz quando.
- **O segredo mestre** da cifra é `CONFIG_ENCRYPTION_KEY`, só no `.env` (sugestão: `openssl rand -base64 32`). Sem ele,
  a tela não grava chave; se ele for trocado ou perdido, as chaves gravadas deixam de abrir (ficam como não cadastradas,
  com um aviso no log) e são cadastradas de novo na tela.
- **Leitura:** `configuracao-ia.service.js::obterConfigGemini` junta as chaves do banco ao modelo e ao timeout do
  `.env`. O provedor (`ai/gemini-search.provider.js`) e a recomendação das carteiras a chamam **a cada chamada**: uma
  chave trocada na tela vale na chamada seguinte, inclusive no processo da coleta e no das carteiras.
- **API**, só admin de plataforma (`requireRole("admin")`): `GET /api/v1/configuracoes/ia` (a situação: cadastrada ou
  não, o final, quando e por quem; **a chave nunca volta**), `PUT /api/v1/configuracoes/ia/chaves/:tipo` (`{ apiKey }`;
  `tipo` é `gratuita` ou `paga`) e `DELETE` na mesma rota. O `PUT` testa a chave no Gemini antes de gravar (a lista de
  modelos, sem gerar nada nem gastar tokens) e recusa a que o Google não aceita; limite de 10 por usuário em 10 minutos.
- **Tela:** o card "Chaves do Gemini" na tela Configuração (Sistema), só para o admin: o estado de cada chave, o campo
  para colar a nova (tipo senha), "Testar e salvar" e "Remover".
- **Coletores de IA** (os eventos de mercado e a leitura de tendência): registrados **sempre**. Sem chave, a execução
  pula com um aviso ("Nenhuma chave do Gemini cadastrada"), sem falhar. A recomendação das carteiras, sem a chave paga,
  segue no fallback "manter" (`SEM_CHAVE_PAGA`), como antes.
- **Status dos módulos:** "Integração com IA" passa a dizer se há chave cadastrada no banco.
- **Transição:** `npm run importar:chaves-gemini` copia `GEMINI_API_KEY_FREE` e `GEMINI_API_KEY` do `.env` para o banco,
  cifradas, só para o tipo ainda sem chave (nunca sobrescreve uma cadastrada na tela). Depois disso, as duas variáveis
  podem sair do `.env`: o código não as lê mais.

## Consequências

- O admin troca a chave sem acesso à VM, e a cobrança vai para o dono da chave paga cadastrada.
- No servidor, antes do cron da madrugada seguinte ao deploy: `CONFIG_ENCRYPTION_KEY` no `.env` e a importação (ou o
  cadastro na tela). Sem isso, as leituras da IA do dia pulam, com o aviso na tela Execuções.
- Uma chave por plataforma. Chave por espaço ou por usuário (cada um pagando a sua) fica para quando houver a demanda;
  seria uma tabela PRIVADA ou USER, não esta.
- O processo de uma chamada lê duas linhas do banco a mais; com dezenas de chamadas por dia, sem custo que justifique
  um cache.

## Alternativas consideradas

- **O `.env` como reserva:** descartada pelo usuário (item 3 do contexto): duas fontes, e a cobrança podendo ficar com
  quem a tela não mostra.
- **A chave em claro no banco:** descartada; um dump do banco (o backup diário, ADR 0026) entregaria a chave.
- **O modelo editável na tela:** descartado (item 2): mexe na medição da recomendação.
