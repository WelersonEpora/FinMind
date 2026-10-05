"use strict";

// Lê a tabela "Monthly overview" do relatório anual "Stocks in European Ports" da European Coffee Federation (PDF):
// o estoque de café verde nos principais portos da Europa no fim de cada mês, em toneladas, por tipo (Robusta,
// Natural Arabica com o semi-lavado do Brasil, Washed Arabica) e o total. ADR 0061.
//
// Cada tabela é um bloco "Type of coffee | 31-Jan-26 | 28-Feb-26 | ..." (6 meses) com as 4 linhas. O arquivo de um
// ano tem dois blocos (jan-jun e jul-dez); o de 2022 traz também os de 2021. Os blocos da "Monthly recapitulation"
// (mês anterior, mês e "Difference") ficam de fora. Antes de 2020 a tabela era por PORTO, não por tipo, e a cobertura
// mudou (a Antuérpia saiu em ago/2019): fica de fora.
//
// Lida por COORDENADA, em linhas por proximidade de y (`shared/utils/pdf-texto.js`). Defeitos reais da fonte,
// tratados sem adivinhar:
//   - números de 2 colunas em y 1 ponto acima dos do mesmo rótulo (2025 e 2026): mesma linha;
//   - número quebrado em pedaços ("193" "," "274", arquivo de 2025): os pedaços a menos de JUNTAR_X pontos se juntam;
//   - separador de milhar com ponto ("256.216", 2023) ou vírgula: o valor é inteiro, em toneladas;
//   - data do cabeçalho em vários formatos ("31 - Jan - 2 1", "30. Jun 21", "31 Mar 23") e com o ano digitado errado
//     ("31-May-24" no arquivo de 2025): o mês segue a sequência do bloco e o ano é o da maioria das colunas, com aviso.
// Cada número vai para a coluna do mês cujo nome está mais perto em x (até RAIO_X). O total tem de fechar com a soma
// dos três tipos (até TOLERANCIA_TOTAL t, o arredondamento da fonte); se não fechar, o mês fica de fora, com o motivo.

const MESES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NOMES_MES = Object.keys(MESES).join("|");
const RE_DATA = new RegExp(`(\\d{1,2})[-.]?(${NOMES_MES})[a-z]*[-.]?(\\d{2})`, "gi");
const RE_NOME_MES = new RegExp(`^(${NOMES_MES})$`, "i");
const RE_PEDACO_NUMERO = /^[\d.,]+$/;
const RE_NUMERO = /^\d{1,3}(?:[.,]\d{3})*$/;
const TOLERANCIA_LINHA = 2;
const JUNTAR_X = 30;
const RAIO_X = 25;
const TOLERANCIA_TOTAL = 3;

const TIPOS = [
  { codigo: "ROBUSTA", rotulo: "robusta" },
  { codigo: "NATURAL_ARABICA", rotulo: "naturalarabica" },
  { codigo: "WASHED_ARABICA", rotulo: "washedarabica" },
  { codigo: "TOTAL", rotulo: "totaleurope" }
];

function texto(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}

function tokens(itens) {
  return itens.flatMap((it) => texto(it.str).split(" ").filter(Boolean).map((t, i) => ({ t, x: it.x + i * 0.01, y: it.y })));
}

// Tokens -> linhas de cima para baixo, cada uma com os tokens por x e os números (pedaços juntados).
function montarLinhas(itens) {
  const grupos = [];
  for (const tk of tokens(itens).sort((a, b) => b.y - a.y)) {
    const grupo = grupos.at(-1);
    if (grupo && grupo.y - tk.y <= TOLERANCIA_LINHA) grupo.tokens.push(tk);
    else grupos.push({ y: tk.y, tokens: [tk] });
  }
  return grupos.map(({ y, tokens: lista }) => {
    const ordenados = lista.sort((a, b) => a.x - b.x);
    const numeros = [];
    const rotulo = [];
    for (const tk of ordenados) {
      if (!RE_PEDACO_NUMERO.test(tk.t)) {
        rotulo.push(tk.t);
        continue;
      }
      const ultimo = numeros.at(-1);
      // Pedaço colado ao anterior, sem texto no meio: o mesmo número.
      if (ultimo && tk.x - ultimo.xFim < JUNTAR_X && ultimo.depoisDoRotulo === rotulo.length) {
        ultimo.t += tk.t;
        ultimo.xFim = tk.x;
      } else {
        numeros.push({ t: tk.t, x: tk.x, xFim: tk.x, depoisDoRotulo: rotulo.length });
      }
    }
    return { y, tokens: ordenados, numeros, rotulo: rotulo.join("").toLowerCase(), texto: ordenados.map((tk) => tk.t).join("").toLowerCase() };
  });
}

function mesSeguinte(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
}

// Cabeçalho -> [{ mes: "2026-01", x }] (x do nome do mês) + avisos. Lança se os meses não seguem a sequência.
function lerCabecalho(linha) {
  const nomes = linha.tokens.filter((tk) => RE_NOME_MES.test(tk.t));
  const datas = [...linha.texto.matchAll(RE_DATA)].map((m) => ({ mes: MESES[m[2].slice(0, 3).toLowerCase()], ano: 2000 + Number(m[3]), original: m[0] }));
  if (datas.length === 0 || datas.length !== nomes.length) {
    throw new Error(`cabeçalho ilegível ("${linha.tokens.map((tk) => tk.t).join(" ")}").`);
  }
  for (let i = 1; i < datas.length; i += 1) {
    if (datas[i].mes !== (datas[i - 1].mes % 12) + 1) throw new Error(`meses fora de sequência no cabeçalho ("${linha.texto}").`);
  }
  // Ano: o da maioria das colunas (o bloco é sempre de um ano só: jan-jun ou jul-dez).
  const contagem = new Map();
  for (const d of datas) contagem.set(d.ano, (contagem.get(d.ano) ?? 0) + 1);
  const ano = [...contagem].sort((a, b) => b[1] - a[1])[0][0];
  const avisos = datas.filter((d) => d.ano !== ano).map((d) => `ano digitado errado na fonte ("${d.original}"): lido como ${ano}.`);
  const colunas = datas.map((d, i) => ({ mes: `${ano}-${String(d.mes).padStart(2, "0")}`, x: nomes[i].x }));
  return { colunas, avisos };
}

function lerNumero(t) {
  if (!RE_NUMERO.test(t)) return null;
  return Number(t.replace(/[.,]/g, ""));
}

// Um bloco (cabeçalho + linhas seguintes) -> { meses: [{ mes, valores }], avisos, problemas }.
function lerBloco(cabecalho, linhas) {
  const { colunas, avisos } = lerCabecalho(cabecalho);
  const problemas = [];
  const porMes = new Map(colunas.map((c) => [c.mes, {}]));
  for (const tipo of TIPOS) {
    const linha = linhas.find((l) => l.rotulo === tipo.rotulo);
    if (!linha) throw new Error(`linha "${tipo.rotulo}" ausente no bloco de ${colunas[0].mes}.`);
    for (const n of linha.numeros) {
      const valor = lerNumero(n.t);
      if (valor === null) throw new Error(`número ilegível na linha "${tipo.rotulo}": "${n.t}".`);
      const coluna = colunas.reduce((melhor, c) => (Math.abs(c.x - n.x) < Math.abs(melhor.x - n.x) ? c : melhor));
      if (Math.abs(coluna.x - n.x) > RAIO_X) throw new Error(`número fora das colunas na linha "${tipo.rotulo}": "${n.t}".`);
      const valores = porMes.get(coluna.mes);
      if (valores[tipo.codigo] !== undefined) throw new Error(`dois números na coluna de ${coluna.mes}, linha "${tipo.rotulo}".`);
      valores[tipo.codigo] = valor;
    }
  }
  const meses = [];
  for (const [mes, valores] of porMes) {
    const lidos = TIPOS.filter((t) => valores[t.codigo] !== undefined).length;
    if (lidos === 0) continue; // mês ainda sem dado (o resto do ano corrente)
    if (lidos < TIPOS.length) {
      problemas.push(`${mes}: só ${lidos} das ${TIPOS.length} linhas têm valor.`);
      continue;
    }
    const soma = valores.ROBUSTA + valores.NATURAL_ARABICA + valores.WASHED_ARABICA;
    if (Math.abs(soma - valores.TOTAL) > TOLERANCIA_TOTAL) {
      problemas.push(`${mes}: a soma dos tipos (${soma}) não fecha com o total (${valores.TOTAL}).`);
      continue;
    }
    meses.push({ mes, valores });
  }
  return { meses, avisos, problemas };
}

/**
 * Páginas (de `lerPdf`) -> { meses: [{ mes: "2026-01", valores: { ROBUSTA, NATURAL_ARABICA, WASHED_ARABICA, TOTAL } }],
 * avisos, problemas }. Um mês repetido em dois blocos (o arquivo de 2022 traz 2021) fica com o último lido, e um valor
 * diferente entre eles é problema. Lança se não houver nenhum bloco.
 */
function lerRelatorio(paginas) {
  const resultado = new Map();
  const avisos = [];
  const problemas = [];
  let blocos = 0;
  for (const pagina of paginas) {
    const linhas = montarLinhas(pagina.itens);
    linhas.forEach((linha, i) => {
      if (!linha.texto.startsWith("typeofcoffee") || linha.texto.includes("difference")) return;
      const fim = linhas.findIndex((l, j) => j > i && l.texto.startsWith("typeofcoffee"));
      const bloco = lerBloco(linha, linhas.slice(i + 1, fim < 0 ? undefined : fim));
      blocos += 1;
      avisos.push(...bloco.avisos);
      problemas.push(...bloco.problemas);
      for (const m of bloco.meses) {
        const anterior = resultado.get(m.mes);
        if (anterior && TIPOS.some((t) => anterior[t.codigo] !== m.valores[t.codigo])) {
          problemas.push(`${m.mes}: valores diferentes em dois blocos do mesmo arquivo.`);
        }
        resultado.set(m.mes, m.valores);
      }
    });
  }
  if (blocos === 0) throw new Error('nenhuma tabela "Type of coffee" (por tipo) no arquivo.');
  const meses = [...resultado].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, valores]) => ({ mes, valores }));
  return { meses, avisos, problemas };
}

module.exports = { lerRelatorio, lerCabecalho, montarLinhas, mesSeguinte, TIPOS };
