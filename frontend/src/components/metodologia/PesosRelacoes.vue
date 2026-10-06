<script setup>
import { computed } from 'vue'
import {
  MESES_CURTOS,
  ROTULO_AGREGACAO,
  ROTULO_ORIGEM_REGRA,
  celulaPesoFamilia,
  classePeso,
  indiceDoMes,
  temCalendario as definiuPeso,
  tomRelacao
} from '../../utils/metodologia.js'

// Pesos e relações entre os fatores de um ativo: o peso do FEL 1 e, quando o especialista definiu, a sugestão de
// peso-base, o calendário de pesos (fator × mês), a matriz de relações e as regras de agregação (o milho, Motor do Milho
// v0). Tudo vem da API (`metodologia.pesos`). O prompt usa o peso do FEL 1, ou o calendário quando `pesos.noPrompt`
// existe (o milho, ADR 0065). A proposta de agregação em código do FinMind (`pesos.agregacaoFinMind`, o café, ADR 0066)
// fica num card próprio, separada do que é do especialista, com a origem de cada regra.
const props = defineProps({
  pesos: { type: Object, required: true },
  // AAAA-MM-DD: o mês destacado no calendário (hoje, ou a data simulada).
  data: { type: String, required: true }
})

// O card de peso só existe quando o especialista definiu peso próprio para algum fator (hoje, o calendário do milho). Sem
// isso, o peso é o do FEL 1, que já está no card de cada fator, e o resumo da seção diz que é ele que vai ao prompt.
const temCalendario = computed(() => definiuPeso(props.pesos))
const nomesPar = (par) => par.fatores.map((c) => siglaPorCodigo.value[c] || c).join(' × ')
const mesAtual = computed(() => indiceDoMes(props.data))
const siglaPorCodigo = computed(() => Object.fromEntries(props.pesos.fatores.map((f) => [f.codigo, f.sigla])))
const notas = computed(() => props.pesos.fatores.filter((f) => f.notas.length))
const proposta = computed(() => props.pesos.agregacaoFinMind)
// A linha do prompt sem a sigla do fator, que a própria linha da tabela já mostra ("F5 (jun): x" -> "(jun): x").
const semSigla = (linha) => linha.replace(/^F\d+:\s*/, '').replace(/^F\d+\s+(?=\()/, '')
// A coluna "Hoje no FinMind" das relações por par: só quando algum par diz o que vai ao prompt (o café).
const paresNoPrompt = computed(() => props.pesos.pares.some((par) => par.noPrompt))
// As linhas da tabela de famílias, com a célula de cada horizonte já montada.
const linhasFamilias = computed(() =>
  (proposta.value?.familias || []).map((familia) => ({
    ...familia,
    celulas: proposta.value.horizontes.map((h) => ({
      horizonte: h.codigo,
      ...celulaPesoFamilia(familia, h.codigo, siglaPorCodigo.value)
    }))
  }))
)
const significado = computed(() =>
  Object.fromEntries((props.pesos.relacoes?.simbolos || []).map((s) => [s.simbolo, s.significado]))
)

function siglas(codigos) {
  // A regra que vale para todos os fatores diz "Todos", como na proposta.
  if (codigos.length === props.pesos.fatores.length) return 'Todos'
  return codigos.map((c) => siglaPorCodigo.value[c] || c).join(', ')
}

function tituloCelula(fator, mes, i) {
  if (!mes) return `${fator.sigla}, ${MESES_CURTOS[i]}: não definido pelo especialista`
  const decidido = mes.decididoPor ? ` (não definido pelo especialista; decidido por: ${mes.decididoPor})` : ''
  return `${fator.sigla}, ${MESES_CURTOS[i]}: ${mes.peso}${decidido}${mes.condicao ? `. ${mes.condicao}` : ''}`
}
</script>

<template>
  <div class="pesos-relacoes">
    <!-- Peso de cada fator e por mês: só quando o especialista definiu peso próprio (o milho). -->
    <article v-if="temCalendario" class="pesos-relacoes__card">
      <header class="pesos-relacoes__card-cabecalho">
        <h3>Peso por fator e por mês</h3>
      </header>
      <p class="pesos-relacoes__texto">
        Proposta de {{ pesos.autoria }}: {{ pesos.descricao }}{{ ' ' }}
        <strong v-if="pesos.noPrompt">
          O prompt diário leva este calendário como uma tabela fixa e a IA usa o peso do mês da análise; no mês não definido (—),
          {{ pesos.noPrompt.mesSemDefinicao }}. {{ pesos.noPrompt.autorizacao }}.
        </strong>
        <strong v-else>O prompt diário usa só a coluna "FEL 1".</strong>
      </p>

      <div class="pesos-relacoes__rolagem">
        <table class="pesos-relacoes__tabela pesos-relacoes__calendario">
          <thead>
            <tr>
              <th class="pesos-relacoes__col-fator">Fator</th>
              <th>FEL 1</th>
              <th class="pesos-relacoes__col-prompt">Hoje no FinMind</th>
              <th
                v-for="(mes, i) in MESES_CURTOS"
                :key="mes"
                class="pesos-relacoes__mes"
                :class="{ 'pesos-relacoes__mes--atual': i === mesAtual }"
                :title="i === mesAtual ? 'Mês de referência' : undefined"
              >
                {{ mes }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fator in pesos.fatores" :key="fator.codigo">
              <td class="pesos-relacoes__col-fator">
                <strong>{{ fator.sigla }}</strong> {{ fator.nome }}
              </td>
              <td>
                <span class="pesos-relacoes__peso" :class="`pesos-relacoes__peso--${classePeso(fator.pesoFel1)}`">{{
                  fator.pesoFel1
                }}</span>
              </td>
              <!-- O que do fator vai ao prompt (bloco 2.5): o peso do mês e, linha a linha, as condições e regras de peso. -->
              <td class="pesos-relacoes__col-prompt">
                <span class="pesos-relacoes__estado pesos-relacoes__estado--orientacao">{{ ROTULO_AGREGACAO.ORIENTACAO }}</span>
                <span v-if="fator.papel" class="pesos-relacoes__estado-texto">Sem peso próprio: o papel dele está nas instruções.</span>
                <span v-for="linha in fator.noPrompt" :key="linha" class="pesos-relacoes__estado-texto">{{ semSigla(linha) }}</span>
              </td>
              <template v-if="fator.meses">
                <td
                  v-for="(mes, i) in fator.meses"
                  :key="i"
                  class="pesos-relacoes__celula"
                  :class="[
                    mes ? `pesos-relacoes__celula--${classePeso(mes.peso)}` : 'pesos-relacoes__celula--vazia',
                    { 'pesos-relacoes__mes--atual': i === mesAtual }
                  ]"
                  :title="tituloCelula(fator, mes, i)"
                >
                  {{ mes ? mes.peso : '—' }}<sup v-if="mes?.condicao">*</sup><sup v-if="mes?.decididoPor">†</sup>
                </td>
              </template>
              <td
                v-else-if="fator.fixo"
                colspan="12"
                class="pesos-relacoes__celula pesos-relacoes__celula--larga"
                :class="`pesos-relacoes__celula--${classePeso(fator.fixo)}`"
              >
                {{ fator.fixo }} o ano todo (sem calendário)
              </td>
              <td
                v-else-if="fator.papel"
                colspan="12"
                class="pesos-relacoes__celula pesos-relacoes__celula--larga pesos-relacoes__celula--papel"
              >
                {{ fator.papel }}
              </td>
              <td v-else colspan="12" class="pesos-relacoes__celula pesos-relacoes__celula--larga pesos-relacoes__celula--vazia">
                Não definido pelo especialista
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="pesos-relacoes__legenda">
        Todo fator vai ao prompt com o peso do mês (tabela 2.5); a coluna "Hoje no FinMind" mostra o que vai além dele. — mês
        não definido pelo especialista (não é completado por inferência). * vale uma condição (passe o mouse). Destacado: o
        mês de referência ({{ MESES_CURTOS[mesAtual] }}).
      </p>
      <ul v-if="notas.length" class="pesos-relacoes__notas">
        <li v-for="fator in notas" :key="fator.codigo">
          <strong>{{ fator.sigla }}:</strong> {{ fator.notas.join(' ') }}
        </li>
      </ul>
    </article>

    <!-- Relações entre os fatores: a matriz do especialista, como ele escreveu. -->
    <article v-if="pesos.relacoes" class="pesos-relacoes__card">
      <header class="pesos-relacoes__card-cabecalho">
        <h3>Relações entre os fatores</h3>
        <span class="pesos-relacoes__estado pesos-relacoes__estado--orientacao">{{ ROTULO_AGREGACAO.ORIENTACAO }}</span>
      </header>
      <p class="pesos-relacoes__texto">
        {{ pesos.relacoes.descricao }} As frases ao lado da matriz vão ao prompt; a matriz é referência e não vai.
      </p>
      <div class="pesos-relacoes__relacoes">
        <div class="pesos-relacoes__rolagem">
          <table class="pesos-relacoes__tabela pesos-relacoes__matriz">
            <thead>
              <tr>
                <th></th>
                <th v-for="fator in pesos.fatores" :key="fator.codigo" :title="fator.nome">
                  {{ fator.sigla }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="linha in pesos.fatores" :key="linha.codigo">
                <th :title="linha.nome">{{ linha.sigla }}</th>
                <td
                  v-for="(simbolo, j) in pesos.relacoes.matriz[linha.codigo]"
                  :key="j"
                  :class="simbolo === null ? 'pesos-relacoes__diagonal' : `pesos-relacoes__rel--${tomRelacao(simbolo)}`"
                  :title="simbolo === null ? undefined : `${linha.sigla} × ${pesos.fatores[j].sigla}: ${significado[simbolo]}`"
                >
                  {{ simbolo === null ? '·' : simbolo }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="pesos-relacoes__relacoes-texto">
          <ul class="pesos-relacoes__simbolos">
            <li v-for="item in pesos.relacoes.simbolos" :key="item.simbolo">
              <span :class="`pesos-relacoes__rel--${tomRelacao(item.simbolo)}`">{{ item.simbolo }}</span>
              {{ item.significado }}
            </li>
          </ul>
          <ul class="pesos-relacoes__notas">
            <li v-for="frase in [...pesos.relacoes.leitura, ...pesos.relacoes.observacoes]" :key="frase">
              {{ frase }}
            </li>
          </ul>
        </div>
      </div>
    </article>

    <!-- Relações por par, como o especialista escreveu (o café: sem matriz, uma tabela de pares com canal e defasagem). -->
    <article v-if="pesos.pares.length" class="pesos-relacoes__card">
      <header class="pesos-relacoes__card-cabecalho">
        <h3>Relações entre os fatores</h3>
      </header>
      <p v-if="pesos.notaPares" class="pesos-relacoes__texto">
        {{ pesos.notaPares }}
      </p>
      <div class="pesos-relacoes__rolagem">
        <table class="pesos-relacoes__tabela pesos-relacoes__agregacao">
          <thead>
            <tr>
              <th>Par</th>
              <th>Sentido</th>
              <th>Canal</th>
              <th>Defasagem</th>
              <th>Tratamento no modelo</th>
              <th v-if="paresNoPrompt">Hoje no FinMind</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="par in pesos.pares" :key="par.fatores.join('-')">
              <td class="pesos-relacoes__siglas">
                <strong>{{ nomesPar(par) }}</strong>
              </td>
              <td>{{ par.sentido }}</td>
              <td>{{ par.canal }}</td>
              <td class="pesos-relacoes__siglas">{{ par.defasagem }}</td>
              <td>{{ par.tratamento }}</td>
              <td v-if="paresNoPrompt">
                <template v-if="par.noPrompt">
                  <span class="pesos-relacoes__estado pesos-relacoes__estado--orientacao">{{ ROTULO_AGREGACAO.ORIENTACAO }}</span>
                  <span class="pesos-relacoes__estado-texto">{{ par.noPrompt }}</span>
                </template>
                <template v-else>—</template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <!-- Regras de agregação: a proposta e como cada uma está hoje no FinMind. -->
    <article v-if="pesos.agregacao.length" class="pesos-relacoes__card">
      <header class="pesos-relacoes__card-cabecalho">
        <h3>Regras de agregação</h3>
      </header>
      <p class="pesos-relacoes__texto">
        Como o motor junta os sinais dos fatores, e como cada regra está hoje no FinMind.
        <template v-if="proposta">
          A agregação do motor (proposta do FinMind, abaixo) as aplica em código<template v-if="proposta.emProducao === false">; o resultado ainda não vai ao prompt</template><template v-else>, e o resultado vai ao prompt</template>.
        </template>
        <template v-else>Nenhuma é calculada.</template>
      </p>
      <div class="pesos-relacoes__rolagem">
        <table class="pesos-relacoes__tabela pesos-relacoes__agregacao">
          <thead>
            <tr>
              <th>Tema</th>
              <th>Proposta</th>
              <th>Fatores</th>
              <th>Hoje no FinMind</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="regra in pesos.agregacao" :key="regra.tema">
              <td>
                <strong>{{ regra.tema }}</strong>
              </td>
              <td>{{ regra.tratamento }}</td>
              <td class="pesos-relacoes__siglas">
                {{ siglas(regra.fatores) }}
              </td>
              <td>
                <span class="pesos-relacoes__estado" :class="`pesos-relacoes__estado--${regra.noFinMind.situacao.toLowerCase()}`">
                  {{ ROTULO_AGREGACAO[regra.noFinMind.situacao] }}
                </span>
                <span class="pesos-relacoes__estado-texto">{{ regra.noFinMind.texto }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>

    <!-- A agregação em código do FinMind (o café, ADR 0066): em produção, não é do especialista e espera a validação do Comitê. -->
    <article v-if="proposta" class="pesos-relacoes__card">
      <header class="pesos-relacoes__card-cabecalho">
        <h3>Agregação em código: proposta do FinMind</h3>
        <span class="pesos-relacoes__versao">{{ proposta.versao }} · {{ proposta.adr }}</span>
      </header>
      <p class="pesos-relacoes__texto">{{ proposta.descricao }}</p>
      <div class="pesos-relacoes__rolagem">
        <table class="pesos-relacoes__tabela pesos-relacoes__familias">
          <thead>
            <tr>
              <th>Família</th>
              <th>Fatores</th>
              <th v-for="h in proposta.horizontes" :key="h.codigo" class="pesos-relacoes__peso-familia">
                {{ h.rotulo }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="familia in linhasFamilias" :key="familia.codigo">
              <td>
                <strong>{{ familia.rotulo }}</strong>
              </td>
              <td class="pesos-relacoes__siglas">
                {{ siglas(familia.fatores) }}
              </td>
              <td v-for="celula in familia.celulas" :key="celula.horizonte" class="pesos-relacoes__peso-familia">
                <span
                  :class="{
                    'pesos-relacoes__celula--vazia': celula.texto === '—'
                  }"
                  >{{ celula.texto }}</span
                >
                <small v-if="celula.membros">só {{ celula.membros }}</small>
              </td>
            </tr>
            <tr v-if="proposta.modificador">
              <td><strong>Modificador</strong></td>
              <td class="pesos-relacoes__siglas">
                {{ siglas([proposta.modificador.fator]) }}
              </td>
              <td v-for="h in proposta.horizontes" :key="h.codigo" class="pesos-relacoes__peso-familia">
                <span v-if="proposta.modificador.horizontes.includes(h.codigo)" class="pesos-relacoes__modificador"
                  >{{ proposta.modificador.rotulo || 'confiança' }}</span
                >
                <span v-else class="pesos-relacoes__celula--vazia">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="pesos-relacoes__legenda">
        Peso da família no horizonte (“mês”: o do calendário acima, no mês da análise); — a família não entra.
        <template v-if="proposta.emProducao === false">Ainda fora do prompt; as regras estão abaixo.</template>
        <template v-else>Vai ao prompt (bloco 3B) como o peso de cada família em cada horizonte; as regras estão abaixo.</template>
      </p>

      <h4 class="pesos-relacoes__subtitulo">Regras</h4>
      <div class="pesos-relacoes__rolagem">
        <table class="pesos-relacoes__tabela pesos-relacoes__agregacao pesos-relacoes__regras">
          <thead>
            <tr>
              <th>Regra</th>
              <th>Origem</th>
              <th>Hoje no FinMind</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="regra in proposta.regras" :key="regra.regra">
              <td><strong>{{ regra.regra }}</strong></td>
              <td>
                <span class="pesos-relacoes__estado" :class="`pesos-relacoes__origem--${regra.origem.toLowerCase()}`">
                  {{ ROTULO_ORIGEM_REGRA[regra.origem] }}
                </span>
                <span class="pesos-relacoes__estado-texto">{{ regra.fonte }}</span>
              </td>
              <td>
                <span class="pesos-relacoes__estado pesos-relacoes__estado--orientacao">{{ ROTULO_AGREGACAO.ORIENTACAO }}</span>
                <span class="pesos-relacoes__estado-texto">{{ regra.prompt }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  </div>
</template>

<style scoped>
.pesos-relacoes {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.pesos-relacoes__card {
  padding: 1rem 1.15rem;
  border: 1px solid var(--p-surface-300);
  border-radius: 16px;
  background: var(--p-content-background);
}

.pesos-relacoes__card-cabecalho {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  margin-bottom: 0.5rem;
}

.pesos-relacoes__card-cabecalho h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}


.pesos-relacoes__texto,
.pesos-relacoes__legenda {
  margin: 0 0 0.75rem;
  color: var(--p-text-muted-color);
  font-size: 0.85rem;
  line-height: 1.5;
}

.pesos-relacoes__legenda {
  margin: 0.5rem 0 0;
  font-size: 0.78rem;
}

/* Tabelas largas rolam dentro do card, nunca a página. */
.pesos-relacoes__rolagem {
  overflow-x: auto;
}

.pesos-relacoes__tabela {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.8rem;
}

.pesos-relacoes__tabela th,
.pesos-relacoes__tabela td {
  padding: 0.35rem 0.45rem;
  border-bottom: 1px solid rgba(19, 33, 59, 0.08);
  vertical-align: middle;
}

.pesos-relacoes__tabela thead th {
  font-weight: 600;
  color: var(--p-text-muted-color);
  white-space: nowrap;
}

.pesos-relacoes__col-fator {
  min-width: 13rem;
}

.pesos-relacoes__col-prompt {
  min-width: 18rem;
  max-width: 26rem;
  white-space: normal;
  vertical-align: top;
}


.pesos-relacoes__mes,
.pesos-relacoes__celula {
  text-align: center;
  white-space: nowrap;
}

.pesos-relacoes__celula {
  font-size: 0.72rem;
  font-weight: 600;
}

.pesos-relacoes__celula--larga {
  white-space: normal;
  font-weight: 500;
}

.pesos-relacoes__celula--alto {
  background: rgba(214, 60, 60, 0.16);
  color: #9b2222;
}

.pesos-relacoes__celula--medio {
  background: rgba(211, 154, 23, 0.18);
  color: #7a5400;
}

.pesos-relacoes__celula--baixo {
  background: rgba(19, 33, 59, 0.06);
  color: #4b5563;
}

.pesos-relacoes__celula--vazia {
  color: #9ca3af;
  font-weight: 400;
}

.pesos-relacoes__celula--papel {
  background: rgba(17, 102, 255, 0.07);
  color: #0d4fc4;
}

/* O mês de referência: uma moldura na coluna inteira. */
.pesos-relacoes__mes--atual {
  box-shadow:
    inset 2px 0 0 #1166ff,
    inset -2px 0 0 #1166ff;
}

thead .pesos-relacoes__mes--atual {
  color: #0d4fc4;
  box-shadow:
    inset 2px 0 0 #1166ff,
    inset -2px 0 0 #1166ff,
    inset 0 2px 0 #1166ff;
}

tbody tr:last-child .pesos-relacoes__mes--atual {
  box-shadow:
    inset 2px 0 0 #1166ff,
    inset -2px 0 0 #1166ff,
    inset 0 -2px 0 #1166ff;
}

.pesos-relacoes__peso {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  color: #fff;
  background: #6b7280;
}

.pesos-relacoes__peso--alto {
  background: #d63c3c;
}

.pesos-relacoes__peso--medio {
  background: #d39a17;
}

.pesos-relacoes__notas {
  margin: 0.75rem 0 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  line-height: 1.55;
}

/* Matriz e legenda lado a lado; em tela estreita, uma abaixo da outra. */
.pesos-relacoes__relacoes {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.5rem;
  align-items: flex-start;
}

.pesos-relacoes__relacoes > .pesos-relacoes__rolagem {
  flex: 0 1 auto;
  max-width: 100%;
}

.pesos-relacoes__relacoes-texto {
  flex: 1 1 18rem;
  min-width: 0;
}

.pesos-relacoes__relacoes-texto .pesos-relacoes__notas {
  margin-top: 0.5rem;
}

.pesos-relacoes__matriz {
  width: auto;
}

.pesos-relacoes__matriz th,
.pesos-relacoes__matriz td {
  min-width: 2.6rem;
  text-align: center;
  font-weight: 600;
}

.pesos-relacoes__diagonal {
  color: #9ca3af;
}

.pesos-relacoes__simbolos {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem 0.9rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
}

.pesos-relacoes__simbolos span {
  display: inline-block;
  min-width: 2rem;
  padding: 0.05rem 0.3rem;
  border-radius: 6px;
  text-align: center;
  font-weight: 600;
}

.pesos-relacoes__rel--positiva-forte {
  background: rgba(17, 102, 255, 0.28);
  color: #0a3a91;
}

.pesos-relacoes__rel--positiva {
  background: rgba(17, 102, 255, 0.15);
  color: #0d4fc4;
}

.pesos-relacoes__rel--positiva-fraca {
  background: rgba(17, 102, 255, 0.06);
  color: #3b6fc9;
}

.pesos-relacoes__rel--inversa {
  background: rgba(214, 110, 20, 0.22);
  color: #8a4200;
}

.pesos-relacoes__rel--inversa-fraca {
  background: rgba(214, 110, 20, 0.08);
  color: #a35a12;
}

.pesos-relacoes__rel--regime {
  background: rgba(124, 58, 237, 0.1);
  color: #5b21b6;
}

.pesos-relacoes__rel--nula {
  color: #9ca3af;
}

.pesos-relacoes__agregacao td {
  vertical-align: top;
  line-height: 1.45;
}

.pesos-relacoes__agregacao td:nth-child(2) {
  min-width: 18rem;
}

.pesos-relacoes__agregacao td:nth-child(4) {
  min-width: 14rem;
}

.pesos-relacoes__siglas {
  white-space: nowrap;
}

.pesos-relacoes__estado {
  display: inline-block;
  margin-bottom: 0.2rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 600;
}

.pesos-relacoes__estado--orientacao {
  background: rgba(25, 135, 84, 0.12);
  color: #146c43;
}

.pesos-relacoes__estado--parcial {
  background: rgba(211, 154, 23, 0.15);
  color: #8a5f00;
}

.pesos-relacoes__estado--fora {
  background: rgba(214, 60, 60, 0.1);
  color: #b02a2a;
}


.pesos-relacoes__versao {
  color: var(--p-text-muted-color);
  font-size: 0.7rem;
}

.pesos-relacoes__subtitulo {
  margin: 1rem 0 0.4rem;
  font-size: 0.88rem;
  font-weight: 600;
}

.pesos-relacoes__familias td,
.pesos-relacoes__familias th {
  white-space: nowrap;
}

.pesos-relacoes__peso-familia {
  text-align: center;
  font-weight: 600;
}

.pesos-relacoes__peso-familia small {
  display: block;
  color: var(--p-text-muted-color);
  font-size: 0.68rem;
  font-weight: 400;
}

.pesos-relacoes__modificador {
  color: #0d4fc4;
  font-size: 0.72rem;
  font-weight: 500;
}

.pesos-relacoes__regras td:nth-child(2) {
  min-width: 14rem;
}

.pesos-relacoes__regras td:nth-child(3) {
  min-width: 20rem;
}

.pesos-relacoes__origem--david {
  background: rgba(25, 135, 84, 0.12);
  color: #146c43;
}

.pesos-relacoes__origem--derivada {
  background: rgba(19, 33, 59, 0.08);
  color: #374151;
}

.pesos-relacoes__origem--proposta {
  background: rgba(17, 102, 255, 0.1);
  color: #0d4fc4;
}

.pesos-relacoes__estado-texto {
  display: block;
  color: var(--p-text-muted-color);
  font-size: 0.75rem;
}
</style>
