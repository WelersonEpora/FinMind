"use strict";

// Camada C (decisão SIMULADA, ADR 0050) comum aos fatores lidos por uma medida com faixa simétrica em torno de zero:
// o desvio do estoque contra a média de 5 anos, o crescimento anual da produção... Cada fator diz qual campo é a
// medida e os textos da explicação; os parâmetros (limiares) são os mesmos para todos e o Comitê os ajusta.
//
//   direcao     = |valor| < limiarModeradoPct -> NEUTRA; fora da faixa, o lado de cima pressiona para `acimaPressiona`
//                 e o de baixo, para o contrário. Padrão BAIXA: nos fatores de oferta, valor alto é mais oferta
//                 (estoque acima do normal, produção crescendo); na demanda, valor alto (consumo crescendo) é ALTA
//   intensidade = FRACA abaixo de limiarModeradoPct, MODERADA até limiarFortePct, FORTE a partir dele
//   tendencia   = valor(t) - valor(t - semanasTendencia): menos que limiarTendenciaPp -> ESTAVEL; senão SUBINDO
//                 ou CAINDO (cada fator dá o nome dela: "afrouxando", "acelerando"...)

const DIRECAO = { ALTA: "ALTA", BAIXA: "BAIXA", NEUTRA: "NEUTRA" };
const INTENSIDADE = { FRACA: "FRACA", MODERADA: "MODERADA", FORTE: "FORTE" };
const TENDENCIA = { SUBINDO: "SUBINDO", CAINDO: "CAINDO", ESTAVEL: "ESTAVEL" };

// Os parâmetros que a decisão por faixa recebe, com o texto da tela (a tela não conhece o fator: desenha esta lista).
// Os limiares estão na unidade da medida do fator: % na maioria; US$/barril no refino. As chaves terminam em "Pct" e
// "Pp" por história (os primeiros fatores eram em %) e ficam assim: são as chaves das versões já gravadas no banco.
// `janela`: a unidade da janela da tendência, "semanas" (padrão) ou "meses" num fator mensal (a chave continua
// `semanasTendencia`).
function parametrosFaixa({ unidade = "%", unidadeMudanca = "p.p.", janela = "semanas" } = {}) {
  return [
    { chave: "limiarModeradoPct", rotulo: "Faixa neutra", unidade, explicacao: "Até onde, para cima ou para baixo, a medida é considerada normal (sem pressão)." },
    { chave: "limiarFortePct", rotulo: "Limiar de intensidade forte", unidade, explicacao: "A partir desse valor a pressão é forte; entre a faixa neutra e ele, moderada." },
    { chave: "semanasTendencia", rotulo: "Janela da tendência", unidade: janela, explicacao: `Contra quantas ${janela} atrás a medida é comparada para dizer se está mudando.` },
    { chave: "limiarTendenciaPp", rotulo: "Mudança mínima da tendência", unidade: unidadeMudanca, explicacao: "Quanto a medida precisa mudar na janela para não ser considerada estável." }
  ];
}
const PARAMETROS_FAIXA = parametrosFaixa();

const ROTULOS = {
  direcao: { ALTA: "Pressão de alta", BAIXA: "Pressão de baixa", NEUTRA: "Neutra" },
  intensidade: { FRACA: "Fraca", MODERADA: "Moderada", FORTE: "Forte" }
};

function arredondar(n, casas) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

const OPOSTA = { ALTA: "BAIXA", BAIXA: "ALTA" };

// Função pura. `valorAnterior`: a medida de `semanasTendencia` semanas antes, ou null. `acimaPressiona`: ALTA ou
// BAIXA, a direção quando a medida passa da faixa para cima.
function decidirPorFaixa(valor, valorAnterior, parametros, acimaPressiona = DIRECAO.BAIXA) {
  if (valor === null || valor === undefined) return null;
  const { limiarModeradoPct, limiarFortePct, limiarTendenciaPp } = parametros;
  const absoluto = Math.abs(valor);

  let direcao = DIRECAO.NEUTRA;
  if (absoluto >= limiarModeradoPct) direcao = valor > 0 ? acimaPressiona : OPOSTA[acimaPressiona];

  let intensidade = INTENSIDADE.FRACA;
  if (absoluto >= limiarFortePct) intensidade = INTENSIDADE.FORTE;
  else if (absoluto >= limiarModeradoPct) intensidade = INTENSIDADE.MODERADA;

  let tendencia = null;
  let mudancaPp = null;
  if (valorAnterior !== null && valorAnterior !== undefined) {
    mudancaPp = arredondar(valor - valorAnterior, 2);
    if (Math.abs(mudancaPp) < limiarTendenciaPp) tendencia = TENDENCIA.ESTAVEL;
    else tendencia = mudancaPp < 0 ? TENDENCIA.CAINDO : TENDENCIA.SUBINDO;
  }

  return { direcao, intensidade, tendencia, mudancaPp };
}

const fmt = (n, casas = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const comSinal = (n, casas = 2) => `${n > 0 ? "+" : ""}${fmt(n, casas)}`;
// Um limiar (parâmetro do Comitê): uma casa, ou duas quando ele tem (0,25 p.p. não vira "0,3").
const fmtLimiar = (n) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

// Os passos da decisão de uma semana, em texto, com os números dela e os parâmetros em uso. `textos` (do fator):
//   primeiroPasso(ponto) - a medida da semana, em uma frase
//   nomeValor            - "o desvio", "o crescimento anual"
//   abaixo / acima       - por que fora da faixa, para baixo e para cima, vira pressão ("estoque abaixo do normal é aperto")
//                          (a direção em si vem da decisão: o sentido é do fator)
//   subindo / caindo     - o que a tendência significa ("o estoque está indo para cima do normal")
//   rotulosTendencia     - { SUBINDO, CAINDO, ESTAVEL }
//   unidade, unidadeMudanca (opcionais) - da medida e da mudança dela: "%" e "p.p." por padrão; " US$/barril" no refino
//   janela (opcional)    - a unidade da janela da tendência: "semanas" por padrão; "meses" num fator mensal
function explicarPorFaixa(ponto, parametros, textos) {
  const d = ponto?.decisao;
  if (!d) return [];
  const valor = ponto[textos.campo];
  const { limiarModeradoPct: mod, limiarFortePct: forte, semanasTendencia: semanas, limiarTendenciaPp: tend } = parametros;
  const u = textos.unidade ?? "%";
  const um = textos.unidadeMudanca ?? " p.p.";
  const janela = textos.janela ?? "semanas";
  const v = `${comSinal(valor)}${u}`;
  const passos = [textos.primeiroPasso(ponto)];

  if (d.direcao === DIRECAO.NEUTRA) passos.push(`Direção: a faixa neutra vai de −${fmtLimiar(mod)}${u} a +${fmtLimiar(mod)}${u}. ${v} está dentro dela → Neutra.`);
  else if (valor < 0) passos.push(`Direção: ${v} está abaixo de −${fmtLimiar(mod)}${u}: ${textos.abaixo} → ${ROTULOS.direcao[d.direcao]}.`);
  else passos.push(`Direção: ${v} está acima de +${fmtLimiar(mod)}${u}: ${textos.acima} → ${ROTULOS.direcao[d.direcao]}.`);

  const absoluto = fmt(Math.abs(valor));
  if (d.intensidade === INTENSIDADE.FORTE) passos.push(`Intensidade: ${absoluto}${u} é ${fmtLimiar(forte)}${u} ou mais → Forte.`);
  else if (d.intensidade === INTENSIDADE.MODERADA) passos.push(`Intensidade: ${absoluto}${u} fica entre ${fmtLimiar(mod)}${u} e ${fmtLimiar(forte)}${u} → Moderada.`);
  else passos.push(`Intensidade: ${absoluto}${u} é menor que ${fmtLimiar(mod)}${u} → Fraca.`);

  const r = textos.rotulosTendencia;
  if (d.tendencia === null) {
    passos.push(`Tendência: sem ${textos.nomeValor} de ${semanas} ${janela} antes, não calculada.`);
  } else {
    const base = `Tendência: há ${semanas} ${janela} ${textos.nomeValor} era ${comSinal(valor - d.mudancaPp)}${u}; mudou ${comSinal(d.mudancaPp)}${um}`;
    if (d.tendencia === TENDENCIA.ESTAVEL) passos.push(`${base}, menos que ${fmtLimiar(tend)}${um} → ${r.ESTAVEL}.`);
    else if (d.tendencia === TENDENCIA.CAINDO) passos.push(`${base}: caiu ${fmtLimiar(tend)}${um} ou mais, ${textos.caindo} → ${r.CAINDO}.`);
    else passos.push(`${base}: subiu ${fmtLimiar(tend)}${um} ou mais, ${textos.subindo} → ${r.SUBINDO}.`);
  }
  return passos;
}

// Exemplos da camada C (ADR 0050): semanas reais (do histórico já calculado) e cenários hipotéticos (valor de agora e
// de `semanasTendencia` semanas antes), pela mesma regra e com os parâmetros em uso.
function exemplosPorFaixa(pontosTodos, parametros, { campo, episodios, cenarios, acimaPressiona = DIRECAO.BAIXA }) {
  const porData = new Map(pontosTodos.map((ponto) => [ponto.observedAt, ponto]));
  return {
    episodios: episodios.map(({ data, rotulo }) => {
      const ponto = porData.get(data);
      return { data, rotulo, valor: ponto?.[campo] ?? null, decisao: ponto?.decisao ?? null };
    }),
    cenarios: cenarios.map(({ valor, valorAnterior, rotulo }) => ({
      rotulo,
      valor,
      valorAnterior,
      decisao: decidirPorFaixa(valor, valorAnterior, parametros, acimaPressiona)
    }))
  };
}

module.exports = {
  DIRECAO,
  INTENSIDADE,
  TENDENCIA,
  PARAMETROS_FAIXA,
  parametrosFaixa,
  ROTULOS,
  decidirPorFaixa,
  explicarPorFaixa,
  exemplosPorFaixa,
  fmt,
  comSinal
};
