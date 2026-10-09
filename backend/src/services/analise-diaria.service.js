"use strict";

const analiseDiariaRepository = require("../repositories/analise-diaria.repository");
const { ATIVOS_COM_ANALISE_DIARIA, configuracaoDoAtivo } = require("../shared/analise-diaria");
const { FATORES_PETROLEO } = require("../shared/metodologia-petroleo");
const { FATORES_OURO } = require("../shared/metodologia-ouro");
const { FATORES_MILHO } = require("../shared/metodologia-milho");
const { FATORES_CAFE } = require("../shared/metodologia-cafe");
const { FATORES_SOJA } = require("../shared/metodologia-soja");
const { FATORES_DOLAR } = require("../shared/metodologia-dolar");
const { NotFoundError, ValidationError } = require("../shared/errors");
const { dataDeReferenciaDosHorizontes, dataAlvoDoHorizonte } = require("../shared/analise-diaria-base");

// Leitura diária de tendência da IA (petróleo, ADR 0052; ouro, ADR 0054; milho, ADR 0058; café, ADR 0062), como o Centro de Decisão a mostra: a leitura feita NA data escolhida
// (nunca a de outro dia no lugar dela) e as evidências que formaram o prompt dela. Tudo sai da leitura GRAVADA (a
// entrada estruturada, o prompt e a resposta como foram): nada é recalculado agora, então um parâmetro que mude depois
// não altera o que a tela diz que a IA recebeu naquele dia. Só os ativos com leitura diária têm o bloco.
const CATALOGO_POR_ATIVO = { PETROLEO: FATORES_PETROLEO, OURO: FATORES_OURO, MILHO: FATORES_MILHO, CAFE: FATORES_CAFE, SOJA: FATORES_SOJA, DOLAR: FATORES_DOLAR };
const ATIVOS_COM_ANALISE = ATIVOS_COM_ANALISE_DIARIA;

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// O resumo do que foi ao prompt: o preço de referência com as variações dos horizontes, a curva, cada fator (com o
// nome do catálogo) e as lacunas. As lacunas são só fatos da entrada (curva sem fonte, num ativo em que ela entra no
// prompt; fator sem dado ou sem leitura), não um julgamento.
function resumirEvidencias(ativo, entrada) {
  const config = configuracaoDoAtivo(ativo);
  const nomes = new Map(CATALOGO_POR_ATIVO[ativo].map((f) => [f.codigo, f.nome]));
  const preco = entrada.precoReferencia;
  const fatores = (entrada.fatores || []).map((f) => ({
    codigo: f.fator,
    nome: nomes.get(f.fator) || f.fator,
    peso: f.peso,
    tipo: f.tipo,
    tipoFel1: f.tipoFel1,
    situacaoRegra: f.situacaoRegra,
    contextoDe: f.contextoDe ?? null,
    informativo: f.informativo === true,
    regra: f.regra ?? null,
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
    ...(entrada.curva || !config.CURVA.aplica ? [] : [{ codigo: "CURVA_SEM_DADO", fator: null, descricao: config.CURVA.lacuna }]),
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
          // A moeda do preço do ativo (US$ no petróleo, no ouro e no café; R$ no milho), da configuração.
          moeda: config.PRECO.moeda || "US$",
          contrato: preco.contrato ?? null,
          ptax: preco.ptax ?? null,
          valor: preco.valor,
          dataReferencia: preco.dataReferencia,
          publicadoEm: preco.publicadoEm,
          publicadoEmEstimado: preco.publicadoEmEstimado,
          variacoes: config.HORIZONTES.map(({ codigo, dias, variacao }) => ({
            horizonte: codigo,
            dias,
            percentual: preco.variacoes?.[variacao]?.percentual ?? null,
            desde: preco.variacoes?.[variacao]?.desde ?? null
          }))
        }
      : null,
    curva: entrada.curva ?? null,
    fatores,
    // A seção de eventos da base do prompt (ADR 0095); null nas leituras de antes dela.
    eventosDoAtivo: entrada.eventosDoAtivo ?? null,
    lacunas
  };
}

// A leitura como foi gravada (ADR 0064): o preço que a IA recebeu, de onde os horizontes contam e, por horizonte, os
// dias, o T1/T2 e a data-alvo. Tudo sai da entrada gravada: a configuração atual só dá o rótulo do horizonte, então uma
// mudança nela (outro prazo, outra faixa) nunca muda o que uma leitura antiga quis dizer. Serve ao Centro de Decisão e à
// Qualidade da IA (`registro` pode ser a linha inteira ou a projeção de analise-diaria.repository.js::listarParaAvaliacao).
function leituraGravada(ativo, registro) {
  const entrada = registro.entrada || {};
  const preco = entrada.precoReferencia;
  // De onde os horizontes contam, como foi gravado (shared/analise-diaria-base.js::REFERENCIA_HORIZONTES): a v1 do
  // petróleo, do último preço; de 2026-10-03 a 2026-10-07, da data da análise; depois, do preço recebido (ADR 0106).
  const tipoReferencia = entrada.referenciaHorizontes || "DATA_DO_ULTIMO_PRECO";
  const dataAnalise = registro.data_analise;
  const dataReferenciaHorizontes = dataDeReferenciaDosHorizontes(tipoReferencia, { dataAnalise, dataPreco: preco?.dataReferencia });
  const rotulos = new Map(configuracaoDoAtivo(ativo).HORIZONTES.map((h) => [h.codigo, h.rotulo]));
  return {
    disponivel: true,
    data: registro.data_analise,
    geradaEm: registro.created_at,
    precoReferencia: preco
      ? {
          serie: preco.serie,
          seriesCode: preco.seriesCode ?? null,
          contrato: preco.contrato ?? null,
          dataReferencia: preco.dataReferencia,
          valor: preco.valor
        }
      : null,
    referenciaHorizontes: { tipo: tipoReferencia, data: dataReferenciaHorizontes },
    horizontes: (entrada.horizontes || []).map(({ codigo, dias, t1, t2, contrato, seriesCode, dataReferencia, valor }) => ({
      codigo,
      rotulo: rotulos.get(codigo) || codigo,
      dias,
      t1: t1 ?? null,
      t2: t2 ?? null,
      // Com contrato próprio, a data do preço recebido é a dele (o mesmo pregão, em regra).
      dataAlvo: dataAlvoDoHorizonte(tipoReferencia, { dataAnalise, dataPreco: (seriesCode ? dataReferencia : null) || preco?.dataReferencia, dias }),
      // O contrato do horizonte (o milho e o café desde a configuração v3, ADR 0078): a avaliação usa o dele. Nas
      // leituras antigas, o da leitura (precoReferencia).
      ...(seriesCode ? { contrato: contrato ?? null, seriesCode, precoRecebido: { valor, dataReferencia } } : {})
    })),
    leituras: registro.leituras,
    // A leitura agregada do motor que foi ao prompt (o café, ADR 0066), como ficou gravada; null nos outros ativos e nas
    // leituras anteriores a ela.
    agregacaoMotor: entrada.agregacaoMotor ?? null
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
  return {
    ...leituraGravada(ativo, registro),
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

module.exports = { obterAnaliseDoDia, obterPromptEnviado, resumirEvidencias, leituraGravada, ATIVOS_COM_ANALISE };
