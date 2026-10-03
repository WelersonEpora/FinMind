"use strict";

const geopoliticaRepository = require("../repositories/geopolitica.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");
const { validarPaginacao } = require("../shared/utils/pagination");
const { FONTES, CODIGOS, fontesDaPesquisa } = require("../collectors/geopolitica/fontes-autorizadas");
const { ATIVOS, ROTULO_ATIVO, TIPOS, CODIGOS_TIPO, frenteDoAtivo } = require("../shared/eventos-mercado");
const { nomeDoFator } = require("../shared/fatores-fel1");

// Entrega a leitura diária de eventos de mercado (ADRs 0047 e 0049) ao Motor e às telas. Para o Motor, o bloco
// "EVENTOS DE MERCADO — <ATIVO>" que entra no prompt do ativo como contexto: o nível e o resumo do dia e os eventos
// aceitos (sustentados por página de fonte autorizada), cada um com o tipo, o fator do FEL 1, o canal, a pressão, a
// intensidade, a confiança, o resumo e as fontes. Os rejeitados ficam só na tela. Os eventos são uma camada
// complementar aos observáveis: não mexem em nenhuma série.
//
// Sem leitura na data (ou numa leitura anterior ao ADR 0049, que não tinha o milho e o café), o bloco diz
// "indisponível", nunca "normal": uma coleta que falhou não pode virar, no prompt, um sinal de calmaria. A leitura é de
// UMA data: não se usa a de ontem no lugar da de hoje.
//
// O peso disso na análise é decidido pela IA do ativo e pelas regras do David, não aqui.

const NIVEL_EXIBICAO = { NORMAL: "NORMAL", ATENCAO: "ATENÇÃO", RELEVANTE: "RELEVANTE", EXCEPCIONAL: "EXCEPCIONAL" };
const GRAU_EXIBICAO = { BAIXA: "baixa", MEDIA: "média", ALTA: "alta" };
const PRESSAO_EXIBICAO = { ALTA: "alta", BAIXA: "baixa", AMBIGUA: "ambígua" };
const ROTULO_TIPO = Object.fromEntries(TIPOS.map((t) => [t.codigo, t.rotulo]));

function validar(ativo, dataReferencia) {
  if (!ATIVOS.includes(ativo)) throw new ValidationError(`Ativo inválido: "${ativo}". Use ${ATIVOS.join(", ")}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataReferencia))) {
    throw new ValidationError(`Data de referência inválida: "${dataReferencia}". Use AAAA-MM-DD.`);
  }
}

function formatarFonte(fonte) {
  return [fonte.nome, fonte.url].filter(Boolean).join(" - ");
}

function formatarEvento(evento, indice) {
  return [`${indice + 1}. ${evento.titulo}`, ...detalhesDoEvento(evento, { comFator: true })].join("\n");
}

// As linhas de um evento abaixo do título (tipo, fator, resumo, canal, pressão, graus e fontes), recuadas.
function detalhesDoEvento(evento, { comFator }) {
  const linhas = [];
  if (evento.tipo) linhas.push(`   Tipo: ${ROTULO_TIPO[evento.tipo]}`);
  if (comFator && evento.fator) linhas.push(`   Fator do FEL 1: ${nomeDoFator(evento.fator)}`);
  if (evento.resumo) linhas.push(`   Resumo: ${evento.resumo}`);
  if (evento.canalTransmissao) linhas.push(`   Canal de transmissão: ${evento.canalTransmissao}`);
  // Dito explicitamente como leitura da IA sobre o fato isolado, para a IA do ativo não tomar como conclusão.
  if (evento.pressao) linhas.push(`   Pressão do fato sobre o preço: ${PRESSAO_EXIBICAO[evento.pressao]} (leitura da IA, com o resto constante)`);
  const graus = [
    evento.intensidade && `Intensidade: ${GRAU_EXIBICAO[evento.intensidade]}`,
    evento.confianca && `Confiança: ${GRAU_EXIBICAO[evento.confianca]}`
  ].filter(Boolean);
  if (graus.length > 0) linhas.push(`   ${graus.join(" | ")}`);
  // Só as páginas de fonte autorizada que sustentam o evento (ligadas a ele pela pesquisa).
  const fontes = evento.fontes.filter((f) => f.origem === "pesquisa").map(formatarFonte);
  if (fontes.length > 0) linhas.push(`   Fontes: ${fontes.join("; ")}`);
  return linhas;
}

function formatarContexto(leitura) {
  const titulo = `EVENTOS DE MERCADO — ${ROTULO_ATIVO[leitura.ativo]} (${leitura.dataReferencia})`;
  if (!leitura.disponivel) {
    return `${titulo}\nLeitura indisponível: a busca deste dia não rodou ou falhou. Não trate a ausência como situação normal.`;
  }
  const linhas = [
    `${titulo} - leitura gerada por IA com busca na web, só em fontes autorizadas; escala de nível provisória`,
    `Nível: ${NIVEL_EXIBICAO[leitura.nivel]}`
  ];
  if (leitura.resumo) linhas.push(`Resumo: ${leitura.resumo}`);
  // Quais fontes a pesquisa do dia de fato leu, pelo grounding (nunca pelo que a IA diz ter consultado: ADR 0049).
  linhas.push(`Fontes autorizadas lidas na pesquisa do dia: ${leitura.fontesLidas.length ? leitura.fontesLidas.join(", ") : "nenhuma"}`);
  if (leitura.eventos.length === 0) {
    linhas.push("Eventos: nenhum evento fora do normal sustentado pelas fontes autorizadas.");
  } else {
    linhas.push("Eventos:", ...leitura.eventos.map(formatarEvento));
  }
  return linhas.join("\n");
}

// As fontes autorizadas lidas pela chamada que cuidou do ativo (desde a v11, as páginas do grounding gravado são
// marcadas com a frente; numa leitura anterior, sem a marca, valem todas).
function fontesLidasDoAtivo(grounding, ativo) {
  const frente = frenteDoAtivo(ativo)?.codigo;
  const paginas = (grounding?.groundingChunks || []).filter((c) => !c.frente || c.frente === frente);
  return fontesDaPesquisa({ groundingChunks: paginas });
}

// { ativo, dataReferencia, disponivel, nivel, resumo, fontesLidas, eventos, contexto } - `contexto` é o bloco pronto para
// o prompt. `fontesLidas`: os nomes das fontes autorizadas que a pesquisa do dia de fato leu (o grounding gravado).
async function obterGeopoliticaDoDia(ativo, dataReferencia, deps = {}) {
  validar(ativo, dataReferencia);
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const registro = await repo.buscarLeituraComEventos(dataReferencia, ativo);
  const coluna = ativo.toLowerCase();
  // Leitura anterior ao ADR 0049 não tem o milho nem o café: para eles, é como não ter leitura.
  const nivel = registro ? registro[`nivel_${coluna}`] : null;

  const leitura = nivel
    ? {
        ativo,
        dataReferencia,
        disponivel: true,
        nivel,
        resumo: registro[`resumo_${coluna}`],
        fontesLidas: fontesLidasDoAtivo(registro.grounding, ativo).map((codigo) => FONTES[codigo].nome),
        eventos: (registro.eventos || [])
          .filter((e) => e.aceito)
          .map((e) => ({
            titulo: e.titulo,
            tipo: e.tipo,
            fator: e.fator,
            resumo: e.resumo,
            canalTransmissao: e.canal_transmissao,
            pressao: e.pressao,
            intensidade: e.intensidade,
            confianca: e.confianca,
            fontes: e.fontes
          }))
      }
    : { ativo, dataReferencia, disponivel: false, nivel: null, resumo: null, fontesLidas: [], eventos: [] };

  return { ...leitura, contexto: formatarContexto(leitura) };
}

// --- Fator de evento (Metodologia do Ativo, ADR 0050) ---------------------------------------------------------------
//
// Um fator de evento (ex.: as decisões da OPEP+, a geopolítica) não é calculado: o resultado dele são os eventos
// aceitos marcados com ele numa janela de dias, e não só os do dia. A janela é a memória do que segue valendo (a decisão
// da OPEP+ do mês passado), sem mudar o prompt da leitura diária: cada evento vai com a data da leitura que o registrou
// (o fato é das 24 a 48 horas anteriores; a data exata, quando a IA a dá, está no resumo) e a idade em dias, para a IA
// do ativo julgar se ele ainda pesa. Os dias sem leitura na janela vão listados: a ausência de evento num dia sem
// leitura não é calmaria.

const DIAS_SEM_LEITURA_LISTADOS = 10;

function somarDias(dataIso, dias) {
  const d = new Date(`${dataIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function diasEntre(inicio, fim) {
  return Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`)) / 86400000);
}

// Os dias da janela sem leitura, a partir da 1ª leitura do ativo (antes dela, a leitura não existia).
function diasSemLeitura(inicio, fim, datas, primeiraData) {
  if (!primeiraData) return [];
  const comLeitura = new Set(datas);
  const faltando = [];
  for (let dia = primeiraData > inicio ? primeiraData : inicio; dia <= fim; dia = somarDias(dia, 1)) {
    if (!comLeitura.has(dia)) faltando.push(dia);
  }
  return faltando;
}

function formatarEventoDoFator(evento, indice) {
  const quando = evento.idadeDias === 0 ? "hoje" : `há ${evento.idadeDias} dia(s)`;
  return [`${indice + 1}. [registrado em ${evento.data}, ${quando}] ${evento.titulo}`, ...detalhesDoEvento(evento, { comFator: false })].join("\n");
}

function formatarEventosDoFator(r) {
  const linhas = [
    `EVENTOS DO FATOR — ${r.fatorNome} — ${ROTULO_ATIVO[r.ativo]} (${r.dataReferencia})`,
    `Fator de evento: não é calculado. Eventos aceitos (sustentados por página de fonte autorizada) da leitura diária ` +
      `por IA marcados com este fator, nos últimos ${r.janelaDias} dias (${r.inicio} a ${r.dataReferencia}), do mais ` +
      `recente para o mais antigo. A data é a da leitura que registrou o evento: o fato é das 24 a 48 horas anteriores, ` +
      `salvo quando o resumo diz a data. A pressão é leitura da IA sobre o fato isolado; a escala é provisória.`
  ];
  if (!r.primeiraLeitura) {
    linhas.push("Leituras: a leitura diária ainda não rodou para este ativo. Não trate a ausência de eventos como situação normal.");
  } else {
    const desde = r.primeiraLeitura > r.inicio ? ` (a leitura diária começou em ${r.primeiraLeitura})` : "";
    linhas.push(`Leituras na janela: ${r.leiturasNaJanela}${desde}.`);
    if (r.ultimaLeitura) {
      const { data, nivel, resumo } = r.ultimaLeitura;
      linhas.push(`Retrato do ativo na leitura mais recente (${data}): nível ${NIVEL_EXIBICAO[nivel]}.${resumo ? ` ${resumo}` : ""}`);
    }
    if (r.diasSemLeitura.length > 0) {
      const lista = r.diasSemLeitura.slice(0, DIAS_SEM_LEITURA_LISTADOS).join(", ");
      const resto = r.diasSemLeitura.length - DIAS_SEM_LEITURA_LISTADOS;
      linhas.push(`Dias sem leitura (sem informação, não calmaria): ${lista}${resto > 0 ? ` e mais ${resto}` : ""}.`);
    }
  }
  if (r.eventos.length === 0) linhas.push("Eventos: nenhum evento deste fator nas leituras da janela.");
  else linhas.push("Eventos:", ...r.eventos.map(formatarEventoDoFator));
  return linhas.join("\n");
}

// { ativo, fator, fatorNome, dataReferencia, janelaDias, inicio, primeiraLeitura, leiturasNaJanela, diasSemLeitura,
//   eventos, contexto } - `contexto` é o bloco pronto para o prompt.
async function obterEventosDoFator(ativo, fator, dataReferencia, janelaDias, deps = {}) {
  validar(ativo, dataReferencia);
  if (!Number.isInteger(janelaDias) || janelaDias < 1) throw new ValidationError("A janela do fator deve ser um número inteiro de dias.");
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const inicio = somarDias(dataReferencia, -(janelaDias - 1));
  const [registros, leituras] = await Promise.all([
    repo.listarEventosAceitosDoFator({ ativo, fator, dataInicio: inicio, dataFim: dataReferencia }),
    repo.listarDatasDeLeitura({ ativo, dataInicio: inicio, dataFim: dataReferencia })
  ]);
  // O retrato do ativo (nível e resumo) na leitura mais recente da janela: o resumo dá a situação do dia; os eventos,
  // a memória.
  const ultimaData = leituras.datas.at(-1);
  const ultima = ultimaData ? await repo.buscarLeituraComEventos(ultimaData, ativo) : null;
  const coluna = ativo.toLowerCase();
  const resultado = {
    ativo,
    fator,
    fatorNome: nomeDoFator(fator),
    dataReferencia,
    janelaDias,
    inicio,
    primeiraLeitura: leituras.primeiraData,
    ultimaLeitura: ultima ? { data: ultimaData, nivel: ultima[`nivel_${coluna}`], resumo: ultima[`resumo_${coluna}`] } : null,
    leiturasNaJanela: leituras.datas.length,
    diasSemLeitura: diasSemLeitura(inicio, dataReferencia, leituras.datas, leituras.primeiraData),
    eventos: registros.map((e) => ({
      data: e.leitura.data_referencia,
      idadeDias: diasEntre(e.leitura.data_referencia, dataReferencia),
      titulo: e.titulo,
      tipo: e.tipo,
      resumo: e.resumo,
      canalTransmissao: e.canal_transmissao,
      pressao: e.pressao,
      intensidade: e.intensidade,
      confianca: e.confianca,
      fontes: e.fontes
    }))
  };
  return { ...resultado, contexto: formatarEventosDoFator(resultado) };
}

// --- Tela Eventos (/dados-mercado/eventos): só leitura ---

const ACEITO_POR_FILTRO = { aceitos: true, rejeitados: false, todos: undefined };

function validarFiltroData(valor, campo) {
  if (valor !== undefined && valor !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    throw new ValidationError(`"${campo}" deve estar em AAAA-MM-DD.`);
  }
  return valor || undefined;
}

function paraEventoResposta(evento) {
  const leitura = evento.leitura;
  return {
    id: evento.id,
    // Vários eventos saem da mesma leitura (uma chamada à IA por dia): a tela abre o prompt pela leitura.
    leituraId: evento.leitura_id,
    data: leitura.data_referencia,
    ativo: evento.ativo,
    tipo: evento.tipo,
    fator: evento.fator,
    fatorNome: nomeDoFator(evento.fator),
    ordem: evento.ordem,
    titulo: evento.titulo,
    resumo: evento.resumo,
    canalTransmissao: evento.canal_transmissao,
    pressao: evento.pressao,
    intensidade: evento.intensidade,
    confianca: evento.confianca,
    fontes: evento.fontes,
    aceito: evento.aceito,
    motivoRejeicao: evento.motivo_rejeicao
  };
}

// Filtros: ativo, tipo, situacao (aceitos - o padrão, o que vai ao Motor | rejeitados | todos), dataInicio/dataFim,
// paginação e ordem pela data.
async function listarEventos(filtros = {}, deps = {}) {
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const { pagina, tamanhoPagina } = validarPaginacao(filtros, { tamanhoPadrao: 25, tamanhoMaximo: 200 });
  if (filtros.ativo && !ATIVOS.includes(filtros.ativo)) throw new ValidationError(`"ativo" deve ser um entre: ${ATIVOS.join(", ")}.`);
  const situacao = filtros.situacao || "aceitos";
  if (!(situacao in ACEITO_POR_FILTRO)) throw new ValidationError('"situacao" deve ser aceitos, rejeitados ou todos.');
  const ordem = filtros.ordem === "ASC" ? "ASC" : "DESC";
  if (filtros.tipo && !CODIGOS_TIPO.includes(filtros.tipo)) throw new ValidationError('"tipo" inválido.');

  const { registros, total } = await repo.listarEventos({
    ativo: filtros.ativo || undefined,
    tipo: filtros.tipo || undefined,
    aceito: ACEITO_POR_FILTRO[situacao],
    dataInicio: validarFiltroData(filtros.dataInicio, "dataInicio"),
    dataFim: validarFiltroData(filtros.dataFim, "dataFim"),
    pagina,
    tamanhoPagina,
    ordem
  });
  return {
    eventos: registros.map(paraEventoResposta),
    paginacao: { pagina, tamanhoPagina, total, totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)) }
  };
}

// A lista de fontes autorizadas para a tela, do mesmo catálogo que o prompt e o parser usam: a tela nunca mostra uma
// lista diferente da real.
function fontesConfiaveis() {
  return CODIGOS.map((codigo) => ({
    nome: FONTES[codigo].nome,
    enderecos: FONTES[codigo].escopos.map((e) => `${e.host}${e.caminho || ""}`),
    papel: FONTES[codigo].papel,
    tipos: FONTES[codigo].tipos,
    ativos: FONTES[codigo].ativos
  }));
}

// A leitura mais recente (o nível e o resumo de cada ativo, o modelo e a versão do prompt), para a metodologia da tela
// Eventos. `leitura: null` antes da primeira coleta.
async function obterUltimaLeitura(deps = {}) {
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const leitura = await repo.buscarUltimaLeitura();
  if (!leitura) return { leitura: null, fontesConfiaveis: fontesConfiaveis() };
  return {
    fontesConfiaveis: fontesConfiaveis(),
    leitura: {
      data: leitura.data_referencia,
      ...Object.fromEntries(
        ATIVOS.map((ativo) => {
          const coluna = ativo.toLowerCase();
          return [coluna, { nivel: leitura[`nivel_${coluna}`] ?? null, resumo: leitura[`resumo_${coluna}`] ?? null }];
        })
      ),
      modelo: leitura.modelo,
      chave: leitura.chave,
      versaoPrompt: leitura.versao_prompt,
      geradaEm: leitura.updated_at
    }
  };
}

// O que foi enviado à IA e o que ela devolveu, para auditoria na tela Eventos (modal "Prompt e resposta da IA"):
// a instrução do sistema e o prompt como foram enviados, a resposta inteira, as buscas que a pesquisa fez e as páginas
// que ela leu (com a URL final). Comum a todos os eventos da leitura.
async function obterDetalheIa(leituraId, deps = {}) {
  if (!/^[0-9a-f-]{36}$/i.test(String(leituraId))) throw new ValidationError("Leitura inválida.");
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const leitura = await repo.buscarLeituraPorId(leituraId);
  if (!leitura) throw new NotFoundError("Leitura de eventos não encontrada.");
  const grounding = leitura.grounding || {};
  return {
    detalheIa: {
      leituraId: leitura.id,
      data: leitura.data_referencia,
      geradaEm: leitura.updated_at,
      modelo: leitura.modelo,
      chave: leitura.chave,
      tokens: leitura.tokens,
      versaoPrompt: leitura.versao_prompt,
      instrucaoSistema: leitura.instrucao_sistema,
      prompt: leitura.prompt,
      resposta: leitura.texto_bruto,
      buscas: grounding.webSearchQueries || [],
      paginasLidas: (grounding.groundingChunks || []).map((c) => ({ site: c.web?.title || null, url: c.web?.urlFinal || null }))
    }
  };
}

module.exports = { obterGeopoliticaDoDia, formatarContexto, obterEventosDoFator, listarEventos, obterUltimaLeitura, obterDetalheIa };
