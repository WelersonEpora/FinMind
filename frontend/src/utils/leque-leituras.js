// Geometria do gráfico "faixas lidas × preço" da Qualidade da IA (ADR 0064): função pura, testável sem DOM (como
// echarts-option-builder.js). Cada faixa é UMA leitura, desenhada na data-alvo e convertida em preço a partir da base
// da própria leitura; no modo de quatro horizontes, cada data-alvo mostra lado a lado o que foi lido para ela 1, 7, 30 e
// 90 dias antes. O componente (components/charts/LequeLeiturasChart.vue) só converte em pixels e desenha.
// Datas são sempre "AAAA-MM-DD" tratadas em UTC.

// Uma cor por horizonte, a mesma nas duas visões (a ordem da paleta categórica que passa no teste de daltonismo).
export const CORES_HORIZONTE = { IMEDIATO: '#2a78d6', CURTO: '#eb6834', MEDIO: '#1baf7a', LONGO: '#eda100' }

const POSICAO = { BAIXA_FORTE: -2, BAIXA_LEVE: -1, LATERAL: 0, ALTA_LEVE: 1, ALTA_FORTE: 2 }

// A folga da escala de preço na visão de um horizonte, pelos dias dele (a da visão de quatro é fixa).
const FOLGA_UM = { 1: 0.03, 7: 0.05, 30: 0.08, 90: 0.1 }
const FOLGA_QUATRO = 0.06

const paraMs = (iso) => Date.parse(`${iso}T00:00:00Z`)

export function somarDias(iso, dias) {
  return new Date(paraMs(iso) + dias * 86400000).toISOString().slice(0, 10)
}

export function diasEntre(inicio, fim) {
  return Math.round((paraMs(fim) - paraMs(inicio)) / 86400000)
}

const fimDeSemana = (iso) => [0, 6].includes(new Date(paraMs(iso)).getUTCDay())

// A faixa em variação % a partir da base. A FORTE não tem limite ("+T2 ou mais"): é desenhada com a altura de uma faixa
// leve (de T2 a T2 + (T2 − T1)) e marcada com uma seta na ponta aberta; o tooltip diz o limite real.
export function faixaDesenhada(faixa, { t1, t2 }) {
  const extra = t2 + (t2 - t1)
  switch (faixa) {
    case 'LATERAL':
      return { de: -t1, ate: t1, seta: null }
    case 'ALTA_LEVE':
      return { de: t1, ate: t2, seta: null }
    case 'ALTA_FORTE':
      return { de: t2, ate: extra, seta: 'cima' }
    case 'BAIXA_LEVE':
      return { de: -t2, ate: -t1, seta: null }
    case 'BAIXA_FORTE':
      return { de: -extra, ate: -t2, seta: 'baixo' }
    default:
      return null
  }
}

// Em que pé está a barra: dentro (o preço caiu na faixa lida), fora (com a distância em faixas), pendente (a apurar ou
// aguardando o preço) ou sem resultado (sem preço, sem pregão, sem base).
export function estadoDaBarra(linha) {
  const situacao = linha.realizado?.situacao
  if (situacao === 'APURADO' && linha.realizado.faixa && POSICAO[linha.lida?.faixa] !== undefined) {
    const distancia = Math.abs(POSICAO[linha.lida.faixa] - POSICAO[linha.realizado.faixa])
    return { estado: distancia === 0 ? 'dentro' : 'fora', distancia }
  }
  if (situacao === 'A_APURAR' || situacao === 'AGUARDANDO_DADO') return { estado: 'pendente', distancia: null }
  return { estado: 'sem-resultado', distancia: null }
}

// As leituras que o gráfico desenha: todas com faixa lida, base e data-alvo. No gráfico, cada data-alvo recebe uma
// leitura por horizonte, então as de fim de semana não se repetem: aparecem, marcadas como fora da métrica.
// `visiveis`: os horizontes marcados na legenda (null = todos), na visão de vários.
export function linhasDoGrafico(linhas, { modo, horizonte, visiveis = null }) {
  return linhas.filter(
    (l) =>
      l.lida?.faixa &&
      (l.base?.valor || l.precoRecebido?.valor) &&
      l.dataAlvo &&
      (modo === 'quatro' ? !visiveis || visiveis.includes(l.horizonte) : l.horizonte === horizonte)
  )
}

// Por que uma leitura desenhada não entra na métrica por causa dela mesma (o gráfico a esmaece): a referência antiga
// (petróleo v1), sem pregão na data da análise (inclusive a de fim de semana que ainda espera o preço) ou sem a
// variação passada para o benchmark. A espera pelo preço (a apurar) não esmaece: é só o tempo. -> o motivo ou null.
export function foraDaMetrica(linha) {
  if (!['DATA_DA_ANALISE', 'DATA_DO_PRECO_RECEBIDO'].includes(linha.referenciaHorizontes)) return 'REFERENCIA_ANTIGA'
  if (linha.motivoFora === 'SEM_PREGAO_NA_DATA' || fimDeSemana(linha.dataAnalise)) return 'SEM_PREGAO_NA_DATA'
  if (linha.motivoFora === 'SEM_BENCHMARK') return 'SEM_BENCHMARK'
  return null
}

// A janela do gráfico: 180 dias, 90 de realizado e 90 de previsão (até onde chega o horizonte mais longo), com hoje no
// meio. É a mesma nas duas visões e em qualquer horizonte: trocar a visão só troca as faixas desenhadas.
export const DIAS_DA_JANELA = 180

export function janelaDoGrafico({ hoje }) {
  return { ini: somarDias(hoje, -DIAS_DA_JANELA / 2), fim: somarDias(hoje, DIAS_DA_JANELA / 2) }
}

// A série que as leituras usavam numa data: a da leitura mais recente até ela (antes da primeira, a da primeira). null
// sem leitura com série.
function serieDasLeituras(linhas) {
  const leituras = [...new Map(linhas.filter((l) => l.seriesCode).map((l) => [l.dataAnalise, l.seriesCode]))].sort((a, b) =>
    a[0].localeCompare(b[0])
  )
  if (leituras.length === 0) return null
  return (data) => ([...leituras].reverse().find(([d]) => d <= data) || leituras[0])[1]
}

// A linha do preço: em cada dia de pregão, o preço do contrato que as leituras daquele dia usavam (a leitura mais
// recente até a data). Na troca de contrato, a linha se parte em outro segmento, sem emendar.
export function segmentosDoPreco(precos, linhas, { ini, fim }) {
  return segmentosComSerie(precos, linhas, { ini, fim }).map((s) => s.pontos)
}

// O contrato de uma série de futuro, pelo código (B3.CCM.CCMX26.SETTLE -> CCMX26); null numa série sem vencimento
// (BCB.PTAX.VENDA, EIA.PETROLEO_PRECOS.BRENT).
export function contratoDaSerie(seriesCode) {
  const partes = String(seriesCode || '').split('.')
  return partes.length === 4 ? partes[2] : null
}

// Como segmentosDoPreco, com a série de cada segmento. `pular(data, serie)`: o ponto que outra linha já desenha (a
// linha se parte no buraco). -> [{ seriesCode, contrato, pontos: [{ data, valor }] }].
function segmentosComSerie(precos, linhas, { ini, fim }, pular = () => false) {
  const porSerie = new Map(precos.map((p) => [p.seriesCode, new Map(p.pontos.map((pt) => [pt.data, pt.valor]))]))
  const serieNaData = serieDasLeituras(linhas)
  if (!serieNaData) return []
  const datas = [...new Set(precos.flatMap((p) => p.pontos.map((pt) => pt.data)))].filter((d) => d >= ini && d <= fim).sort()
  const segmentos = []
  let atual = null
  for (const data of datas) {
    const serie = serieNaData(data)
    const valor = porSerie.get(serie)?.get(data)
    if (valor == null) continue
    if (pular(data, serie)) {
      atual = null
      continue
    }
    if (!atual || atual.seriesCode !== serie) {
      atual = { seriesCode: serie, contrato: contratoDaSerie(serie), pontos: [] }
      segmentos.push(atual)
    }
    atual.pontos.push({ data, valor })
  }
  return segmentos
}

// As linhas de preço dos OUTROS horizontes visíveis, no modo de vários (com contrato por horizonte, ADR 0078): cada um
// desenha o contrato dele só onde ele difere do que já está desenhado (a linha principal e as dos horizontes antes dele).
// No ouro e no dólar, um preço só, não sobra nada. -> [{ horizonte, seriesCode, contrato, pontos }].
function linhasDosOutrosHorizontes(precos, linhas, { principal, horizontes, janela }) {
  const desenhado = new Set()
  const marcar = (segs) => segs.forEach((s) => s.pontos.forEach((p) => desenhado.add(`${p.data}|${s.seriesCode}`)))
  marcar(principal)
  const outras = []
  for (const h of horizontes) {
    const doHorizonte = linhas.filter((l) => l.horizonte === h)
    if (!doHorizonte.length) continue
    const segs = segmentosComSerie(precos, doHorizonte, janela, (data, serie) => desenhado.has(`${data}|${serie}`))
    marcar(segs)
    outras.push(...segs.map((s) => ({ horizonte: h, ...s })))
  }
  return outras
}

// O nome curto de uma série de preço, para a legenda: a fonte e o contrato ("Yahoo BZZ26", "B3 CCMX26").
export function rotuloDaSerie(seriesCode) {
  const contrato = contratoDaSerie(seriesCode)
  const fonte = { B3: 'B3', YAHOO: 'Yahoo' }[String(seriesCode || '').split('.')[0]]
  if (contrato && fonte) return `${fonte} ${contrato}`
  return { 'BCB.PTAX.VENDA': 'BCB PTAX', 'EIA.PETROLEO_PRECOS.BRENT': 'EIA Brent', 'EIA.PETROLEO_PRECOS.WTI': 'EIA WTI' }[seriesCode] || seriesCode
}

// A legenda das linhas de preço: a principal (o contrato atual dela) e um item por contrato das outras, cada um com os
// horizontes que o usam nas leituras da janela. -> [{ seriesCode, rotulo, horizontes, horizonte (a cor; null na
// principal), principal, ligada }].
function legendaDasLinhas({ principal, outras, linhas, horizontes, ligadas, janela }) {
  if (!principal.length) return []
  const daJanela = linhas.filter((l) => l.seriesCode && horizontes.includes(l.horizonte) && l.dataAnalise >= janela.ini && l.dataAnalise <= janela.fim)
  const horizontesDe = (serie, soAtual) =>
    horizontes.filter((h) => {
      const doHorizonte = daJanela.filter((l) => l.horizonte === h).sort((a, b) => a.dataAnalise.localeCompare(b.dataAnalise))
      return soAtual ? doHorizonte.at(-1)?.seriesCode === serie : doHorizonte.some((l) => l.seriesCode === serie)
    })
  const atual = principal.at(-1).seriesCode
  const itens = [{ seriesCode: atual, rotulo: rotuloDaSerie(atual), horizontes: horizontesDe(atual, true), horizonte: null, principal: true, ligada: true }]
  for (const s of outras) {
    if (itens.some((i) => i.seriesCode === s.seriesCode)) continue
    itens.push({ seriesCode: s.seriesCode, rotulo: rotuloDaSerie(s.seriesCode), horizontes: horizontesDe(s.seriesCode, false), horizonte: s.horizonte, principal: false, ligada: ligadas.includes(s.seriesCode) })
  }
  return itens
}

// A linha de CONTEXTO (`contexto` de GET /api/v1/qualidade-ia: no petróleo, o Brent à vista da EIA), fora de qualquer
// medida. Some nos dias em que a linha do preço já é essa série (as leituras antigas, feitas nela), para não repetir; o
// buraco parte a linha em segmentos. -> [[{ data, valor }]].
export function segmentosDoContexto(contexto, linhas, { ini, fim }) {
  if (!contexto?.pontos?.length) return []
  const serieNaData = serieDasLeituras(linhas)
  const segmentos = []
  let atual = null
  for (const p of contexto.pontos) {
    if (p.data < ini || p.data > fim) continue
    if (serieNaData && serieNaData(p.data) === contexto.seriesCode) {
      atual = null
      continue
    }
    if (!atual) segmentos.push((atual = []))
    atual.push({ data: p.data, valor: p.valor })
  }
  return segmentos
}

// Tudo o que o gráfico desenha. `linhas`/`precos`: o que GET /api/v1/qualidade-ia devolve. `horizontes`: os do ativo,
// na ordem ([{ horizonte, dias }]). `contexto`: a série de contexto da API (ou null). -> { ini, fim, escala, barras,
// persistencias, marcadores, segmentos, contexto: { nome, segmentos } | null }.
// `visiveis`: os horizontes marcados na legenda (null = todos); cada um mantém a sua posição na coluna da data-alvo.
// `ligadas`: as séries dos outros contratos ligadas na legenda (`legendaDoPreco`); as demais ficam fora do desenho.
export function montarLeque({ linhas, precos, horizontes, modo, horizonte, persistencia = false, hoje, contexto = null, visiveis = null, ligadas = [] }) {
  const ordem = horizontes.map((h) => h.horizonte)
  const diasHorizonte = horizontes.find((h) => h.horizonte === horizonte)?.dias ?? 7
  const desenhadas = linhasDoGrafico(linhas, { modo, horizonte, visiveis })
  const { ini, fim } = janelaDoGrafico({ hoje })
  const naJanela = desenhadas.filter((l) => l.dataAlvo >= ini && l.dataAlvo <= fim)

  const emPreco = (l, faixa) => {
    const f = faixaDesenhada(faixa, l)
    if (!f) return null
    const base = l.base?.valor ?? l.precoRecebido.valor
    return { precoDe: base * (1 + f.de / 100), precoAte: base * (1 + f.ate / 100), seta: f.seta }
  }

  const barras = naJanela
    .map((l) => ({ dataAlvo: l.dataAlvo, horizonte: l.horizonte, indice: modo === 'quatro' ? ordem.indexOf(l.horizonte) : 0, ...emPreco(l, l.lida.faixa), ...estadoDaBarra(l), foraDaMetrica: foraDaMetrica(l), linha: l }))
    .filter((b) => b.precoDe != null)
  const persistencias =
    modo === 'um' && persistencia
      ? naJanela.filter((l) => l.persistencia?.faixa).map((l) => ({ dataAlvo: l.dataAlvo, ...emPreco(l, l.persistencia.faixa) }))
      : []
  const marcadores =
    modo === 'um'
      ? barras.filter((b) => b.estado === 'dentro' || b.estado === 'fora').map((b) => ({ data: b.dataAlvo, valor: b.linha.realizado.preco, distancia: b.distancia, foraDaMetrica: b.foraDaMetrica }))
      : []
  // A linha do preço segue o contrato de UM horizonte (com contrato por horizonte, ADR 0078, cada um tem o seu): na
  // visão de um horizonte, o dele (o das faixas desenhadas); em vários, o do primeiro marcado (com o imediato, o
  // vencimento mais próximo, o do bloco 2.1 do prompt). Com todos juntos, valia o do último horizonte da leitura (o do longo).
  const horizonteDaLinha = modo === 'um' ? horizonte : (ordem.find((h) => !visiveis || visiveis.includes(h)) ?? ordem[0])
  const linhasDaLinha = linhas.filter((l) => l.horizonte === horizonteDaLinha)
  const daLinha = linhasDaLinha.length ? linhasDaLinha : linhas
  const janelaDoPreco = { ini, fim: hoje < fim ? hoje : fim }
  const principal = segmentosComSerie(precos, daLinha, janelaDoPreco)
  const segmentos = principal.map((s) => s.pontos)
  const segmentosContexto = segmentosDoContexto(contexto, daLinha, janelaDoPreco)
  // No modo de vários horizontes, a linha do contrato de cada horizonte visível que difere da principal (ADR 0078), na
  // cor dele. Começam desligadas: `ligadas` são as séries que o usuário ligou na legenda.
  const horizontesVisiveis = modo === 'quatro' ? ordem.filter((h) => !visiveis || visiveis.includes(h)) : [horizonteDaLinha]
  const todasAsOutras =
    modo === 'quatro'
      ? linhasDosOutrosHorizontes(precos, linhas, {
          principal,
          horizontes: horizontesVisiveis.filter((h) => h !== horizonteDaLinha),
          janela: janelaDoPreco
        })
      : []
  const outrasLinhas = todasAsOutras.filter((s) => ligadas.includes(s.seriesCode))
  const legendaDoPreco = legendaDasLinhas({ principal, outras: todasAsOutras, linhas, horizontes: horizontesVisiveis, ligadas, janela: janelaDoPreco })

  // A escala cobre o preço (a linha e os pontos realizados) e as faixas inteiras, com folga (a seta da FORTE cabe nela):
  // nenhuma faixa fica cortada na borda, nem as largas do longo prazo.
  const valores = [
    ...segmentos.flat().map((p) => p.valor),
    // Também as desligadas: a escala não pula ao ligar e desligar.
    ...todasAsOutras.flatMap((s) => s.pontos.map((p) => p.valor)),
    ...segmentosContexto.flat().map((p) => p.valor),
    ...marcadores.map((m) => m.valor),
    ...[...barras, ...persistencias].flatMap((b) => [b.precoDe, b.precoAte])
  ]
  const folga = modo === 'quatro' ? FOLGA_QUATRO : FOLGA_UM[diasHorizonte] ?? FOLGA_QUATRO
  const escala = valores.length
    ? { min: Math.min(...valores) * (1 - folga), max: Math.max(...valores) * (1 + folga) }
    : { min: 0, max: 1 }

  return { ini, fim, escala, barras, persistencias, marcadores, segmentos, outrasLinhas, legendaDoPreco, contexto: segmentosContexto.length ? { nome: contexto.nome, segmentos: segmentosContexto } : null }
}

// As marcas do eixo de preço: um passo "redondo" que dê no máximo 7 linhas.
export function marcasDoEixo({ min, max }) {
  const passo = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 250, 500].find((p) => (max - min) / p <= 7) || 1000
  const marcas = []
  for (let v = Math.ceil(min / passo) * passo; v <= max + 1e-9; v += passo) marcas.push(Math.round(v * 1000) / 1000)
  return marcas
}
