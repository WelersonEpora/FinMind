"use strict";

const env = require("../../config/env");
const { UpstreamServiceError } = require("../../shared/errors");
const { fimDoDiaUtc } = require("../../shared/utils/date-utils");
const { lerZip } = require("../../shared/utils/zip");
const { persistirObservacoes, baixar } = require("../base/persist-observations");

// NOAA CPC - previsões de temperatura e precipitação de 6 a 10 e de 8 a 14 dias para os EUA (ADR 0067), lidas nos 5
// maiores estados de milho (os mesmos do card de saúde da vegetação, ADR 0025).
//
// Fonte: ftp.cpc.ncep.noaa.gov/GIS/us_tempprcpfcst/, sem chave. Um ZIP por horizonte e variável (`<h><var>_latest.zip`,
// ~3,3 MB), com um Shapefile: polígonos com `Fcst_Date`, `Start_Date`, `End_Date`, `Prob` (%) e `Cat` (Above, Below,
// Normal). Os polígonos são faixas disjuntas (33-40, 40-50...), e o resto do país é um polígono de fundo que o CPC
// preenche com `Cat=Normal`, `Prob=36` (o histórico de geoprocessamento do `.shp.xml` mostra: "default" com Prob 36,
// Cat 'Normal'): é a área de CHANCES IGUAIS (EC) do mapa, sem inclinação, e não uma previsão de "perto do normal".
// Só existe o `_latest`: sem histórico (a série começa na 1ª coleta).
//
// Séries `NOAA_CPC.<ESTADO>.<CAMPO>`, com CAMPO = TEMP_6_10, PRCP_6_10, TEMP_8_14, PRCP_8_14. Valor: +Prob se Above,
// -Prob se Below, 0 se Normal (a categoria e a probabilidade ficam nos metadados). observed_at = Fcst_Date (data de
// emissão; o período previsto fica nos metadados); published_at = fim desse dia em UTC (ESTIMADO: o CPC publica por
// volta das 15h do leste dos EUA).

const URL_BASE = "https://ftp.cpc.ncep.noaa.gov/GIS/us_tempprcpfcst";
const SOURCE_CODE = "NOAA_CPC";
const PREFIXO_SERIE = "NOAA_CPC";

// Um ponto por estado, aproximadamente no centro da área de milho dele. Os códigos e rótulos são os da NOAA VH
// (shared/utils/noaa-vh-regiao.js).
const ESTADOS = [
  { codigo: "EUA_IA", nome: "Iowa", lat: 42.0, lon: -93.5 },
  { codigo: "EUA_IL", nome: "Illinois", lat: 40.5, lon: -89.0 },
  { codigo: "EUA_NE", nome: "Nebraska", lat: 41.0, lon: -97.5 },
  { codigo: "EUA_MN", nome: "Minnesota", lat: 44.0, lon: -94.5 },
  { codigo: "EUA_IN", nome: "Indiana", lat: 40.3, lon: -86.3 }
];

const ARQUIVOS = [
  { campo: "TEMP_6_10", arquivo: "610temp" },
  { campo: "PRCP_6_10", arquivo: "610prcp" },
  { campo: "TEMP_8_14", arquivo: "814temp" },
  { campo: "PRCP_8_14", arquivo: "814prcp" }
];

const SINAL_CATEGORIA = { Above: 1, Below: -1, Normal: 0 };

// O polígono de fundo (chances iguais), pelo valor que o CPC grava nele.
function ehChancesIguais(cat, prob) {
  return cat === "Normal" && prob === 36;
}

// ---------------------------------------------------------------- DBF (dBASE III+)

function lerDbf(buf) {
  const versao = buf[0];
  if (versao !== 0x03 && versao !== 0x83 && versao !== 0x8b && versao !== 0x8c) {
    throw new UpstreamServiceError(`DBF com versão inesperada (0x${versao.toString(16)}).`);
  }
  const nReg = buf.readUInt32LE(4);
  const tamCab = buf.readUInt16LE(8);
  const tamReg = buf.readUInt16LE(10);
  const campos = [];
  let off = 32;
  while (off + 32 <= tamCab && buf[off] !== 0x0d) {
    campos.push({ nome: buf.toString("ascii", off, off + 11).replace(/\0/g, "").trim(), tamanho: buf[off + 16] });
    off += 32;
  }
  const registros = [];
  let rOff = tamCab;
  for (let r = 0; r < nReg && rOff + tamReg <= buf.length; r++) {
    const reg = {};
    let cOff = rOff + 1;
    for (const c of campos) {
      reg[c.nome] = buf.toString("ascii", cOff, cOff + c.tamanho).trim();
      cOff += c.tamanho;
    }
    registros.push(reg);
    rOff += tamReg;
  }
  return registros;
}

// ---------------------------------------------------------------- SHP (ESRI Shapefile, tipo 5 = Polygon)

// Ray casting num anel de pontos [lon, lat].
function pontoNoAnel(anel, lat, lon) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

// Lê os polígonos do SHP (a ordem é a dos registros do DBF): [{ minX, minY, maxX, maxY, aneis }].
function lerPoligonos(shpBuf) {
  const poligonos = [];
  let pos = 100; // cabeçalho do arquivo
  while (pos + 8 < shpBuf.length) {
    const tamConteudo = shpBuf.readInt32BE(pos + 4) * 2;
    if (tamConteudo <= 0) break;
    const tipo = shpBuf.readInt32LE(pos + 8);
    if (tipo !== 5) throw new UpstreamServiceError(`SHP com forma de tipo ${tipo} (esperado 5, polígono).`);
    const numPartes = shpBuf.readInt32LE(pos + 44);
    const numPontos = shpBuf.readInt32LE(pos + 48);
    const basePartes = pos + 52;
    const basePontos = basePartes + numPartes * 4;
    const inicios = [];
    for (let p = 0; p < numPartes; p++) inicios.push(shpBuf.readInt32LE(basePartes + p * 4));
    inicios.push(numPontos);
    const aneis = [];
    for (let a = 0; a < numPartes; a++) {
      const anel = [];
      for (let k = inicios[a]; k < inicios[a + 1]; k++) {
        anel.push([shpBuf.readDoubleLE(basePontos + k * 16), shpBuf.readDoubleLE(basePontos + k * 16 + 8)]);
      }
      aneis.push(anel);
    }
    poligonos.push({
      minX: shpBuf.readDoubleLE(pos + 12),
      minY: shpBuf.readDoubleLE(pos + 20),
      maxX: shpBuf.readDoubleLE(pos + 28),
      maxY: shpBuf.readDoubleLE(pos + 36),
      aneis
    });
    pos += 8 + tamConteudo;
  }
  return poligonos;
}

// Índices dos polígonos que contêm o ponto (par-ímpar sobre todos os anéis: um furo desfaz o anel externo).
function poligonosContendo(poligonos, lat, lon) {
  const indices = [];
  poligonos.forEach((p, i) => {
    if (lon < p.minX || lon > p.maxX || lat < p.minY || lat > p.maxY) return;
    const dentro = p.aneis.reduce((acc, anel) => (pontoNoAnel(anel, lat, lon) ? !acc : acc), false);
    if (dentro) indices.push(i);
  });
  return indices;
}

// ---------------------------------------------------------------- download e parse

async function download({ signal } = {}) {
  const arquivos = [];
  for (const { campo, arquivo } of ARQUIVOS) {
    arquivos.push({ campo, arquivo, buf: await baixar(`${URL_BASE}/${arquivo}_latest.zip`, { signal, as: "buffer" }) });
  }
  return { arquivos };
}

// Um item por arquivo e estado: o registro do DBF do polígono que contém o ponto (o de maior Prob, se a borda cair
// em dois), ou null.
function parse(rawData) {
  if (!rawData?.arquivos) throw new UpstreamServiceError("CPC: dados brutos inválidos.");
  const itens = [];
  for (const { campo, arquivo, buf } of rawData.arquivos) {
    const entradas = lerZip(buf);
    const dbf = entradas.find((e) => e.nome.toLowerCase().endsWith(".dbf"));
    const shp = entradas.find((e) => e.nome.toLowerCase().endsWith(".shp"));
    if (!dbf || !shp) throw new UpstreamServiceError(`CPC ${arquivo}: DBF ou SHP ausente no ZIP.`);
    const registros = lerDbf(dbf.conteudo);
    const poligonos = lerPoligonos(shp.conteudo);
    if (poligonos.length !== registros.length) {
      throw new UpstreamServiceError(`CPC ${arquivo}: ${poligonos.length} polígonos e ${registros.length} registros no DBF.`);
    }
    for (const estado of ESTADOS) {
      const candidatos = poligonosContendo(poligonos, estado.lat, estado.lon).map((i) => registros[i]);
      const registro = candidatos.reduce((melhor, r) => (!melhor || Number(r.Prob) > Number(melhor.Prob) ? r : melhor), null);
      itens.push({ campo, estado, registro });
    }
  }
  return itens;
}

// ---------------------------------------------------------------- normalize

function dataIso(aaaammdd) {
  return /^\d{8}$/.test(aaaammdd ?? "") ? `${aaaammdd.slice(0, 4)}-${aaaammdd.slice(4, 6)}-${aaaammdd.slice(6, 8)}` : null;
}

function normalize(itens) {
  const validos = [];
  const invalidos = [];
  for (const { campo, estado, registro } of itens) {
    const item = { campo, estado: estado.codigo };
    if (!registro) {
      invalidos.push({ item, motivo: `${estado.nome} (${estado.lat}, ${estado.lon}) fora de todos os polígonos.` });
      continue;
    }
    const sinal = SINAL_CATEGORIA[registro.Cat];
    const prob = Number(registro.Prob);
    const emitida = dataIso(registro.Fcst_Date);
    if (sinal === undefined || !Number.isFinite(prob) || !emitida) {
      invalidos.push({ item, motivo: `Registro inesperado: Cat "${registro.Cat}", Prob "${registro.Prob}", Fcst_Date "${registro.Fcst_Date}".` });
      continue;
    }
    validos.push({
      series_code: `${PREFIXO_SERIE}.${estado.codigo}.${campo}`,
      observed_at: emitida,
      value: sinal * prob,
      unit: "% (+acima/-abaixo)",
      source_code: SOURCE_CODE,
      published_at: fimDoDiaUtc(emitida),
      published_at_is_estimated: true,
      published_at_basis: "lag_rule",
      metadata: {
        categoria: registro.Cat,
        probabilidade: prob,
        chancesIguais: ehChancesIguais(registro.Cat, prob),
        periodoInicio: dataIso(registro.Start_Date),
        periodoFim: dataIso(registro.End_Date),
        ponto: { lat: estado.lat, lon: estado.lon }
      }
    });
  }
  return { validos, invalidos };
}

const coletorCpc = {
  codigo: "noaa-cpc",
  get timeoutMs() {
    return env.collectors.sourceTimeoutMs;
  },
  get tentativasRetry() {
    return env.collectors.retryTentativas;
  },
  download,
  parse,
  normalize,
  persist: persistirObservacoes
};

module.exports = { coletorCpc, lerDbf, lerPoligonos, poligonosContendo, pontoNoAnel, ESTADOS, ARQUIVOS, PREFIXO_SERIE, SOURCE_CODE };
