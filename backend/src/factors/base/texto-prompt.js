"use strict";

// O texto de um fator CALCULADO para o prompt da IA do ativo (ADR 0050): genérico, montado do que o fator já declara
// (a `apresentacao`, a decisão da camada C e os parâmetros) e do catálogo (o nome, o peso e a avaliação do dado). A
// tela mostra este mesmo texto ("Texto exato que vai ao prompt"): o que se vê é o que a IA recebe. Função pura.
//
// O bloco tem: o período do ponto (a semana ou o mês, e que não é tempo real), as medidas das camadas A e B como a
// tela as mostra, a decisão sugerida com a regra e a origem dos parâmetros (a margem até o limiar importa: +3,1% numa
// faixa de 3% não é +9,8%), e a relação histórica com o preço (a avaliação do dado), quando o fator a tem.

const ROTULO_ATIVO = { PETROLEO: "PETRÓLEO", OURO: "OURO", MILHO: "MILHO", CAFE: "CAFÉ" };

function numero(valor, casas) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// Um valor de quadro como a tela o mostra: casas, sinal e unidade colada (o mesmo que formatarQuadro do frontend).
function formatarValor(valor, { casas = 0, sinal = false, unidadeValor = "" } = {}) {
  if (valor === null || valor === undefined) return "-";
  return `${sinal && valor > 0 ? "+" : ""}${numero(valor, casas)}${unidadeValor}`;
}

// "- Rótulo: valor (linha de baixo)": a linha de baixo do quadro na tela (o valor secundário ou o sufixo) vai entre
// parênteses. Sem valor na semana, diz isso em vez de "-".
function linhaQuadro(ponto, quadro) {
  const valor = ponto[quadro.campo];
  if (valor === null || valor === undefined) return `- ${quadro.rotulo}: sem dado neste período`;
  const s = quadro.secundario;
  const complemento = s ? [s.prefixo, formatarValor(ponto[s.campo], s), s.sufixo].filter(Boolean).join(" ") : quadro.sufixo;
  return `- ${quadro.rotulo}: ${formatarValor(valor, quadro)}${complemento ? ` (${complemento})` : ""}`;
}

function dataBr(iso) {
  return iso.split("-").reverse().join("/");
}

function periodoDoPonto(observedAt, periodicidade) {
  if (periodicidade === "MENSAL") return `Mês de ${dataBr(observedAt).slice(3)}`;
  return `Semana encerrada em ${dataBr(observedAt)}`;
}

// "0,5" e "0,25": uma casa, ou duas quando o limiar tem (como a explicação da decisão).
function limiar(n) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

// A unidade de um parâmetro colada ao valor: "%" sem espaço; as outras com ("0,5 p.p.", "3 US$/barril").
function comUnidade(valor, unidade) {
  return unidade === "%" ? `${limiar(valor)}%` : `${limiar(valor)} ${unidade}`;
}

function regraDaDecisao(parametros, apresentacao) {
  const unidade = (chave) => apresentacao.parametros.find((p) => p.chave === chave)?.unidade || "";
  const u = unidade("limiarModeradoPct");
  const mod = parametros.limiarModeradoPct;
  return (
    `neutra entre -${comUnidade(mod, u)} e +${comUnidade(mod, u)}, forte a partir de ${comUnidade(parametros.limiarFortePct, u)}; ` +
    `tendência em ${parametros.semanasTendencia} ${unidade("semanasTendencia")}, mudança mínima de ` +
    `${comUnidade(parametros.limiarTendenciaPp, unidade("limiarTendenciaPp"))}`
  );
}

function origemDosParametros(origem, simulacao) {
  if (simulacao) return "parâmetros simulados na tela, não salvos";
  if (!origem) return "parâmetros padrão do FinMind";
  return `parâmetros da versão ${origem.versao}, salva em ${new Date(origem.alteradoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
}

// `fator`: do catálogo ({ nome, peso, dados.avaliacao }). `calculo`: { apresentacao, periodicidade, parametros,
// origemParametros, simulacao }. `ponto`: o último ponto do cálculo (ou null). `ativo`: o código do ativo.
function montarTextoPrompt({ ativo, fator, calculo, ponto }) {
  const { apresentacao } = calculo;
  const linhas = [`FATOR — ${fator.nome} — ${ROTULO_ATIVO[ativo] || ativo} (peso ${fator.peso})`];
  if (!ponto) {
    // Numa simulação, o comum é a publicação registrada do dado ser posterior à data (ex.: o histórico do JODI tem a
    // data da 1ª coleta como limite superior, ADR 0042): pela regra point-in-time, ele ainda não era conhecido.
    linhas.push("Sem dado na data: nada do que o fator usa tinha sido publicado até ela, pelo registro de publicação do FinMind.");
    return linhas.join("\n");
  }

  linhas.push(`${periodoDoPonto(ponto.observedAt, calculo.periodicidade)}. ${apresentacao.nota}`);
  for (const camada of ["A", "B"]) {
    const quadros = apresentacao.quadros.filter((q) => q.camada === camada);
    if (quadros.length === 0) continue;
    linhas.push(camada === "A" ? "Medida (A):" : "Leitura (B):", ...quadros.map((q) => linhaQuadro(ponto, q)));
  }

  const d = ponto.decisao;
  if (!d) {
    linhas.push("Decisão sugerida (C): não calculada, o histórico até a data não basta.");
  } else {
    const r = apresentacao.rotulosDecisao;
    const tendencia = d.tendencia ? r.tendencia[d.tendencia] : "não calculada";
    linhas.push(
      `Decisão sugerida (C): ${r.direcao[d.direcao]}, intensidade ${r.intensidade[d.intensidade].toLowerCase()}, tendência: ${tendencia}.`,
      `Regra (${origemDosParametros(calculo.origemParametros, calculo.simulacao)}): ${regraDaDecisao(calculo.parametros, apresentacao)}`.replace(/.?$/, ".")
    );
  }

  if (fator.dados?.avaliacao?.texto) linhas.push(`Avaliação do dado e relação histórica com o preço: ${fator.dados.avaliacao.texto}`);
  return linhas.join("\n");
}

module.exports = { montarTextoPrompt, formatarValor };
