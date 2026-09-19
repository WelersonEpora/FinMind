<script setup>
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '../components/layout/AppShell.vue'
import ConfirmModal from '../components/ConfirmModal.vue'
import MembroIncluirModal from '../components/MembroIncluirModal.vue'
import workspaceService from '../services/workspace.service.js'
import { useWorkspaceStore } from '../stores/workspace.js'
import { rotuloPapel } from '../utils/workspace.js'

const router = useRouter()

// O guard do router já garantiu que o :workspaceId da URL é de um espaço do
// usuário e o tornou o espaço ativo - por isso basta ler o ativo do store.
const workspaces = useWorkspaceStore()
const espaco = workspaces.active

const souOwner = computed(() => espaco.value?.papel === 'owner')
// Gerir membros e excluir o espaço: só o owner, e nunca no espaço pessoal
// (é de uma pessoa só e não pode ser excluído). O servidor também recusa.
const podeGerir = computed(() => souOwner.value && !espaco.value?.pessoal)

const membros = ref([])
const loadingMembros = ref(true)
const membrosError = ref('')
const mensagem = ref('')

async function carregarMembros(workspaceId) {
  loadingMembros.value = true
  membrosError.value = ''
  try {
    const lista = await workspaceService.listarMembros(workspaceId)
    // Ignora resposta de um espaço que deixou de ser o atual (troca rápida).
    if (espaco.value?.id === workspaceId) membros.value = lista
  } catch (_err) {
    if (espaco.value?.id === workspaceId) membrosError.value = 'Não foi possível carregar os membros.'
  } finally {
    if (espaco.value?.id === workspaceId) loadingMembros.value = false
  }
}

// ---------- Incluir ----------
const incluirOpen = ref(false)

async function onIncluido(membro) {
  incluirOpen.value = false
  mensagem.value = `${membro.nome} foi incluído(a) como ${rotuloPapel(membro.papel)}.`
  await carregarMembros(espaco.value.id)
}

// ---------- Remover membro ----------
// Lixeira só para quem pode sair: nunca o proprietário (o espaço não pode
// ficar sem dono) nem a própria pessoa.
const removendo = ref(null)
const removendoBusy = ref(false)
const removendoError = ref('')

function podeRemover(membro) {
  return podeGerir.value && membro.papel !== 'owner' && !membro.voce
}

function pedirRemocao(membro) {
  removendoError.value = ''
  removendo.value = membro
}

async function confirmarRemocao() {
  const alvo = removendo.value
  const workspaceId = espaco.value.id
  removendoBusy.value = true
  removendoError.value = ''

  try {
    await workspaceService.removerMembro(workspaceId, alvo.id)
    removendo.value = null
    mensagem.value = `${alvo.nome} foi removido(a) do espaço.`
    await carregarMembros(workspaceId)
  } catch (err) {
    removendoError.value = err.response?.data?.error?.message || 'Não foi possível remover o membro.'
    await carregarMembros(workspaceId)
  } finally {
    removendoBusy.value = false
  }
}

// ---------- Excluir espaço ----------
const excluirOpen = ref(false)
const excluirBusy = ref(false)
const excluirError = ref('')

function pedirExclusao() {
  excluirError.value = ''
  excluirOpen.value = true
}

// O servidor exige o nome exato do espaço; a interface já o fez digitar.
async function confirmarExclusao() {
  const { id, nome } = espaco.value
  excluirBusy.value = true
  excluirError.value = ''

  try {
    await workspaces.remove(id, nome)
    excluirOpen.value = false
    // O espaço excluído deixa de existir: o store já voltou ao ativo válido
    // (o pessoal) - levamos o usuário até a Visão geral dele.
    await router.push({ name: 'espaco', params: { workspaceId: workspaces.active.value.id } })
    mensagem.value = `O espaço "${nome}" foi excluído.`
  } catch (err) {
    excluirError.value = err.response?.data?.error?.message || 'Não foi possível excluir o espaço.'
  } finally {
    excluirBusy.value = false
  }
}

watch(
  () => espaco.value?.id,
  (id) => {
    membros.value = []
    mensagem.value = ''
    incluirOpen.value = false
    removendo.value = null
    excluirOpen.value = false
    if (id) carregarMembros(id)
  },
  { immediate: true }
)
</script>

<template>
  <AppShell>
    <template v-if="espaco">
      <h1 class="h4 mb-1">Visão geral</h1>
      <!-- O nome do espaço é o contexto principal desta página: destacado, com o
           mesmo ícone do seletor do menu lateral. text-break: nome comprido quebra
           em vez de estourar a página. -->
      <p class="espaco-nome fw-semibold mb-2 d-flex align-items-center gap-2">
        <i class="bi bi-collection text-primary"></i>
        <span class="text-break">{{ espaco.nome }}</span>
      </p>

      <div class="d-flex flex-wrap gap-2 mb-3">
        <span class="badge text-bg-primary">
          {{ espaco.pessoal ? 'Espaço pessoal' : 'Espaço compartilhado' }}
        </span>
        <span class="badge text-bg-secondary">Seu papel: {{ rotuloPapel(espaco.papel) }}</span>
      </div>

      <output v-if="mensagem" class="alert alert-success alert-dismissible d-block py-2 small">
        {{ mensagem }}
        <button type="button" class="btn-close py-2" aria-label="Fechar" @click="mensagem = ''"></button>
      </output>

      <div class="card mb-4">
        <div class="card-body">
          <h2 class="h6">O que é um espaço</h2>
          <p>
            Um espaço reúne os dados patrimoniais de uma pessoa, família ou cliente — como carteiras, operações e
            alertas — e é privado aos seus membros. Os dados de mercado (cotações, índices, indicadores) são comuns
            a todos os espaços e não pertencem a nenhum deles.
          </p>
          <p class="text-muted small mb-0">
            Nenhum dado patrimonial existe ainda. Quando existir, ele aparecerá aqui, dentro do espaço.
          </p>
        </div>
      </div>

      <div class="d-flex align-items-center justify-content-between mb-2">
        <h2 class="h5 mb-0">Membros</h2>
        <button v-if="podeGerir" type="button" class="btn btn-primary btn-sm" @click="incluirOpen = true">
          <i class="bi bi-plus-lg me-1"></i> Incluir
        </button>
      </div>

      <p v-if="espaco.pessoal" class="text-muted small">
        Este é o seu espaço pessoal — só você tem acesso e ele não pode ser excluído. Para compartilhar com outras
        pessoas, crie um novo espaço pelo seletor de espaço, no menu lateral.
      </p>

      <div v-if="loadingMembros" class="text-muted">Carregando...</div>
      <div v-else-if="membrosError" class="alert alert-danger">{{ membrosError }}</div>
      <div v-else class="table-responsive mb-4">
        <table class="table table-sm align-middle">
          <thead>
            <tr>
              <th>Nome</th>
              <th v-if="souOwner">E-mail</th>
              <th>Papel</th>
              <th v-if="podeGerir" class="text-end"><span class="visually-hidden">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="membro in membros" :key="membro.id">
              <td>
                {{ membro.nome }}
                <span v-if="membro.voce" class="text-muted small">(você)</span>
              </td>
              <td v-if="souOwner">{{ membro.email }}</td>
              <td>
                <span class="badge" :class="membro.papel === 'owner' ? 'text-bg-primary' : 'text-bg-secondary'">
                  {{ rotuloPapel(membro.papel) }}
                </span>
              </td>
              <td v-if="podeGerir" class="text-end">
                <button
                  v-if="podeRemover(membro)"
                  type="button"
                  class="btn btn-sm btn-outline-danger"
                  :title="`Remover ${membro.nome} do espaço`"
                  :aria-label="`Remover ${membro.nome} do espaço`"
                  @click="pedirRemocao(membro)"
                >
                  <i class="bi bi-trash"></i>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="podeGerir" class="card border-danger mt-4">
        <div class="card-body">
          <h2 class="h6 text-danger">Zona de perigo</h2>
          <p class="small text-muted">
            Excluir o espaço remove o acesso de todos os membros e não pode ser desfeito. Os dados de mercado não são
            afetados.
          </p>
          <button type="button" class="btn btn-outline-danger" @click="pedirExclusao">
            <i class="bi bi-trash me-1"></i> Excluir espaço
          </button>
        </div>
      </div>

      <MembroIncluirModal
        v-if="podeGerir"
        :open="incluirOpen"
        :workspace-id="espaco.id"
        @close="incluirOpen = false"
        @added="onIncluido"
      />

      <ConfirmModal
        :open="Boolean(removendo)"
        title="Remover membro"
        confirm-label="Remover"
        :busy="removendoBusy"
        :error-message="removendoError"
        @close="removendo = null"
        @confirm="confirmarRemocao"
      >
        <p class="mb-0">
          Remover <strong>{{ removendo?.nome }}</strong> do espaço <strong>{{ espaco.nome }}</strong>? Essa pessoa
          deixará de ter acesso a este espaço. Ela continua sendo usuária do FinMind e pode ser incluída de novo.
        </p>
      </ConfirmModal>

      <ConfirmModal
        :open="excluirOpen"
        title="Excluir espaço"
        confirm-label="Excluir espaço"
        :require-text="espaco.nome"
        :busy="excluirBusy"
        :error-message="excluirError"
        @close="excluirOpen = false"
        @confirm="confirmarExclusao"
      >
        <p class="mb-2">
          Você vai excluir o espaço <strong>{{ espaco.nome }}</strong>. Esta ação é <strong>permanente</strong> e não
          pode ser desfeita.
        </p>
        <p v-if="membros.length > 1" class="mb-0">
          {{ membros.length - 1 }} {{ membros.length - 1 === 1 ? 'outro membro perderá' : 'outros membros perderão' }}
          o acesso.
        </p>
      </ConfirmModal>
    </template>

    <div v-else class="alert alert-warning">Não foi possível carregar seus espaços.</div>
  </AppShell>
</template>

<style scoped>
/* 22px: maior que o corpo e que uma legenda, mas ainda abaixo do título "Visão
   geral" (h4, 24px) - com 24px o nome igualaria o título e a hierarquia se perderia. */
.espaco-nome {
  font-size: 1.375rem;
}
</style>
