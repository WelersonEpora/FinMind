"use strict";

const observaveisService = require("./observaveis.service");
const { descreverDimensao } = require("./observation-data.service");
const { TAMANHO_PAGINA_MAXIMO } = require("./market-data.service");
const { NotFoundError, ValidationError } = require("../shared/errors");
const { montarCsv, formatarNumero, formatarDataHoraUtc } = require("../shared/utils/csv");

// Exportação da tabela histórica de um observável (para conferir os números
// fora do sistema). Reaproveita `obterHistoricoObservavel` página a página -
// mesmos filtros (modality/campo/itens), mesma visão "vigente hoje" e
// mesma regra da tela -, só que devolvendo a série INTEIRA, não uma página.
//
// O arquivo fica em memória até o fim (erro no meio vira resposta de erro
// normal, não um arquivo truncado); o teto abaixo protege o servidor de um
// pedido que não cabe nem numa planilha (Excel: ~1,05 mi de linhas).
const LIMITE_LINHAS_EXPORTACAO = 500_000;

// Valores da fonte tal como estão gravados: sem arredondamento e com o
// código da modalidade/vencimento/região (não o rótulo de tela), para o conferente
// poder cruzar com a fonte oficial.
function cabecalhoDe(item, comPublicacao) {
  return [
    "Data de referência",
    "Valor",
    "Unidade",
    // Cards com seletor de métrica: sem esta coluna o arquivo não diz o que o valor mede
    // (várias métricas têm a mesma unidade).
    ...(item.campos ? ["Métrica"] : []),
    descreverDimensao(item)?.rotuloModalidade ?? "Modalidade",
    "Fonte",
    ...(comPublicacao ? ["Disponível desde (UTC)", "Publicação estimada"] : []),
    "Coletado em (UTC)"
  ];
}

function linhaDe(registro, comPublicacao, metrica) {
  return [
    registro.dataReferencia,
    formatarNumero(registro.valor),
    registro.unidade,
    ...(metrica ? [metrica.nome] : []),
    registro.modalidade,
    registro.fonte,
    ...(comPublicacao ? [formatarDataHoraUtc(registro.publicadoEm), registro.publicadoEmEstimado ? "sim" : "não"] : []),
    formatarDataHoraUtc(registro.atualizadoEm)
  ];
}

async function exportarHistoricoCsv(codigo, filtros = {}, deps = {}) {
  const item = observaveisService.buscarNoCatalogo(codigo);
  if (!item) {
    throw new NotFoundError("Observável não encontrado.");
  }

  const obterHistorico = deps.obterHistorico || observaveisService.obterHistoricoObservavel;
  // Só a camada point-in-time (`observation`) sabe quando o valor foi publicado.
  const comPublicacao = item.origem === "observation";
  // Métrica exportada (só cards com seletor): a pedida ou a principal.
  const codigoMetrica = item.campos ? filtros.campo || item.campoPrincipal : null;
  const metrica = item.campos ? { codigo: codigoMetrica, nome: item.campos.find((c) => c.codigo === codigoMetrica)?.nome ?? codigoMetrica } : null;

  const consulta = { ...filtros, tamanhoPagina: TAMANHO_PAGINA_MAXIMO, ordenarPor: "referenceDate", ordem: "ASC" };
  const linhas = [];
  let total = 0;
  let totalPaginas = 1;

  for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
    const resultado = await obterHistorico(codigo, { ...consulta, pagina }, deps);
    if (pagina === 1) {
      total = resultado.paginacao.total;
      totalPaginas = resultado.paginacao.totalPaginas;
      if (total > LIMITE_LINHAS_EXPORTACAO) {
        throw new ValidationError(
          `A seleção tem ${total.toLocaleString("pt-BR")} linhas, acima do limite de exportação (${LIMITE_LINHAS_EXPORTACAO.toLocaleString("pt-BR")}). Filtre por modalidade/vencimento e tente novamente.`
        );
      }
    }
    for (const registro of resultado.historico) linhas.push(linhaDe(registro, comPublicacao, metrica));
  }

  const dataHoje = new Date().toISOString().slice(0, 10);
  return {
    nomeArquivo: `${[item.instrumentCode, metrica?.codigo, dataHoje].filter(Boolean).join("_")}.csv`,
    conteudo: montarCsv(cabecalhoDe(item, comPublicacao), linhas),
    totalLinhas: linhas.length
  };
}

module.exports = { exportarHistoricoCsv, LIMITE_LINHAS_EXPORTACAO };
