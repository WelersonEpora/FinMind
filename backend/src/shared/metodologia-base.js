"use strict";

const { FATORES } = require("./fatores-fel1");

// A estrutura comum da metodologia dos fatores de um ativo (ADR 0050): cada ativo tem um módulo só com as definições
// dos fatores (`metodologia-<ativo>.js`), e este monta o que a tela e o motor usam. Uma definição tem:
//   codigo   - o código do fator no catálogo do FEL 1 (`fatores-fel1.js`), de onde vêm o nome e o peso.
//   fel1     - o que o David escreveu no FEL 1 (a tabela "Fatores de Influência de Preço" do ativo), sem reescrever:
//              tipo, direção do impacto, mecanismo de transmissão e fonte.
//   dados    - o que o FinMind já coleta para o fator (cards do catálogo de observáveis) e as lacunas conhecidas.
//              É fato, não proposta. `avaliacao` (opcional): se o dado basta para o fator, com a evidência do histórico
//              (o FEL 1 foi escrito com apoio de IA: um requisito dele pode não ser necessário).
//   proposta - um rascunho do fator nas três camadas do motor (STATUS_DO_PROJETO.md, §5): a medida (A. Medir), a
//              comparação (B. Ler) e um esboço da leitura (C. Decidir, só o Comitê), escrito para abrir caminho e ser
//              corrigido. Fica com `situacao: "PROPOSTA"` até o David validar; aí vira "VALIDADA"
//              com a data e a referência da validação (no ADR).
//   perguntas - o que o David precisa decidir para a proposta virar regra.
//   nome     - (opcional) o título do fator quando o dado usado é mais estreito que o nome da planilha (ex.: o FEL 1
//              diz "Demanda global", o cálculo usa só os EUA). O título diz exatamente o que entra no cálculo; o nome
//              do FEL 1 continua na resposta (`nomeFel1`) e no bloco do especialista na tela.
//   evento   - (opcional) { janelaDias }: FATOR DE EVENTO, sem cálculo. O resultado dele são os eventos aceitos da
//              leitura diária marcados com ele nessa janela (geopolitica.service.js::obterEventosDoFator), o bloco que
//              vai ao prompt da IA do ativo como está.
//   contextoDe - (opcional) o código de outro fator do mesmo ativo: FATOR DE CONTEXTO, por decisão do especialista. O
//              cálculo (A e B) continua e vai ao prompt, mas sem leitura própria (nem pressão, nem intensidade): ele
//              explica o outro fator e não conta a favor nem contra (ex.: a inflação do ouro, contexto do juro real,
//              ADR 0054).
//   decisoes - (opcional) o que o especialista já decidiu sobre o fator, com a data e o ADR: sai das `perguntas`.
// O cálculo de um fator (camadas A, B e C simulada) fica em `factors/` e é ligado a ele em metodologia-ativo.service.js.

const SITUACAO = { PROPOSTA: "PROPOSTA", VALIDADA: "VALIDADA" };

// As definições de um ativo -> os fatores com o nome e o peso do FEL 1. Um código fora do catálogo, ou de outro
// ativo, é erro de programação.
function montarFatores(ativo, definicoes) {
  return definicoes.map((definicao) => {
    const fator = FATORES.find((item) => item.codigo === definicao.codigo);
    if (!fator || fator.ativo !== ativo) throw new Error(`Fator ausente no catálogo do FEL 1 para ${ativo}: ${definicao.codigo}`);
    if (definicao.contextoDe && !definicoes.some((outra) => outra.codigo === definicao.contextoDe && !outra.contextoDe)) {
      throw new Error(`${definicao.codigo}: contexto de um fator que não está no ativo (ou que também é contexto): ${definicao.contextoDe}`);
    }
    return {
      codigo: fator.codigo,
      nome: definicao.nome || fator.nome,
      nomeFel1: fator.nome,
      peso: fator.peso,
      fel1: definicao.fel1,
      dados: definicao.dados,
      proposta: { situacao: SITUACAO.PROPOSTA, ...definicao.proposta },
      perguntas: definicao.perguntas,
      decisoes: definicao.decisoes || [],
      evento: definicao.evento || null,
      contextoDe: definicao.contextoDe || null
    };
  });
}

// A metodologia de um ativo, como o serviço a entrega: `versao` sobe quando uma definição muda (vai com cada prompt).
function montarMetodologia({ ativo, nome, versao, dataVersao, fatores }) {
  return { ativo, nome, versao, dataVersao, fatores };
}

module.exports = { SITUACAO, montarFatores, montarMetodologia };
