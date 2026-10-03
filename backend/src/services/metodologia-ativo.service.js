"use strict";

const { ConflictError, NotFoundError, ValidationError } = require("../shared/errors");
const fatorParametroRepository = require("../repositories/fator-parametro.repository");
const { obterMetodologiaPetroleo } = require("../shared/metodologia-petroleo");
const { buscarNoCatalogo } = require("./observaveis.service");

// Metodologia dos fatores por ativo: a proposta para o David validar (ADR 0050). Só o petróleo por enquanto.
const METODOLOGIAS = {
  PETROLEO: obterMetodologiaPetroleo
};

// Propostas já calculadas (camadas A, B e C simulada): fator do FEL 1 -> a METODOLOGIA do módulo em `factors/`
// (calcular, explicar, exemplos, parâmetros padrão e a apresentação que a tela genérica desenha). Um fator novo é
// só uma linha aqui.
const CALCULOS = {
  PETROLEO_ESTOQUES_EIA: require("../factors/estoques-petroleo-eia.factor").METODOLOGIA,
  PETROLEO_PRODUCAO_EUA: require("../factors/producao-petroleo-eua.factor").METODOLOGIA,
  PETROLEO_DEMANDA: require("../factors/demanda-petroleo-eua.factor").METODOLOGIA,
  PETROLEO_REFINO: require("../factors/refino-petroleo.factor").METODOLOGIA
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;
const SEMANAS_TENDENCIA_MAX = 26;

// Parâmetros da camada C (simulação): os padrões do fator, trocados pelos que vierem na query. Só números de 0 a 100;
// o limiar moderado abaixo do forte; a tendência em semanas inteiras, de 1 a 26.
function lerParametros(padrao, valores = {}) {
  const parametros = { ...padrao };
  for (const chave of Object.keys(padrao)) {
    if (valores[chave] === undefined || valores[chave] === "") continue;
    const valor = Number(valores[chave]);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) throw new ValidationError(`"${chave}" deve ser um número entre 0 e 100.`);
    parametros[chave] = valor;
  }
  if (!(parametros.limiarModeradoPct < parametros.limiarFortePct)) {
    throw new ValidationError('"limiarModeradoPct" deve ser menor que "limiarFortePct".');
  }
  const semanas = parametros.semanasTendencia;
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > SEMANAS_TENDENCIA_MAX) {
    throw new ValidationError(`"semanasTendencia" deve ser um inteiro de 1 a ${SEMANAS_TENDENCIA_MAX}.`);
  }
  return parametros;
}

// O catálogo guarda só o código do observável; a tela precisa do nome para o link do card.
function paraResposta(metodologia) {
  return {
    ...metodologia,
    fatores: metodologia.fatores.map((fator) => ({
      ...fator,
      calculado: Boolean(CALCULOS[fator.codigo]),
      dados: {
        ...fator.dados,
        observaveis: fator.dados.observaveis.map((codigo) => ({ codigo, nome: buscarNoCatalogo(codigo)?.nome || codigo }))
      }
    }))
  };
}

function mesmosParametros(a, b) {
  return Object.keys(b).every((chave) => Number(a[chave]) === Number(b[chave]));
}

// O fator do ativo com cálculo, ou 404.
function fatorCalculado(ativo, codigoFator) {
  const fator = construtorDoAtivo(ativo)().fatores.find((item) => item.codigo === String(codigoFator || "").toUpperCase());
  const calculo = fator && CALCULOS[fator.codigo];
  if (!calculo) throw new NotFoundError("Este fator ainda não tem a proposta calculada.");
  return { fator, calculo };
}

// Os parâmetros em uso no sistema: a última versão gravada (sobre os padrões, para tolerar um parâmetro novo no
// código) ou, sem versão, os padrões do código. `origem` é null nesse caso.
async function parametrosDoSistema(fator, calculo, deps = {}) {
  const repo = deps.fatorParametroRepository || fatorParametroRepository;
  const vigente = await repo.buscarVigente(fator.codigo);
  if (!vigente) return { parametros: { ...calculo.parametrosPadrao }, origem: null };
  const { parametros, ...origem } = vigente;
  return { parametros: { ...calculo.parametrosPadrao, ...parametros }, origem };
}

function construtorDoAtivo(ativo) {
  const construtor = METODOLOGIAS[String(ativo || "").trim().toUpperCase()];
  if (!construtor) throw new NotFoundError("Metodologia não disponível para este ativo.");
  return construtor;
}

// Os 4 ativos do FEL 1, na ordem do Centro de Decisão, para o seletor da tela; `disponivel` diz se a metodologia
// dele já foi montada.
const ATIVOS = [
  { codigo: "OURO", nome: "Ouro" },
  { codigo: "PETROLEO", nome: "Petróleo" },
  { codigo: "MILHO", nome: "Milho" },
  { codigo: "CAFE", nome: "Café" }
];

// Ativo fora do FEL 1: 404. Ativo do FEL 1 sem metodologia montada: `metodologia` null (a tela avisa).
function obterMetodologiaAtivo(ativo) {
  const codigo = String(ativo || "").trim().toUpperCase();
  const encontrado = ATIVOS.find((item) => item.codigo === codigo);
  if (!encontrado) throw new NotFoundError("Ativo não encontrado.");
  const construtor = METODOLOGIAS[codigo];
  return {
    ativo: encontrado,
    ativos: ATIVOS.map((item) => ({ ...item, disponivel: Boolean(METODOLOGIAS[item.codigo]) })),
    metodologia: construtor ? paraResposta(construtor()) : null
  };
}

// `desde` (AAAA-MM-DD, opcional): a 1ª semana do cálculo; sem ele, o histórico inteiro. Sempre o que se sabe agora.
// Os demais campos de `opcoes` são parâmetros da camada C para SIMULAR, sobre os do sistema (nada é gravado).
async function calcularFator(ativo, codigoFator, { desde, ...opcoes } = {}, deps = {}) {
  const { fator, calculo } = fatorCalculado(ativo, codigoFator);
  if (desde !== undefined && (!DATA_ISO.test(desde) || Number.isNaN(Date.parse(desde)))) {
    throw new ValidationError('"desde" deve estar em AAAA-MM-DD.');
  }
  const sistema = await parametrosDoSistema(fator, calculo, deps);
  const parametros = lerParametros(sistema.parametros, opcoes);

  // O histórico inteiro (~2.300 semanas, uma consulta): os exemplos da camada C são semanas antigas; `desde` só recorta
  // o que vai para o gráfico.
  const agora = deps.agora || new Date();
  const todos = await calculo.calcular({ asOf: agora, parametros }, deps);
  const pontos = desde ? todos.filter((ponto) => ponto.observedAt >= desde) : todos;
  const ultimo = todos.at(-1) || null;
  return {
    calculo: {
      fator: fator.codigo,
      factorId: calculo.factorId,
      factorVersion: calculo.factorVersion,
      situacao: fator.proposta.situacao,
      peso: fator.peso,
      parametros,
      simulacao: !mesmosParametros(parametros, sistema.parametros),
      parametrosSistema: sistema.parametros,
      origemParametros: sistema.origem,
      parametrosPadrao: calculo.parametrosPadrao,
      unidade: calculo.apresentacao.unidade,
      periodicidade: calculo.periodicidade,
      tempoReal: false,
      apresentacao: calculo.apresentacao,
      // A decisão da última semana em passos, com os números dela; o peso fecha a lista (vem do FEL 1).
      explicacao: ultimo?.decisao ? [...calculo.explicar(ultimo, parametros), `Peso: ${fator.peso}, do FEL 1 (não é calculado).`] : [],
      exemplos: calculo.exemplos(todos, parametros),
      pontos
    }
  };
}

// Histórico dos parâmetros do fator, da versão mais recente para a mais antiga, e os padrões do código.
async function listarParametros(ativo, codigoFator, deps = {}) {
  const { fator, calculo } = fatorCalculado(ativo, codigoFator);
  const repo = deps.fatorParametroRepository || fatorParametroRepository;
  return { parametros: { versoes: await repo.listarVersoes(fator.codigo), padrao: calculo.parametrosPadrao } };
}

// Grava os parâmetros como os valores do sistema (só admin, na rota): uma versão nova, com o motivo e o autor.
// Recusa parâmetros incompletos ou inválidos, motivo curto e parâmetros iguais aos em uso.
async function salvarParametros(ativo, codigoFator, { parametros, motivo } = {}, usuarioId, deps = {}) {
  const { fator, calculo } = fatorCalculado(ativo, codigoFator);
  const valores = parametros && typeof parametros === "object" ? parametros : {};
  const faltando = Object.keys(calculo.parametrosPadrao).filter((chave) => valores[chave] === undefined || valores[chave] === "");
  if (faltando.length > 0) throw new ValidationError(`Faltam parâmetros: ${faltando.join(", ")}.`);
  const novos = lerParametros(calculo.parametrosPadrao, valores);

  const texto = String(motivo || "").trim();
  if (texto.length < MOTIVO_MIN || texto.length > MOTIVO_MAX) {
    throw new ValidationError(`Informe o motivo do ajuste (de ${MOTIVO_MIN} a ${MOTIVO_MAX} caracteres).`);
  }

  const sistema = await parametrosDoSistema(fator, calculo, deps);
  if (mesmosParametros(novos, sistema.parametros)) throw new ValidationError("Os parâmetros são iguais aos que já estão em uso.");

  const repo = deps.fatorParametroRepository || fatorParametroRepository;
  try {
    const versao = await repo.criarVersao({ fatorCodigo: fator.codigo, parametros: novos, motivo: texto, alteradoPor: usuarioId });
    return { parametros: { versao, valores: novos } };
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      throw new ConflictError("Outro ajuste foi salvo ao mesmo tempo. Recarregue e tente de novo.");
    }
    throw err;
  }
}

module.exports = { obterMetodologiaAtivo, calcularFator, listarParametros, salvarParametros };
