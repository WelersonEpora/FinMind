# Produção registrada de café da Colômbia (Federação Nacional de Cafeteros) — reconhecimento

Nível **2** (fonte localizada, baixada e testada contra o preço; **não** coletada). Linha do índice:
`docs/reconhecimento-fontes/README.md`. Decisão, autorização do reconhecimento e o teste: ADR 0139.

Motivo do reconhecimento: a análise do café de 2026-10-19 (`STATUS_DO_PROJETO.md`, §0, item E10) pede a oferta
colombiana como fator novo ("produção mensal e revisões, em relação à expectativa"). O usuário autorizou, em 2026-10-21,
reconhecer a fonte e testá-la; a coleta e o fator só viriam se o teste mostrasse valor. A Federação de Cafeteiros já é
fonte autorizada da leitura diária de eventos (ADR 0130).

| # | Pergunta | Resposta | Evidência |
|---|---|---|---|
| 1 | API oficial? | Não: planilha XLSX na página de estatísticas (`federaciondecafeteros.org/wp/estadisticas-cafeteras/`), "Precios, área y producción de café"; o nome do arquivo muda a cada mês (ex.: `wp-content/uploads/2026/09/Precios-area-y-produccion-de-cafe-Octubre-2026.xlsx`), e a página chegou a ter dois links com meses diferentes | chamada real, 2026-10-21 |
| 2 | Pública ou autenticada? | Pública | chamada real (HTTP 200, 466 KB) |
| 3 | Cadastro/chave? | Não | chamada real |
| 4 | Formato | XLSX com 11 abas: preço interno diário e mensal, preço externo (ex-dock), preços da OIC por grupo, área por departamento e por tecnificação, **produção registrada mensal** (aba "8. Producción mensual", mil sacas de 60 kg de café verde equivalente) e valor da colheita | arquivo baixado |
| 5 | Documentação oficial | Só os títulos e as notas de cada aba ("Fuente: Dirección de Investigaciones Económicas") | arquivo baixado |
| 6 | Histórico | Produção mensal desde jan/1956 (849 meses, até set/2026: 1.215 mil sacas) | arquivo baixado |
| 7 | Revisões (vintage) | O arquivo só traz o valor atual; não se sabe se a FNC revisa meses passados | — |
| 8 | Fuso / `published_at` | Sem data no arquivo. A FNC divulga a produção do mês nos primeiros dias úteis do mês seguinte (comunicado); o arquivo de outubro tinha `Last-Modified` de 16/10/2026. Seria estimado (o teste usou o dia 10 do mês seguinte) | cabeçalho HTTP |
| 9 | Limite de requisições | Não documentado; um arquivo por mês bastaria | — |
| 10 | Licença | Não declarada; uso interno | — |
| 11 | Riscos técnicos | O nome do arquivo muda todo mês (seria preciso ler a página para achar o link); a "produção registrada" mede as compras internas registradas, que o próprio preço estimula, não a colheita | arquivo baixado |

## O teste (2026-10-21)

A produção de cada mês contra o mesmo mês do ano anterior (e os 3 e os 12 meses contra os do ano anterior), conhecida
no dia 10 do mês seguinte, e o KC de Nova York depois (Yahoo, `KC=F`, a troca de vencimento ajustada), 2000 a 2026:

| Medida | Correlação com o KC em 62 pregões | Mais de +10% (mais oferta): KC em 62 pregões | Menos de −10% (menos oferta) | Todos |
|---|---|---|---|---|
| O mês contra o mesmo mês | +0,16 | +5,4%, subiu em 53% | −1,7%, 45% | +1,7%, 48% |
| 3 meses | +0,16 | +4,5%, 51% | −0,8%, 43% | — |
| 12 meses | +0,10 | +4,7%, 51% | +0,6%, 53% | — |

O sinal é o **oposto** do esperado (mais produção colombiana seria baixa) e se repete nos dois períodos (2000 a 2013 e
2014 a 2026), com efeito fraco: a produção registrada acompanha o preço, não o antecipa. **Não coletada.** Em set/2026,
a produção do mês ficou 6,3% acima de set/2025; a dos 3 meses, 10,3% abaixo; a dos 12 meses, 14,9% abaixo.
