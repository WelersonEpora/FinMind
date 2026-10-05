"use strict";

const { ConflictError, NotFoundError, ValidationError } = require("../shared/errors");
const fatorParametroRepository = require("../repositories/fator-parametro.repository");
const { obterMetodologiaPetroleo } = require("../shared/metodologia-petroleo");
const { obterMetodologiaOuro } = require("../shared/metodologia-ouro");
const { obterMetodologiaMilho } = require("../shared/metodologia-milho");
const { obterMetodologiaCafe } = require("../shared/metodologia-cafe");
const { buscarNoCatalogo } = require("./observaveis.service");
const geopoliticaService = require("./geopolitica.service");
const { montarTextoPrompt } = require("../factors/base/texto-prompt");
const { ATIVOS_COM_ANALISE_DIARIA } = require("../shared/analise-diaria");

// Metodologia dos fatores por ativo: a proposta para o David validar (ADRs 0050 e 0053); no milho, a proposta v0 do
// próprio David (ADR 0055); no café, o Motor do Café v1, com os limiares calibrados pelo FinMind (ADR 0060).
const METODOLOGIAS = {
  CAFE: obterMetodologiaCafe,
  MILHO: obterMetodologiaMilho,
  OURO: obterMetodologiaOuro,
  PETROLEO: obterMetodologiaPetroleo
};

// Os ativos cujo prompt diário já foi aprovado (petróleo, ADR 0052; ouro, ADR 0054; shared/analise-diaria.js): a tela
// só oferece o prompt para eles, e prompt-diario.service.js só o monta para eles.
const ATIVOS_COM_PROMPT_DIARIO = ATIVOS_COM_ANALISE_DIARIA;

// Propostas já calculadas (camadas A, B e C simulada): fator do FEL 1 -> a METODOLOGIA do módulo em `factors/`
// (calcular, explicar, exemplos, parâmetros padrão e a apresentação que a tela genérica desenha). Um fator novo é
// só uma linha aqui.
const CALCULOS = {
  PETROLEO_ESTOQUES_EIA: require("../factors/estoques-petroleo-eia.factor").METODOLOGIA,
  PETROLEO_PRODUCAO_EUA: require("../factors/producao-petroleo-eua.factor").METODOLOGIA,
  PETROLEO_DEMANDA: require("../factors/demanda-petroleo-eua.factor").METODOLOGIA,
  PETROLEO_REFINO: require("../factors/refino-petroleo.factor").METODOLOGIA,
  PETROLEO_DOLAR: require("../factors/dolar-petroleo.factor").METODOLOGIA,
  PETROLEO_FUNDOS: require("../factors/fundos-petroleo.factor").METODOLOGIA,
  PETROLEO_JUROS: require("../factors/juros-petroleo.factor").METODOLOGIA,
  PETROLEO_OFERTA_NAO_OPEP: require("../factors/oferta-nao-opep-petroleo.factor").METODOLOGIA,
  OURO_JUROS_REAIS: require("../factors/juros-reais-ouro.factor").METODOLOGIA,
  OURO_DOLAR: require("../factors/dolar-ouro.factor").METODOLOGIA,
  OURO_INFLACAO: require("../factors/inflacao-ouro.factor").METODOLOGIA,
  OURO_BANCOS_CENTRAIS: require("../factors/bancos-centrais-ouro.factor").METODOLOGIA,
  OURO_ETFS: require("../factors/etfs-ouro.factor").METODOLOGIA,
  OURO_FUNDOS: require("../factors/fundos-ouro.factor").METODOLOGIA,
  OURO_MINERACAO: require("../factors/mineracao-ouro.factor").METODOLOGIA,
  MILHO_ESTOQUES_WASDE: require("../factors/estoques-milho-wasde.factor").METODOLOGIA,
  MILHO_FUNDOS: require("../factors/fundos-milho.factor").METODOLOGIA,
  MILHO_CLIMA_SAFRA_EUA: require("../factors/clima-milho-eua.factor").METODOLOGIA,
  MILHO_SAFRINHA: require("../factors/safrinha-milho.factor").METODOLOGIA,
  MILHO_POLITICA_COMERCIAL: require("../factors/exportacao-milho.factor").METODOLOGIA,
  MILHO_ETANOL: require("../factors/etanol-milho.factor").METODOLOGIA,
  MILHO_DOLAR_PARIDADE: require("../factors/dolar-paridade-milho.factor").METODOLOGIA,
  MILHO_INSUMOS: require("../factors/insumos-milho.factor").METODOLOGIA,
  CAFE_CLIMA: require("../factors/clima-cafe.factor").METODOLOGIA,
  CAFE_SAFRA_BRASIL: require("../factors/safra-cafe.factor").METODOLOGIA,
  CAFE_ESTOQUES: require("../factors/estoques-cafe-ice.factor").METODOLOGIA,
  CAFE_DOLAR: require("../factors/dolar-cafe.factor").METODOLOGIA,
  CAFE_CUSTO_PRECO_MINIMO: require("../factors/custos-cafe.factor").METODOLOGIA,
  CAFE_DEMANDA: require("../factors/demanda-cafe.factor").METODOLOGIA,
  CAFE_FUNDOS: require("../factors/fundos-cafe.factor").METODOLOGIA,
  CAFE_JUROS: require("../factors/juros-cafe.factor").METODOLOGIA
};

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// O dia de hoje em São Paulo (AAAA-MM-DD): a data das leituras de eventos e o limite de uma simulação.
function hojeEmSaoPaulo(agora) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

// A data de uma simulação (AAAA-MM-DD): válida e não no futuro.
function validarDataSimulada(data, agora) {
  if (!DATA_ISO.test(String(data)) || Number.isNaN(Date.parse(data))) throw new ValidationError('"data" deve estar em AAAA-MM-DD.');
  if (data > hojeEmSaoPaulo(agora)) throw new ValidationError('"data" não pode estar no futuro.');
  return data;
}

// O fim do dia em São Paulo: o asOf de uma simulação (o que já tinha sido publicado até o fim daquele dia). Usa
// -03:00; nos verões com horário de verão (até 2019) a diferença é de uma hora.
function fimDoDia(data) {
  return new Date(`${data}T23:59:59.999-03:00`);
}
const MOTIVO_MIN = 5;
const MOTIVO_MAX = 500;
const SEMANAS_TENDENCIA_MAX = 26;

// Parâmetros da camada C (simulação): os padrões do fator, trocados pelos que vierem na query. Só números de 0 a 100;
// nos fatores da decisão por faixa, o limiar moderado abaixo do forte; a tendência em semanas inteiras, de 1 a 26. Um
// fator com regra própria (ex.: o clima do milho, com limiares de alta e de baixa diferentes) só tem as chaves dele.
function lerParametros(padrao, valores = {}) {
  const parametros = { ...padrao };
  for (const chave of Object.keys(padrao)) {
    if (valores[chave] === undefined || valores[chave] === "") continue;
    const valor = Number(valores[chave]);
    if (!Number.isFinite(valor) || valor < 0 || valor > 100) throw new ValidationError(`"${chave}" deve ser um número entre 0 e 100.`);
    parametros[chave] = valor;
  }
  if ("limiarModeradoPct" in padrao && "limiarFortePct" in padrao && !(parametros.limiarModeradoPct < parametros.limiarFortePct)) {
    throw new ValidationError('"limiarModeradoPct" deve ser menor que "limiarFortePct".');
  }
  for (const chave of ["semanasTendencia", "semanasSeguidas", "levantamentosSeguidos"]) {
    if (!(chave in padrao)) continue;
    const semanas = parametros[chave];
    if (!Number.isInteger(semanas) || semanas < 1 || semanas > SEMANAS_TENDENCIA_MAX) {
      throw new ValidationError(`"${chave}" deve ser um inteiro de 1 a ${SEMANAS_TENDENCIA_MAX}.`);
    }
  }
  return parametros;
}

// O catálogo guarda só o código do observável; a tela precisa do nome para o link do card.
function paraResposta(metodologia) {
  return {
    ...metodologia,
    promptDiario: ATIVOS_COM_PROMPT_DIARIO.includes(metodologia.ativo),
    fatores: metodologia.fatores.map((fator) => ({
      ...fator,
      calculado: Boolean(CALCULOS[fator.codigo]),
      // Fator de evento: só eventos, sem cálculo. Com eventos: calculado e também com os eventos da leitura diária marcados
      // com ele (o milho, ADR 0058).
      deEvento: Boolean(fator.evento) && !CALCULOS[fator.codigo],
      comEventos: Boolean(fator.evento) && Boolean(CALCULOS[fator.codigo]),
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
// `data` (AAAA-MM-DD, opcional): SIMULA o fator naquela data, com o que se sabia até o fim dela (point-in-time).
async function calcularFator(ativo, codigoFator, { desde, data, ...opcoes } = {}, deps = {}) {
  const { fator, calculo } = fatorCalculado(ativo, codigoFator);
  if (desde !== undefined && (!DATA_ISO.test(desde) || Number.isNaN(Date.parse(desde)))) {
    throw new ValidationError('"desde" deve estar em AAAA-MM-DD.');
  }
  const sistema = await parametrosDoSistema(fator, calculo, deps);
  const parametros = lerParametros(sistema.parametros, opcoes);

  // O histórico inteiro (~2.300 semanas, uma consulta): os exemplos da camada C são semanas antigas; `desde` só recorta
  // o que vai para o gráfico.
  const agora = deps.agora || new Date();
  const dataSimulada = data === undefined || data === "" ? null : validarDataSimulada(data, agora);
  const calculados = await calculo.calcular({ asOf: dataSimulada ? fimDoDia(dataSimulada) : agora, parametros }, deps);
  const todos = dataSimulada ? calculados.filter((ponto) => ponto.observedAt <= dataSimulada) : calculados;
  const pontos = desde ? todos.filter((ponto) => ponto.observedAt >= desde) : todos;
  const ultimo = todos.at(-1) || null;
  const calculoResposta = {
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
      dataSimulada,
      apresentacao: calculo.apresentacao,
      // A decisão da última semana em passos, com os números dela; o peso fecha a lista (vem do FEL 1).
      explicacao: ultimo?.decisao ? [...calculo.explicar(ultimo, parametros), `Peso: ${fator.peso}, do especialista (não é calculado).`] : [],
      exemplos: calculo.exemplos(todos, parametros),
      pontos
  };
  // O bloco do fator para o prompt da IA do ativo, o mesmo texto que a tela mostra (ADR 0050).
  calculoResposta.textoPrompt = montarTextoPrompt({
    ativo: String(ativo).trim().toUpperCase(),
    fator,
    calculo: calculoResposta,
    ponto: ultimo
  });
  return { calculo: calculoResposta };
}

// O resultado de um fator de evento (ADR 0050): os eventos aceitos da leitura diária marcados com ele, na janela do
// fator até hoje (ou até `data`, numa simulação), e o bloco pronto para o prompt da IA do ativo. Fator sem `evento`
// no catálogo: 404.
async function obterEventosFator(ativo, codigoFator, { data } = {}, deps = {}) {
  const codigo = String(ativo || "").trim().toUpperCase();
  const fator = construtorDoAtivo(codigo)().fatores.find((item) => item.codigo === String(codigoFator || "").toUpperCase());
  if (!fator?.evento) throw new NotFoundError("Este fator não é um fator de evento.");
  const servico = deps.geopoliticaService || geopoliticaService;
  const agora = deps.agora || new Date();
  const dia = data === undefined || data === "" ? hojeEmSaoPaulo(agora) : validarDataSimulada(data, agora);
  // Um fator CALCULADO que também recebe eventos (o milho, ADR 0058): o bloco diz que os eventos complementam o cálculo.
  const janela = { janelaDias: fator.evento.janelaDias, comCalculo: Boolean(CALCULOS[fator.codigo]) };
  const eventosFator = await servico.obterEventosDoFator(codigo, fator.codigo, dia, janela, deps);
  // Logo abaixo do título, a identificação do fator no catálogo, como nos fatores calculados: o código (o que a IA cita
  // na resposta), o peso e o tipo no FEL 1. O serviço de eventos não conhece o catálogo da metodologia. Num fator
  // calculado, o bloco vai logo depois do texto do cálculo, que já identifica o fator.
  const identificacao =
    `Código: ${fator.codigo} | Peso no FEL 1: ${fator.peso} | Tipo no FEL 1: ${fator.fel1.tipo} | ` +
    `Regra: fator de evento (janela de ${fator.evento.janelaDias} dias)`;
  const [titulo, ...resto] = eventosFator.contexto.split("\n");
  const linhas = janela.comCalculo ? [titulo, ...resto] : [titulo, identificacao, ...resto];
  return { eventosFator: { ...eventosFator, contexto: linhas.join("\n") } };
}

// --- Simulação numa data (ADR 0050) -------------------------------------------------------------------------------
//
// O que cada fator do ativo mostraria numa data, com o que se sabia até o fim dela, e o bloco dos fatores completo
// (os textos de todos, na ordem do catálogo) que iria ao prompt da IA do ativo. Os parâmetros da camada C são os em
// uso hoje. Nada é gravado.

function resumoCalculado(calculo) {
  const ultimo = calculo.pontos.at(-1) || null;
  const { graficoC, rotulosDecisao } = calculo.apresentacao;
  const d = ultimo?.decisao;
  return {
    tipo: "CALCULADO",
    observedAt: ultimo?.observedAt ?? null,
    // Quando o dado do ponto ficou disponível (point-in-time) e se essa data é estimada: a idade e a qualidade do dado.
    publicadoEm: ultimo?.disponivelEm ?? null,
    publicadoEmEstimado: ultimo ? Boolean(ultimo.disponivelEmEhEstimado) : null,
    periodicidade: calculo.periodicidade,
    // A versão do cálculo e dos parâmetros usados: a auditoria de "o que a IA recebeu".
    factorId: calculo.factorId,
    factorVersion: calculo.factorVersion,
    parametros: calculo.parametros,
    origemParametros: calculo.origemParametros ? { versao: calculo.origemParametros.versao, alteradoEm: calculo.origemParametros.alteradoEm } : null,
    medida: ultimo ? { rotulo: graficoC.rotulo, valor: ultimo[graficoC.campo] ?? null, unidade: graficoC.unidade || "%" } : null,
    decisao: d
      ? {
          direcao: d.direcao,
          intensidade: d.intensidade,
          tendencia: d.tendencia,
          rotuloDirecao: rotulosDecisao.direcao[d.direcao],
          rotuloIntensidade: rotulosDecisao.intensidade[d.intensidade],
          rotuloTendencia: d.tendencia ? rotulosDecisao.tendencia[d.tendencia] : null
        }
      : null,
    textoPrompt: calculo.textoPrompt
  };
}

function resumoEvento(eventosFator) {
  return {
    tipo: "EVENTO",
    eventos: eventosFator.eventos.length,
    janelaDias: eventosFator.janelaDias,
    primeiraLeitura: eventosFator.primeiraLeitura,
    ultimaLeitura: eventosFator.ultimaLeitura ? { data: eventosFator.ultimaLeitura.data, nivel: eventosFator.ultimaLeitura.nivel } : null,
    textoPrompt: eventosFator.contexto
  };
}

async function simularFatores(ativo, { data } = {}, deps = {}) {
  const codigo = String(ativo || "").trim().toUpperCase();
  const metodologia = construtorDoAtivo(codigo)();
  const agora = deps.agora || new Date();
  const dia = validarDataSimulada(data, agora);
  const fatores = await Promise.all(
    metodologia.fatores.map(async (fator) => {
      const base = {
        codigo: fator.codigo,
        nome: fator.nome,
        peso: fator.peso,
        tipoFel1: fator.fel1.tipo,
        situacaoRegra: fator.proposta.situacao,
        observaveis: fator.dados.observaveis,
        // Fator de CONTEXTO de outro (metodologia-base.js): sem leitura própria no prompt.
        ...(fator.contextoDe ? { contextoDe: fator.contextoDe } : {})
      };
      if (CALCULOS[fator.codigo]) {
        const { calculo } = await calcularFator(codigo, fator.codigo, { data: dia }, deps);
        const calculado = { ...base, ...resumoCalculado(calculo) };
        if (!fator.evento) return calculado;
        // Calculado e com eventos (o milho, ADR 0058): o bloco dos eventos do fator vai depois do texto do cálculo.
        const { eventosFator } = await obterEventosFator(codigo, fator.codigo, { data: dia }, deps);
        const eventos = resumoEvento(eventosFator);
        return {
          ...calculado,
          eventos: eventos.eventos,
          janelaDias: eventos.janelaDias,
          primeiraLeitura: eventos.primeiraLeitura,
          ultimaLeitura: eventos.ultimaLeitura,
          textoPrompt: [calculado.textoPrompt, eventos.textoPrompt].filter(Boolean).join("\n\n")
        };
      }
      if (fator.evento) {
        const { eventosFator } = await obterEventosFator(codigo, fator.codigo, { data: dia }, deps);
        return { ...base, ...resumoEvento(eventosFator) };
      }
      return { ...base, tipo: "SEM_PROPOSTA", textoPrompt: null };
    })
  );
  // O prompt completo (com o preço, a cobertura e as faixas) é montado pelo prompt-diario.service.js, que usa estes
  // mesmos resultados: a simulação não monta um texto próprio.
  return {
    simulacao: {
      ativo: codigo,
      data: dia,
      versaoMetodologia: `${codigo.toLowerCase()}-v${metodologia.versao} (${metodologia.dataVersao})`,
      fatores,
      // O calendário de pesos, quando vai ao prompt (o milho, ADR 0065): a tabela fixa do bloco 2.5.
      ...(metodologia.pesos.noPrompt ? { pesos: metodologia.pesos } : {})
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

module.exports = { ATIVOS_COM_PROMPT_DIARIO, obterMetodologiaAtivo, calcularFator, obterEventosFator, simularFatores, listarParametros, salvarParametros };
