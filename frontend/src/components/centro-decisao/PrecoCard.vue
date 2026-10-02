<script setup>
import { computed } from 'vue'
import LineChart from '../charts/LineChart.vue'
import { formatarValor, formatarVariacao } from '../../utils/centro-decisao.js'
import { formatarData } from '../../utils/geopolitica.js'

// Card de preço do Centro de Decisão (ADR 0048), no desenho do PrecoDestaqueCard do AgroMind: o valor da série como
// era conhecido na data escolhida, o mini-gráfico e as variações. A série é trocada aqui (lista fixa por ativo, a 1ª é
// o padrão). Só exibe: a variação é aritmética sobre a própria série, não sinal.
const props = defineProps({
  ativoNome: { type: String, required: true },
  preco: { type: Object, required: true },
  series: { type: Array, required: true },
  // [{ codigo: 'd1', rotulo: '1 dia' }, ...] na ordem do backend; a tela mostra da maior janela para a menor.
  variacoes: { type: Array, required: true },
  data: { type: String, required: true }
})

const emit = defineEmits(['selecionar-serie'])

const variacoesVisiveis = computed(() =>
  [...props.variacoes]
    .reverse()
    .map((v) => ({ ...v, exibicao: formatarVariacao(props.preco.variacoes?.[v.codigo]?.percentual), desde: props.preco.variacoes?.[v.codigo]?.desde }))
    .filter((v) => v.exibicao)
)

const ICONE_DIRECAO = { alta: 'bi-arrow-up', queda: 'bi-arrow-down', estavel: 'bi-dash' }

function aoTrocarSerie(evento) {
  emit('selecionar-serie', evento.target.value)
}
</script>

<template>
  <article class="preco-card">
    <header class="preco-card__topo">
      <h2 class="preco-card__titulo"><i class="bi bi-graph-up"></i> Preço do {{ ativoNome.toLowerCase() }}</h2>
      <label class="preco-card__serie">
        <span class="visually-hidden">Série de preço</span>
        <select class="form-select form-select-sm" :value="preco.codigo" @change="aoTrocarSerie">
          <option v-for="serie in series" :key="serie.codigo" :value="serie.codigo">{{ serie.nome }}</option>
        </select>
      </label>
    </header>

    <template v-if="preco.disponivel">
      <p v-if="preco.contrato" class="preco-card__contrato" title="Vencimento mais próximo que negociou no último pregão até a data">
        Vencimento {{ preco.contrato.rotulo }}
      </p>

      <div class="preco-card__corpo">
        <div class="preco-card__grafico">
          <LineChart :pontos="preco.pontos" :unidade="preco.unidade" :casas-decimais="preco.casasDecimais" compacto altura="150px" />
        </div>
        <div class="preco-card__valor">
          <span class="preco-card__numero">{{ formatarValor(preco.valor, preco.casasDecimais) }}</span>
          <span class="preco-card__unidade">{{ preco.unidade }}</span>
          <span class="preco-card__data"><i class="bi bi-clock"></i> em {{ formatarData(preco.dataReferencia) }}</span>
        </div>
      </div>

      <ul v-if="variacoesVisiveis.length" class="preco-card__variacoes">
        <li v-for="v in variacoesVisiveis" :key="v.codigo" :title="`Contra ${formatarData(v.desde)}`">
          <span class="preco-card__variacao-rotulo">{{ v.rotulo }}</span>
          <span class="preco-card__variacao-valor" :class="`preco-card__variacao-valor--${v.exibicao.direcao}`">
            <i class="bi" :class="ICONE_DIRECAO[v.exibicao.direcao]"></i> {{ v.exibicao.texto }}
          </span>
        </li>
      </ul>
      <p v-if="preco.contrato" class="preco-card__nota">
        Variações dentro do mesmo vencimento: os contratos não são emendados numa série contínua.
      </p>

      <p v-if="preco.encerradaEm" class="preco-card__aviso">
        <i class="bi bi-exclamation-triangle"></i> Série encerrada em {{ formatarData(preco.encerradaEm) }}: o valor é o
        último publicado.
      </p>
      <p v-else-if="preco.defasada" class="preco-card__aviso">
        <i class="bi bi-exclamation-triangle"></i> Último dado de {{ formatarData(preco.dataReferencia) }},
        {{ preco.diasSemDado }} dias antes de {{ formatarData(data) }}.
      </p>
    </template>

    <div v-else class="preco-card__vazio">
      <p class="mb-1">Sem dado desta série até {{ formatarData(data) }}.</p>
      <p v-if="series.length > 1" class="mb-0 small">Troque a série acima para ver outra fonte desta data.</p>
    </div>

    <footer class="preco-card__rodape">
      <span><i class="bi bi-database"></i> Fonte: {{ preco.fonte }} · {{ preco.periodicidade }}, não é tempo real</span>
      <router-link :to="`/dados-mercado/observaveis/${preco.observavel}`">Ver a série completa</router-link>
    </footer>
  </article>
</template>

<style scoped>
.preco-card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  height: 100%;
  border: 1px solid var(--p-content-border-color);
  border-radius: 16px;
  padding: 1rem 1.15rem;
  background: var(--p-content-background);
}

.preco-card__topo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.preco-card__titulo {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}

.preco-card__serie select {
  min-width: 12rem;
}

.preco-card__contrato {
  margin: -0.2rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.preco-card__corpo {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  align-items: center;
}

.preco-card__grafico {
  min-width: 0;
  border-radius: 12px;
  background: var(--p-content-hover-background);
  padding: 0.25rem;
}

.preco-card__valor {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.preco-card__numero {
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
}

.preco-card__unidade {
  font-size: 0.95rem;
  color: var(--p-text-muted-color);
}

.preco-card__data {
  margin-top: 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  white-space: nowrap;
}

.preco-card__variacoes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(5.5rem, 1fr));
  margin: 0;
  padding: 0.5rem 0;
  list-style: none;
  border-radius: 12px;
  background: var(--p-content-hover-background);
}
.preco-card__variacoes li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
}
.preco-card__variacoes li:not(:last-child) {
  border-right: 1px solid var(--p-content-border-color);
}

.preco-card__variacao-rotulo {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--p-text-muted-color);
}

.preco-card__variacao-valor {
  font-size: 0.9rem;
  font-weight: 700;
  white-space: nowrap;
}
.preco-card__variacao-valor--alta {
  color: var(--p-green-600, #16a34a);
}
.preco-card__variacao-valor--queda {
  color: var(--p-red-600, #dc2626);
}
.preco-card__variacao-valor--estavel {
  color: var(--p-text-muted-color);
}

.preco-card__nota {
  margin: 0;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.preco-card__aviso {
  margin: 0;
  font-size: 0.8rem;
  color: var(--p-orange-600, #ea580c);
}

.preco-card__vazio {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 1.5rem 0;
  text-align: center;
  color: var(--p-text-muted-color);
}

.preco-card__rodape {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-top: auto;
  padding-top: 0.5rem;
  border-top: 1px solid var(--p-content-border-color);
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}
.preco-card__rodape a {
  color: var(--p-primary-color);
  text-decoration: none;
}
.preco-card__rodape a:hover {
  text-decoration: underline;
}

@media (max-width: 575.98px) {
  .preco-card__corpo {
    grid-template-columns: 1fr;
  }
  .preco-card__valor {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
