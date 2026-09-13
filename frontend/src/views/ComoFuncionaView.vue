<script setup>
import AppShell from '../components/layout/AppShell.vue'

const steps = [
  {
    color: '#3B82F6',
    bg: '#EFF6FF',
    detailBg: '#DBEAFE',
    icon: 'bi-database',
    title: 'Coleta de dados',
    description: 'Reunimos dados de diversas fontes do mercado financeiro em tempo real e histórico.',
    listTitle: 'Exemplos de fontes',
    items: ['Preços e cotações', 'Volume e book de ofertas', 'Indicadores econômicos', 'Notícias e eventos', 'Dados alternativos']
  },
  {
    color: '#22C55E',
    bg: '#F0FDF4',
    detailBg: '#DCFCE7',
    icon: 'bi-gear',
    title: 'Preparação e estruturação',
    description: 'Tratamos, organizamos e enriquecemos os dados para que estejam prontos para análise.',
    listTitle: 'Processos aplicados',
    items: ['Limpeza e normalização', 'Cálculo de indicadores', 'Agregação temporal', 'Validação de qualidade', 'Armazenamento seguro']
  },
  {
    color: '#F97316',
    bg: '#FFF7ED',
    detailBg: '#FFEDD5',
    icon: 'bi-bar-chart-line',
    title: 'Motor analítico',
    description: 'Aplicamos regras, cálculos e modelos definidos por especialistas para gerar subsídios para a análise.',
    listTitle: 'Inclui',
    items: ['Indicadores técnicos', 'Indicadores fundamentais', 'Regras de estratégia', 'Contexto de mercado', 'Tratamento de cenários']
  },
  {
    color: '#8B5CF6',
    bg: '#F5F3FF',
    detailBg: '#EDE9FE',
    icon: 'bi-cpu',
    title: 'Inteligência Artificial',
    description: 'A IA analisa os dados estruturados, identifica padrões, interpreta informações e produz uma síntese clara e objetiva.',
    listTitle: 'A IA pode',
    items: ['Interpretar notícias', 'Contextualizar cenários', 'Destacar oportunidades', 'Identificar riscos', 'Explicar as análises']
  },
  {
    color: '#14B8A6',
    bg: '#F0FDFA',
    detailBg: '#CCFBF1',
    icon: 'bi-clipboard-check',
    title: 'Avaliação e resultado',
    description: 'O sistema interpreta a saída da IA, aplica critérios de validação e gera um resultado estruturado.',
    listTitle: 'Resultados possíveis',
    items: ['Análises e relatórios', 'Sinais operacionais (futuros)', 'Alertas e recomendações', 'Justificativas e riscos', 'Rastreabilidade completa']
  },
  {
    color: '#2563EB',
    bg: '#EFF6FF',
    detailBg: '#DBEAFE',
    icon: 'bi-send',
    title: 'Ação (futuro)',
    description: 'Com base nos resultados validados, o sistema poderá apoiar a tomada de decisão e, futuramente, executar operações de forma automática, sempre com controles de risco.',
    listTitle: 'Modos de operação',
    items: ['Análise assistida', 'Simulação (paper trade)', 'Execução automática (futuro)', 'Gestão de risco', 'Monitoramento contínuo']
  }
]
</script>

<template>
  <AppShell>
    <div class="row g-3 align-items-stretch mb-4">
      <div class="col-lg-7 d-flex flex-column justify-content-center">
        <h1 class="display-6 fw-bold mb-2">Como o FinMind funciona</h1>
        <p class="text-muted mb-0">
          Do dado ao insight. Um processo estruturado para transformar informações do mercado financeiro em análises
          claras, objetivas e acionáveis.
        </p>
      </div>

      <div class="col-lg-5">
        <div class="card h-100" style="background-color: #EFF6FF; border: 1.5px solid #3B82F6">
          <div class="card-body d-flex align-items-center gap-3">
            <i class="bi bi-bullseye flex-shrink-0" style="font-size: 2.5rem; color: #1B3A6B" aria-hidden="true"></i>
            <div>
              <h2 class="h5 fw-bold mb-1">Nosso propósito</h2>
              <p class="mb-0 text-body-secondary">
                Combinar dados, tecnologia e inteligência para apoiar melhores decisões no mercado financeiro.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div v-for="(step, index) in steps" :key="step.title" class="col-12 col-sm-6 col-lg-4 col-xl-2 position-relative">
        <span
          class="finmind-step-badge text-white fw-bold d-inline-flex align-items-center justify-content-center"
          :style="{ backgroundColor: step.color }"
        >{{ index + 1 }}</span>

        <span
          v-if="index < steps.length - 1"
          class="finmind-step-arrow d-none d-xl-flex align-items-center justify-content-center"
        >
          <i class="bi bi-arrow-right"></i>
        </span>

        <div class="card h-100 finmind-step-card" :style="{ backgroundColor: step.bg, borderColor: step.color }">
          <div class="card-body d-flex flex-column">
            <div class="text-center mb-3">
              <i class="bi finmind-step-icon" :class="step.icon" :style="{ color: step.color }"></i>
            </div>

            <h3 class="h6 mb-2">{{ step.title }}</h3>
            <p class="text-body-secondary small mb-3">{{ step.description }}</p>

            <div class="finmind-step-detail mt-auto" :style="{ backgroundColor: step.detailBg }">
              <div class="text-uppercase small fw-semibold mb-1 text-dark">{{ step.listTitle }}</div>
              <ul class="small text-body-secondary ps-3 mb-0">
                <li v-for="item in step.items" :key="item">{{ item }}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3">
      <div class="col-12 col-lg-6">
        <div class="card h-100">
          <div class="card-body d-flex align-items-start gap-3">
            <i class="bi bi-diagram-3 flex-shrink-0" style="font-size: 1.5rem; color: #1B3A6B"></i>
            <div>
              <h2 class="h6 mb-1">Tudo integrado, de ponta a ponta</h2>
              <p class="mb-0 text-body-secondary small">
                O FinMind foi projetado para ser modular, seguro e escalável, permitindo evoluir conforme as
                estratégias e necessidades do mercado. Cada etapa do processo é registrada, garantindo transparência
                e rastreabilidade.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-lg-6">
        <div class="card h-100 border-0" style="background-color: #F0FDF4">
          <div class="card-body d-flex align-items-start gap-3">
            <i class="bi bi-shield-check flex-shrink-0" style="font-size: 1.5rem; color: #16A34A"></i>
            <div>
              <h2 class="h6 mb-1">Importante</h2>
              <p class="mb-0 text-body-secondary small">
                O FinMind é uma ferramenta de apoio à decisão. Os resultados devem sempre ser analisados com
                responsabilidade e dentro da sua estratégia e perfil de risco.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.finmind-step-card {
  border-width: 1.5px;
  border-style: solid;
}

.finmind-step-badge {
  position: absolute;
  top: -14px;
  left: 28px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 0.9rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  z-index: 2;
}

.finmind-step-icon {
  font-size: 2.5rem;
  line-height: 1;
}

.finmind-step-detail {
  border-radius: 8px;
  padding: 0.75rem 0.9rem;
}

.finmind-step-arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  right: -14px;
  z-index: 3;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  color: #475569;
  font-size: 1.25rem;
}
</style>
