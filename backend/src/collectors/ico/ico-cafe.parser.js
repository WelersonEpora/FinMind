"use strict";

// Lê as tabelas de preços e de estoques certificados do Coffee Market Report mensal da ICO (PDF). ADR 0061.
//
//   Preços - "ICO (daily) indicator prices and futures prices (US cents/lb)": a média mensal dos preços indicativos
//     (I-CIP, Colombian Milds, Other Milds, Brazilian Naturals, Robustas) e dos futuros de Nova York e Londres (média
//     da 2ª e 3ª posições), de 12 a 14 meses terminando no mês do relatório.
//   Estoques - "Certified stocks on the New York and London futures markets": os estoques certificados das duas
//     bolsas, em milhões de sacas, 12 ou 13 meses terminando no mês do relatório ou no anterior (fev e mar/2020, ago/
//     2018: a fonte ainda não tinha o mês).
//
// Lidas por COORDENADA (`shared/utils/pdf-texto.js`), em linhas montadas por proximidade de y, porque o layout muda
// muito entre os 165 relatórios (out/2012 a ago/2026). Achados reais:
//   - o número da tabela muda (os preços são a "Table 2" em fev/2013 e jan/2014) e em out/2023 a tabela de preços não
//     tem título no texto: os preços são achados pela linha "Monthly averages" com o cabeçalho das 7 colunas logo
//     acima, e os estoques pelo texto do título;
//   - o rótulo do mês fica a menos de 1 ponto da linha dos números, às vezes acima e às vezes abaixo (ago/2020); o
//     "London" dos estoques fica 3,4 pontos acima dos números (ago/2026): linha só de números vai para o rótulo sem
//     números mais próximo, dentro de RAIO_Y;
//   - o rótulo vem quebrado ("Ja n-14", "Jul -14", "May - 17") e com hífen tipográfico ("Oct ‐ 12"): os pedaços são
//     juntados sem espaço; o cabeçalho também ("Brazilia" "n", "Robusta" "s", dez/2021): as colunas são achadas pelo
//     começo da palavra;
//   - o NÚMERO vem partido em itens ("12" "1.18" = 121,18, abr/2019): pedaços numéricos de itens a menos de JUNTAR_X
//     pontos se juntam;
//   - nos estoques, o mês e o ano em linhas separadas ("Sep-" em cima, "20" embaixo, ago/2021), e "New" e "York" também;
//   - em 2012 o mês vem por extenso ("October") e o ano numa linha só dele ("2011"), e a tabela traz depois as médias
//     ANUAIS (lidas até "Annual averages", que fica de fora); os estoques eram um gráfico;
//   - em alguns relatórios uma tabela é IMAGEM, sem texto (preços em jul e ago/2015 e set, nov e dez/2016; estoques em
//     set, nov e dez/2016): fica de fora, com o motivo.
//
// Travas (qualquer uma derruba SÓ aquela tabela, com o motivo): as 7 colunas no cabeçalho, na ordem esperada; 7
// números por linha; todo número com rótulo de mês; meses consecutivos terminando no mês do relatório (o
// point-in-time depende disso).
//
// Fora (ADR 0061): os diferenciais (deriváveis dos preços), o balanço por ano-café (o layout muda entre os anos e o
// PSD do USDA já dá a produção por espécie) e as exportações por grupo.

const MESES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const NOMES_MES = Object.keys(MESES).join("|");
// "Aug-20" (com o hífen já normalizado): mês abreviado e ano com 2 dígitos.
const RE_MES_ANO = new RegExp(`^(${NOMES_MES})[a-z]*-(\\d{2})$`, "i");
// "October" (2012): mês por extenso, o ano vem da linha de ano anterior.
const RE_MES_EXTENSO = new RegExp(`^(${NOMES_MES})[a-z]*$`, "i");
// Token do cabeçalho dos estoques: "Aug-20", "Aug-" (o ano na linha de baixo) ou "Aug".
const RE_MES_CABECALHO = new RegExp(`^(${NOMES_MES})-?(\\d{2})?$`, "i");
const RE_ANO_CURTO = /^\d{2}$/;
const RE_MESES_NO_TEXTO = new RegExp(`(${NOMES_MES})[a-z]*-?(\\d{2})`, "gi");
const RE_COMECA_COM_MES = new RegExp(`^(${NOMES_MES})`, "i");
const RE_ANO = /^(19|20)\d{2}$/;
const RE_NUMERO = /^-?\d+\.\d+$/;
const RE_PEDACO_NUMERO = /^-?[\d.]+$/;
const RE_HIFENS = /[‐‑‒–—]/g;
// Itens a até TOLERANCIA_LINHA pontos em y são da mesma linha; uma linha só de números vai para o rótulo sem números
// a até RAIO_Y pontos (achado: 3,4). Pedaços de número de itens a menos de JUNTAR_X pontos são um número só (achado:
// 10,1; entre colunas, 50 ou mais). O cabeçalho dos preços são as linhas logo acima de "Monthly averages", com até
// SALTO_CABECALHO pontos entre elas.
const TOLERANCIA_LINHA = 2;
const RAIO_Y = 6;
const JUNTAR_X = 20;
const SALTO_CABECALHO = 20;
const RAIO_ANO_X = 15;

// Colunas dos preços, da esquerda para a direita, com o começo da 1ª palavra do cabeçalho de cada uma.
const COLUNAS_PRECO = [
  { codigo: "I_CIP", palavra: "composite" },
  { codigo: "COLOMBIAN_MILDS", palavra: "colombian" },
  { codigo: "OTHER_MILDS", palavra: "other" },
  { codigo: "BRAZILIAN_NATURALS", palavra: "brazil" },
  { codigo: "ROBUSTAS", palavra: "robusta" },
  { codigo: "NOVA_YORK", palavra: "new" },
  { codigo: "LONDRES", palavra: "london" }
];
const LINHAS_ESTOQUE = [
  { codigo: "NOVA_YORK", rotulos: ["newyork", "york"] },
  { codigo: "LONDRES", rotulos: ["london"] }
];

function texto(str) {
  return String(str ?? "").replace(RE_HIFENS, "-").replace(/\s+/g, " ").trim();
}

// Itens -> tokens (um item pode juntar várias palavras), com x crescente dentro do item e o índice do item.
function tokens(itens) {
  return itens.flatMap((it, item) => texto(it.str).split(" ").filter(Boolean).map((t, i) => ({ t, x: it.x + i * 0.01, y: it.y, item, i })));
}

// Pedaços numéricos de itens diferentes, a menos de JUNTAR_X pontos: um número só ("12" + "1.18" = "121.18"). Tokens
// separados por espaço dentro do mesmo item são números diferentes.
function juntarPedacos(ordenados) {
  const resultado = [];
  for (const tk of ordenados) {
    const anterior = resultado.at(-1);
    if (anterior && RE_PEDACO_NUMERO.test(anterior.t) && RE_PEDACO_NUMERO.test(tk.t) && tk.item !== anterior.item && tk.x - anterior.xUltimo < JUNTAR_X) {
      anterior.t += tk.t;
      anterior.xUltimo = tk.x;
      anterior.item = tk.item;
    } else {
      resultado.push({ ...tk, xUltimo: tk.x });
    }
  }
  return resultado;
}

// Tokens -> linhas de cima para baixo: { y, numeros: [Number] (por x), rotulo (o resto, junto e sem espaço), texto,
// tokens }.
function montarLinhas(itens) {
  const grupos = [];
  for (const tk of tokens(itens).sort((a, b) => b.y - a.y)) {
    const grupo = grupos.at(-1);
    if (grupo && grupo.y - tk.y <= TOLERANCIA_LINHA) grupo.tokens.push(tk);
    else grupos.push({ y: tk.y, tokens: [tk] });
  }
  return grupos.map(({ y, tokens: lista }) => {
    const ordenados = juntarPedacos(lista.sort((a, b) => a.x - b.x));
    const numeros = ordenados.filter((tk) => RE_NUMERO.test(tk.t));
    const resto = ordenados.filter((tk) => !RE_NUMERO.test(tk.t));
    return {
      y,
      numeros: numeros.map((tk) => Number(tk.t)),
      rotulo: resto.map((tk) => tk.t).join(""),
      texto: ordenados.map((tk) => tk.t).join(" ").toLowerCase(),
      tokens: ordenados
    };
  });
}

// Linha só de números + linha só de rótulo a até RAIO_Y = uma linha.
function juntarRotulosSoltos(linhas) {
  const soltos = linhas.filter((l) => l.numeros.length > 0 && l.rotulo === "");
  const resultado = linhas.filter((l) => !soltos.includes(l));
  for (const s of soltos) {
    const candidatas = resultado.filter((l) => l.numeros.length === 0 && l.rotulo !== "" && Math.abs(l.y - s.y) <= RAIO_Y);
    const alvo = candidatas.sort((a, b) => Math.abs(a.y - s.y) - Math.abs(b.y - s.y))[0];
    if (!alvo) throw new Error(`linha de números sem rótulo (${s.numeros.join(" ")}).`);
    alvo.numeros = s.numeros;
  }
  return resultado.sort((a, b) => b.y - a.y);
}

function mesIso(nome, ano) {
  return `${ano}-${String(MESES[nome.slice(0, 3).toLowerCase()]).padStart(2, "0")}`;
}

function mesSeguinte(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12 ? `${ano + 1}-01` : `${ano}-${String(m + 1).padStart(2, "0")}`;
}

function mesAnterior(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1 ? `${ano - 1}-12` : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

// Meses consecutivos terminando num dos `ultimosAceitos`.
function conferirMeses(meses, ultimosAceitos, descricao) {
  if (meses.length === 0) throw new Error(`${descricao}: nenhum mês lido.`);
  for (let i = 1; i < meses.length; i += 1) {
    if (meses[i] !== mesSeguinte(meses[i - 1])) throw new Error(`${descricao}: meses fora de sequência (${meses[i - 1]} → ${meses[i]}).`);
  }
  if (!ultimosAceitos.includes(meses.at(-1))) {
    throw new Error(`${descricao}: o último mês é ${meses.at(-1)}, não o do relatório (${ultimosAceitos[0]}).`);
  }
}

// Linhas do cabeçalho dos preços: as que ficam logo acima de "Monthly averages", sem número, até um título ou um
// salto de mais de SALTO_CABECALHO pontos.
function cabecalhoAcima(linhas, iMedias) {
  const cabecalho = [];
  let yAnterior = linhas[iMedias].y;
  for (let i = iMedias - 1; i >= 0; i -= 1) {
    const l = linhas[i];
    if (l.y - yAnterior > SALTO_CABECALHO || l.texto.startsWith("table") || l.numeros.length > 0) break;
    cabecalho.unshift(l);
    yAnterior = l.y;
  }
  return cabecalho;
}

// As 7 colunas no cabeçalho, da esquerda para a direita (pelo começo da 1ª palavra de cada uma); null se faltar uma.
function conferirCabecalho(cabecalho) {
  const lista = cabecalho.flatMap((l) => l.tokens);
  let xAnterior = -Infinity;
  for (const coluna of COLUNAS_PRECO) {
    const tk = lista.find((c) => c.t.toLowerCase().startsWith(coluna.palavra));
    if (!tk) return `coluna "${coluna.palavra}" ausente do cabeçalho`;
    if (tk.x <= xAnterior) return `coluna "${coluna.palavra}" fora da ordem esperada`;
    xAnterior = tk.x;
  }
  return null;
}

/** Preços -> [{ mes, valores: { I_CIP, ..., LONDRES } }]. Lança com o motivo. */
function lerPrecos(paginas, mesRelatorio) {
  let achado = null;
  let motivoCabecalho = null;
  for (const pagina of paginas) {
    const linhas = montarLinhas(pagina.itens);
    for (const [i, l] of linhas.entries()) {
      if (!l.texto.startsWith("monthly averages")) continue;
      const motivo = conferirCabecalho(cabecalhoAcima(linhas, i));
      if (!motivo) {
        achado = { linhas, iMedias: i };
        break;
      }
      motivoCabecalho = motivo;
    }
    if (achado) break;
  }
  if (!achado) {
    throw new Error(
      motivoCabecalho
        ? `preços: ${motivoCabecalho}.`
        : 'preços: tabela não encontrada (sem a linha "Monthly averages" no texto; em alguns relatórios a tabela é imagem).'
    );
  }
  const { linhas, iMedias } = achado;
  const iFim = linhas.findIndex((l, i) => i > iMedias && (l.texto.startsWith("annual averages") || l.texto.startsWith("% change")));
  if (iFim < 0) throw new Error('preços: fim da tabela ("% change") não encontrado.');

  let ano = null;
  const resultado = [];
  for (const linha of juntarRotulosSoltos(linhas.slice(iMedias + 1, iFim))) {
    if (linha.numeros.length === 0 && RE_ANO.test(linha.rotulo)) {
      ano = Number(linha.rotulo);
      continue;
    }
    const abreviado = RE_MES_ANO.exec(linha.rotulo);
    const extenso = !abreviado && RE_MES_EXTENSO.exec(linha.rotulo);
    let mes = null;
    if (abreviado) mes = mesIso(abreviado[1], 2000 + Number(abreviado[2]));
    else if (extenso && ano) mes = mesIso(extenso[1], ano);
    if (!mes) throw new Error(`preços: rótulo de mês ilegível ("${linha.rotulo}").`);
    if (linha.numeros.length !== COLUNAS_PRECO.length) {
      throw new Error(`preços: ${linha.numeros.length} números na linha de ${mes} (esperados ${COLUNAS_PRECO.length}).`);
    }
    resultado.push({ mes, valores: Object.fromEntries(COLUNAS_PRECO.map((c, i) => [c.codigo, linha.numeros[i]])) });
  }
  conferirMeses(resultado.map((r) => r.mes), [mesRelatorio], "preços");
  return resultado;
}

// Cabeçalho dos estoques -> meses ("2026-08"), por x. Primeiro, a linha inteira com os pedaços juntos ("Jan" "-"
// "13 Feb" "-" ..., jan/2014); se faltar o ano de algum mês, o ano vem de um token de 2 dígitos noutra linha do
// cabeçalho, na mesma coluna ("Aug-" em cima, "20" embaixo, ago/2021).
function mesesDoCabecalho(linhasCabecalho) {
  for (const l of linhasCabecalho) {
    const nomes = l.tokens.filter((tk) => RE_COMECA_COM_MES.test(tk.t.replace(/^\d+/, "")));
    const datas = [...l.tokens.map((tk) => tk.t).join("").matchAll(RE_MESES_NO_TEXTO)];
    if (datas.length > 0 && datas.length === nomes.length) return datas.map((m) => mesIso(m[1], 2000 + Number(m[2])));
  }
  const lista = linhasCabecalho.flatMap((l) => l.tokens);
  const anos = lista.filter((tk) => RE_ANO_CURTO.test(tk.t));
  const meses = [];
  for (const tk of lista.filter((t) => RE_MES_CABECALHO.test(t.t)).sort((a, b) => a.x - b.x)) {
    const m = RE_MES_CABECALHO.exec(tk.t);
    let ano = m[2];
    if (!ano) {
      const candidato = anos.filter((a) => a.y !== tk.y && Math.abs(a.x - tk.x) <= RAIO_ANO_X).sort((a, b) => Math.abs(a.x - tk.x) - Math.abs(b.x - tk.x))[0];
      if (!candidato) throw new Error(`estoques: mês sem ano no cabeçalho ("${tk.t}").`);
      ano = candidato.t;
    }
    meses.push(mesIso(m[1], 2000 + Number(ano)));
  }
  return meses;
}

/** Estoques -> [{ mes, valores: { NOVA_YORK, LONDRES } }]; [] se o relatório não tem a tabela. Lança com o motivo. */
function lerEstoques(paginas, mesRelatorio) {
  let achado = null;
  for (const pagina of paginas) {
    const linhas = montarLinhas(pagina.itens);
    // O título, com as palavras juntas ("Certif ied", dez/2021); a mesma frase no texto corrido não conta (out/2012).
    const indice = linhas.findIndex((l) => {
      const junto = l.texto.replace(/ /g, "");
      return junto.startsWith("table") && junto.includes("certifiedstocksonthenewyork");
    });
    if (indice >= 0) {
      achado = { linhas, indice };
      break;
    }
  }
  if (!achado) return [];
  const { linhas, indice } = achado;
  const iFim = linhas.findIndex((l, i) => i > indice && l.texto.startsWith("in million"));
  if (iFim < 0) throw new Error('estoques: linha "In million bags" não encontrada (em alguns relatórios a tabela é imagem).');
  const corpo = linhas.slice(indice + 1, iFim);
  const iDados = corpo.findIndex((l) => l.numeros.length > 0);
  if (iDados < 0) throw new Error("estoques: tabela sem números no texto (imagem?).");

  // Cabeçalho: as linhas antes dos números, menos os rótulos das bolsas ("New" sozinho, ago/2021).
  const meses = mesesDoCabecalho(corpo.slice(0, iDados));
  conferirMeses(meses, [mesRelatorio, mesAnterior(mesRelatorio)], "estoques");

  const porBolsa = {};
  for (const linha of juntarRotulosSoltos(corpo)) {
    if (linha.numeros.length === 0) continue; // cabeçalho, "New" sozinho
    const bolsa = LINHAS_ESTOQUE.find((l) => l.rotulos.includes(linha.rotulo.toLowerCase()));
    if (!bolsa) throw new Error(`estoques: linha inesperada ("${linha.rotulo}").`);
    if (linha.numeros.length !== meses.length) {
      throw new Error(`estoques: ${linha.numeros.length} números na linha "${linha.rotulo}" para ${meses.length} meses.`);
    }
    porBolsa[bolsa.codigo] = linha.numeros;
  }
  for (const l of LINHAS_ESTOQUE) if (!porBolsa[l.codigo]) throw new Error(`estoques: linha "${l.rotulos[0]}" não encontrada.`);
  return meses.map((mes, i) => ({ mes, valores: Object.fromEntries(LINHAS_ESTOQUE.map((l) => [l.codigo, porBolsa[l.codigo][i]])) }));
}

/**
 * Páginas (de `lerPdf`) + mês do relatório ("2026-08") -> { precos, estoques, problemas }. Uma tabela ilegível vira
 * um problema (com o motivo) e a outra é lida mesmo assim.
 */
function lerRelatorio(paginas, mesRelatorio) {
  const resultado = { precos: [], estoques: [], problemas: [] };
  for (const [chave, ler] of [
    ["precos", lerPrecos],
    ["estoques", lerEstoques]
  ]) {
    try {
      resultado[chave] = ler(paginas, mesRelatorio);
    } catch (err) {
      resultado.problemas.push(err.message);
    }
  }
  return resultado;
}

module.exports = { lerRelatorio, lerPrecos, lerEstoques, mesSeguinte, COLUNAS_PRECO };
