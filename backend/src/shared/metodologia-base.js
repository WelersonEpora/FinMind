"use strict";

const { FATORES } = require("./fatores-fel1");

// A estrutura comum da metodologia dos fatores de um ativo (ADR 0050): cada ativo tem um módulo só com as definições
// dos fatores (`metodologia-<ativo>.js`), e este monta o que a tela e o motor usam. Uma definição tem:
//   codigo   - o código do fator no catálogo do FEL 1 (`fatores-fel1.js`), de onde vêm o nome e o peso.
//   fel1     - o que o David escreveu no FEL 1 (a tabela "Fatores de Influência de Preço" do ativo), sem reescrever:
//              tipo, direção do impacto, mecanismo de transmissão e fonte.
//   dados    - o que o FinMind já coleta para o fator (cards do catálogo de observáveis) e as lacunas conhecidas.
//              É fato, não proposta. `avaliacao` (opcional): se o dado basta para o fator, com a evidência do histórico
//              (o FEL 1 foi escrito com apoio de IA: um requisito dele pode não ser necessário).
//   proposta - um rascunho do fator nas três camadas do motor (ADR 0050): a medida (A. Medir), a
//              comparação (B. Ler) e um esboço da leitura (C. Decidir, só o Comitê), escrito para abrir caminho e ser
//              corrigido. Fica com `situacao: "PROPOSTA"` até o David validar; aí vira "VALIDADA", com a validação do
//              ativo (3º parâmetro de `montarFatores`: quem, quando e o ADR) em `validacao`. Opcionais: `autoria` (de quem é a proposta, quando não
//              é do FinMind: ex.: o Motor do Milho v0 do David) e `regrasEspecialista` ({ alta, baixa }: as regras como
//              o especialista as escreveu, sem reescrever).
//   perguntas - o que o David precisa decidir para a proposta virar regra.
//   nome     - (opcional) o título do fator quando o dado usado é mais estreito que o nome da planilha (ex.: o FEL 1
//              diz "Demanda global", o cálculo usa só os EUA). O título diz exatamente o que entra no cálculo; o nome
//              do FEL 1 continua na resposta (`nomeFel1`) e no bloco do especialista na tela.
//   evento   - (opcional) { janelaDias }: FATOR DE EVENTO, cuja condição é o próprio evento (a geopolítica; com cálculo,
//              a OPEP+ e o F8 do milho). O resultado dele são os eventos aceitos da leitura diária marcados com ele nessa
//              janela (geopolitica.service.js::obterEventosDoFator), o bloco que vai ao prompt da IA do ativo como está.
//              Os eventos dos OUTROS fatores vão numa seção só, na base do prompt (ADR 0095).
//   janelaEventos - (opcional) a janela, em dias, dos eventos marcados com este fator na seção de eventos da base, quando
//              não é a padrão (JANELA_EVENTOS_PADRAO; ex.: 30 na demanda do café, decisão do Comitê). Não num fator de
//              evento.
//   contextoDe - (opcional) o código de outro fator do mesmo ativo: FATOR DE CONTEXTO, por decisão do especialista. O
//              cálculo (A e B) continua e vai ao prompt, mas sem leitura própria (nem pressão, nem intensidade): ele
//              explica o outro fator e não conta a favor nem contra (ex.: a inflação do ouro, contexto do juro real,
//              ADR 0054).
//   informativo - (opcional) true: FATOR SÓ DE INFORMAÇÃO, como o de contexto, mas sem explicar um fator específico
//              (ex.: os fundos do petróleo, cujo extremo não mostrou reversão nem continuação no histórico, ADR 0094).
//              O cálculo vai ao prompt com a tendência, sem pressão, e não conta a favor nem contra. Não se combina com
//              `contextoDe`.
//   papelDecididoPor - (opcional, com `contextoDe` ou `informativo`) quem decidiu esse papel sem pressão, como o texto
//              do prompt o diz: "do especialista" (padrão, o David) ou "do usuário" (ex.: o refino, ADR 0093).
//   efeitoDefasado - (opcional) { mesesMin, mesesMax, sobre }: SINAL DEFASADO, pela regra do especialista (ex.: o F6 do
//              milho age sobre a safrinha seguinte, de 6 a 12 meses depois). O bloco do fator no prompt ganha a data de
//              efeito esperada, contada do período do dado (texto-prompt.js).
//   decisoes - (opcional) o que o especialista já decidiu sobre o fator, com a data e o ADR: sai das `perguntas`.
//   ajustesFel1 - (opcional) o que muda na tabela do FEL 1 sem reescrever o `fel1` (o milho, ADR 0082): cada um
//              { campo, noFel1, ajuste, origem }; `campo` é um dos de CAMPOS_FEL1, `noFel1` o texto como está (conferido
//              contra o `fel1` ou, no peso, o catálogo: a tela nunca mostra um "de" que não existe) e `origem` quem
//              decidiu, quando e o ADR. Só na tela: não vai ao prompt.
// O cálculo de um fator (camadas A, B e C simulada) fica em `factors/` e é ligado a ele em metodologia-ativo.service.js.
//
// Além dos fatores, cada ativo tem o que vale para o ATIVO e não para um fator (`doAtivo`): o preço de referência (o
// instrumento operado), o formato da leitura da IA, o peso e a agregação dos fatores, a validação dos eventos. Mesmo
// formato dos fatores: `decisoes` (o que já foi decidido, com quem, a data e o ADR) e `perguntas` (o que o especialista
// ainda decide). Uma pergunta respondida sai das `perguntas` e vira decisão. Não vai ao prompt: não muda a `versao`.
//
// E os pesos e as relações entre os fatores (`pesos`, opcional): o que o especialista definiu além do peso do FEL 1.
// Hoje só o milho tem calendário (Motor do Milho v0, Seções 3 e 4). Só vai ao prompt com `noPrompt` (abaixo); sem ele,
// a IA recebe só o peso do FEL 1.
//   autoria    - de quem é a definição. `descricao`: o que ela diz do peso, em uma frase (a abertura da seção).
//   fatores    - por código: `sugestao` (o peso-base que o especialista sugere no lugar do FEL 1, como escrito) e UM de:
//                `meses` ({ Alto: [7], Médio: [6, 8] }: os meses de 1 a 12 de cada peso; mês fora de todos = não
//                definido, nunca preenchido por inferência), `fixo` (o mesmo peso o ano todo, sem calendário) ou `papel`
//                (o fator não tem peso próprio, ex.: multiplica o dos outros). `condicoes` ({ texto, meses }) e `notas`.
//                `mesesDecididos` (opcional, com `meses`): { origem, meses: { Baixo: [1, 2] } }, o peso dos meses que o
//                especialista não definiu, decidido depois por quem pode (o usuário, num ADR); cada um sai com
//                `decididoPor` (a origem), para a tela e o prompt não o atribuírem ao especialista.
//   relacoes   - { descricao, simbolos: [{ simbolo: "++", significado: "forte" }, ...] (a legenda, na ordem), matriz: { CODIGO: [o símbolo contra cada fator, na ordem do
//                ativo; null na diagonal] }, observacoes, leitura }. Simétrica: um símbolo diferente entre A×B e B×A
//                é erro de transcrição.
//   pares      - (opcional, no lugar da matriz ou junto) as relações por par: { fatores: [A, B], sentido, canal,
//                defasagem, tratamento, noPrompt? }, como o especialista escreveu; `noPrompt`: o item do prompt diário e a
//                frase que leva o par (o café, ADR 0062); `notaPares`, uma ressalva sobre elas.
//   agregacao  - as regras de agregação, cada uma { tema, tratamento, fatores, noFinMind: { situacao, texto } }:
//                como a regra está hoje no FinMind (orientação no prompt, parcial ou fora do motor).
//   noPrompt   - (opcional) { autorizacao, mesSemDefinicao }: o calendário vai ao prompt diário como uma tabela fixa (o
//                milho, ADR 0065), com quem autorizou e o que vale no mês que o especialista não definiu. Mudar o que vai
//                ao prompt sobe a `versao` da metodologia.
//   agregacaoFinMind - (opcional) a proposta de agregação em código do FinMind, separada da do especialista (o café,
//                ADR 0066): { versao, situacao, adr, descricao, horizontes, familias: [{ codigo, rotulo,
//                fatores, magnitudeFel1, pesos: { HORIZONTE: % }, composicao }], modificador, regras: [{ regra,
//                origem: DAVID | DERIVADA | PROPOSTA, fonte, prompt }] }; `prompt`: a frase exata que vai ao prompt. Vem do agregador (factors/agregacao/), nunca escrita à mão.

const SITUACAO = { PROPOSTA: "PROPOSTA", VALIDADA: "VALIDADA" };
// A validação dos motores dos quatro ativos, na reunião de 2026-10-07: como estavam, com as decisões já registradas.
const VALIDACAO_MOTORES = Object.freeze({ por: "Comitê, com o David", data: "2026-10-07", adr: "ADR 0108" });
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const PESOS = ["Alto", "Médio", "Baixo"];
const SITUACAO_AGREGACAO = { ORIENTACAO: "ORIENTACAO", PARCIAL: "PARCIAL", FORA: "FORA" };
// A origem de cada regra da agregação do FinMind (ADR 0066): do especialista, derivada do estudo, ou proposta do FinMind.
const ORIGENS_REGRA = ["DAVID", "DERIVADA", "PROPOSTA"];

// Os campos da tabela do FEL 1 que um ajuste pode mudar: o rótulo na tela -> onde está o texto original.
const CAMPOS_FEL1 = Object.freeze({
  Tipo: (fator, fel1) => fel1.tipo,
  "Direção do impacto": (fator, fel1) => fel1.direcao,
  "Mecanismo de transmissão": (fator, fel1) => fel1.mecanismo,
  Fonte: (fator, fel1) => fel1.fonte,
  Peso: (fator) => fator.peso
});

function montarAjustesFel1(fator, definicao) {
  return (definicao.ajustesFel1 || []).map((ajuste) => {
    const original = CAMPOS_FEL1[ajuste.campo];
    if (!original) throw new Error(`${fator.codigo}: campo de ajuste ao FEL 1 desconhecido: ${ajuste.campo}`);
    if (!ajuste.ajuste || !ajuste.origem) throw new Error(`${fator.codigo}: ajuste ao FEL 1 sem o ajuste ou a origem (${ajuste.campo})`);
    if (ajuste.noFel1 !== original(fator, definicao.fel1)) {
      throw new Error(`${fator.codigo}: o ajuste de "${ajuste.campo}" não parte do texto do FEL 1: ${ajuste.noFel1}`);
    }
    return { campo: ajuste.campo, noFel1: ajuste.noFel1, ajuste: ajuste.ajuste, origem: ajuste.origem };
  });
}

// As definições de um ativo -> os fatores com o nome e o peso do FEL 1. Um código fora do catálogo, ou de outro
// ativo, é erro de programação. `validacao` (opcional): { por, data, adr }, o motor do ativo validado por inteiro (o
// Comitê, com o David, em 2026-10-07, ADR 0108): todos os fatores saem como VALIDADA, com ela.
function montarFatores(ativo, definicoes, validacao = null) {
  if (validacao && (!validacao.por || !validacao.data || !validacao.adr)) throw new Error(`${ativo}: validação sem quem, quando ou o ADR`);
  const situacao = validacao ? { situacao: SITUACAO.VALIDADA, validacao } : { situacao: SITUACAO.PROPOSTA };
  return definicoes.map((definicao) => {
    const fator = FATORES.find((item) => item.codigo === definicao.codigo);
    if (!fator || fator.ativo !== ativo) throw new Error(`Fator ausente no catálogo do FEL 1 para ${ativo}: ${definicao.codigo}`);
    if (definicao.contextoDe && !definicoes.some((outra) => outra.codigo === definicao.contextoDe && !outra.contextoDe && !outra.informativo)) {
      throw new Error(`${definicao.codigo}: contexto de um fator que não está no ativo (ou que também é contexto): ${definicao.contextoDe}`);
    }
    if (definicao.informativo && definicao.contextoDe) throw new Error(`${definicao.codigo}: informativo e contexto ao mesmo tempo`);
    if (definicao.janelaEventos && definicao.evento) throw new Error(`${definicao.codigo}: fator de evento não tem janela na seção de eventos da base`);
    return {
      codigo: fator.codigo,
      nome: definicao.nome || fator.nome,
      nomeFel1: fator.nome,
      peso: fator.peso,
      fel1: definicao.fel1,
      dados: definicao.dados,
      proposta: { ...situacao, ...definicao.proposta },
      perguntas: definicao.perguntas,
      decisoes: definicao.decisoes || [],
      ajustesFel1: montarAjustesFel1(fator, definicao),
      evento: definicao.evento || null,
      janelaEventos: definicao.janelaEventos || null,
      contextoDe: definicao.contextoDe || null,
      informativo: definicao.informativo === true,
      papelDecididoPor: definicao.contextoDe || definicao.informativo ? definicao.papelDecididoPor || "do especialista" : null,
      efeitoDefasado: definicao.efeitoDefasado || null
    };
  });
}

// O que vale para o ativo inteiro (ver acima). As duas listas são obrigatórias: vazia é "nada decidido" ou "nada
// pendente", não esquecimento.
function montarDoAtivo(ativo, doAtivo) {
  if (!doAtivo || !Array.isArray(doAtivo.decisoes) || !Array.isArray(doAtivo.perguntas)) {
    throw new Error(`${ativo}: a metodologia precisa de doAtivo com as listas decisoes e perguntas`);
  }
  return { decisoes: [...doAtivo.decisoes], perguntas: [...doAtivo.perguntas] };
}

// { Alto: [7], Médio: [6, 8] } -> os 12 meses (janeiro primeiro), cada um { peso, condicao } ou null (não definido).
function mesesDoFator(codigo, meses, condicoes = [], decididos = null) {
  const lista = Array(12).fill(null);
  const preencher = (porPeso, decididoPor) => {
    for (const [peso, numeros] of Object.entries(porPeso)) {
      if (!PESOS.includes(peso)) throw new Error(`${codigo}: peso desconhecido no calendário: ${peso}`);
      for (const mes of numeros) {
        if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error(`${codigo}: mês inválido: ${mes}`);
        if (lista[mes - 1]) throw new Error(`${codigo}: o mês ${mes} tem dois pesos`);
        lista[mes - 1] = decididoPor ? { peso, condicao: null, decididoPor } : { peso, condicao: null };
      }
    }
  };
  preencher(meses, null);
  if (decididos) {
    if (!decididos.origem) throw new Error(`${codigo}: mesesDecididos sem a origem`);
    preencher(decididos.meses, decididos.origem);
  }
  for (const { texto, meses: numeros } of condicoes) {
    for (const mes of numeros || []) {
      if (!lista[mes - 1]) throw new Error(`${codigo}: condição num mês sem peso: ${mes}`);
      lista[mes - 1].condicao = texto;
    }
  }
  return lista;
}

// O peso de cada fator: o do FEL 1 (o que vai ao prompt) e, se o especialista definiu, a sugestão dele, o calendário
// (ou o peso fixo, ou o papel) e as notas. `F1`...`Fn` na ordem do ativo, como o especialista numera.
function montarPesoFator(fator, indice, definicao) {
  const base = { codigo: fator.codigo, sigla: `F${indice + 1}`, nome: fator.nome, pesoFel1: fator.peso };
  if (!definicao) return { ...base, sugestao: null, meses: null, fixo: null, papel: null, condicoes: [], noPrompt: [], notas: [] };
  const formas = ["meses", "fixo", "papel"].filter((chave) => definicao[chave]);
  if (formas.length !== 1) throw new Error(`${fator.codigo}: o peso precisa de um entre meses, fixo e papel`);
  if (definicao.fixo && !PESOS.includes(definicao.fixo)) throw new Error(`${fator.codigo}: peso fixo desconhecido: ${definicao.fixo}`);
  const condicoesSemMes = (definicao.condicoes || []).filter((c) => !c.meses).map((c) => c.texto);
  const sigla = base.sigla;
  // O que do fator vai ao prompt além do peso do mês, linha a linha, como vai (ADR 0065): as condições com os meses e as
  // sem mês. O prompt (prompt-diario.service.js::blocoPesos) e a tela (coluna "Hoje no FinMind") usam estas linhas.
  const comMes = (definicao.condicoes || [])
    .filter((c) => c.meses)
    .map((c) => `${sigla} (${c.meses.map((m) => MESES_CURTOS[m - 1]).join(", ")}): ${c.texto}`);
  return {
    ...base,
    sugestao: definicao.sugestao || null,
    meses: definicao.meses ? mesesDoFator(fator.codigo, definicao.meses, definicao.condicoes, definicao.mesesDecididos) : null,
    fixo: definicao.fixo || null,
    papel: definicao.papel || null,
    condicoes: condicoesSemMes,
    noPrompt: [...comMes, ...condicoesSemMes.map((texto) => `${sigla}: ${texto}`)],
    // Só a explicação do especialista: as condições estão em `noPrompt`.
    notas: definicao.notas || []
  };
}

// A matriz de relações: uma linha por fator do ativo, com um símbolo conhecido por coluna, e simétrica.
function validarRelacoes(ativo, codigos, relacoes) {
  const simbolos = new Set(relacoes.simbolos.map((item) => item.simbolo));
  const linhas = Object.keys(relacoes.matriz);
  if (linhas.length !== codigos.length || !codigos.every((c) => linhas.includes(c))) {
    throw new Error(`${ativo}: a matriz de relações precisa de uma linha por fator do ativo`);
  }
  codigos.forEach((a, i) => {
    const linha = relacoes.matriz[a];
    if (linha.length !== codigos.length) throw new Error(`${a}: a linha da matriz precisa de ${codigos.length} colunas`);
    codigos.forEach((b, j) => {
      if (i === j) {
        if (linha[j] !== null) throw new Error(`${a}: a diagonal da matriz é null`);
        return;
      }
      if (!simbolos.has(linha[j])) throw new Error(`${a} × ${b}: símbolo desconhecido: ${linha[j]}`);
      if (linha[j] !== relacoes.matriz[b][i]) throw new Error(`${a} × ${b}: a matriz não é simétrica`);
    });
  });
}

function montarPesos(ativo, fatores, pesos) {
  const codigos = fatores.map((f) => f.codigo);
  const definicoes = pesos?.fatores || {};
  const fora = Object.keys(definicoes).filter((codigo) => !codigos.includes(codigo));
  if (fora.length) throw new Error(`${ativo}: peso de fator fora do ativo: ${fora.join(", ")}`);
  if (pesos?.relacoes) validarRelacoes(ativo, codigos, pesos.relacoes);
  for (const par of pesos?.pares || []) {
    if (par.fatores.length !== 2 || par.fatores.some((codigo) => !codigos.includes(codigo))) {
      throw new Error(`${ativo}: relação por par com fator fora do ativo: ${par.fatores.join(" × ")}`);
    }
  }
  if (pesos?.noPrompt && !(pesos.noPrompt.autorizacao && pesos.noPrompt.mesSemDefinicao)) {
    throw new Error(`${ativo}: pesos no prompt sem a autorização ou sem a regra do mês não definido`);
  }
  const proposta = pesos?.agregacaoFinMind;
  if (proposta) {
    const foraDoAtivo = proposta.familias.flatMap((f) => f.fatores).concat(proposta.modificador ? [proposta.modificador.fator] : []).filter((c) => !codigos.includes(c));
    if (foraDoAtivo.length) throw new Error(`${ativo}: agregação do FinMind com fator fora do ativo: ${foraDoAtivo.join(", ")}`);
    if (proposta.regras.some((r) => !ORIGENS_REGRA.includes(r.origem))) throw new Error(`${ativo}: agregação do FinMind com regra sem origem`);
    if (proposta.regras.some((r) => !r.prompt)) throw new Error(`${ativo}: agregação do FinMind com regra que não vai ao prompt`);
  }
  for (const regra of pesos?.agregacao || []) {
    const desconhecidos = regra.fatores.filter((codigo) => !codigos.includes(codigo));
    if (desconhecidos.length) throw new Error(`${ativo}: agregação "${regra.tema}" com fator fora do ativo: ${desconhecidos.join(", ")}`);
    if (!SITUACAO_AGREGACAO[regra.noFinMind?.situacao]) throw new Error(`${ativo}: agregação "${regra.tema}" sem a situação no FinMind`);
  }
  return {
    autoria: pesos?.autoria || null,
    descricao: pesos?.descricao || null,
    // Do especialista e não aprovado pelo Comitê enquanto não houver decisão registrada.
    situacao: pesos ? SITUACAO.PROPOSTA : null,
    fatores: fatores.map((fator, i) => montarPesoFator(fator, i, definicoes[fator.codigo])),
    relacoes: pesos?.relacoes || null,
    pares: pesos?.pares || [],
    notaPares: pesos?.notaPares || null,
    agregacao: pesos?.agregacao || [],
    noPrompt: pesos?.noPrompt || null,
    agregacaoFinMind: proposta || null
  };
}

// A metodologia de um ativo, como o serviço a entrega: `versao` sobe quando uma definição de fator muda (vai com cada
// prompt).
// A seção de eventos da base do prompt (ADR 0095): a janela padrão, a de cada fator que tem outra, e os fatores de
// evento, cujos eventos ficam no bloco deles.
const JANELA_EVENTOS_PADRAO = 7;

function montarEventosDoAtivo(fatores) {
  return {
    janelaDias: JANELA_EVENTOS_PADRAO,
    janelaPorFator: Object.fromEntries(fatores.filter((f) => f.janelaEventos).map((f) => [f.codigo, f.janelaEventos])),
    excluirFatores: fatores.filter((f) => f.evento).map((f) => f.codigo)
  };
}

function montarMetodologia({ ativo, nome, versao, dataVersao, doAtivo, fatores, pesos = null }) {
  return {
    ativo,
    nome,
    versao,
    dataVersao,
    doAtivo: montarDoAtivo(ativo, doAtivo),
    pesos: montarPesos(ativo, fatores, pesos),
    eventosDoAtivo: montarEventosDoAtivo(fatores),
    fatores
  };
}

module.exports = { SITUACAO, VALIDACAO_MOTORES, SITUACAO_AGREGACAO, JANELA_EVENTOS_PADRAO, montarFatores, montarMetodologia };
