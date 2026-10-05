"use strict";

// O texto de um fator CALCULADO para o prompt da IA do ativo (ADR 0050): genérico, montado do que o fator já declara
// (a `apresentacao`, a decisão da camada C e os parâmetros) e do catálogo (o nome, o peso e a avaliação do dado). A
// tela mostra este mesmo texto ("Texto exato que vai ao prompt"): o que se vê é o que a IA recebe. Função pura.
//
// O bloco tem o período do ponto (a semana ou o mês, e que não é tempo real) e quatro partes, sempre nesta ordem:
//   A — Medida: os dados observados e as variações (os quadros da camada A, como a tela os mostra);
//   B — Leitura: a referência, a comparação (os quadros da camada B) e a regra aplicada, com a origem dos parâmetros
//       (a margem até o limiar importa: +3,1% numa faixa de 3% não é +9,8%);
//   C — Leitura do fator: pressão (alta, baixa ou neutra), intensidade e tendência. "Leitura", não "decisão": não é
//       recomendação operacional;
//   D — Validação histórica: a relação do fator com o preço no histórico (a avaliação do dado do catálogo). Separada
//       de propósito: contextualiza a qualidade da relação e não entra na leitura atual.

const ROTULO_ATIVO = { PETROLEO: "PETRÓLEO", OURO: "OURO", MILHO: "MILHO", CAFE: "CAFÉ" };

function numero(valor, casas, agrupar = true) {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: agrupar });
}

// Um valor de quadro como a tela o mostra: casas, sinal, unidade colada e, com `agrupar: false`, sem o separador de
// milhar (um ano) - o mesmo que formatarQuadro do frontend.
function formatarValor(valor, { casas = 0, sinal = false, unidadeValor = "", agrupar = true } = {}) {
  if (valor === null || valor === undefined) return "-";
  return `${sinal && valor > 0 ? "+" : ""}${numero(valor, casas, agrupar)}${unidadeValor}`;
}

// "- Rótulo: valor (linha de baixo)": a linha de baixo do quadro na tela (o valor secundário ou o sufixo) vai entre
// parênteses; o `detalhe` (o campo de um texto do ponto, ex.: a previsão do CPC por estado) vai na linha seguinte. Sem
// valor na semana, diz isso em vez de "-".
function linhaQuadro(ponto, quadro) {
  const valor = ponto[quadro.campo];
  if (valor === null || valor === undefined) return `- ${quadro.rotulo}: sem dado neste período`;
  const s = quadro.secundario;
  const complemento = s ? [s.prefixo, formatarValor(ponto[s.campo], s), s.sufixo].filter(Boolean).join(" ") : quadro.sufixo;
  const linha = `- ${quadro.rotulo}: ${formatarValor(valor, quadro)}${complemento ? ` (${complemento})` : ""}`;
  return quadro.detalhe && ponto[quadro.detalhe] ? `${linha}
  ${ponto[quadro.detalhe]}` : linha;
}

function dataBr(iso) {
  return iso.split("-").reverse().join("/");
}

// "3º/2026": o trimestre de uma data do 1º dia do trimestre (AAAA-MM-01).
function trimestre(iso) {
  return `${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}º/${iso.slice(0, 4)}`;
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// "abr/2027": o mês de uma data (AAAA-MM-DD) somado de `meses`.
function mesDepois(iso, meses) {
  const total = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 + meses;
  return `${MESES_CURTOS[total % 12]}/${Math.floor(total / 12)}`;
}

// A data de efeito de um sinal defasado (metodologia-base.js, `efeitoDefasado`), contada do período do dado.
function linhaEfeitoDefasado(efeito, observedAt) {
  return (
    `- Sinal defasado: efeito esperado de ${mesDepois(observedAt, efeito.mesesMin)} a ${mesDepois(observedAt, efeito.mesesMax)} ` +
    `(${efeito.mesesMin} a ${efeito.mesesMax} meses depois do dado), sobre ${efeito.sobre}; fora dos horizontes desta leitura.`
  );
}

function periodoDoPonto(observedAt, periodicidade) {
  if (periodicidade === "MENSAL") return `Mês de ${dataBr(observedAt).slice(3)}`;
  if (periodicidade === "TRIMESTRAL") return `Trimestre de ${trimestre(observedAt)}`;
  if (periodicidade === "LEVANTAMENTO") return `Levantamento de ${dataBr(observedAt)}`;
  if (periodicidade === "PUBLICACAO") return `Publicação de ${dataBr(observedAt)}`;
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

// Um texto com os parâmetros entre chaves ("{limiarRevisaoPct}"), preenchidos com os em uso. As janelas em semanas ou
// levantamentos ("semanas...", "levantamentos...") e os estados ("estadosMinimos") são contagens: sem casa decimal.
const CONTAGEM = /^(semanas|levantamentos|estados)/;
function preencher(texto, parametros) {
  return texto.replace(/\{(\w+)\}/g, (_, chave) => (CONTAGEM.test(chave) ? String(parametros[chave]) : limiar(parametros[chave])));
}

// A regra da decisão por faixa. Opcionais da `apresentacao`: `regra`, a regra própria de um fator que não é por faixa
// (ex.: o clima do milho), no lugar dela; `regraAdicional`, uma condição a mais além da faixa (ex.: a revisão do
// estoque no milho). Os dois em texto, com os parâmetros entre chaves.
function regraDaDecisao(parametros, apresentacao) {
  if (apresentacao.regra) return preencher(apresentacao.regra, parametros);
  const unidade = (chave) => apresentacao.parametros.find((p) => p.chave === chave)?.unidade || "";
  const u = unidade("limiarModeradoPct");
  const mod = parametros.limiarModeradoPct;
  const regra =
    `neutra entre -${comUnidade(mod, u)} e +${comUnidade(mod, u)}, forte a partir de ${comUnidade(parametros.limiarFortePct, u)}; ` +
    `tendência em ${parametros.semanasTendencia} ${unidade("semanasTendencia")}, mudança mínima de ` +
    `${comUnidade(parametros.limiarTendenciaPp, unidade("limiarTendenciaPp"))}`;
  if (!apresentacao.regraAdicional) return regra;
  return `${regra}; ${preencher(apresentacao.regraAdicional, parametros)}`;
}

function origemDosParametros(origem, simulacao) {
  if (simulacao) return "parâmetros simulados na tela, não salvos";
  if (!origem) return "parâmetros padrão do FinMind";
  return `parâmetros da versão ${origem.versao}, salva em ${new Date(origem.alteradoEm).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
}

// `fator`: do catálogo ({ nome, peso, dados.avaliacao }). `calculo`: { apresentacao, periodicidade, parametros,
// origemParametros, simulacao }. `ponto`: o último ponto do cálculo (ou null). `ativo`: o código do ativo.
const PRESSAO = { ALTA: "alta", BAIXA: "baixa", NEUTRA: "neutra" };

// Fecha a frase com um ponto, sem duplicar quando ela já termina em um ("0,25 p.p.").
function comPonto(frase) {
  return frase.endsWith(".") ? frase : `${frase}.`;
}

const SITUACAO_REGRA = { PROPOSTA: "proposta", VALIDADA: "validada" };

// A 2ª linha do bloco: o código do fator (o que a IA cita na resposta), o tipo no FEL 1, a situação da regra e a
// versão do cálculo. O nome no FEL 1 NÃO entra: o título diz o dado usado, e o nome do FEL 1 pode citar o que não entra
// no cálculo (ex.: a Guiana na oferta não-OPEP); ele fica no modal da tela.
function linhaIdentificacao(fator, calculo) {
  const partes = [`Código: ${fator.codigo}`];
  if (fator.fel1?.tipo) partes.push(`Tipo no FEL 1: ${fator.fel1.tipo}`);
  if (fator.proposta?.situacao) partes.push(`Regra: ${SITUACAO_REGRA[fator.proposta.situacao] || fator.proposta.situacao}`);
  if (calculo.factorId) partes.push(`Cálculo: ${calculo.factorId} v${calculo.factorVersion}`);
  return partes.join(" | ");
}

function montarTextoPrompt({ ativo, fator, calculo, ponto }) {
  const { apresentacao } = calculo;
  const linhas = [`FATOR — ${fator.nome} — ${ROTULO_ATIVO[ativo] || ativo} (peso ${fator.peso})`, linhaIdentificacao(fator, calculo)];
  if (!ponto) {
    // Numa simulação, o comum é a publicação registrada do dado ser posterior à data (ex.: o histórico do JODI tem a
    // data da 1ª coleta como limite superior, ADR 0042): pela regra point-in-time, ele ainda não era conhecido.
    linhas.push("Sem dado na data: nada do que o fator usa tinha sido publicado até ela, pelo registro de publicação do FinMind.");
  } else {
    linhas.push(`${periodoDoPonto(ponto.observedAt, calculo.periodicidade)}. ${apresentacao.nota}`);
    linhas.push("A — Medida:", ...apresentacao.quadros.filter((q) => q.camada === "A").map((q) => linhaQuadro(ponto, q)));
    linhas.push("B — Leitura:", ...apresentacao.quadros.filter((q) => q.camada === "B").map((q) => linhaQuadro(ponto, q)));
    // Fator de CONTEXTO (metodologia-base.js, `contextoDe`): sem a regra da pressão nem a pressão. Só a tendência, que
    // diz para onde o dado está indo, e o papel dele.
    if (!fator.contextoDe) {
      linhas.push(
        `- Regra aplicada (${origemDosParametros(calculo.origemParametros, calculo.simulacao)}): ${comPonto(regraDaDecisao(calculo.parametros, apresentacao))}`
      );
    }

    const d = ponto.decisao;
    if (fator.contextoDe) {
      linhas.push(
        "C — Papel na análise:",
        `- CONTEXTO do fator ${fator.contextoDe}, por decisão do especialista: sem pressão própria; não conta a favor nem contra.`,
        `- Tendência: ${d?.tendencia ? apresentacao.rotulosDecisao.tendencia[d.tendencia] : "não calculada"}`
      );
    } else if (!d) {
      linhas.push("C — Leitura do fator: não calculada, o histórico até a data não basta.");
    } else {
      const r = apresentacao.rotulosDecisao;
      linhas.push(
        "C — Leitura do fator:",
        `- Pressão: ${PRESSAO[d.direcao]}`,
        `- Intensidade: ${r.intensidade[d.intensidade].toLowerCase()}`,
        `- Tendência: ${d.tendencia ? r.tendencia[d.tendencia] : "não calculada"}`
      );
    }
    if (fator.efeitoDefasado) linhas.push(linhaEfeitoDefasado(fator.efeitoDefasado, ponto.observedAt));
  }

  // A validação histórica vale com ou sem ponto na data: é sobre a relação do fator com o preço, não sobre o dia.
  if (fator.dados?.avaliacao?.texto) {
    linhas.push("D — Validação histórica (contexto para avaliar a relação; não entra na leitura acima):", `- ${fator.dados.avaliacao.texto}`);
  }
  return linhas.join("\n");
}

module.exports = { montarTextoPrompt, formatarValor };
