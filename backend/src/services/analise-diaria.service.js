"use strict";

const analiseDiariaRepository = require("../repositories/analise-diaria.repository");
const { HORIZONTES } = require("../shared/analise-diaria-petroleo");
const { FATORES_PETROLEO } = require("../shared/metodologia-petroleo");
const { NotFoundError, ValidationError } = require("../shared/errors");

// Leitura diária de tendência da IA (ADR 0052), como o Centro de Decisão a mostra: a leitura feita NA data escolhida
// (nunca a de outro dia no lugar dela) e as evidências que formaram o prompt dela. Tudo sai da leitura GRAVADA (a
// entrada estruturada, o prompt e a resposta como foram): nada é recalculado agora, então um parâmetro que mude depois
// não altera o que a tela diz que a IA recebeu naquele dia. Só os ativos com leitura diária têm o bloco.
const CATALOGO_POR_ATIVO = { PETROLEO: FATORES_PETROLEO };
const ATIVOS_COM_ANALISE = Object.keys(CATALOGO_POR_ATIVO);

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// O resumo do que foi ao prompt: o preço de referência com as variações dos horizontes, a curva, cada fator (com o
// nome do catálogo) e as lacunas. As lacunas são só fatos da entrada (curva sem fonte, fator sem dado ou sem leitura),
// não um julgamento.
function resumirEvidencias(ativo, entrada) {
  const nomes = new Map(CATALOGO_POR_ATIVO[ativo].map((f) => [f.codigo, f.nome]));
  const preco = entrada.precoReferencia;
  const fatores = (entrada.fatores || []).map((f) => ({
    codigo: f.fator,
    nome: nomes.get(f.fator) || f.fator,
    peso: f.peso,
    tipo: f.tipo,
    tipoFel1: f.tipoFel1,
    situacaoRegra: f.situacaoRegra,
    situacao: f.situacao,
    dataReferencia: f.dataReferencia ?? null,
    publicadoEm: f.publicadoEm ?? null,
    idadeDias: f.idadeDias ?? null,
    medida: f.medida ?? null,
    leitura: f.leitura ?? null,
    factorId: f.factorId ?? null,
    factorVersion: f.factorVersion ?? null,
    parametros: f.parametros ?? null,
    origemParametros: f.origemParametros ?? null,
    janelaDias: f.janelaDias ?? null,
    eventos: f.eventos ?? null,
    ultimaLeitura: f.ultimaLeitura ?? null
  }));
  const lacunas = [
    ...(entrada.curva ? [] : [{ codigo: "CURVA_SEM_DADO", fator: null, descricao: "Curva futura do WTI sem fonte na base" }]),
    ...(preco ? [] : [{ codigo: "PRECO_SEM_DADO", fator: null, descricao: "Sem preço de referência na data" }]),
    ...fatores
      .filter((f) => f.situacao === "SEM_DADO" || f.situacao === "SEM_LEITURA")
      .map((f) => ({ codigo: f.situacao, fator: f.codigo, descricao: `${f.nome}: ${f.situacao === "SEM_DADO" ? "sem dado até a data" : "sem leitura diária na janela"}` }))
  ];
  return {
    referenciaHorizontes: entrada.referenciaHorizontes || "DATA_DO_ULTIMO_PRECO",
    preco: preco
      ? {
          serie: preco.serie,
          valor: preco.valor,
          dataReferencia: preco.dataReferencia,
          publicadoEm: preco.publicadoEm,
          publicadoEmEstimado: preco.publicadoEmEstimado,
          variacoes: HORIZONTES.map(({ codigo, dias, variacao }) => ({
            horizonte: codigo,
            dias,
            percentual: preco.variacoes?.[variacao]?.percentual ?? null,
            desde: preco.variacoes?.[variacao]?.desde ?? null
          }))
        }
      : null,
    curva: entrada.curva ?? null,
    fatores,
    lacunas
  };
}

// -> null (ativo sem leitura diária), { disponivel: false } (nenhuma leitura nesta data) ou a leitura com o que a tela
// precisa: as quatro leituras, as faixas de cada horizonte (as da configuração gravada com ela), o preço de referência,
// as evidências e a proveniência (modelo, versões, hash). O prompt e a resposta (~30 mil caracteres) ficam de fora:
// `obterPromptEnviado`, sob demanda.
async function obterAnaliseDoDia(ativo, data, deps = {}) {
  if (!ATIVOS_COM_ANALISE.includes(ativo)) return null;
  const repo = deps.analiseDiariaRepository || analiseDiariaRepository;
  const registro = await repo.buscarAnaliseDoDia(ativo, data);
  if (!registro) return { disponivel: false, data };

  const entrada = registro.entrada || {};
  const faixasDoHorizonte = new Map((entrada.horizontes || []).map((h) => [h.codigo, h]));
  // De onde os horizontes contam, como foi gravado com a leitura (a configuração v1 contava do último preço, a v2 conta
  // da data da análise; shared/analise-diaria-petroleo.js::REFERENCIA_HORIZONTES).
  const tipoReferencia = entrada.referenciaHorizontes || "DATA_DO_ULTIMO_PRECO";
  const dataReferenciaHorizontes =
    tipoReferencia === "DATA_DA_ANALISE" ? registro.data_analise : entrada.precoReferencia?.dataReferencia ?? null;
  return {
    disponivel: true,
    data: registro.data_analise,
    geradaEm: registro.created_at,
    precoReferencia: entrada.precoReferencia
      ? { serie: entrada.precoReferencia.serie, dataReferencia: entrada.precoReferencia.dataReferencia, valor: entrada.precoReferencia.valor }
      : null,
    referenciaHorizontes: { tipo: tipoReferencia, data: dataReferenciaHorizontes },
    horizontes: HORIZONTES.map(({ codigo, rotulo, dias }) => {
      const faixa = faixasDoHorizonte.get(codigo) || {};
      return { codigo, rotulo, dias, t1: faixa.t1 ?? null, t2: faixa.t2 ?? null };
    }),
    leituras: registro.leituras,
    evidencias: resumirEvidencias(ativo, entrada),
    proveniencia: {
      modelo: registro.modelo,
      chave: registro.chave,
      tokens: registro.tokens,
      versaoPrompt: registro.versao_prompt,
      versaoMetodologia: registro.versao_metodologia,
      versaoConfiguracao: registro.versao_configuracao,
      hashEntrada: registro.hash_entrada
    }
  };
}

// GET /api/v1/centro-decisao/analise?ativo=&data= : o que foi enviado à IA e o que ela respondeu, como ficou gravado.
async function obterPromptEnviado({ ativo, data } = {}, deps = {}) {
  if (!ATIVOS_COM_ANALISE.includes(ativo)) throw new ValidationError(`"ativo" deve ser um entre: ${ATIVOS_COM_ANALISE.join(", ")}.`);
  if (!REGEX_DATA.test(data || "")) throw new ValidationError('"data" deve estar em AAAA-MM-DD.');
  const repo = deps.analiseDiariaRepository || analiseDiariaRepository;
  const registro = await repo.buscarAnaliseDoDia(ativo, data);
  if (!registro) throw new NotFoundError("Não há leitura de tendência deste ativo nesta data.");
  return {
    analiseEnviada: {
      ativo,
      data: registro.data_analise,
      geradaEm: registro.created_at,
      instrucaoDoSistema: registro.instrucao_sistema,
      prompt: registro.prompt,
      respostaBruta: registro.resposta_bruta,
      hashEntrada: registro.hash_entrada,
      versaoPrompt: registro.versao_prompt,
      versaoMetodologia: registro.versao_metodologia,
      versaoConfiguracao: registro.versao_configuracao,
      modelo: registro.modelo,
      chave: registro.chave,
      tokens: registro.tokens
    }
  };
}

module.exports = { obterAnaliseDoDia, obterPromptEnviado, resumirEvidencias, ATIVOS_COM_ANALISE };
