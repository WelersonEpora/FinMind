<script setup>
// A revisão imediata com evento de magnitude 3 (§6 da análise do café de 2026-10-19; aprovada pelo Comitê em 2026-10-22;
// ADR 0149): cada evento aceito de grau ALTA da leitura diária de eventos pede a revisão de uma pessoa (os fatores e as
// regras diante do fato). Ler é de todos; marcar como revisado, só do admin.
import { computed, onMounted, ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import revisoesEventoService from '../../services/revisoes-evento.service.js'
import { useAuthStore } from '../../stores/auth.js'

const props = defineProps({ ativo: { type: String, required: true } })
const auth = useAuthStore()
const ehAdmin = computed(() => auth.state.user?.role === 'admin')

const carregando = ref(true)
const erro = ref('')
const revisoes = ref(null)
const emRevisao = ref(null)
const observacao = ref('')
const salvando = ref(false)
const erroRevisao = ref('')

const dataBr = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '-')

async function carregar() {
  carregando.value = true
  erro.value = ''
  try {
    revisoes.value = (await revisoesEventoService.listar(props.ativo)).revisoes
  } catch (err) {
    erro.value = err.response?.data?.error?.message || 'Não foi possível carregar as revisões.'
  } finally {
    carregando.value = false
  }
}

function abrir(evento) {
  emRevisao.value = evento
  observacao.value = ''
  erroRevisao.value = ''
}

async function confirmar() {
  salvando.value = true
  erroRevisao.value = ''
  try {
    revisoes.value = (await revisoesEventoService.revisar(emRevisao.value.chave, observacao.value)).revisoes
    emRevisao.value = null
  } catch (err) {
    erroRevisao.value = err.response?.data?.error?.message || 'Não foi possível registrar a revisão.'
  } finally {
    salvando.value = false
  }
}

async function desfazer(evento) {
  try {
    revisoes.value = (await revisoesEventoService.desfazer(evento.chave)).revisoes
  } catch (err) {
    erro.value = err.response?.data?.error?.message || 'Não foi possível desfazer a revisão.'
  }
}

onMounted(carregar)
</script>

<template>
  <section class="revisoes-evento">
    <p class="small text-muted mb-2">
      Cada evento aceito de grau ALTA (a magnitude 3 do documento) da leitura diária de eventos, desde
      {{ dataBr(revisoes?.desde) }}, pede uma revisão dos fatores e das regras diante do fato. A leitura da IA do dia já o
      considera; a revisão é de governança, de uma pessoa.
    </p>
    <div v-if="carregando" class="text-muted small">Carregando...</div>
    <div v-else-if="erro" class="alert alert-danger small py-2">{{ erro }}</div>
    <template v-else-if="revisoes">
      <div class="alert small py-2" :class="revisoes.pendentes ? 'alert-warning' : 'alert-light'">
        {{ revisoes.pendentes ? `${revisoes.pendentes} evento(s) pendente(s) de revisão.` : 'Nenhuma revisão pendente.' }}
        {{ revisoes.eventos.length ? '' : 'Nenhum evento de grau ALTA desde a decisão do Comitê.' }}
      </div>
      <div v-if="revisoes.eventos.length" class="revisoes-evento__tabela">
        <table class="table table-sm mb-0">
          <thead>
            <tr><th>Data</th><th>Evento</th><th>Pressão</th><th>Revisão</th><th></th></tr>
          </thead>
          <tbody>
            <tr v-for="e in revisoes.eventos" :key="e.chave">
              <td>{{ dataBr(e.data) }}</td>
              <td>
                <strong>{{ e.titulo }}</strong>
                <div class="small text-muted">{{ e.tipo }}<template v-if="e.resumo"> · {{ e.resumo }}</template></div>
              </td>
              <td>{{ e.pressao || '-' }}</td>
              <td>
                <template v-if="e.revisao">
                  <span class="badge text-bg-success">Revisado em {{ dataBr(e.revisao.revisadoEm) }}</span>
                  <div v-if="e.revisao.observacao" class="small">{{ e.revisao.observacao }}</div>
                </template>
                <span v-else class="badge text-bg-warning">Pendente</span>
              </td>
              <td class="text-end">
                <template v-if="ehAdmin">
                  <Button v-if="!e.revisao" label="Revisado" size="small" outlined @click="abrir(e)" />
                  <Button v-else label="Desfazer" size="small" text @click="desfazer(e)" />
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <Dialog :visible="Boolean(emRevisao)" modal header="Registrar a revisão" :style="{ width: '32rem' }" :breakpoints="{ '640px': '95vw' }" @update:visible="(v) => !v && (emRevisao = null)">
      <p class="small mb-2"><strong>{{ emRevisao?.titulo }}</strong> ({{ dataBr(emRevisao?.data) }})</p>
      <label class="form-label small mb-1">O que foi revisto (opcional)</label>
      <textarea v-model="observacao" rows="3" maxlength="2000" class="form-control form-control-sm" placeholder="Ex.: o F2 já reflete a revisão; nada a mudar"></textarea>
      <div v-if="erroRevisao" class="text-danger small mt-2">{{ erroRevisao }}</div>
      <template #footer>
        <Button label="Cancelar" text @click="emRevisao = null" />
        <Button label="Marcar como revisado" :loading="salvando" @click="confirmar" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.revisoes-evento__tabela {
  overflow-x: auto;
}
</style>
