"use strict";

const carteiraRepository = require("../repositories/carteira.repository");
const { CONTAS, ESPECIFICACOES } = require("../carteiras/especificacoes");
const { parametrosPadrao, validarParametros, pendencias, resolverVigente, classificarMudanca } = require("../carteiras/parametros");
const { ehDiaUtil, somarDiasUteis } = require("../carteiras/calendario");
const { ValidationError, ConflictError, NotFoundError } = require("../shared/errors");

// Carteiras virtuais (ADR 0127): criar, listar, detalhar e mudar os parâmetros. Sempre num espaço (o repositório é
// escopado; a rota confere o vínculo, ADR 0007). Conta, moeda, capital e início são fixos desde a criação; os
// parâmetros mudam por versão nova (append-only): um AJUSTE vale a partir da próxima rodada e abre um segmento novo de
// medição; uma CORRECAO_CUSTO (o custo real por contrato) vale desde o início.

const TAMANHO_MAXIMO_NOME = 120;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;
const MOTIVO_INICIAL = "Versão inicial: os parâmetros da Cartilha de Operações v1.0 do Comitê";
// As duas contas (ADR 0127, §11): a B3 (milho, café e soja, em reais) e, desde a etapa 8, a internacional (ouro e
// petróleo, em dólar).
const CONTAS_DISPONIVEIS = Object.freeze(["B3", "INTERNACIONAL"]);

function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

const repoDo = (workspaceId, deps) => (deps.carteiraRepository || carteiraRepository).forWorkspace(workspaceId);
const plano = (registro) => (typeof registro?.get === "function" ? registro.get({ plain: true }) : registro);

function paraResposta(carteira) {
  const c = plano(carteira);
  return {
    id: c.id,
    nome: c.nome,
    conta: c.conta,
    moeda: c.moeda,
    capitalInicial: Number(c.capital_inicial),
    dataInicio: c.data_inicio,
    situacao: c.situacao,
    criadaEm: c.created_at
  };
}

function paraVersao(versao) {
  const v = plano(versao);
  return { versao: v.versao, tipo: v.tipo, vigenteDesde: v.vigente_desde, motivo: v.motivo, autorUserId: v.autor_user_id, criadaEm: v.created_at };
}

function validarNome(nome) {
  if (typeof nome !== "string" || !nome.trim()) throw new ValidationError('"nome" é obrigatório.');
  const final = nome.trim();
  if (final.length > TAMANHO_MAXIMO_NOME) throw new ValidationError(`"nome" deve ter no máximo ${TAMANHO_MAXIMO_NOME} caracteres.`);
  return final;
}

// O início é a 1ª rodada: um dia útil (segunda a sexta) depois de hoje. Uma carteira nunca começa no passado.
function validarInicio(dataInicio, hoje) {
  if (!REGEX_DATA.test(dataInicio || "")) throw new ValidationError('"dataInicio" deve estar em AAAA-MM-DD.');
  if (dataInicio <= hoje) throw new ValidationError(`"dataInicio" deve ser depois de hoje (${hoje}): uma carteira nunca começa no passado.`);
  if (!ehDiaUtil(dataInicio)) throw new ValidationError('"dataInicio" deve ser um dia útil (segunda a sexta).');
}

function erroDeParametros(erros) {
  return new ValidationError("Parâmetros inválidos.", { erros });
}

// POST: a carteira com a versão 1 dos parâmetros (os padrões da Cartilha para a conta e os ativos, ou os enviados) e
// as seis trilhas, numa transação.
async function criarCarteira(workspaceId, userId, dados = {}, deps = {}) {
  const repo = repoDo(workspaceId, deps);
  const hoje = deps.hoje || hojeEmSaoPaulo(deps.agora);
  const nome = validarNome(dados.nome);
  const conta = dados.conta;
  if (!CONTAS[conta]) throw new ValidationError(`"conta" deve ser uma entre: ${Object.keys(CONTAS).join(", ")}.`);
  if (!CONTAS_DISPONIVEIS.includes(conta)) throw new ValidationError(`A conta ${conta} ainda não está disponível (ADR 0127, etapa 8).`);
  const capitalInicial = Number(dados.capitalInicial);
  if (!(Number.isFinite(capitalInicial) && capitalInicial > 0)) throw new ValidationError('"capitalInicial" deve ser um número maior que 0.');
  validarInicio(dados.dataInicio, hoje);

  const ativos = dados.ativos;
  if (!Array.isArray(ativos) || ativos.length === 0) throw new ValidationError('"ativos": escolha pelo menos um.');
  if (new Set(ativos).size !== ativos.length) throw new ValidationError('"ativos" repetidos.');
  const foraDaConta = ativos.filter((a) => ESPECIFICACOES[a]?.conta !== conta);
  if (foraDaConta.length) throw new ValidationError(`Ativos que não são da conta ${conta}: ${foraDaConta.join(", ")}.`);

  const parametros = dados.parametros ?? parametrosPadrao(conta, ativos);
  const erros = validarParametros(parametros);
  if (parametros?.conta !== conta) erros.push(`parametros.conta: deve ser ${conta}, a conta da carteira.`);
  const ativosDosParametros = Object.keys(parametros?.ativos || {}).sort();
  if (ativosDosParametros.join(",") !== [...ativos].sort().join(",")) erros.push("parametros.ativos: devem ser os ativos escolhidos.");
  if (erros.length) throw erroDeParametros(erros);

  if (await repo.buscarPorNome(nome)) throw new ConflictError(`Já existe uma carteira "${nome}" neste espaço.`);

  const carteira = await repo.criarComTrilhas({
    carteira: { nome, conta, moeda: CONTAS[conta].moeda, capital_inicial: capitalInicial, data_inicio: dados.dataInicio },
    parametros,
    motivo: typeof dados.motivo === "string" && dados.motivo.trim() ? dados.motivo.trim() : MOTIVO_INICIAL,
    autorUserId: userId
  });
  return { carteira: paraResposta(carteira) };
}

async function listarCarteiras(workspaceId, deps = {}) {
  const carteiras = await repoDo(workspaceId, deps).listar();
  return { carteiras: carteiras.map(paraResposta) };
}

async function buscarOuFalhar(repo, carteiraId) {
  const carteira = await repo.buscar(carteiraId);
  if (!carteira) throw new NotFoundError("Carteira não encontrada.");
  return plano(carteira);
}

// GET de uma carteira: os dados, os parâmetros em vigor (hoje, ou no início se ela ainda não começou), as pendências
// (o custo ainda sem número real), as trilhas e o histórico de versões.
async function obterCarteira(workspaceId, carteiraId, deps = {}) {
  const repo = repoDo(workspaceId, deps);
  const carteira = await buscarOuFalhar(repo, carteiraId);
  const hoje = deps.hoje || hojeEmSaoPaulo(deps.agora);
  const [versoes, trilhas] = await Promise.all([repo.listarVersoes(carteiraId), repo.listarTrilhas(carteiraId)]);
  const planas = versoes.map(plano);
  const data = hoje > carteira.data_inicio ? hoje : carteira.data_inicio;
  const parametros = resolverVigente(planas, data);
  return {
    carteira: {
      ...paraResposta(carteira),
      parametros,
      pendencias: pendencias(parametros),
      trilhas: trilhas.map(plano).map((t) => ({ id: t.id, tipo: t.tipo, calculada: t.calculada })),
      versoes: planas.map(paraVersao)
    }
  };
}

// POST de uma versão nova. Os parâmetros vêm inteiros; a mudança é classificada contra os que estão em vigor na
// última versão: só o custo -> CORRECAO_CUSTO, desde o início; outra coisa -> AJUSTE, a partir do próximo dia útil (ou
// do início, se a carteira ainda não começou). Custo junto com outra mudança é recusado.
async function registrarVersaoDeParametros(workspaceId, carteiraId, userId, { parametros, motivo } = {}, deps = {}) {
  const repo = repoDo(workspaceId, deps);
  const carteira = await buscarOuFalhar(repo, carteiraId);
  if (typeof motivo !== "string" || !motivo.trim()) throw new ValidationError('"motivo" é obrigatório: ele fica no histórico da versão.');

  const erros = validarParametros(parametros);
  if (parametros?.conta !== carteira.conta) erros.push(`parametros.conta: a conta da carteira é ${carteira.conta} e não muda.`);
  if (erros.length) throw erroDeParametros(erros);

  const versoes = (await repo.listarVersoes(carteiraId)).map(plano);
  const atuais = resolverVigente(versoes, "9999-12-31");
  const { tipo, erro } = classificarMudanca(atuais, parametros);
  if (erro) throw new ValidationError(erro);

  const hoje = deps.hoje || hojeEmSaoPaulo(deps.agora);
  const proximaRodada = somarDiasUteis(hoje, 1);
  const vigenteDesde = tipo === "CORRECAO_CUSTO" || carteira.data_inicio > proximaRodada ? carteira.data_inicio : proximaRodada;
  const versao = await repo.registrarVersao({ carteiraId, tipo, vigenteDesde, parametros, motivo: motivo.trim(), autorUserId: userId });
  return { versao: paraVersao(versao) };
}

module.exports = { criarCarteira, listarCarteiras, obterCarteira, registrarVersaoDeParametros, hojeEmSaoPaulo, CONTAS_DISPONIVEIS };
