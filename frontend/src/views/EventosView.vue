<script setup>
import { onMounted, ref, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import AppShell from '../components/layout/AppShell.vue'
import geopoliticaService from '../services/geopolitica.service.js'
import { nivel, pressao, rotuloAtivo, rotuloGrau, formatarData, rotuloFonte, rotuloAssunto, rotuloTipo, TIPOS } from '../utils/geopolitica.js'

// Tela Eventos (ADR 0047): o que a leitura diária de geopolítica encontrou e entregou como contexto ao prompt do ouro
// e do petróleo. Só leitura. No topo, a última leitura (o nível e o resumo de cada ativo, que num dia NORMAL é tudo o
// que existe); abaixo, os eventos, um por linha, expandíveis. Rejeitados (sem site confiável) só com o filtro.

const OPCOES_LINHAS_POR_PAGINA = [25, 50, 100, 200]
const OPCOES_ATIVO = [
  { valor: '', rotulo: 'Todos' },
  { valor: 'OURO', rotulo: 'Ouro' },
  { valor: 'PETROLEO', rotulo: 'Petróleo' }
]
const OPCOES_SITUACAO = [
  { valor: 'aceitos', rotulo: 'Aceitos (vão ao Motor)' },
  { valor: 'rejeitados', rotulo: 'Rejeitados (sem site confiável)' },
  { valor: 'todos', rotulo: 'Todos' }
]

const leitura = ref(null)
const fontesConfiaveis = ref(null)
const carregandoLeitura = ref(true)

const eventos = ref([])
const totalEventos = ref(0)
const eventosExpandidos = ref({})
const paginaAtual = ref(1)
const tamanhoPagina = ref(OPCOES_LINHAS_POR_PAGINA[0])
const ordem = ref('DESC')
const carregando = ref(true)
const errorMessage = ref('')

const ativoFiltro = ref('')
const tipoFiltro = ref('')
const assuntoFiltro = ref('')
// O filtro de assunto só aparece quando houver mais de um assunto com evento (hoje só Geopolítica).
const assuntosDisponiveis = ref([])
const situacaoFiltro = ref('aceitos')
const dataInicioFiltro = ref('')
const dataFimFiltro = ref('')

async function carregarLeitura() {
  carregandoLeitura.value = true
  try {
    const resposta = await geopoliticaService.getUltimaLeitura()
    leitura.value = resposta.leitura
    fontesConfiaveis.value = resposta.fontesConfiaveis
  } catch (_err) {
    leitura.value = null
  } finally {
    carregandoLeitura.value = false
  }
}

async function carregar() {
  carregando.value = true
  errorMessage.value = ''
  try {
    const resultado = await geopoliticaService.listarEventos({
      ativo: ativoFiltro.value || undefined,
      tipo: tipoFiltro.value || undefined,
      assunto: assuntoFiltro.value || undefined,
      situacao: situacaoFiltro.value,
      dataInicio: dataInicioFiltro.value || undefined,
      dataFim: dataFimFiltro.value || undefined,
      pagina: paginaAtual.value,
      tamanhoPagina: tamanhoPagina.value,
      ordem: ordem.value
    })
    eventos.value = resultado.eventos
    totalEventos.value = resultado.paginacao.total
    assuntosDisponiveis.value = resultado.assuntosDisponiveis || []
  } catch (_err) {
    errorMessage.value = 'Não foi possível carregar os eventos.'
  } finally {
    carregando.value = false
  }
}

// Modal "Prompt e resposta da IA": o mesmo para todos os eventos da leitura do dia (uma chamada à IA gera vários
// eventos). Carregado na primeira abertura e guardado por leitura.
const detalheIaAberto = ref(false)
const detalheIa = ref(null)
const carregandoDetalheIa = ref(false)
const erroDetalheIa = ref('')
const cacheDetalheIa = {}

const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

async function abrirDetalheIa(evento) {
  detalheIaAberto.value = true
  erroDetalheIa.value = ''
  if (cacheDetalheIa[evento.leituraId]) {
    detalheIa.value = cacheDetalheIa[evento.leituraId]
    return
  }
  detalheIa.value = null
  carregandoDetalheIa.value = true
  try {
    const { detalheIa: detalhe } = await geopoliticaService.getDetalheIa(evento.leituraId)
    cacheDetalheIa[evento.leituraId] = detalhe
    detalheIa.value = detalhe
  } catch (_err) {
    erroDetalheIa.value = 'Não foi possível carregar o prompt e a resposta da IA.'
  } finally {
    carregandoDetalheIa.value = false
  }
}

function atualizarTudo() {
  carregarLeitura()
  carregar()
}

watch([ativoFiltro, tipoFiltro, assuntoFiltro, situacaoFiltro, dataInicioFiltro, dataFimFiltro, tamanhoPagina], () => {
  paginaAtual.value = 1
  carregar()
})

function onPage(evento) {
  paginaAtual.value = evento.page + 1
  carregar()
}

function onSort(evento) {
  ordem.value = evento.sortOrder === 1 ? 'ASC' : 'DESC'
  paginaAtual.value = 1
  carregar()
}

onMounted(atualizarTudo)
</script>

<template>
  <AppShell>
    <div class="eventos">
      <header class="eventos__cabecalho">
        <h1 class="eventos__titulo"><i class="bi bi-globe2"></i> Eventos</h1>
        <p class="eventos__subtitulo">
          Leitura diária de geopolítica do ouro e do petróleo, gerada por IA com busca na web só nos sites confiáveis.
          É o contexto do fator geopolítico no prompt de cada ativo.
        </p>
      </header>

      <section class="eventos__leitura">
        <div v-if="carregandoLeitura" class="text-muted small">Carregando a última leitura...</div>
        <div v-else-if="!leitura" class="alert alert-info small mb-0">
          Nenhuma leitura ainda. A primeira sai na próxima coleta, com a chave do Gemini configurada.
        </div>
        <template v-else>
          <div class="eventos__leitura-cards">
            <article v-for="ativo in ['OURO', 'PETROLEO']" :key="ativo" class="eventos__leitura-card">
              <div class="eventos__leitura-card-topo">
                <h2 class="eventos__leitura-ativo">{{ rotuloAtivo(ativo) }}</h2>
                <span class="nivel-badge" :class="`nivel-badge--${nivel(leitura[ativo === 'OURO' ? 'ouro' : 'petroleo'].nivel).classe}`">
                  {{ nivel(leitura[ativo === 'OURO' ? 'ouro' : 'petroleo'].nivel).rotulo }}
                </span>
              </div>
              <p class="eventos__leitura-resumo">{{ leitura[ativo === 'OURO' ? 'ouro' : 'petroleo'].resumo || 'Sem resumo.' }}</p>
            </article>
          </div>
          <p class="eventos__leitura-rodape">
            Leitura de {{ formatarData(leitura.data) }} · escala de nível provisória (a régua é do especialista)
          </p>
        </template>
      </section>

      <!-- Mesmo formato da seção "Fonte e metodologia" do detalhe de um observável (ObservavelDetalheView.vue). -->
      <section class="eventos__secao">
        <details class="eventos__metodologia">
          <summary>Fonte e metodologia</summary>
          <p>
            Leitura diária de geopolítica do ouro e do petróleo, feita por IA (Gemini) com a pesquisa do Google, usando
            somente os sites confiáveis abaixo. Responde a uma pergunta: aconteceu hoje algo <strong>fora do normal</strong>
            com potencial de afetar o preço do ouro ou do petróleo? Não é um resumo do noticiário nem um sistema de
            acompanhamento de eventos: cada dia é uma leitura nova, e um fato que continua relevante simplesmente aparece
            de novo.
          </p>
          <ol class="eventos__metodologia-passos">
            <li>
              <strong>Uma leitura por dia.</strong> Na coleta diária, o FinMind faz uma única chamada ao Gemini, que
              responde para os dois ativos: o nível do dia (Normal, Atenção, Relevante ou Excepcional), um resumo e os
              eventos. A coleta roda 3 vezes por madrugada (01h, 03h e 05h, horário de Brasília): vale a primeira leitura
              que der certo, e as execuções seguintes pulam a chamada (aparecem como "ignorado" em Execuções). Elas só
              servem de nova tentativa quando a anterior falhou.
            </li>
            <li>
              <strong>Fontes primárias primeiro.</strong> O núcleo são instituições que só publicam quando algo acontece
              (um aviso do UKMTO já é, por definição, uma anomalia), mais uma agência de notícias para o que nenhuma
              instituição publica em tempo real, como escalada militar e ataques em terra. É <strong>uma lista só para os
              dois ativos</strong>: um ataque em Ormuz relatado pelo UKMTO pode contar para o petróleo (rota) e para o
              ouro (risco e inflação via energia). A IA decide a seção pelo canal de transmissão.
            </li>
            <li>
              <strong>Só sites confiáveis.</strong> O pedido manda usar somente esses sites, com as buscas restritas a
              eles e ao menos uma busca em cada um. Um fato encontrado só em outro site não deve ser relatado. A rotina
              (sanções e notícias de todo dia) não conta como "fora do normal".
            </li>
            <li>
              <strong>Dupla conferência.</strong> O Google não permite travar a pesquisa nesses sites: o pedido orienta,
              mas não garante. Por isso o FinMind confere cada fonte citada: ela só sustenta o evento se for um site
              confiável <strong>e</strong> se esse site apareceu de fato nos resultados da pesquisa daquela chamada.
              Sem isso, o evento é <strong>rejeitado</strong> e não vai ao Motor (fica visível no filtro "Situação").
              A segunda conferência existe porque, num teste, a IA citou a Reuters sem ter lido nenhuma página dela.
            </li>
            <li>
              <strong>Sem pesquisa, sem leitura.</strong> Às vezes a IA responde sem pesquisar, sem dar erro, escrevendo
              de memória. Quando a resposta não traz nenhuma página lida, o FinMind tenta mais uma vez; se de novo vier
              sem pesquisa, nada é gravado e a execução fica como falha. Assim, um nível ou resumo escrito de memória nunca
              chega ao Motor: sem leitura no dia, o prompt do ativo recebe "leitura indisponível".
            </li>
            <li>
              <strong>Link direto.</strong> A pesquisa informa quais páginas leu e em quais trechos da resposta cada uma
              se apoia. O FinMind segue esses links na hora da coleta e liga cada evento às páginas dos sites confiáveis
              que o sustentam. No evento, a fonte aparece só pelo nome, e o único link é o do próprio evento: o aviso, o
              comunicado ou a matéria oficial que a pesquisa leu. Sem essa ligação, a fonte fica só citada, sem link. Os
              sites confiáveis, com o link de cada um, estão na lista abaixo.
            </li>
            <li>
              <strong>Assunto e tipo.</strong> Todo evento desta leitura é do assunto <strong>Geopolítica</strong>
              (preenchido pelo FinMind, não pela IA). Dentro dele, a IA classifica o <strong>tipo</strong> numa lista
              fechada: conflito militar, rota marítima, infraestrutura, sanção, decisão de produção, diplomacia ou outro.
              Outros assuntos no futuro usarão o mesmo mecanismo, cada um com o próprio prompt e as próprias fontes.
            </li>
            <li>
              <strong>Uso no Motor.</strong> O nível, o resumo e os eventos aceitos de cada ativo entram no prompt da
              análise daquele ativo como contexto do fator geopolítico, só com as fontes confirmadas. Sem leitura no
              dia, o prompt recebe "leitura indisponível", nunca "normal".
            </li>
            <li>
              <strong>Pressão sobre o preço.</strong> É para que lado o fato, sozinho e com o resto constante, empurra o
              preço. Não é previsão: o preço pode ir para o outro lado por juros, dólar ou outros fatores.
            </li>
          </ol>
          <p class="eventos__metodologia-nota">
            A pesquisa lê a internet do dia: a leitura só vale da primeira coleta em diante e não serve para backtest.
            A escala de nível e o que conta como "fora do normal" são provisórios: a régua é do especialista. Intensidade
            e confiança são declaradas pela própria IA. Ficaram de fora, depois de testados: a Reuters (a pesquisa do
            Gemini não lê o site), a IEA (publica pouco que mude a leitura de um dia) e Fed, BCE, BIS e FMI (são
            política monetária e regulação, outro fator). Decisão registrada no ADR 0047.
          </p>
          <dl class="eventos__metodologia-lista">
            <dt>Fonte</dt>
            <dd>Gemini (Google) com a pesquisa do Google, sobre os sites confiáveis</dd>
            <dt>Frequência</dt>
            <dd>
              Uma leitura por dia (a data é o dia em São Paulo), na coleta das 01h, 03h e 05h: vale a primeira que der
              certo
            </dd>
            <dt>Refazer a leitura do dia</dt>
            <dd>
              Para trocar a leitura de hoje por uma nova (por exemplo, depois de uma falha da pesquisa), no console do
              backend:
              <code class="eventos__metodologia-comando">GEOPOLITICA_REFAZER=1 npm run collect -- --coletor=geopolitica</code>
              A nova leitura substitui a anterior do mesmo dia. Sem <code>GEOPOLITICA_REFAZER=1</code>, o comando pula a
              chamada se já houver leitura de hoje.
            </dd>
            <template v-for="fonte in fontesConfiaveis || []" :key="fonte.nome">
              <dt>{{ fonte.nome }}</dt>
              <dd>
                <template v-for="(dominio, i) in fonte.dominios" :key="dominio">
                  <template v-if="i > 0">, </template>
                  <a class="eventos__metodologia-dominio" :href="`https://${dominio}`" target="_blank" rel="noopener noreferrer">{{ dominio }}</a>
                </template>
                · {{ fonte.papel }}
              </dd>
            </template>
            <template v-if="leitura">
              <dt>Modelo</dt>
              <dd>{{ leitura.modelo }} (chave {{ leitura.chave }})</dd>
              <dt>Versão do prompt</dt>
              <dd>{{ leitura.versaoPrompt }}</dd>
            </template>
          </dl>
        </details>
      </section>

      <div v-if="errorMessage" class="alert alert-danger">{{ errorMessage }}</div>

      <div v-else class="tabela-card">
        <div class="tabela-card__filtros">
          <div>
            <label class="form-label small mb-1 d-block">Ativo</label>
            <select v-model="ativoFiltro" class="form-select form-select-sm">
              <option v-for="opcao in OPCOES_ATIVO" :key="opcao.valor" :value="opcao.valor">{{ opcao.rotulo }}</option>
            </select>
          </div>
          <div v-if="assuntosDisponiveis.length > 1">
            <label class="form-label small mb-1 d-block">Assunto</label>
            <select v-model="assuntoFiltro" class="form-select form-select-sm">
              <option value="">Todos</option>
              <option v-for="codigo in assuntosDisponiveis" :key="codigo" :value="codigo">{{ rotuloAssunto(codigo) }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1 d-block">Tipo</label>
            <select v-model="tipoFiltro" class="form-select form-select-sm">
              <option value="">Todos</option>
              <option v-for="(rotulo, codigo) in TIPOS" :key="codigo" :value="codigo">{{ rotulo }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1 d-block">Situação</label>
            <select v-model="situacaoFiltro" class="form-select form-select-sm">
              <option v-for="opcao in OPCOES_SITUACAO" :key="opcao.valor" :value="opcao.valor">{{ opcao.rotulo }}</option>
            </select>
          </div>
          <div>
            <label class="form-label small mb-1 d-block">De</label>
            <input v-model="dataInicioFiltro" type="date" class="form-control form-control-sm" />
          </div>
          <div>
            <label class="form-label small mb-1 d-block">Até</label>
            <input v-model="dataFimFiltro" type="date" class="form-control form-control-sm" />
          </div>
        </div>

        <DataTable
          v-model:expanded-rows="eventosExpandidos"
          :value="eventos"
          lazy
          :loading="carregando"
          paginator
          paginator-position="both"
          :always-show="false"
          :rows="tamanhoPagina"
          :first="(paginaAtual - 1) * tamanhoPagina"
          :total-records="totalEventos"
          paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink CurrentPageReport"
          current-page-report-template="Página {currentPage} de {totalPages} ({totalRecords} no total)"
          sort-mode="single"
          sort-field="data"
          :sort-order="ordem === 'ASC' ? 1 : -1"
          data-key="id"
          class="tabela-paginada"
          @page="onPage"
          @sort="onSort"
        >
          <template #paginatorstart>
            <Button class="tabela-refresh-botao" icon="pi pi-refresh" text title="Atualizar" :loading="carregando" @click="atualizarTudo" />
          </template>
          <template #paginatorend>
            <label class="tabela-linhas-por-pagina">
              <span>Por página</span>
              <select v-model.number="tamanhoPagina">
                <option v-for="opcao in OPCOES_LINHAS_POR_PAGINA" :key="opcao" :value="opcao">{{ opcao }}</option>
              </select>
            </label>
          </template>
          <template #empty>Nenhum evento com esses filtros.</template>

          <Column expander style="width: 3rem" />
          <Column field="data" header="Data" sortable>
            <template #body="{ data }">{{ formatarData(data.data) }}</template>
          </Column>
          <Column v-if="assuntosDisponiveis.length > 1" header="Assunto">
            <template #body="{ data }">{{ rotuloAssunto(data.assunto) }}</template>
          </Column>
          <Column header="Tipo">
            <template #body="{ data }"><span class="tipo-tag">{{ rotuloTipo(data.tipo) }}</span></template>
          </Column>
          <Column header="Ativo">
            <template #body="{ data }">{{ rotuloAtivo(data.ativo) }}</template>
          </Column>
          <Column header="Título">
            <template #body="{ data }"><span class="eventos__titulo-coluna" :title="data.titulo">{{ data.titulo }}</span></template>
          </Column>
          <Column header="Pressão">
            <template #body="{ data }">
              <span
                v-if="pressao(data.pressao)"
                class="pressao"
                :class="`pressao--${pressao(data.pressao).classe}`"
                :title="`Pressão do fato sobre o preço: ${pressao(data.pressao).rotulo.toLowerCase()} (leitura da IA, com o resto constante)`"
              >
                <i class="bi" :class="pressao(data.pressao).icone"></i> {{ pressao(data.pressao).rotulo }}
              </span>
              <span v-else>—</span>
            </template>
          </Column>
          <Column header="Intensidade">
            <template #body="{ data }">{{ rotuloGrau(data.intensidade) }}</template>
          </Column>
          <Column header="Confiança">
            <template #body="{ data }">{{ rotuloGrau(data.confianca) }}</template>
          </Column>
          <Column v-if="situacaoFiltro !== 'aceitos'" header="Situação">
            <template #body="{ data }">
              <span v-if="data.aceito" class="situacao situacao--aceito"><i class="pi pi-check-circle"></i> Aceito</span>
              <span v-else class="situacao situacao--rejeitado"><i class="pi pi-ban"></i> Rejeitado</span>
            </template>
          </Column>

          <template #expansion="{ data }">
            <div class="eventos__expansao">
              <h3 class="eventos__expansao-titulo">{{ data.titulo }}</h3>

              <div v-if="!data.aceito" class="alert alert-warning small py-2">
                <strong>Rejeitado: não vai ao Motor.</strong> {{ data.motivoRejeicao }}
              </div>

              <dl class="eventos__expansao-meta">
                <div><dt>Assunto</dt><dd>{{ rotuloAssunto(data.assunto) }}</dd></div>
                <div><dt>Tipo</dt><dd>{{ rotuloTipo(data.tipo) }}</dd></div>
                <div><dt>Ativo</dt><dd>{{ rotuloAtivo(data.ativo) }}</dd></div>
                <div>
                  <dt>Pressão sobre o preço</dt>
                  <dd>
                    <span v-if="pressao(data.pressao)" class="pressao" :class="`pressao--${pressao(data.pressao).classe}`">
                      <i class="bi" :class="pressao(data.pressao).icone"></i> {{ pressao(data.pressao).rotulo }}
                    </span>
                    <span v-else>—</span>
                  </dd>
                </div>
                <div><dt>Intensidade</dt><dd>{{ rotuloGrau(data.intensidade) }}</dd></div>
                <div><dt>Confiança</dt><dd>{{ rotuloGrau(data.confianca) }}</dd></div>
                <div><dt>Ordem no dia</dt><dd>{{ data.ordem }}º</dd></div>
              </dl>
              <p v-if="pressao(data.pressao)" class="eventos__expansao-nota">
                A pressão é para que lado este fato, sozinho e com o resto constante, empurra o preço. Não é previsão: o
                preço pode ir para o outro lado por juros, dólar ou outros fatores.
              </p>

              <div class="eventos__expansao-bloco">
                <h4>Resumo</h4>
                <p>{{ data.resumo || '—' }}</p>
              </div>
              <div class="eventos__expansao-bloco">
                <h4>Canal de transmissão</h4>
                <p>{{ data.canalTransmissao || '—' }}</p>
              </div>
              <div class="eventos__expansao-bloco">
                <h4>Fontes</h4>
                <ul v-if="data.fontes.length" class="eventos__fontes">
                  <li v-for="(fonte, i) in data.fontes" :key="i">
                    <!-- No evento, a fonte só é citada pelo nome; o link dos sites fica em "Fonte e metodologia". O único
                         link aqui é o do próprio evento: a página que a pesquisa leu (origem "pesquisa"). -->
                    <span class="eventos__fonte-nome">{{ rotuloFonte(fonte) }}</span>
                    <span
                      v-if="fonte.origem === 'pesquisa'"
                      class="fonte-tag fonte-tag--autorizada"
                      title="Página que a pesquisa leu e que apoia este evento: o link abre a notícia ou o aviso oficial."
                    >
                      confiável · link direto da pesquisa
                    </span>
                    <span v-else-if="fonte.fonteAutorizada && fonte.confirmadaNaPesquisa" class="fonte-tag fonte-tag--autorizada">
                      confiável · confirmada na pesquisa
                    </span>
                    <span
                      v-else-if="fonte.fonteAutorizada"
                      class="fonte-tag fonte-tag--alerta"
                      title="Site confiável, mas ele não apareceu nos resultados da pesquisa desta chamada: não sustenta o evento."
                    >
                      confiável · não confirmada na pesquisa
                    </span>
                    <span v-else class="fonte-tag">fora da lista</span>
                    <a
                      v-if="fonte.origem === 'pesquisa' && fonte.url"
                      class="eventos__fonte-url"
                      :href="fonte.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Abrir a página oficial deste evento em nova aba"
                    >
                      <i class="bi bi-box-arrow-up-right"></i> {{ fonte.url }}
                    </a>
                  </li>
                </ul>
                <p v-else>Nenhuma fonte citada.</p>
              </div>
              <div class="eventos__expansao-ia">
                <Button
                  label="Ver prompt e resposta da IA"
                  icon="pi pi-code"
                  text
                  size="small"
                  title="O que foi enviado à IA e o que ela respondeu nesta leitura (comum a todos os eventos do dia)"
                  @click="abrirDetalheIa(data)"
                />
              </div>
            </div>
          </template>
        </DataTable>
      </div>

      <Dialog v-model:visible="detalheIaAberto" modal header="Prompt e resposta da IA" :style="{ width: '64rem' }" :breakpoints="{ '960px': '95vw' }">
        <div v-if="carregandoDetalheIa" class="text-muted">Carregando...</div>
        <div v-else-if="erroDetalheIa" class="alert alert-danger small mb-0">{{ erroDetalheIa }}</div>
        <div v-else-if="detalheIa" class="detalhe-ia">
          <p class="detalhe-ia__nota">
            Uma única chamada por dia gera todos os eventos da leitura: este prompt e esta resposta são os mesmos para
            todos os eventos de {{ formatarData(detalheIa.data) }}.
          </p>
          <dl class="detalhe-ia__meta">
            <div><dt>Leitura</dt><dd>{{ formatarData(detalheIa.data) }}</dd></div>
            <div><dt>Gerada em</dt><dd>{{ detalheIa.geradaEm ? formatadorDataHora.format(new Date(detalheIa.geradaEm)) : '—' }}</dd></div>
            <div><dt>Modelo</dt><dd>{{ detalheIa.modelo }}</dd></div>
            <div><dt>Chave</dt><dd>{{ detalheIa.chave }}</dd></div>
            <div><dt>Tokens</dt><dd>{{ detalheIa.tokens ?? '—' }}</dd></div>
            <div><dt>Versão do prompt</dt><dd>{{ detalheIa.versaoPrompt }}</dd></div>
          </dl>

          <details class="detalhe-ia__bloco">
            <summary>Instrução do sistema <span>(regras, escala de nível e formato da resposta)</span></summary>
            <pre>{{ detalheIa.instrucaoSistema || 'Não gravada nesta leitura.' }}</pre>
          </details>
          <details class="detalhe-ia__bloco" open>
            <summary>Prompt <span>(data e sites confiáveis)</span></summary>
            <pre>{{ detalheIa.prompt }}</pre>
          </details>
          <details class="detalhe-ia__bloco" open>
            <summary>Resposta da IA <span>(como veio, antes da conferência das fontes)</span></summary>
            <pre>{{ detalheIa.resposta }}</pre>
          </details>
          <details class="detalhe-ia__bloco">
            <summary>Pesquisa <span>({{ detalheIa.buscas.length }} buscas, {{ detalheIa.paginasLidas.length }} páginas lidas)</span></summary>
            <h5>Buscas feitas</h5>
            <ul>
              <li v-for="(busca, i) in detalheIa.buscas" :key="`busca-${i}`"><code>{{ busca }}</code></li>
            </ul>
            <h5>Páginas lidas</h5>
            <ul>
              <li v-for="(pagina, i) in detalheIa.paginasLidas" :key="`pagina-${i}`">
                <strong>{{ pagina.site || '?' }}</strong>
                <a v-if="pagina.url" :href="pagina.url" target="_blank" rel="noopener noreferrer">{{ pagina.url }}</a>
                <span v-else class="text-muted">(link não resolvido)</span>
              </li>
            </ul>
          </details>
        </div>
      </Dialog>
    </div>
  </AppShell>
</template>

<style scoped>
.eventos {
  max-width: 1440px;
  margin: 0 auto;
}

.eventos__cabecalho {
  margin-bottom: 1.25rem;
}

.eventos__titulo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
  letter-spacing: -0.01em;
}

.eventos__subtitulo {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.9rem;
  max-width: 80ch;
}

.eventos__leitura {
  margin-bottom: 1.5rem;
}

/* "Fonte e metodologia": mesmo visual de ObservavelDetalheView.vue (.observavel-detalhe__metodologia). */
.eventos__secao {
  margin-bottom: 1.75rem;
}

.eventos__metodologia {
  border: 1px solid var(--p-content-border-color);
  border-radius: 12px;
  background: var(--p-content-background);
  padding: 0.85rem 1.1rem;
  font-size: 0.85rem;
}
.eventos__metodologia summary {
  cursor: pointer;
  font-weight: 600;
}
.eventos__metodologia p {
  color: var(--p-text-muted-color);
  line-height: 1.5;
  margin: 0.75rem 0 0;
}

.eventos__metodologia-passos {
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  line-height: 1.5;
  color: var(--p-text-muted-color);
}
.eventos__metodologia-passos strong {
  color: var(--p-text-color);
}
.eventos__metodologia-passos > li:not(:last-child) {
  margin-bottom: 0.4rem;
}

.eventos__metodologia-nota {
  font-size: 0.82rem;
}

.eventos__metodologia-lista {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.3rem 0.75rem;
  margin: 0.75rem 0 0;
  font-size: 0.82rem;
}
.eventos__metodologia-lista dt {
  color: var(--p-text-muted-color);
  font-weight: 600;
}
.eventos__metodologia-lista dd {
  margin: 0;
}
.eventos__metodologia-comando {
  display: block;
  margin: 0.35rem 0;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  background: var(--p-content-hover-background);
  font-size: 0.78rem;
  overflow-wrap: anywhere;
}

.eventos__leitura-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.eventos__leitura-card {
  border: 1px solid var(--p-content-border-color);
  border-radius: 14px;
  padding: 0.9rem 1.1rem;
  background: var(--p-content-background);
}

.eventos__leitura-card-topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.eventos__leitura-ativo {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.eventos__leitura-resumo {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.5;
}

.eventos__leitura-rodape {
  margin: 0.5rem 0 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.nivel-badge {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  white-space: nowrap;
  border: 1px solid currentColor;
}
.nivel-badge--normal {
  color: var(--p-green-600, #16a34a);
}
.nivel-badge--atencao {
  color: var(--p-yellow-600, #ca8a04);
}
.nivel-badge--relevante {
  color: var(--p-orange-600, #ea580c);
}
.nivel-badge--excepcional {
  color: var(--p-red-600, #dc2626);
}
.nivel-badge--desconhecido {
  color: var(--p-text-muted-color);
}

.eventos__titulo-coluna {
  display: inline-block;
  max-width: 460px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}

.situacao {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}
.situacao--aceito {
  color: var(--p-green-600, #16a34a);
}
.situacao--rejeitado {
  color: var(--p-red-600, #dc2626);
}

.pressao {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: 600;
  white-space: nowrap;
}
.pressao--alta {
  color: var(--p-green-600, #16a34a);
}
.pressao--baixa {
  color: var(--p-red-600, #dc2626);
}
.pressao--ambigua {
  color: var(--p-text-muted-color);
}

.eventos__expansao-nota {
  margin: -0.4rem 0 0.9rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.eventos__expansao {
  padding: 0.9rem 1.1rem;
  background: var(--p-content-background);
}

.eventos__expansao-titulo {
  margin: 0 0 0.85rem;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.4;
}

.eventos__expansao-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1.75rem;
  margin: 0 0 0.9rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.eventos__expansao-meta dt {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--p-text-muted-color);
}

.eventos__expansao-meta dd {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.eventos__expansao-bloco:not(:last-child) {
  margin-bottom: 0.9rem;
}

.eventos__expansao-bloco h4 {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--p-text-muted-color);
}

.eventos__expansao-bloco p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.eventos__fontes {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
}

.eventos__fontes a {
  color: var(--p-primary-color);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.eventos__fontes a:hover {
  text-decoration: underline;
}

.fonte-tag {
  margin-left: 0.4rem;
  padding: 0 0.4rem;
  border-radius: 6px;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
  border: 1px solid var(--p-content-border-color);
}
/* A URL também é link (cor de link, herdada de .eventos__fontes a): clicar no nome ou no endereço abre a página. */
.eventos__fonte-url {
  display: block;
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.fonte-tag--alerta {
  color: var(--p-orange-600, #ea580c);
  border-color: currentColor;
}
.eventos__metodologia-dominio {
  font-weight: 600;
  color: var(--p-primary-color);
  text-decoration: none;
}
.eventos__metodologia-dominio:hover {
  text-decoration: underline;
}
.eventos__fonte-nome {
  font-weight: 600;
}
.fonte-tag--autorizada {
  color: var(--p-green-600, #16a34a);
  border-color: currentColor;
}

/* Painel expandido levemente destacado da linha-resumo, como no AgroMind. O tema do PrimeVue injeta o fundo da
   linha depois deste CSS, por isso o !important. */
:deep(.p-datatable-row-expansion > td) {
  background: color-mix(in srgb, var(--p-text-color) 6%, var(--p-content-background)) !important;
}

.eventos__expansao-ia {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--p-content-border-color);
}

/* Modal "Prompt e resposta da IA". */
.detalhe-ia {
  font-size: 0.85rem;
}
.detalhe-ia__nota {
  margin: 0 0 0.75rem;
  color: var(--p-text-muted-color);
}
.detalhe-ia__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1.5rem;
  margin: 0 0 1rem;
}
.detalhe-ia__meta dt {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--p-text-muted-color);
}
.detalhe-ia__meta dd {
  margin: 0;
  font-weight: 600;
}
.detalhe-ia__bloco {
  border: 1px solid var(--p-content-border-color);
  border-radius: 10px;
  padding: 0.6rem 0.9rem;
  margin-bottom: 0.6rem;
}
.detalhe-ia__bloco summary {
  cursor: pointer;
  font-weight: 600;
}
.detalhe-ia__bloco summary span {
  font-weight: 400;
  color: var(--p-text-muted-color);
}
.detalhe-ia__bloco pre {
  margin: 0.6rem 0 0;
  max-height: 420px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: 0.76rem;
  padding: 0.75rem;
  border-radius: 8px;
  background: var(--p-content-hover-background);
}
.detalhe-ia__bloco h5 {
  margin: 0.7rem 0 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}
.detalhe-ia__bloco ul {
  margin: 0;
  padding-left: 1.1rem;
}
.detalhe-ia__bloco li a {
  margin-left: 0.4rem;
  color: var(--p-primary-color);
  overflow-wrap: anywhere;
}

.tipo-tag {
  display: inline-block;
  padding: 0.1rem 0.5rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
  background: var(--p-content-hover-background);
  color: var(--p-text-color);
}
</style>
