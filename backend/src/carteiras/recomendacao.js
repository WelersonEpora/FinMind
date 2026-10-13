"use strict";

const { ACOES_SEM_POSICAO, ACOES_COM_POSICAO } = require("./intencao");

// A RECOMENDAÇÃO diária da IA (ADR 0127, §4), a parte pura: a entrada do prompt, a validação estrita da resposta, a
// marcação das recomendações contrárias à leitura, as intenções da trilha IA e o custo. A chamada ao Gemini fica em
// services/recomendacao-carteira.service.js.
//
// A entrada são as leituras congeladas de CURTO, MEDIO e LONGO de cada ativo e os eventos da semana; NENHUM estado de
// trilha (D8) nem dado da carteira. A resposta traz, por ativo, os três ramos (sem posição, comprado, vendido), a
// prioridade, o porquê de cada ramo, as evidências (pelos ids recebidos) e o que invalida a tese; nunca preço, stop,
// alvo nem quantidade. O motor aplica o ramo do estado de cada trilha e roda por cima (travas, vagas, R:R).

const HORIZONTES = Object.freeze(["CURTO", "MEDIO", "LONGO"]);
const RAMOS = Object.freeze({ semPosicao: ACOES_SEM_POSICAO, comprado: ACOES_COM_POSICAO, vendido: ACOES_COM_POSICAO });
const CAMPOS_ITEM = Object.freeze(["ativo", "prioridade", "semPosicao", "comprado", "vendido", "evidencias", "invalidaSe"]);
const CAMPOS_RAMO = Object.freeze(["acao", "porque"]);
// Um campo com cara de número operacional é recusado com uma mensagem própria (o prompt proíbe).
const CAMPO_PROIBIDO = /preco|preço|stop|alvo|quantidade|tamanho|contratos|lote/i;
const EVENTOS_POR_ATIVO = 10;

// Modelo fixado (ADR 0127, §4): um alias (`*-latest`) mudaria o modelo sem aviso, e a medição precisa saber qual é.
function modeloFixadoValido(nome) {
  return typeof nome === "string" && nome.trim() !== "" && !/latest/i.test(nome);
}

// A entrada do prompt. `leiturasPorAtivo`: { ATIVO: [leituras de analise_diaria] | null }; `eventosPorAtivo`: { ATIVO:
// [eventos] }. Ativo sem leitura fica fora (a trilha IA não entra nele e mantém a posição, como a regra fixa, §6).
// Cada leitura e cada evento ganha um id ("MILHO.MEDIO", "MILHO.EV1"), que a resposta cita.
function montarEntrada({ data, ativos, leiturasPorAtivo, eventosPorAtivo = {} }) {
  const comLeitura = [];
  const semLeitura = [];
  for (const ativo of ativos) {
    const leituras = (leiturasPorAtivo[ativo] || []).filter((l) => HORIZONTES.includes(l?.horizonte));
    if (!leituras.length) {
      semLeitura.push(ativo);
      continue;
    }
    comLeitura.push({
      ativo,
      leituras: HORIZONTES.map((h) => leituras.find((l) => l.horizonte === h))
        .filter(Boolean)
        .map((l) => ({
          id: `${ativo}.${l.horizonte}`,
          horizonte: l.horizonte,
          tendencia: l.tendencia,
          faixa: l.faixa ?? null,
          confianca: l.confianca,
          tese: l.tese ?? null,
          invalidaSe: l.invalidaSe ?? null
        })),
      eventos: (eventosPorAtivo[ativo] || []).slice(0, EVENTOS_POR_ATIVO).map((e, i) => ({
        id: `${ativo}.EV${i + 1}`,
        data: e.data,
        titulo: e.titulo,
        pressao: e.pressao ?? null,
        intensidade: e.intensidade ?? null,
        resumo: e.resumo ?? null
      }))
    });
  }
  return { data, ativos: comLeitura, semLeitura };
}

const idsDaEntrada = (entrada) => new Set(entrada.ativos.flatMap((a) => [...a.leituras.map((l) => l.id), ...a.eventos.map((e) => e.id)]));

// O texto da entrada, para o prompt.
function textoDaEntrada(entrada) {
  const blocos = entrada.ativos.map((a) => {
    const linhas = [`### ${a.ativo}`, "Leituras de tendência do dia:"];
    for (const l of a.leituras) {
      linhas.push(`- [${l.id}] ${l.horizonte}: tendência ${l.tendencia}${l.faixa ? ` (${l.faixa})` : ""}, confiança ${l.confianca}.`);
      if (l.tese) linhas.push(`  Tese: ${l.tese}`);
      if (l.invalidaSe) linhas.push(`  Invalida se: ${l.invalidaSe}`);
    }
    if (!a.eventos.length) linhas.push("Eventos dos últimos 7 dias: nenhum evento aceito.");
    else {
      linhas.push("Eventos dos últimos 7 dias (do mais recente):");
      for (const e of a.eventos) {
        const grau = [e.pressao && `pressão ${e.pressao}`, e.intensidade && `intensidade ${e.intensidade}`].filter(Boolean).join(", ");
        linhas.push(`- [${e.id}] ${e.data}: ${e.titulo}${grau ? ` (${grau})` : ""}.${e.resumo ? ` ${e.resumo}` : ""}`);
      }
    }
    return linhas.join("\n");
  });
  return blocos.join("\n\n");
}

const textoPreenchido = (v) => typeof v === "string" && v.trim() !== "";

// -> { recomendacoes, erros }. Estrita: o JSON inteiro passa ou nada é usado.
function validarRecomendacao(texto, entrada) {
  const erros = [];
  let json;
  try {
    json = JSON.parse(texto);
  } catch (_err) {
    return { recomendacoes: null, erros: ["A resposta não é um JSON válido."] };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return { recomendacoes: null, erros: ["A resposta deve ser um objeto."] };
  const extras = Object.keys(json).filter((k) => k !== "recomendacoes");
  if (extras.length) erros.push(`Campos desconhecidos na raiz: ${extras.join(", ")}.`);
  const itens = json.recomendacoes;
  if (!Array.isArray(itens)) return { recomendacoes: null, erros: [...erros, '"recomendacoes" deve ser uma lista.'] };

  const esperados = entrada.ativos.map((a) => a.ativo);
  const ids = idsDaEntrada(entrada);
  const vistos = new Set();
  for (const [i, item] of itens.entries()) {
    const onde = `recomendacoes[${i}]${item?.ativo ? ` (${item.ativo})` : ""}`;
    if (!item || typeof item !== "object") {
      erros.push(`${onde}: deve ser um objeto.`);
      continue;
    }
    for (const chave of Object.keys(item)) {
      if (CAMPOS_ITEM.includes(chave)) continue;
      erros.push(CAMPO_PROIBIDO.test(chave) ? `${onde}: "${chave}" não é permitido (sem preço, stop, alvo ou quantidade).` : `${onde}: campo desconhecido "${chave}".`);
    }
    if (!esperados.includes(item.ativo)) erros.push(`${onde}: ativo "${item.ativo}" não está na entrada.`);
    else if (vistos.has(item.ativo)) erros.push(`${onde}: ativo repetido.`);
    vistos.add(item.ativo);
    if (!Number.isInteger(item.prioridade)) erros.push(`${onde}: "prioridade" deve ser um inteiro.`);
    for (const [ramo, acoes] of Object.entries(RAMOS)) {
      const r = item[ramo];
      if (!r || typeof r !== "object") {
        erros.push(`${onde}: falta o ramo "${ramo}".`);
        continue;
      }
      for (const chave of Object.keys(r)) {
        if (!CAMPOS_RAMO.includes(chave)) {
          erros.push(CAMPO_PROIBIDO.test(chave) ? `${onde}.${ramo}: "${chave}" não é permitido (sem preço, stop, alvo ou quantidade).` : `${onde}.${ramo}: campo desconhecido "${chave}".`);
        }
      }
      if (!acoes.includes(r.acao)) erros.push(`${onde}.${ramo}: ação "${r.acao}" fora de ${acoes.join(", ")}.`);
      if (!textoPreenchido(r.porque)) erros.push(`${onde}.${ramo}: "porque" vazio.`);
    }
    if (!Array.isArray(item.evidencias) || item.evidencias.length === 0) erros.push(`${onde}: "evidencias" deve citar pelo menos um id.`);
    else {
      const desconhecidas = item.evidencias.filter((id) => !ids.has(id));
      if (desconhecidas.length) erros.push(`${onde}: evidências que não estão na entrada: ${desconhecidas.join(", ")}.`);
    }
    if (!textoPreenchido(item.invalidaSe)) erros.push(`${onde}: "invalidaSe" vazio.`);
  }
  const faltando = esperados.filter((a) => !vistos.has(a));
  if (faltando.length) erros.push(`Faltam os ativos: ${faltando.join(", ")}.`);
  const prioridades = itens.map((i) => i?.prioridade).sort((a, b) => a - b);
  if (prioridades.some((p, i) => p !== i + 1)) erros.push(`As prioridades devem ser de 1 a ${itens.length}, sem repetir.`);

  if (erros.length) return { recomendacoes: null, erros };
  return { recomendacoes: [...itens].sort((a, b) => a.prioridade - b.prioridade), erros: [] };
}

// Uma recomendação contrária à leitura não é recusada: é marcada e medida (ADR 0127, §4). Contrária: um ramo que fica
// contra a tendência do MEDIO (entrar comprado com o MEDIO em BAIXA, entrar vendido com ele em ALTA; manter comprado
// com o MEDIO em BAIXA, manter vendido com ele em ALTA). -> { ATIVO: [ramos contrários] }, só os que têm algum.
function contrariasALeitura(recomendacoes, entrada) {
  const marcas = {};
  for (const r of recomendacoes) {
    const medio = entrada.ativos.find((a) => a.ativo === r.ativo)?.leituras.find((l) => l.horizonte === "MEDIO")?.tendencia;
    const ramos = [];
    if ((r.semPosicao.acao === "ENTRAR_COMPRADO" && medio === "BAIXA") || (r.semPosicao.acao === "ENTRAR_VENDIDO" && medio === "ALTA")) ramos.push("semPosicao");
    if (r.comprado.acao === "MANTER" && medio === "BAIXA") ramos.push("comprado");
    if (r.vendido.acao === "MANTER" && medio === "ALTA") ramos.push("vendido");
    if (ramos.length) marcas[r.ativo] = ramos;
  }
  return marcas;
}

// As intenções da trilha IA no dia. `recomendacoes`: as validadas, ou null (falhou: o fallback "manter", sem novas
// entradas; posições, stops e alvos seguem). Ativo fora da recomendação (sem leitura): não entrar, ou manter.
// `posicoes`: { ATIVO: posição | null }.
function intencoesDaIa({ ativos, recomendacoes, posicoes = {}, contrarias = {} }) {
  const porAtivo = Object.fromEntries((recomendacoes || []).map((r) => [r.ativo, r]));
  const n = (recomendacoes || []).length;
  const restantes = ativos.filter((a) => !porAtivo[a]);
  return ativos.map((ativo) => {
    const posicao = posicoes[ativo] || null;
    const ramo = !posicao ? "semPosicao" : posicao.lado === "COMPRADO" ? "comprado" : "vendido";
    const r = porAtivo[ativo];
    if (!r) {
      return {
        trilha: "IA",
        ativo,
        acao: posicao ? "MANTER" : "NAO_ENTRAR",
        prioridade: n + restantes.indexOf(ativo) + 1,
        origem: "FALLBACK",
        referencia: { ramo, motivo: recomendacoes ? "SEM_LEITURA" : "SEM_RECOMENDACAO" },
        plano: null
      };
    }
    return {
      trilha: "IA",
      ativo,
      acao: r[ramo].acao,
      prioridade: r.prioridade,
      origem: "RECOMENDACAO",
      referencia: { ramo, contraria: (contrarias[ativo] || []).includes(ramo) },
      plano: null
    };
  });
}

// Os tokens por tipo, somados de todas as chamadas (inclusive as respostas recusadas), e o custo em US$ pelos preços
// por milhão de tokens (o raciocínio é cobrado como saída). Sem os preços configurados, o custo fica nulo.
function somarUso(usos) {
  const soma = { entrada: 0, saida: 0, raciocinio: 0, total: 0 };
  for (const u of usos.filter(Boolean)) {
    soma.entrada += u.promptTokenCount || 0;
    soma.saida += u.candidatesTokenCount || 0;
    soma.raciocinio += u.thoughtsTokenCount || 0;
    soma.total += u.totalTokenCount || 0;
  }
  return soma;
}

function custoUsd(tokens, { precoEntrada, precoSaida } = {}) {
  if (!(precoEntrada >= 0 && precoSaida >= 0) || precoEntrada == null || precoSaida == null) return null;
  return Math.round(((tokens.entrada * precoEntrada + (tokens.saida + tokens.raciocinio) * precoSaida) / 1e6) * 1e6) / 1e6;
}

module.exports = { HORIZONTES, modeloFixadoValido, montarEntrada, textoDaEntrada, validarRecomendacao, contrariasALeitura, intencoesDaIa, somarUso, custoUsd };
