"use strict";

const geopoliticaRepository = require("../repositories/geopolitica.repository");
const { NotFoundError, ValidationError } = require("../shared/errors");
const { validarPaginacao } = require("../shared/utils/pagination");
const { FONTES, CODIGOS } = require("../collectors/geopolitica/fontes-autorizadas");

// Entrega a leitura diária de geopolítica ao Motor (ADR 0047): o bloco "GEOPOLÍTICA — <ATIVO>" que entra no prompt
// do ativo como contexto do fator geopolítico do dia. Só os eventos aceitos (sustentados por fonte autorizada) vão
// para o bloco; os rejeitados ficam só na tela.
//
// Sem leitura na data, o bloco diz "indisponível", nunca "normal": uma coleta que falhou não pode virar, no prompt,
// um sinal de calmaria. A leitura é de UMA data: não se usa a de ontem no lugar da de hoje.
//
// O peso disso na análise é decidido pela IA do ativo e pelas regras do David, não aqui.

const ATIVOS = { OURO: "OURO", PETROLEO: "PETRÓLEO" };
const NIVEL_EXIBICAO = { NORMAL: "NORMAL", ATENCAO: "ATENÇÃO", RELEVANTE: "RELEVANTE", EXCEPCIONAL: "EXCEPCIONAL" };
const GRAU_EXIBICAO = { BAIXA: "baixa", MEDIA: "média", ALTA: "alta" };
const PRESSAO_EXIBICAO = { ALTA: "alta", BAIXA: "baixa", AMBIGUA: "ambígua" };
// Em sincronia com GeopoliticaEvento.TIPOS (model) e com o parser.
const TIPO_EXIBICAO = {
  CONFLITO_MILITAR: "conflito militar",
  ROTA_MARITIMA: "rota marítima",
  INFRAESTRUTURA: "infraestrutura",
  SANCAO: "sanção",
  PRODUCAO: "decisão de produção",
  DIPLOMACIA: "diplomacia",
  OUTRO: "outro"
};
const ASSUNTOS = ["GEOPOLITICA"];

function validar(ativo, dataReferencia) {
  if (!ATIVOS[ativo]) throw new ValidationError(`Ativo inválido: "${ativo}". Use OURO ou PETROLEO.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dataReferencia))) {
    throw new ValidationError(`Data de referência inválida: "${dataReferencia}". Use AAAA-MM-DD.`);
  }
}

function formatarFonte(fonte) {
  return [fonte.nome, fonte.url].filter(Boolean).join(" - ");
}

function formatarEvento(evento, indice) {
  const linhas = [`${indice + 1}. ${evento.titulo}`];
  if (evento.tipo) linhas.push(`   Tipo: ${TIPO_EXIBICAO[evento.tipo]}`);
  if (evento.resumo) linhas.push(`   Resumo: ${evento.resumo}`);
  if (evento.canalTransmissao) linhas.push(`   Canal de transmissão: ${evento.canalTransmissao}`);
  // Dito explicitamente como leitura da IA sobre o fato isolado, para a IA do ativo não tomar como conclusão.
  if (evento.pressao) linhas.push(`   Pressão do fato sobre o preço: ${PRESSAO_EXIBICAO[evento.pressao]} (leitura da IA, com o resto constante)`);
  const graus = [
    evento.intensidade && `Intensidade: ${GRAU_EXIBICAO[evento.intensidade]}`,
    evento.confianca && `Confiança: ${GRAU_EXIBICAO[evento.confianca]}`
  ].filter(Boolean);
  if (graus.length > 0) linhas.push(`   ${graus.join(" | ")}`);
  // Só os sites confiáveis confirmados nos resultados da pesquisa: são eles que sustentam o evento.
  const fontes = evento.fontes.filter((f) => f.fonteAutorizada && f.confirmadaNaPesquisa).map(formatarFonte);
  if (fontes.length > 0) linhas.push(`   Fontes: ${fontes.join("; ")}`);
  return linhas.join("\n");
}

function formatarContexto(geopolitica) {
  const titulo = `GEOPOLÍTICA — ${ATIVOS[geopolitica.ativo]} (${geopolitica.dataReferencia})`;
  if (!geopolitica.disponivel) {
    return `${titulo}\nLeitura indisponível: a busca deste dia não rodou ou falhou. Não trate a ausência como situação normal.`;
  }
  const linhas = [
    `${titulo} - leitura gerada por IA com busca na web; escala de nível provisória`,
    `Nível: ${NIVEL_EXIBICAO[geopolitica.nivel]}`
  ];
  if (geopolitica.resumo) linhas.push(`Resumo: ${geopolitica.resumo}`);
  if (geopolitica.eventos.length === 0) {
    linhas.push("Eventos: nenhum evento geopolítico fora do normal sustentado pelas fontes autorizadas.");
  } else {
    linhas.push("Eventos:", ...geopolitica.eventos.map(formatarEvento));
  }
  return linhas.join("\n");
}

// { ativo, dataReferencia, disponivel, nivel, resumo, eventos, contexto } - `contexto` é o bloco pronto para o prompt.
async function obterGeopoliticaDoDia(ativo, dataReferencia, deps = {}) {
  validar(ativo, dataReferencia);
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const leitura = await repo.buscarLeituraComEventos(dataReferencia, ativo);

  const geopolitica = leitura
    ? {
        ativo,
        dataReferencia,
        disponivel: true,
        nivel: ativo === "OURO" ? leitura.nivel_ouro : leitura.nivel_petroleo,
        resumo: ativo === "OURO" ? leitura.resumo_ouro : leitura.resumo_petroleo,
        eventos: (leitura.eventos || [])
          .filter((e) => e.aceito)
          .map((e) => ({
            titulo: e.titulo,
            tipo: e.tipo,
            resumo: e.resumo,
            canalTransmissao: e.canal_transmissao,
            pressao: e.pressao,
            intensidade: e.intensidade,
            confianca: e.confianca,
            fontes: e.fontes
          }))
      }
    : { ativo, dataReferencia, disponivel: false, nivel: null, resumo: null, eventos: [] };

  return { ...geopolitica, contexto: formatarContexto(geopolitica) };
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
    assunto: evento.assunto,
    tipo: evento.tipo,
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

// Filtros: ativo (OURO | PETROLEO), situacao (aceitos - o padrão, o que vai ao Motor | rejeitados | todos),
// dataInicio/dataFim, paginação e ordem pela data.
async function listarEventos(filtros = {}, deps = {}) {
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const { pagina, tamanhoPagina } = validarPaginacao(filtros, { tamanhoPadrao: 25, tamanhoMaximo: 200 });
  if (filtros.ativo && !ATIVOS[filtros.ativo]) throw new ValidationError('"ativo" deve ser OURO ou PETROLEO.');
  const situacao = filtros.situacao || "aceitos";
  if (!(situacao in ACEITO_POR_FILTRO)) throw new ValidationError('"situacao" deve ser aceitos, rejeitados ou todos.');
  const ordem = filtros.ordem === "ASC" ? "ASC" : "DESC";
  if (filtros.assunto && !ASSUNTOS.includes(filtros.assunto)) throw new ValidationError('"assunto" inválido.');
  if (filtros.tipo && !TIPO_EXIBICAO[filtros.tipo]) throw new ValidationError('"tipo" inválido.');

  const { registros, total } = await repo.listarEventos({
    ativo: filtros.ativo || undefined,
    assunto: filtros.assunto || undefined,
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
    // Assuntos que já têm evento: a tela só mostra o filtro de assunto quando há mais de um.
    assuntosDisponiveis: await repo.listarAssuntos(),
    paginacao: { pagina, tamanhoPagina, total, totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)) }
  };
}

// A leitura mais recente para a faixa do topo: o nível e o resumo de cada ativo (é o que o Motor recebe junto com os
// eventos, e num dia NORMAL é tudo o que existe). `leitura: null` antes da primeira coleta.
async function obterUltimaLeitura(deps = {}) {
  const repo = deps.geopoliticaRepository || geopoliticaRepository;
  const leitura = await repo.buscarUltimaLeitura();
  // A lista vem do mesmo catálogo que o prompt e o parser usam: a tela nunca mostra uma lista diferente da real.
  const fontesConfiaveis = CODIGOS.map((codigo) => ({
    nome: FONTES[codigo].nome,
    dominios: FONTES[codigo].dominios,
    papel: FONTES[codigo].papel
  }));
  if (!leitura) return { leitura: null, fontesConfiaveis };
  return {
    fontesConfiaveis,
    leitura: {
      data: leitura.data_referencia,
      ouro: { nivel: leitura.nivel_ouro, resumo: leitura.resumo_ouro },
      petroleo: { nivel: leitura.nivel_petroleo, resumo: leitura.resumo_petroleo },
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
  if (!leitura) throw new NotFoundError("Leitura de geopolítica não encontrada.");
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

module.exports = { obterGeopoliticaDoDia, formatarContexto, listarEventos, obterUltimaLeitura, obterDetalheIa };
