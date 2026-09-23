"use strict";

// Extrai o balanço de oferta e demanda do milho de Mato Grosso do PDF "Oferta e Demanda - Milho"
// do IMEA (catálogo `/api/arquivo`, mesma fonte do `imea-custo-milho`). ADR 0019.
//
// Diferente do WASDE (ADR 0015: `pdftotext -layout` desalinhava a tabela do PDF do ESMIS), aqui a
// extração é por COORDENADA (x/y de cada texto, via `pdfjs-dist`): a posição resolve o alinhamento
// que o texto corrido perde. É por isso que o balanço, descartado no ADR 0018, virou viável agora.
//
// Layout conferido nas 77 edições REAIS do catálogo (2014-04-14 a 2026-08-31, ADR 0019 - o catálogo
// tem 79, mas 1 é um PDF de metodologia e 1 é uma republicação no mesmo dia): as MESMAS 10 linhas em
// todas - Oferta, Estoque Inicial, Importação, Produção, Demanda, Consumo MT, Consumo Interestadual,
// Exportação, Aquisições públicas, Estoque Final (3.369 observações válidas, 0 inválidas). Um
// rótulo desconhecido é ignorado (não quebra a edição), para o caso de uma edição futura ser diferente.
//
// Achados desta investigação que o parser precisa tratar:
//   - Rótulo e números da MESMA linha podem estar em baselines Y levemente diferentes (ex.: rótulo
//     em y=657, números em y=655, visto em 2017/2020/2021): as linhas são agrupadas por
//     PROXIMIDADE de Y (tolerância), nunca por igualdade exata.
//   - O cabeçalho de safra muda de formato entre edições ("2011/12" x "2019/2020") e tem colunas de
//     VARIAÇÃO percentual ("∆ 19/20 e 20/21", às vezes numa linha decorativa própria com "ꓥ" e
//     espaço dentro do ano - "2020 / 2021"): só cabeçalhos que casam com \d{4}/\d{2,4}\*? viram
//     coluna; o resto não casa com o padrão e fica de fora, de propósito (não é safra).
//   - Cada valor é lido pela coluna (safra) cujo X está mais perto do cabeçalho, dentro de um raio
//     máximo - sem o raio, um valor de variação (que fica bem à direita, sem cabeçalho de safra
//     correspondente) seria colado por engano na última safra.
//   - Um token com "%" nunca é dado (é a variação): descartado antes de casar com coluna.
//   - Em algumas edições (achado real: 2022-04-18, 2022-07-18) o PDF quebra um número em VÁRIOS
//     itens de texto - "11," + "36" em vez de "11,36", às vezes dígito a dígito numa porcentagem
//     ("1"+"5"+","+"9"+"8"+"%" = "15,98%") - tanto na tabela quanto no texto corrido ao redor dela.
//     Sem remontar, cada fragmento vira um "valor" solto e pode grudar na coluna errada. Fragmentos
//     ADJACENTES (gap pequeno) que só têm dígito/vírgula/%/hífen são remontados antes de ler a
//     linha; nunca toca em texto (rótulo ou prosa), que não casa com esse padrão.

const { semAcento } = require("./imea-comum");

const RE_SAFRA = /^(\d{4})\/(\d{2}|\d{4})(\*)?$/;
const RE_NUMERO = /^-?\d+(?:,\d+)?$/;
const RE_FRAGMENTO_NUMERICO = /^[\d,%-]+$/;
const TOLERANCIA_Y = 4;
const RAIO_MAX_X = 20;
const RAIO_MAX_MESCLA_X = 20;

// Rótulo normalizado (sem acento, minúsculo) -> campo. "Consumo MT"/"Consumo de MT" e
// "Estoque Inicial"/"Estoque inicial" são a mesma coisa com grafia diferente entre edições.
const ROTULOS = {
  oferta: "OFERTA",
  "estoque inicial": "ESTOQUE_INICIAL",
  importacao: "IMPORTACAO",
  producao: "PRODUCAO",
  demanda: "DEMANDA",
  "consumo mt": "CONSUMO_MT",
  "consumo de mt": "CONSUMO_MT",
  "consumo interestadual": "CONSUMO_INTERESTADUAL",
  exportacao: "EXPORTACAO",
  "aquisicoes publicas": "AQUISICOES_PUBLICAS",
  "estoque final": "ESTOQUE_FINAL"
};

function texto(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}

function normalizarRotulo(str) {
  return semAcento(texto(str)).toLowerCase();
}

// "2011/12" -> {safra:"2011/12", anoInicial:2011, estimativa:false}; "2019/2020*" -> {safra:"2019/20", ...,
// estimativa:true}. O 2º ano vem com 2 OU 4 dígitos conforme a edição: sempre normalizado para 2 dígitos.
function lerSafra(str) {
  const m = RE_SAFRA.exec(texto(str));
  if (!m) return null;
  const anoFim = m[2].length === 4 ? m[2].slice(2) : m[2];
  return { safra: `${m[1]}/${anoFim}`, anoInicial: Number(m[1]), estimativa: Boolean(m[3]) };
}

// null = célula vazia ou "-" (sem dado); NaN = texto que não é número (inválido).
function numero(str) {
  const t = texto(str);
  if (t === "" || t === "-") return null;
  return RE_NUMERO.test(t) ? Number(t.replace(",", ".")) : NaN;
}

// Remonta fragmentos numéricos adjacentes ("11," + "36" -> "11,36") numa linha já ordenada por X.
// Compara cada item ao ANTERIOR (não ao início do grupo): é o que deixa fragmentos dígito-a-dígito
// de uma % ("1"+"5"+","+"9"+"8"+"%") virarem um token só, mesmo com o grupo inteiro passando de 20pt
// de ponta a ponta. Rótulo/prosa nunca casa com o padrão (só dígito/vírgula/%/hífen): não é tocado.
function mesclarFragmentosNumericos(itensOrdenados) {
  const mesclados = [];
  let xUltimoItem = null;
  for (const item of itensOrdenados) {
    const t = texto(item.str);
    const ehFragmento = RE_FRAGMENTO_NUMERICO.test(t);
    const anterior = mesclados.at(-1);
    if (ehFragmento && anterior?.emCurso && xUltimoItem !== null && item.x - xUltimoItem <= RAIO_MAX_MESCLA_X) {
      anterior.str = texto(anterior.str) + t;
    } else {
      mesclados.push({ ...item, str: t, emCurso: ehFragmento });
    }
    xUltimoItem = item.x;
  }
  return mesclados.map(({ emCurso: _emCurso, ...item }) => item);
}

// Agrupa itens de texto em linhas por PROXIMIDADE de Y (não igualdade exata - achado real desta
// investigação), da mais alta para a mais baixa; dentro de cada linha, ordenado por X e com os
// fragmentos numéricos adjacentes já remontados.
function agruparLinhas(itens, tolerancia = TOLERANCIA_Y) {
  const ordenados = [...itens].sort((a, b) => b.y - a.y);
  const linhas = [];
  for (const item of ordenados) {
    const linha = linhas.find((l) => Math.abs(l.y - item.y) <= tolerancia);
    if (linha) linha.itens.push(item);
    else linhas.push({ y: item.y, itens: [item] });
  }
  for (const linha of linhas) linha.itens = mesclarFragmentosNumericos(linha.itens.sort((a, b) => a.x - b.x));
  return linhas;
}

// A linha de cabeçalho é a que tem MAIS células reconhecíveis como safra (\d{4}/\d{2,4}\*?) - filtro
// que já descarta sozinho as linhas decorativas de variação ("∆...", "ꓥ", "2020 / 2021" com espaço
// dentro do ano, que não casam com o padrão). Precisa de pelo menos 2 colunas para ser cabeçalho.
// Devolve { y, colunas } da linha escolhida como cabeçalho (o Y serve para delimitar onde a tabela
// começa: tudo abaixo do cabeçalho, na mesma página, é candidato a linha de dado).
function acharCabecalho(linhas) {
  let melhor = null;
  for (const linha of linhas) {
    const colunas = linha.itens
      .map((it) => {
        const safra = lerSafra(it.str);
        return safra ? { ...safra, x: it.x } : null;
      })
      .filter(Boolean);
    if (colunas.length >= 2 && (!melhor || colunas.length > melhor.colunas.length)) melhor = { y: linha.y, colunas };
  }
  return melhor ? { y: melhor.y, colunas: [...melhor.colunas].sort((a, b) => a.x - b.x) } : null;
}

function ehTokenDeValor(str) {
  const t = texto(str);
  return RE_NUMERO.test(t) || t === "-" || /%$/.test(t);
}

// Concatena os tokens não numéricos do início da linha (o rótulo pode vir em mais de um item de
// texto, ex.: "Consumo" + "Interestadual" em itens separados) e devolve o resto como candidatos a valor.
function separarRotuloEValores(itens) {
  let i = 0;
  while (i < itens.length && !ehTokenDeValor(itens[i].str)) i += 1;
  const rotulo = itens
    .slice(0, i)
    .map((it) => texto(it.str))
    .join(" ")
    .trim();
  return { rotulo, valores: itens.slice(i) };
}

// Cada valor vai para a coluna (safra) de cabeçalho mais próxima em X, dentro do raio máximo - sem
// isso, uma variação percentual (bem à direita, sem safra correspondente) grudaria na última safra.
// Token com "%" nunca é dado (é variação): descartado antes de casar.
function lerValoresPorColuna(valores, colunas) {
  const candidatos = valores.filter((v) => !/%$/.test(texto(v.str)));
  const porSafra = {};
  const usados = new Set();

  for (const coluna of colunas) {
    let melhor = null;
    let menorDist = Infinity;
    candidatos.forEach((v, idx) => {
      if (usados.has(idx)) return;
      const dist = Math.abs(v.x - coluna.x);
      if (dist < menorDist) {
        menorDist = dist;
        melhor = idx;
      }
    });
    if (melhor !== null && menorDist <= RAIO_MAX_X) {
      usados.add(melhor);
      porSafra[coluna.safra] = { valor: numero(candidatos[melhor].str), texto: texto(candidatos[melhor].str), estimativa: coluna.estimativa, anoInicial: coluna.anoInicial };
    }
  }
  return porSafra;
}

// `paginas`: [{ itens: [{str,x,y}] }] (uma por página do PDF). Devolve { linhas, invalidos }, onde
// `linhas` é { CAMPO: { safra: { valor, texto, estimativa, anoInicial } } } e `invalidos` é uma lista
// de { rotulo, safra, motivo }. Só a PRIMEIRA página com a tabela (âncora "Estoque Inicial") é lida.
function extrairBalanco(paginas) {
  const invalidos = [];

  for (const pagina of paginas) {
    const todasLinhas = agruparLinhas(pagina.itens);
    const linhaAncora = todasLinhas.find((l) => normalizarRotulo(separarRotuloEValores(l.itens).rotulo) === "estoque inicial");
    if (!linhaAncora) continue;

    const linhasAcima = todasLinhas.filter((l) => l.y > linhaAncora.y);
    const cabecalho = acharCabecalho(linhasAcima);
    if (!cabecalho) {
      invalidos.push({ rotulo: null, safra: null, motivo: "Tabela de balanço encontrada, mas sem cabeçalho de safra reconhecível acima dela." });
      return { linhas: {}, invalidos };
    }

    // A tabela começa em "Oferta" (ACIMA de "Estoque Inicial", a âncora usada só para achar a
    // página certa) e vai até "Estoque Final": tudo abaixo do cabeçalho, na mesma página.
    const linhasDaTabela = todasLinhas.filter((l) => l.y < cabecalho.y);
    const resultado = {};
    for (const linha of linhasDaTabela) {
      const { rotulo, valores } = separarRotuloEValores(linha.itens);
      const campo = ROTULOS[normalizarRotulo(rotulo)];
      if (!campo) continue; // rótulo desconhecido: ignorado, não quebra a edição (ex.: rodapé, nota de fonte)

      const porSafra = lerValoresPorColuna(valores, cabecalho.colunas);
      for (const [safra, dado] of Object.entries(porSafra)) {
        if (Number.isNaN(dado.valor)) {
          invalidos.push({ rotulo: campo, safra, motivo: `Valor não numérico ("${dado.texto}") em ${campo}/${safra}.` });
          continue;
        }
        if (dado.valor === null) continue; // sem dado ("-"), não é erro
        resultado[campo] = resultado[campo] || {};
        resultado[campo][safra] = dado;
      }
    }
    return { linhas: resultado, invalidos };
  }

  return { linhas: {}, invalidos: [{ rotulo: null, safra: null, motivo: 'Tabela de balanço (âncora "Estoque Inicial") não encontrada em nenhuma página do PDF.' }] };
}

// `lerPdf` (impura, pdfjs-dist) vive em shared/utils/pdf-texto.js, compartilhada com o Boletim Diário
// da B3 (ADR 0020); `extrairBalanco` acima é pura e testável com fixtures que reproduzem os layouts reais.
module.exports = {
  extrairBalanco,
  agruparLinhas,
  acharCabecalho,
  mesclarFragmentosNumericos,
  lerSafra,
  numero,
  normalizarRotulo,
  ROTULOS
};
