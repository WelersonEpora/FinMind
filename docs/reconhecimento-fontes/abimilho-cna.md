# Abimilho e CNA — reconhecimento (nível 1, sem coletor)

**Data:** 2026-09-24. **Situação:** reconhecidas; **nenhuma das duas gera dado primário de milho**: tudo o que
publicam é número de outra fonte (já coletada pelo FinMind, ou comercial). **Recomendação: não implementar**
(ver no fim).

O relatório FEL 1 descreve: "Abimilho: estatísticas e panorama do setor de milho, periódico, consulta online,
HTML/PDF" e "CNA Brasil: panorama do setor agropecuário, periódico, API, PDF/HTML" (p. 10, 13 e 14). Pergunta que
guiou o reconhecimento: **existe API, ou o mesmo dado sai de outra fonte com API** (como a CEPEA pela B3, ADR 0021)?

## Abimilho (`www.abimilho.com.br`)

| # | Pergunta | Resposta (evidência de 2026-09-24) |
|---|---|---|
| 1 | API oficial? | **Não.** Site PHP institucional; a página "Estatísticas" só embute um **painel Power BI público** |
| 2 | Pública ou autenticada? | Pública. **O certificado HTTPS venceu em 2026-06-21** (Let's Encrypt, não renovado): `curl`/navegador recusam sem ignorar o certificado |
| 3 | Cadastro ou chave? | Nenhum |
| 4 | Formato | HTML (tabela estática de consumo) e Power BI (a consulta interna do Power BI público não é interface publicada) |
| 5 | Documentação | Nenhuma |
| 6 | Histórico | Painel com 3 páginas: **Brasil** (O&D do milho, produção e área por safra, adoção de biotecnologia), **Comércio exterior** (exportação mensal e por destino) e **Mundo** (O&D global, produção e área por país). Páginas antigas, fora do menu mas no ar: congeladas em **jan/2020** |
| 7 | Revisa? | Não se aplica: o painel está parado. Modelo do Power BI com atualização **desligada** (`refreshEnabled: false`); última carga **2024-11-12**. Tabela "Consumo" (moagem seca/úmida, etanol, humano) só de **2024, atualizada em jan/2024** |
| 8 | Publicação | Irregular; nada novo desde nov/2024 |
| 9 | Limite de requisições | Não verificado |
| 10 | Licença | Não publicada ("todos os direitos reservados") |
| 11 | Riscos | **Todos os números vêm de outra fonte**, citada no próprio painel: Secex (= Comex Stat, já coletado, ADR 0013), Conab (ADR 0017), USDA (= WASDE/PSD, ADRs 0014/0015), Sindirações e **Céleres** (consultoria comercial: estimativas de O&D e adoção de biotecnologia). Site sem manutenção (certificado vencido, banners de 2024) |

## CNA — Confederação da Agricultura e Pecuária do Brasil (`cnabrasil.org.br`)

| # | Pergunta | Resposta (evidência de 2026-09-24) |
|---|---|---|
| 1 | API oficial? | **Não encontrada** (o "API" do relatório não se confirma). Site Craft CMS; publicações em PDF |
| 2 | Pública ou autenticada? | Pública; `robots.txt` só bloqueia `/cpresources/` |
| 3 | Cadastro ou chave? | Nenhum |
| 4 | Formato | PDF, link na página de cada publicação (`/storage/arquivos/files/...pdf`) |
| 5 | Documentação | Nenhuma para dados |
| 6 | Histórico | Três publicações com milho: **Panorama do Agro** (semanal, ed. 33 de 14–18/09/2026: resumo institucional e de mercado); **VBP da agropecuária** (mensal: produção × preço por produto, com projeção do ano); **Campo Futuro** (custo de produção por propriedade modal, banco desde 2007, painéis anuais atualizados mensalmente; boletins regionais anuais e "Ativos do Campo" mensal) |
| 7 | Revisa? | O VBP revisa mês a mês a projeção do ano (cada PDF é uma edição); não medido |
| 8 | Publicação | Semanal (Panorama), mensal (VBP, Ativos do Campo), anual (boletins do Campo Futuro) |
| 9 | Limite de requisições | Não verificado |
| 10 | Licença | Não verificada |
| 11 | Riscos | **Nada primário de milho:** o VBP do milho é produção da **Conab** × preço da **Cepea** (notas do próprio PDF, set/2026); o Panorama comenta o Indicador Esalq/B3 (já coletado, ADR 0021). O custo do **Campo Futuro** para grãos é levantado pela **Cepea** e só sai em PDF/livro, sem planilha ou API encontrada |

## Existe o mesmo dado em outra fonte com API?

| Dado da Abimilho/CNA | Fonte primária | No FinMind |
|---|---|---|
| Exportação (total e por destino) | Secex/Comex Stat | Total: **sim** (ADR 0013). **Por destino: não**, mas a mesma API do coletor atual traz o país: `details: ["country"]` devolveu **97 destinos em 2025** (NCM 10059010; Irã 9,1 Mt, Egito 7,6 Mt, Vietnã 4,3 Mt, Arábia Saudita 2,0 Mt, China 1,9 Mt), chamada real de 2026-09-24. É a lacuna do fator 8 do milho ("política comercial/China"), sem precisar da Abimilho |
| Produção, área, produtividade por safra | Conab | **Sim** (ADR 0017) |
| O&D mundial, produção por país | USDA | **Sim** (WASDE, ADR 0015) |
| O&D Brasil, adoção de biotecnologia | Céleres | Não: comercial, fora do escopo |
| Consumo por destino (ração, etanol, humano) | Abimilho/Sindirações | Não; a Abimilho só tem 2024. O consumo total vem do balanço da Conab |
| VBP do milho | Conab × Cepea | Os dois componentes: sim. O VBP é um cálculo (fator), não um observável |
| Preço (Panorama) | Cepea/B3 | **Sim** (ADR 0021) |
| Custo de produção fora de MT (Campo Futuro) | Cepea | Não: só PDF anual; o site da Cepea bloqueia automação. É a lacuna do fator 6 do milho, que segue aberta |

## Recomendação

**Não implementar nenhuma das duas.** O FEL 1 as trata como "panorama do setor", e é isso que são: leitura
humana, não série. Tudo o que tem número já vem da fonte primária com vintage. O único ganho real apontado pelo
reconhecimento está em **outra** fonte: a **exportação por país de destino no Comex Stat** (mesma API do coletor
atual), que cobriria parte do fator "Política comercial/exportações — China" — decisão do Comitê, fora deste
reconhecimento.

## Fontes

- Abimilho — Estatísticas: https://www.abimilho.com.br/estatisticas
- CNA — Panorama do Agro, ed. 33: https://cnabrasil.org.br/publicacoes/panorama-do-agro-ed33
- CNA — VBP da agropecuária (set/2026): https://cnabrasil.org.br/publicacoes/vbp-da-agropecuaria-deve-cair-4-em-2026
- CNA — Projeto Campo Futuro: https://cnabrasil.org.br/projetos-e-programas/campo-futuro
