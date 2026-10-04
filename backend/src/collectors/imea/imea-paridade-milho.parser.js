"use strict";

// Extrai a paridade de exportação do milho de Mato Grosso da tabela "DIÁRIO" do Boletim Semanal - Milho
// do IMEA (PDF do catálogo `/api/arquivo`). ADR 0057.
//
// A tabela existe desde a edição de 2021-06-07 (o boletim passou de ~12 para 3 páginas): uma coluna por dia
// útil da semana ANTERIOR à edição (cabeçalho "21/09/2026" ou "05/09/22") e uma linha
// "Paridade Exportação - jul/26 | MT | R$/sc | Imea | 46,56 | 41,57 | ...". Antes disso a paridade só
// aparece num gráfico ou numa linha semanal com o texto espaçado letra a letra: fica de fora.
//
// Lido por COORDENADA, como o balanço (ADR 0019), com o mesmo agrupamento de linhas por proximidade de Y:
// achado real (2022-09-12), o rótulo fica em y=723 e os números em y=720. Cada valor vai para o dia cujo
// X do cabeçalho está mais perto, dentro de um raio; "-" é dia sem valor (feriado).
//
// O cabeçalho de datas tem defeitos reais, tratados sem adivinhar o dia:
//   - espaço dentro da data ("31/ 05/ 21", 2021-06-07) e dia com 1 dígito ("5/12/22", 2022-12-12);
//   - ano truncado ou digitado errado ("02/05/202", 2023-05-08; "7/12/222", 2022-12-12): o dia e o mês valem,
//     e o ano é o que põe a data na janela da edição;
//   - dia fora da janela da edição ("01/11/21" numa edição de 2021-12-06; sábado e domingo de abril numa de
//     2024-05-13): recusado;
//   - a mesma data em duas colunas ("29/11/22" duas vezes, 2022-12-05): as duas recusadas, não dá para saber
//     qual é a certa.
// A janela é de 1 a JANELA_DIAS dias antes da edição: a tabela é a da semana anterior (de 3 a 7 dias nas 1.206
// datas lidas; até 9 nas edições de quarta-feira de 2021). Fora dela fica também a tabela velha republicada com as
// datas antigas (achado real, 2026-02-16 repete a de 2026-02-09).
//
// O contrato de referência vem do rótulo ("jul/26") e vai só para a metadata: achado real, a edição de
// 2026-09-28 ainda diz "jul/26" na tabela, mas a média dos 5 dias (44,73) é a "Paridade Ex. jul/27" do
// resumo da página 2. O rótulo pode estar desatualizado.

const { semAcento } = require("./imea-comum");
const { agruparLinhas } = require("./imea-oferta-demanda-milho.parser");

const RE_DATA = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/;
const RE_NUMERO = /^-?\d{1,3}(?:\.\d{3})*(?:,\d+)?$/;
const RE_ROTULO = /^paridade exportacao/;
const RE_CONTRATO = /paridade exportacao\s*-?\s*([a-z]{3})\s*\/\s*(\d{2})\b/;
const RAIO_MAX_X = 25;
const MINIMO_DE_COLUNAS = 3;
const JANELA_DIAS = 9;
const DIA_MS = 24 * 60 * 60 * 1000;

function texto(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}

function textoDaLinha(linha) {
  return semAcento(linha.itens.map((it) => texto(it.str)).join(" ")).toLowerCase();
}

function iso(ano, mes, dia) {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia ? d.toISOString().slice(0, 10) : null;
}

function naJanela(dataIso, dataEdicao) {
  const dias = (Date.parse(dataEdicao) - Date.parse(dataIso)) / DIA_MS;
  return dias >= 1 && dias <= JANELA_DIAS;
}

// Célula de cabeçalho -> { dia, mes, ano } (ano null se truncado ou com erro), ou null se não é data.
function lerCelulaData(str) {
  const m = RE_DATA.exec(texto(str).replace(/\s/g, ""));
  if (!m) return null;
  const ano = m[3].length === 2 ? 2000 + Number(m[3]) : m[3].length === 4 ? Number(m[3]) : null;
  return { dia: Number(m[1]), mes: Number(m[2]), ano };
}

// A data ISO da célula: com o ano do cabeçalho, se completo; senão, o ano que a põe na janela da edição.
function resolverData({ dia, mes, ano }, dataEdicao) {
  if (ano !== null) return iso(ano, mes, dia);
  const anoEdicao = Number(dataEdicao.slice(0, 4));
  return [anoEdicao, anoEdicao - 1].map((a) => iso(a, mes, dia)).find((d) => d && naJanela(d, dataEdicao)) ?? null;
}

// null = "-" (dia sem valor); NaN = texto que não é número.
function numero(str) {
  const t = texto(str);
  if (t === "-" || t === "") return null;
  return RE_NUMERO.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : NaN;
}

function colunasDeData(linha) {
  return linha.itens.map((it) => ({ celula: lerCelulaData(it.str), texto: texto(it.str), x: it.x })).filter((c) => c.celula);
}

// `paginas`: [{ itens: [{str,x,y}] }]; `dataEdicao`: a data ISO da edição (do catálogo).
// Devolve { contrato, dias: [{ data, valor, texto }], invalidos: [{ data, motivo }] }.
// Sem a linha da paridade ou sem o cabeçalho de datas, lança: a edição inteira vira um inválido no coletor.
// Uma linha que começa com "paridade exportação" sem cabeçalho de datas acima (achado real: uma frase do texto
// da página 2 em 2023-01-16) não é a tabela: a busca segue nas páginas seguintes.
function extrairParidade(paginas, dataEdicao) {
  let semCabecalho = false;
  for (const pagina of paginas) {
    const linhas = agruparLinhas(pagina.itens);
    const linhaParidade = linhas.find((l) => RE_ROTULO.test(textoDaLinha(l)));
    if (!linhaParidade) continue;

    // O cabeçalho de datas é a linha mais próxima ACIMA da paridade com pelo menos 3 datas.
    const cabecalho = linhas
      .filter((l) => l.y > linhaParidade.y)
      .sort((a, b) => a.y - b.y)
      .map(colunasDeData)
      .find((colunas) => colunas.length >= MINIMO_DE_COLUNAS);
    if (!cabecalho) {
      semCabecalho = true;
      continue;
    }

    const m = RE_CONTRATO.exec(textoDaLinha(linhaParidade));
    const contrato = m ? `${m[1]}/${m[2]}` : null;

    const colunas = cabecalho.map((c) => ({ ...c, data: resolverData(c.celula, dataEdicao) }));
    const contagem = new Map();
    for (const c of colunas) if (c.data) contagem.set(c.data, (contagem.get(c.data) ?? 0) + 1);

    const candidatos = linhaParidade.itens.filter((it) => RE_NUMERO.test(texto(it.str)) || texto(it.str) === "-");
    const dias = [];
    const invalidos = [];
    for (const coluna of colunas) {
      let melhor = null;
      for (const it of candidatos) {
        const dist = Math.abs(it.x - coluna.x);
        if (dist <= RAIO_MAX_X && (!melhor || dist < melhor.dist)) melhor = { it, dist };
      }
      const valor = melhor ? numero(melhor.it.str) : undefined;
      if (valor === null) continue;
      const rotulo = coluna.data ?? coluna.texto;
      if (valor === undefined) invalidos.push({ data: rotulo, motivo: "Sem valor na coluna do dia." });
      else if (!coluna.data || !naJanela(coluna.data, dataEdicao)) {
        invalidos.push({ data: rotulo, motivo: `Data do cabeçalho ("${coluna.texto}") fora da semana anterior à edição: erro de digitação da fonte, dia não gravado.` });
      } else if (contagem.get(coluna.data) > 1) {
        invalidos.push({ data: rotulo, motivo: `Data "${coluna.texto}" repetida no cabeçalho: não dá para saber qual coluna é a do dia, nenhuma gravada.` });
      } else dias.push({ data: coluna.data, valor, texto: texto(melhor.it.str) });
    }
    return { contrato, dias, invalidos };
  }
  throw new Error(semCabecalho ? "a linha da paridade não tem o cabeçalho de datas acima dela (na mesma página)" : 'a tabela diária não tem a linha "Paridade Exportação"');
}

module.exports = { extrairParidade, lerCelulaData, resolverData, numero, JANELA_DIAS };
