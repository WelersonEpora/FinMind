"use strict";

const { slug } = require("./imea-comum");

// Extrai, da resposta de `GET /api/v2/mobile/cadeias/3/cotacoes` (cadeia do milho), a ÁREA, a PRODUÇÃO e a
// PRODUTIVIDADE por safra de Mato Grosso e das 7 regiões do IMEA. ADR 0018.
//
// A resposta mistura ~130 indicadores da cadeia (preço, custo por item, andamento de semeadura e colheita...),
// cada um só com um `IndicadorFinalId` numérico e SEM nome. Só entram os 3 abaixo, identificados por
// CASAMENTO DE VALOR com o relatório de Oferta e Demanda de 31/08/2026 (Mato Grosso, safra 2025/26: 7,43 milhões de
// ha, 58,04 milhões de t, 130,11 sc/ha; e as 7 regiões, uma a uma). Os demais IDs (% e R$/sc) NÃO foram
// identificados com essa certeza e não são coletados.
//
// A unidade que a API informa (`UnidadeSigla`) é conferida: se mudar, o item vai para os inválidos em vez de
// gravar um número na unidade errada. Nada é convertido nem calculado: valores como publicados.

const INDICADORES = {
  "700940565361721344": { metrica: "AREA", unidade: "ha" },
  "701185771642290176": { metrica: "PRODUCAO", unidade: "t" },
  "701199398680133632": { metrica: "PRODUTIVIDADE", unidade: "sc/ha" }
};

const TIPO_LOCALIDADE = { 1: "estado", 2: "regiao" };
const RE_SAFRA = /^(\d{2})\/(\d{2})$/;
const RE_DATA = /^(\d{4}-\d{2}-\d{2})/;

// "25/26" -> { safra: "2025/26", observedAt: "2025-09-01" }. O segundo número tem de ser o ano seguinte, senão o
// rótulo não é uma safra. 1º de setembro é CONVENÇÃO (a mesma do WASDE e da Conab): a fonte informa a safra, não um dia.
function lerSafra(rotulo) {
  const m = RE_SAFRA.exec(String(rotulo ?? "").trim());
  if (!m) return null;
  const inicio = 2000 + Number(m[1]);
  if ((inicio + 1) % 100 !== Number(m[2])) return null;
  return { safra: `${inicio}/${m[2]}`, observedAt: `${inicio}-09-01` };
}

function motivoDeInvalidez(item, indicador) {
  if (item.UnidadeSigla !== indicador.unidade) {
    return `unidade "${item.UnidadeSigla}" diferente da esperada ("${indicador.unidade}") para ${indicador.metrica}.`;
  }
  if (typeof item.Valor !== "number" || !Number.isFinite(item.Valor)) return `valor inválido: ${JSON.stringify(item.Valor)}.`;
  if (!lerSafra(item.Safra)) return `safra inválida: ${JSON.stringify(item.Safra)}.`;
  if (!RE_DATA.test(String(item.DataPublicacao ?? ""))) return `DataPublicacao inválida: ${JSON.stringify(item.DataPublicacao)}.`;
  if (!slug(item.Localidade)) return "localidade vazia.";
  return null;
}

/**
 * Filtra pelos 3 indicadores e devolve { observacoes, invalidos, ignorados }. `ignorados` = itens de OUTROS
 * indicadores (a maioria da resposta), só para o log.
 *
 * A API repete alguns itens (a safra 2025/26 vem duas vezes, com o mesmo valor e a mesma data): repetição idêntica
 * vira um só; a mesma safra/região com valores ou datas diferentes vale a de DataPublicacao mais recente, e com a
 * mesma data e valores diferentes os dois vão para os inválidos (não há como saber qual vale).
 */
function extrairSafras(itens) {
  const invalidos = [];
  const porChave = new Map();
  let ignorados = 0;

  for (const item of itens) {
    const indicador = INDICADORES[item?.IndicadorFinalId];
    if (!indicador) {
      ignorados += 1;
      continue;
    }
    const motivo = motivoDeInvalidez(item, indicador);
    if (motivo) {
      invalidos.push({ item: { localidade: item.Localidade, safra: item.Safra, metrica: indicador.metrica }, motivo });
      continue;
    }

    const { safra, observedAt } = lerSafra(item.Safra);
    const regiao = slug(item.Localidade);
    const observacao = {
      seriesCode: `IMEA.MILHO.${regiao}.${indicador.metrica}`,
      observedAt,
      valor: item.Valor,
      unidade: indicador.unidade,
      dataPublicacao: RE_DATA.exec(item.DataPublicacao)[1],
      regiao,
      localidade: item.Localidade,
      tipoLocalidade: TIPO_LOCALIDADE[item.TipoLocalidadeId] ?? null,
      metrica: indicador.metrica,
      safra,
      indicadorId: item.IndicadorFinalId
    };

    const chave = `${observacao.seriesCode}|${observedAt}`;
    const anterior = porChave.get(chave);
    if (!anterior) {
      porChave.set(chave, observacao);
    } else if (anterior.dataPublicacao === observacao.dataPublicacao && anterior.valor !== observacao.valor) {
      porChave.delete(chave);
      invalidos.push({
        item: { localidade: item.Localidade, safra, metrica: indicador.metrica },
        motivo: `a API repete a safra com a mesma data (${observacao.dataPublicacao}) e valores diferentes (${anterior.valor} e ${observacao.valor}).`
      });
    } else if (observacao.dataPublicacao > anterior.dataPublicacao) {
      porChave.set(chave, observacao);
    }
  }

  return { observacoes: [...porChave.values()], invalidos, ignorados };
}

module.exports = { INDICADORES, TIPO_LOCALIDADE, lerSafra, extrairSafras };
