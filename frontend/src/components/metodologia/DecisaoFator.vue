<script setup>
import { computed, reactive, ref, watch } from 'vue'
import LineChart from '../charts/LineChart.vue'
import metodologiaAtivoService from '../../services/metodologia-ativo.service.js'
import { useAuthStore } from '../../stores/auth.js'
import { descreverOrigemParametros, parametrosAlterados, periodoDoFator, rotulosDasFaixas, seriesComFaixas } from '../../utils/metodologia.js'

// Camada C de um fator (ADR 0050): a direção, a intensidade e a tendência, com os parâmetros EM USO NO SISTEMA (a
// última versão salva, ou o padrão do código). Qualquer um pode simular outros valores (nada é gravado); só o admin
// salva uma versão nova, com o motivo. Genérico: a regra e a explicação vêm do backend, e os rótulos, os parâmetros
// e o gráfico, da `apresentacao` do fator.
const props = defineProps({
  ativo: { type: String, required: true },
  fator: { type: String, required: true },
  calculo: { type: Object, required: true },
  simulando: { type: Boolean, default: false }
})
// `simular`: parâmetros para simular, ou null para voltar aos do sistema. `salvo`: uma versão nova foi gravada.
const emit = defineEmits(['simular', 'salvo'])

const auth = useAuthStore()
const ehAdmin = computed(() => auth.state.user?.role === 'admin')

const apresentacao = computed(() => props.calculo.apresentacao)
// Semana ou mês: os textos de período seguem a periodicidade do fator.
const periodoFator = computed(() => periodoDoFator(props.calculo.periodicidade))
const seriesLabels = computed(() => rotulosDasFaixas(apresentacao.value.graficoC.rotulo, apresentacao.value.graficoC.limiares))

const formulario = reactive({})
watch(
  () => props.calculo.parametros,
  (parametros) => Object.assign(formulario, parametros),
  { immediate: true }
)

const ultimo = computed(() => props.calculo.pontos.at(-1) || null)
// Uma regra (a soja, ADR 0116): o estado na data, sem direção, intensidade nem peso.
const ehRegra = computed(() => Boolean(ultimo.value?.estado))
// Os fatores da soja não têm tendência (o primário muda por publicação): a coluna sai.
const comTendencia = computed(() => !apresentacao.value.semTendencia)
const editados = computed(() => parametrosAlterados(formulario, props.calculo.parametros))
const diferenteDoSistema = computed(() => parametrosAlterados(formulario, props.calculo.parametrosSistema))
const origem = computed(() => descreverOrigemParametros(props.calculo.origemParametros))
const linhas = computed(() =>
  seriesComFaixas(props.calculo.pontos, apresentacao.value.graficoC.campo, props.calculo.parametros, apresentacao.value.graficoC.limiares)
)

function rotulo(tipo, valor) {
  return valor ? apresentacao.value.rotulosDecisao[tipo][valor] : '-'
}

// A unidade da medida da decisão: % na maioria dos fatores; US$/barril no refino.
const unidadeMedida = computed(() => apresentacao.value.graficoC.unidade || '%')

function comSinal(n) {
  if (n === null || n === undefined) return '-'
  const numero = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const u = unidadeMedida.value === '%' ? '%' : ` ${unidadeMedida.value}`
  return `${n > 0 ? '+' : ''}${numero}${u}`
}

function dataHoraBr(instante) {
  return new Date(instante).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

function simular() {
  emit('simular', { ...formulario })
}

function voltarAoSistema() {
  emit('simular', null)
}

function classeDirecao(direcao) {
  return `decisao__direcao--${(direcao || 'nenhuma').toLowerCase()}`
}

// --- Salvar como valores do sistema (admin) ---
const salvarAberto = ref(false)
const motivo = ref('')
const salvando = ref(false)
const erroSalvar = ref('')

function abrirSalvar() {
  motivo.value = ''
  erroSalvar.value = ''
  salvarAberto.value = true
}

async function confirmarSalvar() {
  salvando.value = true
  erroSalvar.value = ''
  try {
    await metodologiaAtivoService.salvarParametros(props.ativo, props.fator, { parametros: { ...formulario }, motivo: motivo.value })
    salvarAberto.value = false
    historico.value = null
    emit('salvo')
  } catch (err) {
    erroSalvar.value = err?.response?.data?.error?.message || 'Não foi possível salvar os parâmetros.'
  } finally {
    salvando.value = false
  }
}

// --- Histórico das versões ---
const historicoAberto = ref(false)
const historico = ref(null)
const erroHistorico = ref('')

async function alternarHistorico() {
  historicoAberto.value = !historicoAberto.value
  if (!historicoAberto.value || historico.value) return
  erroHistorico.value = ''
  try {
    const { parametros } = await metodologiaAtivoService.getParametros(props.ativo, props.fator)
    historico.value = parametros
  } catch (_err) {
    erroHistorico.value = 'Não foi possível carregar o histórico.'
  }
}

function resumoParametros(parametros) {
  return apresentacao.value.parametros.map((p) => `${p.rotulo}: ${parametros[p.chave]} ${p.unidade}`).join(' · ')
}
</script>

<template>
  <section class="decisao">
    <div class="decisao__topo">
      <h4 v-if="ehRegra">C. Estado da regra <small>com os parâmetros do sistema; sem peso e sem direção própria</small></h4>
      <h4 v-else>C. Decidir <small>direção, intensidade e tendência com os parâmetros do sistema</small></h4>
      <span v-if="calculo.simulacao" class="decisao__alterado">Simulação: estes valores não estão salvos</span>
    </div>
    <p class="decisao__origem">
      <i class="bi bi-sliders"></i>
      <span v-if="calculo.simulacao">Simulando sobre os valores do sistema ({{ origem }}).</span>
      <span v-else>Valores em uso no sistema: {{ origem }}.</span>
      <span v-if="calculo.origemParametros?.motivo" class="decisao__motivo">Motivo: "{{ calculo.origemParametros.motivo }}"</span>
    </p>

    <template v-if="ehRegra">
      <p class="decisao__semana">{{ periodoFator.referencia(ultimo.observedAt) }}</p>
      <div class="decisao__resultado">
        <div class="decisao__quadro">
          <span>Estado</span>
          <strong>{{ ultimo.estado.rotulo }}</strong>
        </div>
      </div>
      <p class="decisao__subtitulo">Como chegamos aqui</p>
      <ol class="decisao__passos">
        <li v-for="passo in calculo.explicacao" :key="passo">{{ passo }}</li>
      </ol>
    </template>

    <template v-else-if="ultimo?.decisao">
      <p class="decisao__semana">{{ periodoFator.referencia(ultimo.observedAt) }}</p>
      <div class="decisao__resultado">
        <div class="decisao__quadro" :class="classeDirecao(ultimo.decisao.direcao)">
          <span>Direção</span>
          <strong>{{ rotulo('direcao', ultimo.decisao.direcao) }}</strong>
        </div>
        <div class="decisao__quadro">
          <span>Intensidade</span>
          <strong>{{ rotulo('intensidade', ultimo.decisao.intensidade) }}</strong>
        </div>
        <div v-if="comTendencia" class="decisao__quadro">
          <span>Tendência</span>
          <strong>{{ rotulo('tendencia', ultimo.decisao.tendencia) }}</strong>
        </div>
        <div class="decisao__quadro">
          <span>Peso</span>
          <strong>{{ calculo.peso }}</strong>
          <small>{{ calculo.pesoDoComite ? `fixo, ${calculo.pesoDecididoPor || 'do Comitê'}` : 'do especialista' }}</small>
        </div>
      </div>

      <p class="decisao__subtitulo">Como chegamos aqui</p>
      <ol class="decisao__passos">
        <li v-for="passo in calculo.explicacao" :key="passo">{{ passo }}</li>
      </ol>
    </template>

    <p class="decisao__subtitulo">Parâmetros</p>
    <div class="decisao__parametros">
      <label v-for="p in apresentacao.parametros" :key="p.chave" class="decisao__parametro">
        <span class="decisao__parametro-rotulo">{{ p.rotulo }}</span>
        <span class="decisao__parametro-campo">
          <input v-model.number="formulario[p.chave]" type="number" step="any" min="0" class="form-control form-control-sm" />
          <span>{{ p.unidade }}</span>
        </span>
        <small>
          {{ p.explicacao }} No sistema: {{ calculo.parametrosSistema[p.chave] }} {{ p.unidade }} · padrão do FinMind:
          {{ calculo.parametrosPadrao[p.chave] }} {{ p.unidade }}.
        </small>
      </label>
    </div>
    <div class="decisao__acoes">
      <button type="button" class="btn btn-sm btn-primary" :disabled="!editados || simulando" @click="simular">Simular</button>
      <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!calculo.simulacao || simulando" @click="voltarAoSistema">
        Voltar aos valores do sistema
      </button>
      <button
        v-if="ehAdmin"
        type="button"
        class="btn btn-sm btn-outline-primary ms-auto"
        :disabled="!diferenteDoSistema || simulando"
        @click="abrirSalvar"
      >
        Salvar como valores do sistema
      </button>
    </div>
    <p class="decisao__ajuda">
      Simular mostra o efeito sem gravar nada.
      <template v-if="ehAdmin">Salvar troca os valores em uso no sistema e fica registrado no histórico, com o motivo.</template>
      <template v-else>Só um administrador pode salvar novos valores do sistema.</template>
    </p>

    <div v-if="salvarAberto" class="decisao__salvar">
      <p class="mb-2"><strong>Salvar como valores do sistema</strong></p>
      <p class="decisao__ajuda mb-2">{{ resumoParametros(formulario) }}</p>
      <label class="form-label small mb-1" for="motivo-ajuste">Motivo do ajuste</label>
      <textarea id="motivo-ajuste" v-model="motivo" class="form-control form-control-sm" rows="2" maxlength="500"
        placeholder="Ex.: decisão do Comitê em 02/10/2026: faixa neutra de 4%"></textarea>
      <div v-if="erroSalvar" class="alert alert-danger py-1 px-2 mt-2 mb-0 small">{{ erroSalvar }}</div>
      <div class="decisao__acoes">
        <button type="button" class="btn btn-sm btn-primary" :disabled="salvando || motivo.trim().length < 5" @click="confirmarSalvar">
          {{ salvando ? 'Salvando...' : 'Confirmar' }}
        </button>
        <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="salvando" @click="salvarAberto = false">Cancelar</button>
      </div>
    </div>

    <button type="button" class="btn btn-link btn-sm px-0 decisao__historico-botao" @click="alternarHistorico">
      <i class="bi" :class="historicoAberto ? 'bi-chevron-down' : 'bi-chevron-right'"></i> Histórico dos valores do sistema
    </button>
    <div v-if="historicoAberto" class="decisao__historico">
      <div v-if="erroHistorico" class="text-danger small">{{ erroHistorico }}</div>
      <div v-else-if="!historico" class="text-muted small">Carregando...</div>
      <template v-else>
        <ul class="decisao__historico-lista">
          <li v-for="v in historico.versoes" :key="v.versao">
            <strong>Versão {{ v.versao }}</strong> · {{ v.alteradoPor?.nome || 'usuário removido' }} · {{ dataHoraBr(v.alteradoEm) }}
            <div>{{ resumoParametros(v.parametros) }}</div>
            <div class="decisao__motivo">Motivo: "{{ v.motivo }}"</div>
          </li>
          <li>
            <strong>Padrão do FinMind</strong> (no código, antes de qualquer ajuste)
            <div>{{ resumoParametros(historico.padrao) }}</div>
          </li>
        </ul>
      </template>
    </div>

    <p class="decisao__subtitulo">{{ apresentacao.graficoC.titulo }}</p>
    <LineChart :pontos="linhas" :unidade="unidadeMedida" :casas-decimais="2" :series-labels="seriesLabels" />

    <p class="decisao__subtitulo">Exemplos: {{ periodoFator.janela }} reais</p>
    <div class="table-responsive">
      <table class="table table-sm decisao__tabela">
        <thead>
          <tr>
            <th>{{ periodoFator.unidade }}</th>
            <th>Contexto</th>
            <th>{{ apresentacao.exemplos.colunaValor }}</th>
            <th v-if="!ehRegra">Direção</th>
            <th v-if="!ehRegra">Intensidade</th>
            <th v-if="comTendencia">Tendência</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="e in calculo.exemplos.episodios" :key="e.data">
            <td>{{ periodoFator.data(e.data) }}</td>
            <td>{{ e.rotulo }}</td>
            <td>{{ comSinal(e.valor) }}</td>
            <td v-if="!ehRegra" :class="classeDirecao(e.decisao?.direcao)">{{ rotulo('direcao', e.decisao?.direcao) }}</td>
            <td v-if="!ehRegra">{{ rotulo('intensidade', e.decisao?.intensidade) }}</td>
            <td v-if="comTendencia">{{ rotulo('tendencia', e.decisao?.tendencia) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Sem cenários (a soja: a decisão depende do período e de várias medidas, não de um número só). -->
    <p v-if="calculo.exemplos.cenarios.length" class="decisao__subtitulo">Exemplos: cenários hipotéticos</p>
    <div v-if="calculo.exemplos.cenarios.length" class="table-responsive">
      <table class="table table-sm decisao__tabela">
        <thead>
          <tr>
            <th>Cenário</th>
            <th>{{ apresentacao.exemplos.colunaValor }}</th>
            <th>{{ calculo.parametros.semanasTendencia }} {{ periodoFator.janela }} antes</th>
            <th>Direção</th>
            <th>Intensidade</th>
            <th>Tendência</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in calculo.exemplos.cenarios" :key="c.rotulo">
            <td>{{ c.rotulo }}</td>
            <td>{{ comSinal(c.valor) }}</td>
            <td>{{ comSinal(c.valorAnterior) }}</td>
            <td :class="classeDirecao(c.decisao?.direcao)">{{ rotulo('direcao', c.decisao?.direcao) }}</td>
            <td>{{ rotulo('intensidade', c.decisao?.intensidade) }}</td>
            <td>{{ rotulo('tendencia', c.decisao?.tendencia) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p class="decisao__nota">
      Proposta para o Comitê ver como o fator ficaria: ainda não vai para o Centro de Decisão nem para a IA. Os exemplos
      são calculados pela mesma regra e com os parâmetros em uso nesta tela.
    </p>
  </section>
</template>

<style scoped>
.decisao {
  margin-top: 1rem;
  background: rgba(17, 102, 255, 0.03);
  border: 1px dashed rgba(17, 102, 255, 0.4);
  border-radius: 12px;
  padding: 1rem;
}

.decisao__topo {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.decisao__topo h4 {
  margin: 0;
  font-size: 1rem;
}

.decisao__topo h4 small {
  margin-left: 0.4rem;
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--p-text-muted-color);
}

.decisao__alterado {
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  background: rgba(211, 154, 23, 0.15);
  color: #8a5f00;
  font-size: 0.7rem;
  font-weight: 600;
}

.decisao__origem {
  margin: -0.25rem 0 0.75rem;
  font-size: 0.8rem;
}

.decisao__origem .bi {
  margin-right: 0.3rem;
}

.decisao__motivo {
  display: block;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.decisao__ajuda {
  margin: 0.4rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.decisao__salvar {
  margin-top: 0.75rem;
  padding: 0.75rem;
  border: 1px solid rgba(17, 102, 255, 0.3);
  border-radius: 10px;
  background: #fff;
  font-size: 0.85rem;
}

.decisao__historico-botao {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  text-decoration: none;
}

.decisao__historico-lista {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  line-height: 1.5;
}

.decisao__historico-lista li + li {
  margin-top: 0.4rem;
}

.decisao__semana,
.decisao__subtitulo {
  margin: 0.9rem 0 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
}

.decisao__semana {
  margin-top: 0;
}

.decisao__resultado {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.75rem;
}

.decisao__quadro {
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid rgba(19, 33, 59, 0.08);
  border-radius: 10px;
  padding: 0.65rem 0.8rem;
}

.decisao__quadro span,
.decisao__quadro small {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
}

.decisao__quadro strong {
  font-size: 1.05rem;
}

.decisao__direcao--alta strong,
td.decisao__direcao--alta {
  color: #146c43;
}

.decisao__direcao--baixa strong,
td.decisao__direcao--baixa {
  color: #b02a37;
}

.decisao__passos {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.85rem;
  line-height: 1.6;
}

.decisao__parametros {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}

.decisao__parametro {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  background: #fff;
  border: 1px solid rgba(19, 33, 59, 0.08);
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
}

.decisao__parametro-rotulo {
  font-size: 0.8rem;
  font-weight: 600;
}

.decisao__parametro-campo {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
}

.decisao__parametro-campo input {
  max-width: 6rem;
}

.decisao__parametro small {
  font-size: 0.72rem;
  color: var(--p-text-muted-color);
  line-height: 1.4;
}

.decisao__acoes {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.decisao__tabela {
  font-size: 0.8rem;
  margin-bottom: 0;
}

.decisao__nota {
  margin: 0.75rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
</style>
