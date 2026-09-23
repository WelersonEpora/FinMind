"use strict";

// Extrai a tabela "Mercado Futuro" do CCM (futuro de milho com liquidação financeira) do Boletim
// Diário de Informações (BDI) da B3, capítulo de derivativos em PDF (`BDI_03-1_AAAAMMDD.pdf`).
// ADR 0020.
//
// Extração por COORDENADA (itens de texto com x/y, via shared/utils/pdf-texto.js), mesmo motivo do
// IMEA (ADR 0019): o texto corrido (`pdftotext -layout`) embaralha as colunas desta tabela.
//
// Layout conferido em boletins REAIS de 2022-03-21 a 2025-12-11 (o "layout antigo"; a partir de
// 2025-12-12 o capítulo virou um resumo sem vencimentos - ver ADR 0020):
//
//   CCM: Milho com Liquidação Financeira (Contrato = 450 Sacas; Cotação = R$/60kg)
//   Mercado Futuro
//   <3 linhas de cabeçalho>
//   F23 | 9,677 | 360 | 1,020 | 39,894,242 | 87.04 | 86.80 | 87.04 | 86.91 | 86.84 | 86.71 | -0.29↓ | 86.82 | 86.84
//
// Cada linha de vencimento tem SEMPRE 13 valores, na ordem das colunas; célula vazia é "-". Por isso a
// leitura é POSICIONAL (e não pela coluna mais próxima em X, como no IMEA): os números são alinhados à
// direita e o X do início do texto varia com o tamanho do número. A contagem exata de 13 é a trava:
// qualquer linha com outra contagem é rejeitada, nunca "encaixada".
//
// Achados reais que o parser trata:
//   - O PDF às vezes junta DUAS células num único item de texto ("3,512 145,828,089" = contratos +
//     volume): os itens são quebrados por espaço antes de contar.
//   - O FORMATO NUMÉRICO muda no meio do período: 2022-2023 em padrão americano ("9,677" e "87.04"),
//     2024 em diante em padrão brasileiro ("10.653" e "65,26"). O formato é detectado por tabela, pela
//     coluna de ajuste (preço sempre com casas decimais), e cada número é validado pela regra estrita
//     daquele formato - "1,020" nunca vira 1,02 por engano: ou casa com o formato da tabela, ou é inválido.
//   - A mesma página tem outras tabelas do CCM (opções de compra/venda), com o mesmo título: só a que
//     vem logo depois de "Mercado Futuro" é lida.

const { lerPdf } = require("../../shared/utils/pdf-texto");

const TOLERANCIA_Y = 2;
const RE_VENCIMENTO = /^[FGHJKMNQUVXZ]\d{2}$/;
const RE_TITULO_CCM = /^CCM: Milho com Liquida/i;
const RE_TITULO_PRODUTO = /^[A-Z0-9]{2,5}: /;
const RE_SETA = /^[↑↓]+$/;

// Posição do valor na linha -> campo. Os 3 últimos (variação em pontos, última oferta de compra e de
// venda) não são coletados: a variação é derivada do ajuste (seria um fator) e as ofertas não são
// preço de negócio.
const COLUNAS = [
  { sufixo: "OPEN_INTEREST", campoFonte: "Contratos em Aberto", tipo: "inteiro", unit: "contratos" },
  { sufixo: "TRADES", campoFonte: "Negócios Realizados", tipo: "inteiro", unit: "negocios" },
  { sufixo: "CONTRACTS", campoFonte: "Contratos Negociados", tipo: "inteiro", unit: "contratos" },
  { sufixo: "VOLUME_BRL", campoFonte: "Volume", tipo: "inteiro", unit: "BRL" },
  { sufixo: "OPEN", campoFonte: "Preço de Abertura", tipo: "decimal", unit: "BRL/saca" },
  { sufixo: "LOW", campoFonte: "Preço Mínimo", tipo: "decimal", unit: "BRL/saca" },
  { sufixo: "HIGH", campoFonte: "Preço Máximo", tipo: "decimal", unit: "BRL/saca" },
  { sufixo: "AVG", campoFonte: "Preço Médio", tipo: "decimal", unit: "BRL/saca" },
  { sufixo: "LAST", campoFonte: "Último Preço", tipo: "decimal", unit: "BRL/saca" },
  { sufixo: "SETTLE", campoFonte: "Ajuste", tipo: "decimal", unit: "BRL/saca" },
  null, // Variação em Pontos
  null, // Última Oferta de Compra
  null // Última Oferta de Venda
];
const INDICE_AJUSTE = COLUNAS.findIndex((c) => c?.sufixo === "SETTLE");

// Palavras que o cabeçalho da tabela precisa ter (as 3 linhas juntas). Se a B3 mudar as colunas, a
// tabela é rejeitada em vez de lida na ordem errada. A quebra de linha varia entre boletins
// ("Contratos" / "em Aberto" ou "Contratos em" / "Aberto" - achado real, 2024-08-15): por isso
// palavras soltas, não expressões.
const CABECALHO_ESPERADO = ["Contratos", "Aberto", "Negócios", "Negociados", "Volume", "Abertura", "Mínimo", "Máximo", "Médio", "Último", "Ajuste", "Pontos"];

const FORMATOS = {
  en: { inteiro: /^\d{1,3}(?:,\d{3})*$/, decimal: /^-?\d{1,3}(?:,\d{3})*\.\d+$/, milhar: ",", separadorDecimal: "." },
  pt: { inteiro: /^\d{1,3}(?:\.\d{3})*$/, decimal: /^-?\d{1,3}(?:\.\d{3})*,\d+$/, milhar: ".", separadorDecimal: "," }
};

const MESES = { JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6, JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12 };

function texto(str) {
  return String(str ?? "").replace(/\s+/g, " ").trim();
}

function semAcento(str) {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

// Agrupa itens em linhas por proximidade de Y (da mais alta para a mais baixa), cada linha ordenada por X.
function agruparLinhas(itens, tolerancia = TOLERANCIA_Y) {
  const ordenados = [...itens].sort((a, b) => b.y - a.y);
  const linhas = [];
  for (const item of ordenados) {
    const linha = linhas.find((l) => Math.abs(l.y - item.y) <= tolerancia);
    if (linha) linha.itens.push(item);
    else linhas.push({ y: item.y, itens: [item] });
  }
  for (const linha of linhas) linha.itens.sort((a, b) => a.x - b.x);
  return linhas;
}

// "REFERENTE A SEGUNDA-FEIRA - 16 DE JANEIRO DE 2023 - Nº 11" -> "2023-01-16" (ou null).
function extrairDataReferencia(paginas) {
  for (const pagina of paginas) {
    for (const item of pagina.itens) {
      const m = /REFERENTE A .*?(\d{1,2}) DE ([A-ZÀ-Ú]+) DE (\d{4})/i.exec(texto(item.str));
      if (!m) continue;
      const mes = MESES[semAcento(m[2]).toUpperCase()];
      if (!mes) continue;
      return `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return null;
}

// Os 13 valores de uma linha de vencimento: cada item quebrado por espaço (células coladas) e as setas
// soltas de variação descartadas.
function tokensDaLinha(itens) {
  return itens
    .slice(1)
    .flatMap((it) => texto(it.str).split(" "))
    .filter((t) => t !== "" && !RE_SETA.test(t));
}

// Detecta o formato numérico da tabela pela coluna de ajuste (preço, sempre com decimais).
function detectarFormato(linhasDeTokens) {
  const encontrados = new Set();
  for (const tokens of linhasDeTokens) {
    const ajuste = tokens[INDICE_AJUSTE];
    if (!ajuste || ajuste === "-") continue;
    if (FORMATOS.en.decimal.test(ajuste)) encontrados.add("en");
    else if (FORMATOS.pt.decimal.test(ajuste)) encontrados.add("pt");
  }
  return encontrados.size === 1 ? [...encontrados][0] : null;
}

// null = "-" (célula vazia); NaN = não casa com o formato da tabela (inválido).
function lerNumero(token, tipo, formato) {
  if (token === "-") return null;
  const regra = FORMATOS[formato];
  if (!regra[tipo].test(token)) return NaN;
  const semMilhar = token.split(regra.milhar).join("");
  return Number(tipo === "decimal" ? semMilhar.replace(regra.separadorDecimal, ".") : semMilhar);
}

// Moldura da página: "BDI" no topo e o rodapé "<página> | REFERENTE A ...". Não é conteúdo.
function ehMoldura(conteudo) {
  return /^BDI$/.test(conteudo) || /REFERENTE A/i.test(conteudo) || /^\d{1,3}$/.test(conteudo);
}

// Varre as linhas de todas as páginas, em ordem, procurando o título do CCM seguido de
// "Mercado Futuro". Devolve { cabecalho: string, linhas: [{ vencimento, tokens, textoOriginal }] } ou
// null se a tabela não existir no boletim. O título pode ficar no pé de uma página e "Mercado Futuro"
// no topo da seguinte (achado real: 2024-03-11, 2022-05-23...), e a tabela pode continuar na página
// seguinte (o cabeçalho se repete e é pulado): a moldura da página é ignorada em qualquer estado.
function localizarTabela(paginas) {
  let estado = "fora";
  let cabecalho = "";
  const linhas = [];

  for (const pagina of paginas) {
    for (const linha of agruparLinhas(pagina.itens)) {
      const primeiro = texto(linha.itens[0].str);
      const conteudo = linha.itens.map((it) => texto(it.str)).join(" ");

      if (estado === "fora") {
        if (RE_TITULO_CCM.test(primeiro)) estado = "titulo";
        continue;
      }
      if (ehMoldura(conteudo)) continue;
      if (estado === "titulo") {
        estado = /^Mercado Futuro$/i.test(conteudo) ? "tabela" : "fora";
        continue;
      }

      // estado === "tabela"
      if (RE_VENCIMENTO.test(primeiro)) {
        linhas.push({ vencimento: primeiro, tokens: tokensDaLinha(linha.itens), textoOriginal: conteudo });
        continue;
      }
      if (RE_TITULO_PRODUTO.test(primeiro) || /^Mercado /i.test(conteudo)) {
        return { cabecalho, linhas };
      }
      // Cabeçalho (inclusive o repetido numa página nova) não é dado.
      cabecalho += ` ${conteudo}`;
    }
  }
  return estado === "tabela" ? { cabecalho, linhas } : null;
}

// Função pura principal. `paginas`: [{ itens: [{ str, x, y }] }]. Devolve:
//   { situacao: "ok", dataReferencia, formato, linhas: [{ vencimento, valores: { SUFIXO: numero|null } }], invalidos }
//   { situacao: "sem_tabela", dataReferencia, motivo }
//   { situacao: "erro", dataReferencia, motivo }
function extrairFuturosCcm(paginas) {
  const dataReferencia = extrairDataReferencia(paginas);
  const tabela = localizarTabela(paginas);

  if (!tabela) {
    const temResumoNovo = paginas.some((p) => p.itens.some((it) => /^CCM: MILHO$/.test(texto(it.str))));
    return {
      situacao: "sem_tabela",
      dataReferencia,
      motivo: temResumoNovo
        ? "Boletim no layout novo (resumo, sem tabela por vencimento)."
        : "Boletim sem a tabela de futuros do CCM (capítulo de derivativos ausente ou sem o produto)."
    };
  }

  const faltando = CABECALHO_ESPERADO.filter((palavra) => !tabela.cabecalho.includes(palavra));
  if (faltando.length > 0) {
    return { situacao: "erro", dataReferencia, motivo: `Cabeçalho da tabela do CCM diferente do esperado (faltando: ${faltando.join(", ")}) - layout mudou?` };
  }
  if (tabela.linhas.length === 0) {
    return { situacao: "erro", dataReferencia, motivo: "Tabela de futuros do CCM encontrada, mas sem nenhuma linha de vencimento." };
  }

  const formato = detectarFormato(tabela.linhas.map((l) => l.tokens));
  if (!formato) {
    return { situacao: "erro", dataReferencia, motivo: "Formato numérico da tabela do CCM não reconhecido (ajuste nem em 87.04 nem em 87,04)." };
  }

  const linhas = [];
  const invalidos = [];
  for (const { vencimento, tokens, textoOriginal } of tabela.linhas) {
    if (tokens.length !== COLUNAS.length) {
      invalidos.push({ vencimento, motivo: `${tokens.length} valores em vez de ${COLUNAS.length}: "${textoOriginal}".` });
      continue;
    }
    const valores = {};
    const ruins = [];
    COLUNAS.forEach((coluna, i) => {
      if (!coluna) return;
      const valor = lerNumero(tokens[i], coluna.tipo, formato);
      if (Number.isNaN(valor)) ruins.push(`${coluna.campoFonte}="${tokens[i]}"`);
      else valores[coluna.sufixo] = valor;
    });
    if (ruins.length > 0) {
      invalidos.push({ vencimento, motivo: `Número fora do formato ${formato}: ${ruins.join(", ")}.` });
      continue;
    }
    const incoerencia = verificarCoerencia(valores);
    if (incoerencia) {
      invalidos.push({ vencimento, motivo: `${incoerencia} - coluna deslocada? "${textoOriginal}".` });
      continue;
    }
    linhas.push({ vencimento, valores });
  }

  return { situacao: "ok", dataReferencia, formato, linhas, invalidos };
}

// Trava contra coluna deslocada: numa linha lida na ordem certa, mínimo <= abertura/médio/último <=
// máximo, e todo vencimento tem ajuste.
function verificarCoerencia(v) {
  if (v.SETTLE === null) return "Sem preço de ajuste";
  if (v.LOW !== null && v.HIGH !== null) {
    if (v.LOW > v.HIGH) return `Mínimo (${v.LOW}) maior que o máximo (${v.HIGH})`;
    for (const campo of ["OPEN", "AVG", "LAST"]) {
      if (v[campo] !== null && (v[campo] < v.LOW || v[campo] > v.HIGH)) return `${campo} (${v[campo]}) fora do intervalo mínimo-máximo (${v.LOW}-${v.HIGH})`;
    }
  }
  return null;
}

// Impura: Buffer do PDF -> resultado de `extrairFuturosCcm`.
async function extrairDoPdf(buffer) {
  return extrairFuturosCcm(await lerPdf(buffer));
}

module.exports = {
  extrairFuturosCcm,
  extrairDoPdf,
  extrairDataReferencia,
  agruparLinhas,
  detectarFormato,
  lerNumero,
  tokensDaLinha,
  COLUNAS
};
