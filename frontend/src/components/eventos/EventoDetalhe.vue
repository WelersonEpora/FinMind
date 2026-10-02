<script setup>
import Button from 'primevue/button'
import PressaoIndicador from './PressaoIndicador.vue'
import { pressao, rotuloAtivo, rotuloGrau, rotuloFonte, rotuloAssunto, rotuloTipo } from '../../utils/geopolitica.js'

// Detalhe de um evento da leitura de geopolítica (ADR 0047): a expansão da linha na tela Eventos e o modal do card
// no Centro de Decisão. Um só componente, para as duas telas nunca mostrarem o evento de jeitos diferentes.
defineProps({
  evento: { type: Object, required: true },
  // Botão "Ver prompt e resposta da IA" (só na tela Eventos, que tem o modal da IA).
  comIa: { type: Boolean, default: false }
})

const emit = defineEmits(['ver-ia'])
</script>

<template>
  <div class="evento-detalhe">
    <h3 class="evento-detalhe__titulo">{{ evento.titulo }}</h3>

    <dl class="evento-detalhe__meta">
      <div><dt>Assunto</dt><dd>{{ rotuloAssunto(evento.assunto) }}</dd></div>
      <div><dt>Tipo</dt><dd>{{ rotuloTipo(evento.tipo) }}</dd></div>
      <div><dt>Ativo</dt><dd>{{ rotuloAtivo(evento.ativo) }}</dd></div>
      <div><dt>Pressão sobre o preço</dt><dd><PressaoIndicador :codigo="evento.pressao" /></dd></div>
      <div><dt>Intensidade</dt><dd>{{ rotuloGrau(evento.intensidade) }}</dd></div>
      <div><dt>Confiança</dt><dd>{{ rotuloGrau(evento.confianca) }}</dd></div>
      <div><dt>Ordem no dia</dt><dd>{{ evento.ordem }}º</dd></div>
    </dl>
    <p v-if="pressao(evento.pressao)" class="evento-detalhe__nota">
      A pressão é para que lado este fato, sozinho e com o resto constante, empurra o preço. Não é previsão: o preço pode
      ir para o outro lado por juros, dólar ou outros fatores.
    </p>

    <div class="evento-detalhe__bloco">
      <h4>Resumo</h4>
      <p>{{ evento.resumo || '—' }}</p>
    </div>
    <div class="evento-detalhe__bloco">
      <h4>Canal de transmissão</h4>
      <p>{{ evento.canalTransmissao || '—' }}</p>
    </div>
    <div class="evento-detalhe__bloco">
      <h4>Fontes</h4>
      <ul v-if="evento.fontes.length" class="evento-detalhe__fontes">
        <li v-for="(fonte, i) in evento.fontes" :key="i">
          <!-- No evento, a fonte só é citada pelo nome; o link dos sites fica em "Fonte e metodologia" da tela Eventos.
               O único link aqui é o do próprio evento: a página que a pesquisa leu (origem "pesquisa"). -->
          <span class="evento-detalhe__fonte-nome">{{ rotuloFonte(fonte) }}</span>
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
            class="evento-detalhe__fonte-url"
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
    <div v-if="comIa" class="evento-detalhe__ia">
      <Button
        label="Ver prompt e resposta da IA"
        icon="pi pi-code"
        text
        size="small"
        title="O que foi enviado à IA e o que ela respondeu nesta leitura (comum a todos os eventos do dia)"
        @click="emit('ver-ia', evento)"
      />
    </div>
  </div>
</template>

<style scoped>
.evento-detalhe__nota {
  margin: -0.4rem 0 0.9rem;
  font-size: 0.75rem;
  color: var(--p-text-muted-color);
}

.evento-detalhe__titulo {
  margin: 0 0 0.85rem;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.4;
}

.evento-detalhe__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1.75rem;
  margin: 0 0 0.9rem;
  padding-bottom: 0.9rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.evento-detalhe__meta dt {
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--p-text-muted-color);
}

.evento-detalhe__meta dd {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.evento-detalhe__bloco:not(:last-child) {
  margin-bottom: 0.9rem;
}

.evento-detalhe__bloco h4 {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  color: var(--p-text-muted-color);
}

.evento-detalhe__bloco p {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
}

.evento-detalhe__fontes {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.85rem;
}

.evento-detalhe__fontes a {
  color: var(--p-primary-color);
  text-decoration: none;
  overflow-wrap: anywhere;
}

.evento-detalhe__fontes a:hover {
  text-decoration: underline;
}

.evento-detalhe__fonte-nome {
  font-weight: 600;
}

/* A URL também é link (cor de link, herdada de .evento-detalhe__fontes a): clicar no nome ou no endereço abre a página. */
.evento-detalhe__fonte-url {
  display: block;
  font-size: 0.72rem;
  overflow-wrap: anywhere;
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
.fonte-tag--alerta {
  color: var(--p-orange-600, #ea580c);
  border-color: currentColor;
}
.fonte-tag--autorizada {
  color: var(--p-green-600, #16a34a);
  border-color: currentColor;
}

.evento-detalhe__ia {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--p-content-border-color);
}
</style>
