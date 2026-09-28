"use strict";

// Leitura do CSV da PSD do café (USDA FAS, `psd_coffee_csv.zip`). ADR 0031.
//
// Layout conferido no arquivo real de 2026-09-28 (87.704 linhas, uma por país × safra × atributo):
//   Commodity_Code,Commodity_Description,Country_Code,Country_Name,Market_Year,Calendar_Year,Month,
//   Attribute_ID,Attribute_Description,Unit_ID,Unit_Description,Value
// Aspas só em alguns campos, e um rótulo tem vírgula dentro (`"Rst,Ground Dom. Consum"`): a linha é lida com
// aspas, nunca por `split(",")`.
//
// SÓ 7 dos 19 atributos entram (os que alimentam os fatores "Estoque global" e "Demanda global e consumo" do café e
// a oferta dos outros países, FEL 1): as subdivisões por tipo (grão, torrado e moído, solúvel), a "outra produção" e
// as identidades contábeis (estoque inicial = final da safra anterior, oferta e distribuição totais) ficam fora.
// Nada é convertido nem somado: mil sacas de 60 kg, como publicado (a PSD do café não traz total mundial; somar os
// países seria um fator).

const CABECALHO = [
  "Commodity_Code",
  "Commodity_Description",
  "Country_Code",
  "Country_Name",
  "Market_Year",
  "Calendar_Year",
  "Month",
  "Attribute_ID",
  "Attribute_Description",
  "Unit_ID",
  "Unit_Description",
  "Value"
];
const COMMODITY_CAFE_VERDE = "0711100";
const UNIDADE_FONTE = "(1000 60 KG BAGS)";
const UNIDADE = "mil sacas";

// Attribute_ID -> campo. O nome da fonte também é conferido: se o USDA trocar o significado de um ID, o item vai
// para os inválidos em vez de gravar a métrica errada.
const ATRIBUTOS = {
  "028": { campo: "PRODUCAO", nomeFonte: "Production" },
  "029": { campo: "PRODUCAO_ARABICA", nomeFonte: "Arabica Production" },
  "053": { campo: "PRODUCAO_ROBUSTA", nomeFonte: "Robusta Production" },
  "176": { campo: "ESTOQUE_FINAL", nomeFonte: "Ending Stocks" },
  "125": { campo: "CONSUMO", nomeFonte: "Domestic Consumption" },
  "088": { campo: "EXPORTACAO", nomeFonte: "Exports" },
  "057": { campo: "IMPORTACAO", nomeFonte: "Imports" }
};

// Uma linha de CSV com aspas duplas opcionais ("" = aspas literais).
function lerLinhaCsv(linha) {
  const campos = [];
  let atual = "";
  let entreAspas = false;
  for (let i = 0; i < linha.length; i += 1) {
    const c = linha[i];
    if (entreAspas) {
      if (c === '"' && linha[i + 1] === '"') {
        atual += '"';
        i += 1;
      } else if (c === '"') {
        entreAspas = false;
      } else {
        atual += c;
      }
    } else if (c === '"') {
      entreAspas = true;
    } else if (c === ",") {
      campos.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  campos.push(atual);
  return campos;
}

// Cabeçalho diferente do conhecido = layout mudou: melhor falhar a coleta do que gravar colunas trocadas.
function conferirCabecalho(primeiraLinha) {
  const colunas = lerLinhaCsv(primeiraLinha.replace(/^\uFEFF/, "").trim());
  return colunas.length === CABECALHO.length && colunas.every((c, i) => c.trim() === CABECALHO[i]);
}

// "2025" -> "2025/26". A safra do café varia por país (no Brasil, julho a junho; na maioria, outubro a setembro).
function rotuloSafra(anoInicio) {
  return `${anoInicio}/${String((anoInicio + 1) % 100).padStart(2, "0")}`;
}

function motivoDeInvalidez(r, atributo) {
  if (r.Attribute_Description.trim() !== atributo.nomeFonte) {
    return `atributo ${r.Attribute_ID} veio como "${r.Attribute_Description}" (esperado "${atributo.nomeFonte}").`;
  }
  if (r.Unit_Description.trim() !== UNIDADE_FONTE) return `unidade "${r.Unit_Description}" diferente da esperada ("${UNIDADE_FONTE}").`;
  if (!/^[A-Z0-9]{2}$/.test(r.Country_Code)) return `código de país inválido: ${JSON.stringify(r.Country_Code)}.`;
  if (!/^\d{4}$/.test(r.Market_Year)) return `safra inválida: ${JSON.stringify(r.Market_Year)}.`;
  const semRevisao = r.Month === "00" && r.Calendar_Year === r.Market_Year;
  if (!semRevisao && (!/^\d{4}$/.test(r.Calendar_Year) || !/^(0[1-9]|1[0-2])$/.test(r.Month))) {
    return `mês de revisão inválido: ${JSON.stringify(`${r.Calendar_Year}-${r.Month}`)}.`;
  }
  if (r.Value.trim() === "" || !Number.isFinite(Number(r.Value))) return `valor inválido: ${JSON.stringify(r.Value)}.`;
  return null;
}

// Uma linha de dados -> { ignorado } (atributo não coletado), { invalido } ou { observacao }.
function lerRegistro(linha, numero) {
  const valores = lerLinhaCsv(linha);
  if (valores.length !== CABECALHO.length) {
    return { invalido: { item: { linha: numero }, motivo: `linha com ${valores.length} colunas (esperado ${CABECALHO.length}).` } };
  }
  const r = Object.fromEntries(CABECALHO.map((c, i) => [c, valores[i]]));
  const atributo = ATRIBUTOS[r.Attribute_ID];
  if (r.Commodity_Code !== COMMODITY_CAFE_VERDE || !atributo) return { ignorado: true };
  const motivo = motivoDeInvalidez(r, atributo);
  if (motivo) return { invalido: { item: { pais: r.Country_Code, safra: r.Market_Year, atributo: r.Attribute_ID }, motivo } };

  return {
    observacao: {
      seriesCode: `USDA.PSD.CAFE.${r.Country_Code}.${atributo.campo}`,
      // Convenção (a mesma da Conab café, ADR 0029): 1º de janeiro do ano que dá nome à safra.
      observedAt: `${r.Market_Year}-01-01`,
      valor: Number(r.Value),
      unidade: UNIDADE,
      pais: r.Country_Code,
      nomePais: r.Country_Name.trim(),
      campo: atributo.campo,
      safra: rotuloSafra(Number(r.Market_Year)),
      // `Month` "00" (com `Calendar_Year` = a safra): a fonte não diz quando o valor foi revisado. É o caso de todas as
      // linhas das safras de 1960 a 1998 e de parte das de 1999 a 2003 (arquivo de 2026-09-28).
      mesRevisao: r.Month === "00" ? null : `${r.Calendar_Year}-${r.Month}`
    }
  };
}

/**
 * CSV inteiro -> { observacoes, invalidos, ignorados }. `ignorados` = linhas de atributos que não são coletados (a
 * maioria do arquivo), só para o log. A mesma chave (país × safra × atributo) repetida com o mesmo valor vira uma só;
 * com valores diferentes, as duas vão para os inválidos (não há como saber qual vale).
 */
function extrairPsdCafe(texto) {
  const linhas = String(texto ?? "").split(/\r?\n/);
  if (!conferirCabecalho(linhas[0] ?? "")) {
    throw new Error(`Cabeçalho do CSV da PSD do café diferente do esperado: ${JSON.stringify((linhas[0] ?? "").slice(0, 200))}.`);
  }

  const invalidos = [];
  const porChave = new Map();
  const conflitos = new Set();
  let ignorados = 0;

  for (let n = 1; n < linhas.length; n += 1) {
    if (!linhas[n].trim()) continue;
    const { ignorado, invalido, observacao } = lerRegistro(linhas[n], n + 1);
    if (ignorado) ignorados += 1;
    if (invalido) invalidos.push(invalido);
    if (!observacao) continue;

    const chave = `${observacao.seriesCode}|${observacao.observedAt}`;
    const anterior = porChave.get(chave);
    if (!anterior) porChave.set(chave, observacao);
    else if (anterior.valor !== observacao.valor || anterior.mesRevisao !== observacao.mesRevisao) conflitos.add(chave);
  }

  const observacoes = [];
  for (const [chave, o] of porChave) {
    if (conflitos.has(chave)) {
      invalidos.push({ item: { pais: o.pais, safra: o.safra, campo: o.campo }, motivo: "a mesma safra, país e atributo aparece mais de uma vez com valores diferentes." });
    } else {
      observacoes.push(o);
    }
  }
  return { observacoes, invalidos, ignorados };
}

module.exports = { ATRIBUTOS, UNIDADE, lerLinhaCsv, extrairPsdCafe };
