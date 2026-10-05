# Café — viabilidade das fontes novas pedidas pelo Motor do Café v1

**Data:** 2026-10-04. Linha do índice: `docs/reconhecimento-fontes/README.md`. Metodologia do café: ADR 0060.

**Desfecho (2026-10-04):** o Comitê autorizou a ordem sugerida no fim deste documento. As sacas aguardando
classificação da ICE, o relatório mensal da ICO (tabelas 1 e 5) e os portos europeus da ECF foram implementados no ADR
0061, só como dado. O INMET espera o índice do David; o diário da ICE, orçamento e licença. **Correção:** a carga
completa da ICO mostrou que ela revisa (127 revisões em 167 relatórios, inclusive erros de digitação corrigidos no mês
seguinte); a linha 7 da tabela da §2 vale só para os 11 meses comparados.

**Pedido do usuário (Welerson, 2026-10-04):** um estudo de viabilidade das fontes que o Motor do Café v1 pede e que o
FinMind não coleta. **Limite:** só reconhecimento (nível 1). Nenhum coletor foi escrito. A aquisição continua encerrada
desde 2026-10-01: cada fonte só entra com autorização própria, registrada num ADR.

Tudo abaixo foi conferido com chamada real nesta data: download, leitura do conteúdo e dos termos. O que não deu para
confirmar fica como incerteza.

## Resumo

| Fonte | Para quê (fator) | Acesso | Custo | Viabilidade | Recomendação |
|---|---|---|---|---|---|
| ICE, sacas aguardando classificação (*pending grading*) | F3 | Já no arquivo da ICE que coletamos todo dia | Nenhum | **Alta** | **Fazer**: não é fonte nova, é ler um bloco a mais |
| ICO, *Coffee Market Report* (PDF mensal) | F6 (substituição e balanço por espécie), F3 (estoque de Londres), preço do KC e do robusta | PDF público desde ao menos 2012; reuso livre com citação | Nenhum | **Alta** (tabelas 1, 2, 4 e 5); média (tabela 3) | **Fazer primeiro**: cobre 4 pedidos do estudo de uma vez |
| ECF, estoques nos portos europeus | F3 (e F6) | PDF anual, atualizado a cada 2 meses; `robots.txt` liberado | Nenhum | **Média** | Fazer depois da ICO: PDF com erros, revisa, 2 meses de atraso |
| INMET (estações) | F1 (chuva, Tmin, frio, balanço hídrico) | ZIP anual por estação (2000 a 2026); a API de dados exige token | Nenhum | **Média, com custo alto de modelagem** | Só com a regra definida: o FinMind teria de construir o índice |
| Federação do Café da Colômbia (FNC) | Outras origens (§7): a maior origem de arábica lavado depois do Brasil | XLSX mensal, novo a cada mês | Nenhum | **Alta** (técnica); licença não lida | Fazer se o Comitê quiser outras origens: produção e exportação mensais desde os anos 1950 |
| ICE Futures Europe, robusta (preço diário e estoques) | F6 (substituição), §7 | Relatório no site, com termo de aceite | Site grátis; FTP US$ 2.500/ano; histórico US$ 50 por trimestre | Média: risco jurídico, o mesmo do ADR 0032 | A ICO mensal cobre o essencial; diário só se o Comitê pedir |
| ICE Futures U.S., preço do KC (diário) | Preço de referência do estudo | Relatório no site, com termo de aceite | Idem | Média: o mesmo risco | A ICO mensal (média de Nova York) basta para a v1 |
| Diferencial FOB (prêmio do café brasileiro sobre Nova York) | §7 | Sem fonte pública primária | Pago (corretoras) | **Baixa** | Não fazer; a ICO dá o diferencial entre grupos |
| GCA, ABIC, Somar, EarthDaily | §11.4 do estudo | Assinatura ou contrato | Pago | Baixa | O estudo já as marca como não homologadas |

**Achado principal:** o relatório mensal da ICO entrega, em PDF público e com reuso livre:

- o preço médio de Nova York e de Londres;
- a arbitragem entre os dois (a substituição de arábica por robusta, que o F6 pede);
- os estoques certificados de Londres (o robusta);
- o balanço mundial por espécie;
- as exportações por grupo.

São quatro dos pedidos do estudo numa fonte só, sem risco jurídico. E o bloco de *pending grading* já está no arquivo
da ICE que baixamos todo dia.

## 1. ICE — sacas aguardando classificação (*pending grading*)

**Não é fonte nova.** O XLS diário que o coletor do ADR 0032 já baixa traz, além das sacas certificadas, os blocos
*Transition Bags Certified*, a classificação do dia, *Pending Grading Report* e *Flagged for Rebagging*
(`cafe-mercado-mundial.md`). O parser lê só o total certificado.

- **O que falta:** ler o bloco *Pending Grading* (sacas aguardando classificação, por origem) e gravar como série nova.
  Mesma URL, mesmo `published_at` (real), mesmo histórico desde 2016 no servidor.
- **Riscos:** o layout do arquivo já mudou (portos, blocos auxiliares), então o bloco precisa ser achado pelo título,
  não por posição. O risco jurídico é o já aceito no ADR 0032.
- **Uso no F3:** a regra de alta do estudo pede "queda dos estoques certificados acompanhada de redução nos lotes
  pendentes de certificação".

## 2. ICO — *Coffee Market Report* (relatório mensal)

| # | Pergunta | Resposta (2026-10-04) |
|---|---|---|
| 1 | API oficial? | Não. A base estatística da ICO é só para membros ("Monthly trade statistics are available upon subscription", tabela 4) |
| 2–3 | Autenticação / chave | Público, sem cadastro |
| 4 | Formato | PDF, `https://www.ico.org/documents/cy<AAAA-AA>/cmr-<MMAA>-e.pdf` (agosto/2026: `cy2025-26/cmr-0826-e.pdf`, 17 páginas, 2,1 MB) |
| 5 | Documentação | Notas explicativas no próprio PDF (ex.: a tabela 3 usa o ano-café de outubro a setembro) |
| 6 | Histórico | Baixados: ago/2012, ago/2016, ago/2020, ago/2025, jul e ago/2026 (todos 200). Cada relatório traz 12 meses das tabelas 1, 2 e 5: um relatório por ano basta para o histórico mensal |
| 7 | Revisão | **Preços: não revisa.** Os 11 meses em comum nos relatórios de julho e agosto/2026 são idênticos nas tabelas 1 e 5. O balanço (tabela 3) é estimativa e deve revisar (não medido) |
| 8 | Publicação | `Last-Modified` do PDF: o de agosto/2026 em **2026-09-10**, uns 10 dias depois do fim do mês. O de setembro ainda não existia em 2026-10-04 |
| 9 | Limite | Não observado (6 downloads seguidos sem bloqueio) |
| 10 | Licença | Reuso livre com citação da ICO ("if the ICO is clearly acknowledged as the source", lido em 2026-09-28) |
| 11 | Riscos | **Layout muda entre anos.** Em 2016, a tabela 3 era a produção por ano-safra e a 6 o consumo; em 2026, a 3 é o resumo do balanço. Em julho/2026, o resumo do balanço não saiu no texto extraído. As tabelas 1, 2 e 5 se mantêm |

**O que cada tabela entrega** (agosto/2026, em US¢/lb e milhões de sacas):

- **Tabela 1:** média mensal dos preços indicativos (I-CIP, Colombian Milds, Other Milds, Brazilian Naturals, Robustas)
  e dos futuros de **Nova York** e **Londres** (média da 2ª e 3ª posições). Ago/2026: Brazilian Naturals 322,24; Nova
  York 313,20; Londres 167,63.
- **Tabela 2:** diferenciais entre grupos, entre eles **Nova York − Londres** (a arbitragem: 145,56 em ago/2026) e
  Brazilian Naturals − Robustas.
- **Tabela 3:** produção de arábica e robusta e consumo por região, por ano-café.
- **Tabela 4:** exportações por grupo (arábica −6,2% e robusta +9,6% no ano-café até julho).
- **Tabela 5:** **estoques certificados de Nova York e Londres**, mensais (Londres: 0,83 milhão de sacas em ago/2026).

**Como responde aos pedidos do estudo:**

- **F6, substituição de arábica por robusta:** a arbitragem Nova York − Londres (tabela 2).
- **F6, demanda e balanço:** o consumo por região e a produção por espécie (tabela 3), ao lado do PSD.
- **F3, estoques de Londres:** a tabela 5.
- **Preço do KC:** a média mensal de Nova York, sem licença da ICE.

**É mensal**: serve para a leitura de 30 e 90 dias, não para o diário.

**Esforço:** um coletor de PDF por coordenada, como o do IMEA (ADR 0019), com uma leitura por tabela. A carga histórica
pega um relatório por ano. A tabela 3 pede tratamento por época de layout.

## 3. ECF — *Stocks in European Ports*

| # | Pergunta | Resposta (2026-10-04) |
|---|---|---|
| 1 | API oficial? | Não |
| 2–3 | Autenticação / chave | Público, sem cadastro. `robots.txt` sem restrição (`Disallow:` vazio) |
| 4 | Formato | **Um PDF por ano** (`wp-content/uploads/<AAAA>/<MM>/<ano>-Stocks-European-Ports.pdf`), **substituído** a cada atualização: o de 2026 foi publicado em junho e de novo em agosto, em caminhos diferentes |
| 5 | Documentação | Introdução no PDF: estoques de café verde nos portos de Antuérpia, Hamburgo, Le Havre, Barcelona, Trieste, Gênova, Nápoles, Tallinn, Londres, Felixstowe e Bremen (parte), **incluindo os certificados da ICE**, em toneladas, por tipo (Robusta, Natural Arabica com o semi-lavado do Brasil, Washed Arabica) |
| 6 | Histórico | Arquivos anuais de 2016 a 2026 listados na página. Fim de cada mês |
| 7 | Revisão | **Revisa.** Robusta de março/2026: 139.191 t na versão de junho, 139.093 t na de agosto; abril: 150.769 → 150.565 t |
| 8 | Publicação | **Bimestral, com ~2 meses de atraso**: março e abril saíram em 01/06; maio e junho em agosto |
| 9 | Limite | Não observado |
| 10 | Licença | Não lida (há uma página `/disclaimer/`). Dados cedidos por armazéns e portos |
| 11 | Riscos | Texto do PDF com espaços quebrados ("202 6") e **erros de digitação da fonte** (o arquivo de 2025 traz "31-May-24" e "193 , 274"). A data de cada versão só pelo caminho do arquivo. Para o point-in-time, cada PDF baixado é uma versão |

**Esforço:** coletor de PDF por coordenada, com o tratamento dos defeitos conhecidos como aviso (como no IMEA). Com 2
meses de atraso, serve só ao horizonte longo. **Sobreposição:** inclui os certificados da ICE em Londres e Antuérpia,
que a ICO também dá (dupla contagem com o F3 se os dois entrarem).

## 4. INMET — estações meteorológicas

Reconhecido em 2026-09-24 (`clima.md`) como "inadequado nesta fase": entrega tempo, não o efeito na lavoura. **O que
mudou:** o estudo agora pede exatamente essas variáveis (chuva quinzenal contra 30 anos, temperatura mínima, duração do
frio, ponto de orvalho, balanço hídrico) para o F1.

| # | Pergunta | Resposta (2026-10-04) |
|---|---|---|
| 1 | API oficial? | Sim, `apitempo.inmet.gov.br`. A lista de estações é pública (672; 68 em MG). **Os dados de estação voltam vazios (204) sem token**; o token é pedido por cadastro (incerteza: o processo não foi feito) |
| 2–3 | Autenticação / chave | Arquivo histórico sem cadastro; API de dados com token |
| 4 | Formato | **ZIP anual** com um CSV por estação automática, dados **horários** (`portal.inmet.gov.br/uploads/dadoshistoricos/<ano>.zip`): 2025 com 91 MB, 2024 com 103 MB |
| 5 | Documentação | Página de dados históricos e manual no portal |
| 6 | Histórico | ZIPs de **2000 a 2026**. As estações do café são mais novas: Franca (A708) desde 2002, Varginha (A515) e Patrocínio (A523) desde 2006, Caldas (A530) desde 2006, Machado (A567) desde 2017; Patos de Minas (A562) em pane |
| 7 | Revisão | Não medida. O ZIP é sobrescrito (o de 2025 foi atualizado em 2026-03-20) |
| 8 | Publicação | O ZIP do ano corrente é atualizado com ~1 mês de atraso (2026: 02/09). Sem data por registro: o point-in-time seria o `Last-Modified` do ZIP, ou o token para o diário |
| 9 | Limite | Não observado |
| 10 | Licença | Dado público federal (não lida a página de termos) |
| 11 | Riscos | O `curl` desta máquina perde a conexão com o INMET (o `fetch` do Node funciona). Falhas nas séries das estações automáticas. **Sem 30 anos**: a climatologia que o estudo pede teria de vir das Normais Climatológicas (1991–2020), não das estações |

**O ponto que decide não é técnico.** Ponderar estações, montar a anomalia contra a climatologia, contar horas de frio e
calcular o balanço hídrico é construir um índice. Isso é regra de fator: precisa da definição do David (quais estações,
qual limiar de frio, qual balanço) antes do código. Hoje o F1 usa o VHI da NOAA, que já é o efeito na vegetação. O
INMET entra bem como complemento para **geada** (temperatura mínima horária de maio a agosto em Varginha, Patrocínio,
Franca e Caldas), que o VHI não pega na semana.

**Esforço:** alto. Carga de 27 ZIPs (~2 GB), filtro das estações, agregação diária e o índice. Para o diário, o token.

## 5. Federação Nacional de Cafeteros da Colômbia (FNC)

O estudo (§7) pede monitorar as outras origens de arábica, a começar pela Colômbia. A FNC publica duas planilhas na
página de estatísticas (`federaciondecafeteros.org/wp/estadisticas-cafeteras/`):

| # | Pergunta | Resposta (2026-10-04) |
|---|---|---|
| 1 | API oficial? | Não |
| 2–3 | Autenticação / chave | Público, sem cadastro |
| 4 | Formato | **XLSX**, um arquivo novo por mês em `wp-content/uploads/<AAAA>/<MM>/`: "Precios, área y producción de café" (465 KB) e "Exportaciones" (3,6 MB) |
| 5 | Documentação | Aba "Índice" e o título de cada aba, com a fonte (Almacafé, SICA, Dirección de Investigaciones Económicas) |
| 6 | Histórico | **Produção registrada mensal** (mil sacas de 60 kg) desde 1956; preço interno diário e mensal; preço externo (ex-dock) mensal; **preços indicativos da ICO por grupo** (mensais); área cultivada por departamento desde 2002; **exportações mensais** em volume e valor, por tipo, porto, destino e exportador |
| 7 | Revisão | **Revisa**: as abas se dizem "Información Preliminar" (valor, destino) ou "definitiva" (volume). Não medido |
| 8 | Publicação | `Last-Modified`: a planilha de preços e produção de setembro em 2026-10-02; a de exportações de agosto em 2026-09-29 (~1 mês de atraso) |
| 9 | Limite | Não observado. O site é lento (o `fetch` do Node ficou parado mais de 2 minutos; o `curl` baixou em 7 s) |
| 10 | Licença | Não lida |
| 11 | Riscos | O caminho muda a cada mês (a URL vem da página); a aba "Fecha de elaboración: Julio 2022" indica um layout estável, mas sem garantia. Datas em número de série do Excel |

**Uso:** a produção e a exportação mensais da Colômbia entram como "outra origem" no F2 ou no F6, num fator que o
estudo ainda não define (é uma lacuna da §7, não uma regra). **Esforço:** baixo (XLSX, como a Conab).

## 6. ICE — robusta de Londres e preço diário do KC

- **Relatórios:** o *Report Center* tem o relatório "Robusta Coffee" da ICE Futures Europe (`ice.com/report/173`) e o
  de estoques do café "C" (`/report/42`, o que já coletamos). Os preços de fim de dia ficam em "End of day" por bolsa.
- **Custo** (*ICE Futures Europe Market Data Policy*, jan/2026, §2.6): os relatórios de fim de dia são "available free
  of charge on ICE's website". A entrega automática por FTP custa **US$ 2.500 por ano**; o histórico de commodities,
  **US$ 50 por trimestre**, desde o 2º trimestre de 2013.
- **Termos** (*ICE Report Center Click Through Agreement*, lido em 2026-10-04): o dado é só "for your own business or
  personal activities". O usuário "may not develop or create any product that uses, is based on, or is developed in
  connection with any of the information [...] without prior approval from ICE Data Services". **Vale também para os
  estoques do café "C" que já coletamos** (risco aceito no ADR 0032).

**Recomendação:** para a v1, a ICO cobre o robusta e o KC por mês, sem esse risco. Se o Comitê quiser o diário, o caminho
limpo é pedir a aprovação da ICE ou comprar o histórico (barato: ~US$ 2.600 para 13 anos de um produto) com a licença.
Um coletor no site repete o risco do ADR 0032. **A decisão de orçamento é do Luiz (P3, ADR 0055).**

## 7. Diferencial FOB, frete e as fontes já marcadas pelo estudo

- **Diferencial FOB** (prêmio do café brasileiro embarcado sobre Nova York): não há fonte pública primária. O Cecafé
  não publica o diferencial, e os relatórios mensais dele (PDF) são proibidos a robôs pelo `robots.txt` (`/*.pdf$`).
  As tabelas de base são de corretoras (pagas). **Substituto parcial:** o diferencial Brazilian Naturals − Nova York, da
  tabela 1 da ICO, mensal.
- **Frete marítimo e contêineres:** índices como Drewry e Freightos são comerciais (não testados). Os gargalos do porto
  de Santos aparecem como evento na leitura diária por IA (MAPA, Comissão Europeia e afins).
- **GCA, ABIC, Somar/Climatempo, EarthDaily:** o próprio estudo (§11.4) as classifica como não homologadas
  (assinatura, licença ou publicação irregular). Não testadas.

## Ordem sugerida, se o Comitê autorizar

1. **ICE *pending grading*:** já baixado, só ler.
2. **ICO:** 4 pedidos numa fonte, grátis, sem risco.
3. **ECF:** complementa o F3 com a Europa, com atraso.
4. **INMET:** só depois de o David definir o índice de geada ou de balanço hídrico.
5. **ICE diário (robusta e KC):** só com orçamento e licença.

Cada uma pede a autorização do usuário num ADR, com o limite "só aquisição de dados", como as fontes anteriores.
