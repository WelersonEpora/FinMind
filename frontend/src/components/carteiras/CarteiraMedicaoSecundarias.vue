<script setup>
import { computed } from 'vue'
import { classeSinal, formatarMoeda, formatarR, formatarRetorno, nomeAtivo, nomeTrilha, rotulo } from '../../utils/carteiras.js'

// As métricas secundárias da medição (ADR 0127, §10; etapa 7b): descritivas, sem veredito. Explicam a pergunta
// principal, não decidem nada. Três blocos recolhíveis: a atribuição, o painel das trilhas e as métricas da Cartilha.
const props = defineProps({
  secundarias: { type: Object, required: true },
  moeda: { type: String, required: true },
  minimoDias: { type: Number, required: true }
})

const N2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const N0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const numero = (v) => (v == null ? '—' : N2.format(v))
const pct = (v) => (v == null ? '—' : `${N0.format(v)}%`)
const pctDe = (parte, total) => (total ? `${N0.format((parte / total) * 100)}%` : '—')

const a = computed(() => props.secundarias.atribuicao)
const comOperacoes = computed(() => props.secundarias.cartilha.filter((t) => t.total.operacoes > 0 || t.aderencia?.entradas))
</script>

<template>
  <div class="mb-3">
    <h3 class="h6 mb-1">Métricas secundárias (descritivas)</h3>
    <p class="small text-muted mb-2">
      Ajudam a entender o resultado acima, mas não decidem nada e não têm veredito. Contam só o segmento em vigor. Com
      poucas semanas, quase tudo aqui é ruído.
    </p>

    <!-- 1. A atribuição -->
    <details class="card mb-2">
      <summary class="card-header small fw-semibold">De onde vem a diferença IA − Determinística</summary>
      <div class="card-body small">
        <h4 class="h6 small fw-semibold">Dias com posições diferentes</h4>
        <p class="mb-3">
          Em <strong>{{ a.divergentes.divergentes }}</strong> de {{ a.divergentes.dias }} dias medidos, as duas trilhas carregavam posições
          diferentes (outro ativo ou outro lado). Nesses dias, a diferença somou
          <strong :class="classeSinal(a.divergentes.acumuladaDivergentes)">{{ formatarRetorno(a.divergentes.acumuladaDivergentes) }}</strong>; nos
          outros, <span :class="classeSinal(a.divergentes.acumuladaIguais)">{{ formatarRetorno(a.divergentes.acumuladaIguais) }}</span>
          (as mesmas posições, com preço de entrada, quantidade ou saída diferentes).
        </p>

        <h4 class="h6 small fw-semibold">Por ativo</h4>
        <div class="table-responsive mb-3">
          <table class="table table-sm mb-0">
            <thead>
              <tr><th>Ativo</th><th class="text-end">IA</th><th class="text-end">Determinística</th><th class="text-end">Diferença</th></tr>
            </thead>
            <tbody>
              <tr v-for="l in a.porAtivo" :key="l.ativo ?? 'caixa'">
                <td>{{ l.ativo ? nomeAtivo(l.ativo) : 'Rendimento do caixa' }}</td>
                <td class="text-end">{{ formatarRetorno(l.ia) }}</td>
                <td class="text-end">{{ formatarRetorno(l.det) }}</td>
                <td class="text-end fw-semibold" :class="classeSinal(l.diferenca)">{{ formatarRetorno(l.diferenca) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h4 class="h6 small fw-semibold">Recomendações contrárias à leitura</h4>
        <p class="mb-3">
          A recomendação foi contra a tendência do MÉDIO em <strong>{{ a.contrarias.dias }}</strong> dia(s) ({{ a.contrarias.ramos }} ramo(s)). A trilha IA
          aplicou {{ a.contrarias.entradas }} entrada(s) e {{ a.contrarias.manutencoes }} manutenção(ões) contra a leitura.
          <template v-if="a.contrarias.resultado.encerradas">
            Das entradas, {{ a.contrarias.resultado.encerradas }} encerrada(s), {{ a.contrarias.resultado.acertos }} com ganho, resultado de
            <span :class="classeSinal(a.contrarias.resultado.resultadoPct)">{{ formatarRetorno(a.contrarias.resultado.resultadoPct) }}</span> do capital
            ({{ formatarR(a.contrarias.resultado.rMedio) }} em média).
          </template>
          <template v-else-if="a.contrarias.entradas">Nenhuma dessas operações foi encerrada ainda.</template>
        </p>

        <h4 class="h6 small fw-semibold">Cortes do motor</h4>
        <p v-if="!a.cortes.length" class="mb-3">O motor não barrou nenhuma intenção no segmento.</p>
        <ul v-else class="mb-3 ps-3">
          <li v-for="c in a.cortes" :key="c.tipo">
            <strong>{{ nomeTrilha(c.tipo) }}</strong>: {{ c.total }} barrada(s) —
            <span v-for="(n, motivo, i) in c.motivos" :key="motivo">{{ i ? '; ' : '' }}{{ rotulo(motivo) }} ({{ n }})</span>
          </li>
        </ul>

        <h4 class="h6 small fw-semibold">Consistência da réplica semanal</h4>
        <p class="mb-0">
          <template v-if="!a.consistencia.replicas">Nenhuma réplica no segmento ainda (uma por semana).</template>
          <template v-else>
            {{ a.consistencia.replicas }} réplica(s), {{ a.consistencia.comparaveis }} comparável(is) (a do dia e a réplica válidas). A réplica repetiu
            <strong>{{ a.consistencia.acoesIguais }} de {{ a.consistencia.acoes }}</strong> ações ({{ pctDe(a.consistencia.acoesIguais, a.consistencia.acoes) }}) e
            {{ a.consistencia.prioridadesIguais }} de {{ a.consistencia.prioridades }} prioridades. Os dias em fallback estão no custo da IA, acima.
          </template>
        </p>
      </div>
    </details>

    <!-- 2. O painel das trilhas -->
    <details class="card mb-2">
      <summary class="card-header small fw-semibold">As seis trilhas lado a lado</summary>
      <div class="card-body small">
        <div class="table-responsive">
          <table class="table table-sm mb-2">
            <thead>
              <tr>
                <th>Trilha</th>
                <th class="text-end">Retorno</th>
                <th class="text-end">Volatilidade (ano)</th>
                <th class="text-end">Sharpe</th>
                <th class="text-end">Maior recuo</th>
                <th class="text-end">Tempo exposto</th>
                <th class="text-end">Custos</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="t in secundarias.painel" :key="t.tipo">
                <td>{{ nomeTrilha(t.tipo) }}</td>
                <td class="text-end" :class="classeSinal(t.retornoPct)">{{ formatarRetorno(t.retornoPct) }}</td>
                <td class="text-end">{{ t.volatilidadePct == null ? '—' : `${numero(t.volatilidadePct)}%` }}</td>
                <td class="text-end">{{ numero(t.sharpe) }}</td>
                <td class="text-end" :class="{ 'text-danger fw-semibold': t.limiteDrawdownPct != null && -t.maiorRecuoPct >= t.limiteDrawdownPct }">
                  {{ formatarRetorno(t.maiorRecuoPct) }}
                  <span v-if="t.limiteDrawdownPct != null" class="text-muted">/ {{ N0.format(t.limiteDrawdownPct) }}%</span>
                </td>
                <td class="text-end">{{ pct(t.tempoExpostoPct) }}</td>
                <td class="text-end">{{ formatarMoeda(t.custos, moeda) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="secundarias.iaMenosPersistencia" class="mb-2">
          <strong>IA − Persistência:</strong>
          <span :class="classeSinal(secundarias.iaMenosPersistencia.acumulada)">{{ formatarRetorno(secundarias.iaMenosPersistencia.acumulada) }}</span>
          em {{ secundarias.iaMenosPersistencia.dias }} dias. Responde a outra pergunta: a IA inteira (as leituras e a recomendação) rende mais que
          uma regra sem nenhuma IA? Só o número, sem intervalo nem veredito.
        </p>
        <p class="text-muted mb-0">
          Retorno em % do capital inicial, desde o início do segmento. A volatilidade e o Sharpe são anualizados (√252) e aparecem com
          {{ minimoDias }} dias; o Sharpe é sobre o rendimento da trilha Caixa (a Selic, ou a meta do Fed na conta internacional). O maior recuo
          aparece contra o limite de drawdown da Cartilha. Tempo exposto: os dias com alguma posição carregada de um ajuste para o outro.
        </p>
      </div>
    </details>

    <!-- 3. As métricas da Cartilha -->
    <details class="card mb-2">
      <summary class="card-header small fw-semibold">Métricas da Cartilha, por trilha e ativo</summary>
      <div class="card-body small">
        <p v-if="!comOperacoes.length" class="mb-0">Nenhuma operação no segmento ainda.</p>
        <template v-else>
          <div class="table-responsive">
            <table class="table table-sm mb-2">
              <thead>
                <tr>
                  <th>Trilha / ativo</th>
                  <th class="text-end">Operações</th>
                  <th class="text-end">Encerradas</th>
                  <th class="text-end">Acerto</th>
                  <th class="text-end">Resultado médio</th>
                  <th class="text-end">R:R realizado</th>
                  <th class="text-end">R:R planejado</th>
                  <th class="text-end">Resultado</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="t in comOperacoes" :key="t.tipo">
                  <tr class="fw-semibold">
                    <td>
                      {{ nomeTrilha(t.tipo) }}
                      <span v-if="t.aderencia" class="fw-normal text-muted">
                        · aderência ao checklist {{ t.aderencia.aderentes }} de {{ t.aderencia.entradas }}
                      </span>
                    </td>
                    <td class="text-end">{{ t.total.operacoes }}</td>
                    <td class="text-end">{{ t.total.encerradas }}</td>
                    <td class="text-end">{{ pct(t.total.acertoPct) }}</td>
                    <td class="text-end">{{ formatarR(t.total.rMedio) }}</td>
                    <td class="text-end">{{ numero(t.total.rrRealizado) }}</td>
                    <td class="text-end">{{ numero(t.total.rrPlanejado) }}</td>
                    <td class="text-end" :class="classeSinal(t.total.resultadoPct)">{{ formatarRetorno(t.total.resultadoPct) }}</td>
                  </tr>
                  <tr v-for="l in t.porAtivo.filter((x) => x.operacoes)" :key="`${t.tipo}-${l.ativo}`">
                    <td class="ps-4">{{ nomeAtivo(l.ativo) }}</td>
                    <td class="text-end">{{ l.operacoes }}</td>
                    <td class="text-end">{{ l.encerradas }}</td>
                    <td class="text-end">{{ pct(l.acertoPct) }}</td>
                    <td class="text-end">{{ formatarR(l.rMedio) }}</td>
                    <td class="text-end">{{ numero(l.rrRealizado) }}</td>
                    <td class="text-end">{{ numero(l.rrPlanejado) }}</td>
                    <td class="text-end" :class="classeSinal(l.resultadoPct)">{{ formatarRetorno(l.resultadoPct) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <p class="text-muted mb-0">
            As operações que entraram no segmento. Acerto: as encerradas com ganho. R:R realizado: o ganho médio em R sobre a perda média em R
            (precisa de ganhos e perdas); o planejado é o alvo 2 em R. Resultado: o das encerradas, em % do capital inicial. A aderência conta as
            entradas do operador (sem as canceladas) com os 8 itens do checklist marcados.
          </p>
        </template>
      </div>
    </details>
  </div>
</template>
