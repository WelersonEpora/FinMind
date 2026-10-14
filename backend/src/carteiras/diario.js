"use strict";

const { sinal } = require("./risco");

// O DIÁRIO DO OPERADOR (ADR 0127, §7; etapa 6): as regras puras do que ele registra à mão. O motor (motor.js) executa
// as ordens dele como as das outras trilhas: a entrada e a saída no preço informado, conferido contra a faixa do dia na
// liquidação; o stop e os alvos da Tabela 2 pela mínima e máxima do dia.

// O checklist de entrada da Cartilha v1.0 (Cap. 7.1), na ordem dela. Os itens `automatico` o sistema confere (a
// verificação de mesmo código bloqueia a entrada); os outros o operador marca. A aderência (Cap. 9.5) é a entrada com
// os 8 itens cumpridos; um item desmarcado não impede o registro: a medição precisa ver o que ficou fora da Cartilha.
const CHECKLIST = Object.freeze([
  { codigo: "VIES_FINMIND", texto: "Viés claro do FINMIND para o ativo", automatico: null },
  { codigo: "ESTRUTURA_SMC", texto: "Estrutura SMC alinhada (BOS/CHoCH, zona de interesse, FVG/sweep)", automatico: null },
  { codigo: "KILL_ZONE", texto: "Setup dentro da kill zone", automatico: null },
  { codigo: "STOP_PISO", texto: "Stop definido, respeitando o piso de ATR(14)", automatico: ["STOP_DO_LADO", "PISO_ATR"] },
  { codigo: "ALVOS_RR", texto: "Alvos conforme a Tabela 2, com o R:R mínimo respeitado", automatico: ["RR_MINIMO"] },
  { codigo: "DIMENSIONAMENTO", texto: "Dimensionamento confirmando o risco % do ativo", automatico: ["QUANTIDADE"] },
  { codigo: "JANELA_B3", texto: "Janela de pregão da B3 (09h00-15h55), fora de ±30 min de eventos", automatico: null },
  { codigo: "SEM_EVENTO", texto: "Sem evento de alto impacto nos ±30 minutos", automatico: null }
]);

// O checklist como fica gravado: os itens manuais como o operador marcou; os automáticos pelas verificações.
// -> { itens: { CODIGO: boolean }, aderente, erros }.
function montarChecklist(marcados, verificacoes = []) {
  const erros = [];
  if (marcados != null && (typeof marcados !== "object" || Array.isArray(marcados))) erros.push('"checklist" deve ser um objeto { CODIGO: true/false }.');
  const recebidos = marcados && typeof marcados === "object" ? marcados : {};
  const conhecidos = new Set(CHECKLIST.map((i) => i.codigo));
  for (const codigo of Object.keys(recebidos)) {
    if (!conhecidos.has(codigo)) erros.push(`checklist: item "${codigo}" desconhecido.`);
  }
  const okDe = new Map(verificacoes.map((v) => [v.codigo, v.ok]));
  const itens = {};
  for (const item of CHECKLIST) {
    itens[item.codigo] = item.automatico ? item.automatico.every((c) => okDe.get(c) === true) : recebidos[item.codigo] === true;
  }
  return { itens, aderente: Object.values(itens).every(Boolean), erros };
}

// O stop movido pelo operador: só a favor da posição e ainda do lado da perda em relação ao último ajuste (senão a
// posição sairia na hora). `stopVigente`: o stop atual, com o último movimento já registrado. -> lista de erros.
function validarMovimentoDeStop({ lado, stopVigente, novo, ultimoAjuste }) {
  const s = sinal(lado);
  const erros = [];
  if (!(Number.isFinite(novo) && novo > 0)) return ['"stop" deve ser um número maior que 0.'];
  if (stopVigente == null) return ["A posição não tem stop."];
  if (!((novo - stopVigente) * s > 1e-9)) erros.push(`O stop só se move a favor da posição: ${s > 0 ? "acima" : "abaixo"} de ${stopVigente}.`);
  if (!((ultimoAjuste - novo) * s > 1e-9)) erros.push(`O stop precisa ficar ${s > 0 ? "abaixo" : "acima"} do último ajuste (${ultimoAjuste}).`);
  return erros;
}

// Os movimentos de stop em vigor em `data` aplicados às posições (o mais recente de cada uma, sempre a favor: o alvo 1
// pode já ter levado o stop à entrada). `movimentos`: [{ posicaoId, stop, vigenteDesde, registradoEm }]. -> posições novas.
function aplicarMovimentosDeStop(posicoes, movimentos, data) {
  const ultimo = new Map();
  for (const m of movimentos) {
    if (m.vigenteDesde > data) continue;
    const atual = ultimo.get(m.posicaoId);
    if (!atual || m.vigenteDesde > atual.vigenteDesde || (m.vigenteDesde === atual.vigenteDesde && m.registradoEm > atual.registradoEm)) {
      ultimo.set(m.posicaoId, m);
    }
  }
  return posicoes.map((p) => {
    const m = ultimo.get(p.id);
    if (!m || p.stop == null) return p;
    const s = sinal(p.lado);
    return { ...p, stop: s > 0 ? Math.max(p.stop, m.stop) : Math.min(p.stop, m.stop) };
  });
}

// A fase da operação no ciclo do ADR 0127, §7: planejada (a ordem aguarda a liquidação), aberta, em gestão (depois do
// alvo 1, de uma redução ou de um stop movido), encerrada ou cancelada.
function faseDaOperacao({ ordem, posicao, eventos = [] }) {
  if (!posicao) return ordem?.situacao === "CANCELADA" ? "CANCELADA" : ordem?.situacao === "CRIADA" ? "PLANEJADA" : "NAO_EXECUTADA";
  if (posicao.situacao === "ENCERRADA") return "ENCERRADA";
  const mexida = posicao.alvo1Atingido || posicao.reduzida || eventos.some((e) => e.tipo === "STOP_MOVIDO");
  return mexida ? "EM_GESTAO" : "ABERTA";
}

module.exports = { CHECKLIST, montarChecklist, validarMovimentoDeStop, aplicarMovimentosDeStop, faseDaOperacao };
