"use strict";

const XLSX = require("xlsx");
const { slug, semAcento } = require("./imea-comum");
const { codigoDoItem, unidadeDoItem, UNIDADE_PADRAO, UNIDADE_POR_ITEM } = require("./imea-custo-itens");

// Extrai o CUSTO DE PRODUÇÃO DO MILHO de uma planilha XLSX do IMEA (uma das 4: Mensal e Ponderado, cada uma em Alta
// e Média Tecnologia). ADR 0018. Funciona sobre matrizes de células, não sobre o arquivo: a leitura do XLSX fica em
// `lerPlanilha`, e o resto é função pura, testável sem arquivo.
//
// Layout conferido nas 4 planilhas publicadas em 15/09/2026. Tudo é achado pelo TEXTO, nunca pela posição:
//   - aba `Indice`: uma linha por aba de local (`Item` = nome da aba, `Local` = "MT" ou o município);
//   - uma aba por local (`Milho_MT`, `Milho_Mensal_ALTA_sor`...), com o título (tipo, tecnologia, local), as linhas de
//     cabeçalho `Safra` / `Ano` / `Mês` (uma coluna por período) e uma linha por item de custo, terminando em
//     `Unidade: R$/ha.`;
//   - coluna de período: `Consolidado` (a safra inteira, `2021/22`) ou um mês da safra corrente (`Julho`, `Agosto*`; o
//     asterisco é "estimativa"). A coluna `Var. Mensal` é variação derivada e NÃO é extraída.
//
// Nenhum cálculo, conversão nem interpretação: só os valores publicados. A célula com "-" ou em branco é AUSÊNCIA
// (não vira zero); o zero publicado (número 0) é mantido.
//
// `series_code`: `IMEA.CUSTO.MILHO.<PERIODO>.<ITEM_REGIAO>.<ITEM>`. Nas colunas mensais (`PERIODO=MES`), o
// `ITEM_REGIAO` é `<TIPO>_<TECNOLOGIA>_<LOCAL>` - o TIPO (Mensal/Ponderado) entra no item porque os dois arquivos
// trazem o MESMO mês com valores diferentes (a fonte não explica a diferença): não dá pra ter uma só série por
// mês/local/tecnologia, então os dois tipos convivem como itens distintos do MESMO card (seletor de região/tela).
// Na coluna "Consolidado" (`PERIODO=SAFRA`, só existe no Ponderado), `ITEM_REGIAO` é só `<TECNOLOGIA>_<LOCAL>` -
// sem ambiguidade de tipo, sem precisar dele no item.

const LIMITE_COLUNAS = 40;
const RE_SAFRA = /^(\d{4})\/(\d{2})$/;
const MESES = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12
};

function texto(celula) {
  if (celula === null || celula === undefined) return "";
  return String(celula).replace(/\s+/g, " ").trim();
}

// "MT" é o estado; os demais são municípios.
function codigoDoLocal(nome) {
  const codigo = slug(nome);
  return codigo === "MT" ? "MATO_GROSSO" : codigo;
}

// ---------------------------------------------------------------- leitura do arquivo

function matriz(planilha) {
  const ref = XLSX.utils.decode_range(planilha["!ref"] || "A1");
  // Algumas abas declaram a largura máxima do Excel (16.384 colunas) só por formatação: só as primeiras importam.
  ref.e.c = Math.min(ref.e.c, LIMITE_COLUNAS - 1);
  return XLSX.utils.sheet_to_json(planilha, { header: 1, defval: null, raw: true, range: XLSX.utils.encode_range(ref) });
}

// Buffer XLSX -> { indice, abas }, com as abas de local (`Milho_*`) já em matriz. Lança Error se não for um XLSX
// com a aba `Indice`.
function lerPlanilha(buffer) {
  const livro = XLSX.read(buffer, { type: "buffer" });
  if (!livro.Sheets.Indice) throw new Error('a planilha não tem a aba "Indice" (formato inesperado).');
  const abas = {};
  for (const nome of livro.SheetNames) {
    if (/^Milho_/.test(nome)) abas[nome] = matriz(livro.Sheets[nome]);
  }
  return { indice: matriz(livro.Sheets.Indice), abas };
}

// ---------------------------------------------------------------- índice

// [{ aba, local }] das linhas do Indice que apontam para uma aba de milho.
function lerIndice(linhas) {
  return linhas
    .filter((linha) => /^Milho_/.test(texto(linha[0])))
    .map((linha) => ({ aba: texto(linha[0]), local: texto(linha[2]) }))
    .filter((entrada) => entrada.local);
}

// ---------------------------------------------------------------- uma aba (um local)

// Colunas de período da aba: { colunas: [{ coluna, periodo: "SAFRA" | "MES", observedAt, safra, mes, estimativa }],
// ambiguas: [{ coluna, periodo, observedAt, rotulo, vezes }] }. Um período que aparece em MAIS DE UMA coluna (visto na
// aba de Tangará da Serra do Ponderado Média: "2024/25" rotulada como "2025/26") é ambíguo: não há como saber qual
// coluna é qual, então NENHUMA delas é gravada e cada uma é reportada (o resto da aba é aproveitado).
function lerColunas(linhaSafra, linhaAno, linhaMes) {
  const todas = [];
  for (let coluna = 1; coluna < LIMITE_COLUNAS; coluna += 1) {
    const m = RE_SAFRA.exec(texto(linhaSafra[coluna]));
    if (!m) continue; // vazia ou "Var. Mensal" (variação derivada)

    const inicio = Number(m[1]);
    if ((inicio + 1) % 100 !== Number(m[2])) throw new Error(`coluna ${coluna + 1}: rótulo de safra inválido "${texto(linhaSafra[coluna])}".`);
    const rotuloMes = texto(linhaMes[coluna]);
    const mes = semAcento(rotuloMes).toLowerCase().replace(/\*/g, "").trim();
    const ano = Number(texto(linhaAno[coluna]));

    let periodo;
    let observedAt;
    if (mes === "consolidado") {
      // Safra consolidada. 1º de setembro do ano de início é CONVENÇÃO (a mesma do WASDE e da Conab).
      if (ano !== inicio) throw new Error(`coluna ${coluna + 1}: o ano (${texto(linhaAno[coluna])}) não é o de início da safra ${m[1]}/${m[2]}.`);
      periodo = "SAFRA";
      observedAt = `${inicio}-09-01`;
    } else if (MESES[mes]) {
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw new Error(`coluna ${coluna + 1}: ano inválido "${texto(linhaAno[coluna])}".`);
      periodo = "MES";
      observedAt = `${ano}-${String(MESES[mes]).padStart(2, "0")}-01`;
    } else {
      throw new Error(`coluna ${coluna + 1}: período desconhecido "${rotuloMes}".`);
    }

    todas.push({ coluna, periodo, observedAt, safra: `${m[1]}/${m[2]}`, mes: rotuloMes, estimativa: rotuloMes.includes("*") });
  }
  if (todas.length === 0) throw new Error("nenhuma coluna de período (safra consolidada ou mês) encontrada.");

  const vezes = new Map();
  for (const c of todas) vezes.set(`${c.periodo}|${c.observedAt}`, (vezes.get(`${c.periodo}|${c.observedAt}`) || 0) + 1);
  const repetida = (c) => vezes.get(`${c.periodo}|${c.observedAt}`) > 1;
  return {
    colunas: todas.filter((c) => !repetida(c)),
    ambiguas: todas
      .filter(repetida)
      .map((c) => ({ coluna: c.coluna, periodo: c.periodo, observedAt: c.observedAt, rotulo: `${c.safra} ${c.mes}`, vezes: vezes.get(`${c.periodo}|${c.observedAt}`) }))
  };
}

function acharLinha(linhas, rotulo) {
  return linhas.findIndex((linha) => semAcento(texto(linha[0])).toLowerCase() === rotulo);
}

// Confere o título da aba (tipo, tecnologia e local) com o que o arquivo e o Índice dizem. Barra uma aba trocada.
function conferirTitulo(titulos, { tipo, tecnologia, codigoLocal }) {
  const codigos = titulos.map(slug);
  const tecnologiaDaAba = codigos.find((c) => /^MILHO_(ALTA|MEDIA)_TECNOLOGIA$/.test(c));
  if (!tecnologiaDaAba) throw new Error('o título "MILHO ... TECNOLOGIA" não foi encontrado.');
  if (tecnologiaDaAba !== `MILHO_${tecnologia}_TECNOLOGIA`) throw new Error(`a aba é de ${tecnologiaDaAba}, mas o arquivo é de tecnologia ${tecnologia}.`);
  const mensalNaAba = codigos.some((c) => c.includes("MENSAL"));
  if (mensalNaAba !== (tipo === "MENSAL")) throw new Error(`o título da aba ${mensalNaAba ? "diz" : "não diz"} "MENSAL", mas o arquivo é ${tipo}.`);
  // A fonte varia a grafia das preposições ("Campo Novo do Parecis" no Índice, "CAMPO NOVO DOS PARECIS" no título).
  const semPreposicao = (c) => c.replace(/(^|_)(DE|DA|DO|DAS|DOS)(?=_)/g, "");
  if (!codigos.some((c) => semPreposicao(c) === semPreposicao(codigoLocal))) {
    throw new Error(`o título da aba não é o local "${codigoLocal}" do Índice.`);
  }
}

// Uma aba -> { observacoes, invalidos }. Lança Error se o layout não é o esperado.
function extrairAba(linhas, { tipo, tecnologia, local }) {
  const codigoLocal = codigoDoLocal(local);
  const idxSafra = acharLinha(linhas, "safra");
  const idxAno = acharLinha(linhas, "ano");
  const idxMes = acharLinha(linhas, "mes");
  if (idxSafra < 0 || idxAno < 0 || idxMes < 0) throw new Error('as linhas de cabeçalho "Safra", "Ano" e "Mês" não foram encontradas.');

  conferirTitulo(linhas.slice(0, idxSafra).map((l) => texto(l[0])).filter(Boolean), { tipo, tecnologia, codigoLocal });
  const { colunas, ambiguas } = lerColunas(linhas[idxSafra], linhas[idxAno], linhas[idxMes]);

  const observacoes = [];
  const invalidos = ambiguas.map((a) => ({
    item: { local: codigoLocal, coluna: a.coluna + 1, periodo: a.observedAt },
    motivo: `a coluna "${a.rotulo}" repete um período que aparece em ${a.vezes} colunas da aba (rótulo repetido na fonte): não há como saber qual é qual, nenhuma foi gravada.`
  }));
  const codigosVistos = new Set();
  let unidadeConferida = false;

  for (let i = idxMes + 1; i < linhas.length; i += 1) {
    const linha = linhas[i];
    const rotulo = texto(linha[0]);
    if (!rotulo) continue;

    if (/^Unidade:/i.test(rotulo)) {
      if (!new RegExp(`^Unidade:\\s*${UNIDADE_PADRAO.replace(/[$/]/g, "\\$&")}`, "i").test(rotulo)) {
        throw new Error(`a unidade da planilha mudou (esperava "${UNIDADE_PADRAO}", achei "${rotulo}").`);
      }
      unidadeConferida = true;
      break;
    }

    const item = codigoDoItem(rotulo);
    if (!item) continue;
    const ident = { local: codigoLocal, item: rotulo };
    if (codigosVistos.has(item)) {
      invalidos.push({ item: ident, motivo: `o item "${rotulo}" repete um código já lido na aba (${item}).` });
      continue;
    }
    codigosVistos.add(item);

    // Um parêntese com "/" ou "$" no rótulo é uma unidade (as duas linhas conhecidas estão em UNIDADE_POR_ITEM);
    // uma nova não é gravada como R$/ha.
    const temUnidadeNoRotulo = (rotulo.match(/\(([^)]*)\)/g) || []).some((p) => /[/$]/.test(p));
    if (temUnidadeNoRotulo && !UNIDADE_POR_ITEM[item]) {
      invalidos.push({ item: ident, motivo: `o rótulo "${rotulo}" indica uma unidade que não é a da planilha (${UNIDADE_PADRAO}) e não é uma linha conhecida.` });
      continue;
    }
    const unidade = unidadeDoItem(item);

    for (const col of colunas) {
      const celula = linha[col.coluna];
      let valor;
      if (typeof celula === "number") {
        valor = celula;
      } else {
        const t = texto(celula);
        if (t === "" || t === "-") continue;
        invalidos.push({ item: { ...ident, periodo: col.observedAt }, motivo: `valor não numérico: "${t}".` });
        continue;
      }
      if (!Number.isFinite(valor)) {
        invalidos.push({ item: { ...ident, periodo: col.observedAt }, motivo: `valor inválido: ${celula}.` });
        continue;
      }
      // O item (a "região" do card) leva o TIPO (Mensal/Ponderado) só quando o período é MES: os dois arquivos
      // trazem colunas mensais para o mesmo mês, com valores diferentes e sem explicação da fonte, então precisam
      // conviver como itens distintos no MESMO card. Já a coluna "Consolidado" (SAFRA) só existe no Ponderado - sem
      // ambiguidade, sem precisar do tipo no item (rótulo mais limpo). Ver `descreverLocalCustoImea`.
      const regiaoItem = col.periodo === "SAFRA" ? `${tecnologia}_${codigoLocal}` : `${tipo}_${tecnologia}_${codigoLocal}`;
      observacoes.push({
        seriesCode: `IMEA.CUSTO.MILHO.${col.periodo}.${regiaoItem}.${item}`,
        observedAt: col.observedAt,
        // Arredondado a 6 casas (mesma precisão do DECIMAL(18,6) e do mesmoValor() do point-in-time.service.js).
        // O IMEA calcula esses valores (custo ponderado por área etc.) e a planilha guarda o float bruto com mais
        // de 6 casas (ex.: 27,8871875): sem arredondar aqui, a comparação em JS (Number(x).toFixed(6)) e o
        // arredondamento do banco na 1ª gravação podem discordar no 6º dígito (double vs decimal), lendo uma
        // republicação sem mudança real como revisão nova a cada coleta. Achado real (backend/database, 2026-09-22).
        valor: Number(valor.toFixed(6)),
        unidade,
        tipo,
        tecnologia,
        periodo: col.periodo,
        local: codigoLocal,
        localNome: local,
        item,
        rotulo,
        safra: col.safra,
        mes: col.mes,
        estimativa: col.estimativa
      });
    }
  }

  if (!unidadeConferida) throw new Error('a linha "Unidade: R$/ha." não foi encontrada (a planilha terminou antes?).');
  return { observacoes, invalidos };
}

// ---------------------------------------------------------------- uma planilha (todos os locais)

/**
 * { indice, abas } -> { observacoes, invalidos, locaisSemAba }. Falha de UMA aba vai para os inválidos e não derruba
 * as demais. `locaisSemAba` = locais que o Índice lista mas cuja aba não existe na planilha (lacuna da própria fonte,
 * vista em 3 dos 4 arquivos): informativo, não é falha.
 */
function extrairCusto({ indice, abas }, { tipo, tecnologia }) {
  const locais = lerIndice(indice);
  if (locais.length === 0) throw new Error("o Índice da planilha não lista nenhuma aba de milho.");

  const observacoes = [];
  const invalidos = [];
  const locaisSemAba = [];

  for (const { aba, local } of locais) {
    if (!abas[aba]) {
      locaisSemAba.push(local);
      continue;
    }
    try {
      const resultado = extrairAba(abas[aba], { tipo, tecnologia, local });
      observacoes.push(...resultado.observacoes);
      invalidos.push(...resultado.invalidos);
    } catch (err) {
      invalidos.push({ item: { aba, local }, motivo: `Aba não lida: ${err.message}` });
    }
  }
  return { observacoes, invalidos, locaisSemAba };
}

module.exports = { lerPlanilha, lerIndice, extrairAba, extrairCusto, codigoDoLocal, MESES };
