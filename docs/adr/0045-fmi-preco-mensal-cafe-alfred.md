# 0045 — Café: preço mensal do FMI (arábica e robusta), pelo ALFRED

## Contexto

O preço é o dado principal da recomendação da IA. No café, o histórico diário longo só existe no KC (o futuro de café
arábica "C" da ICE), que é pago; o futuro ICF da B3 (ADR 0028) é grátis, mas só tem ~4,5 anos. Em 2026-09-30 foi
confirmado, por chamada real, o preço mensal do arábica e do robusta do FMI no FRED (`STATUS_DO_PROJETO.md`, §3).

Na reunião de 2026-10-01 o **Comitê decidiu seguir com o histórico disponível** (perguntas 2, 3 e 8 da §4), sem
comprar dado de preço. O KC fica de fora, e o preço do FMI passa a ser o único histórico longo e gratuito do café.

**Autorização:** o usuário autorizou em 2026-10-01 ("sim, faça isso"), em resposta à proposta desta fonte como a
próxima, **só aquisição de dados**. Não é precedente para outra fonte nem para qualquer regra.

## Evidência (chamada real, 2026-10-01)

- **Séries:** `PCOFFOTMUSDM` ("Global price of Coffee, Other Mild Arabica") e `PCOFFROBUSDM` ("Global price of Coffee,
  Robustas"), em centavos de dólar por libra-peso (US¢/lb), mensais, média do mês, release 365 do FRED ("Primary
  Commodity Prices"). Nota da série: o preço de referência é o do maior exportador de cada tipo. A versão atual vai de
  1992-01 a 2026-07 (415 meses), igual pela API e pelo CSV.
- **Revisões:** 91 versões no ALFRED, desde 2015-11-06. 530 de 559 meses do arábica e 524 do robusta têm mais de uma
  versão (ex.: maio/2026 saiu 317,53 em 2026-06-05 e foi a 315,06 em 2026-07-13).
- **Datas das versões irregulares:** o FRED ficou 706 dias sem atualizar a série (2017-07-12 a 2019-06-18), 261 dias
  entre 2021-12 e 2022-08 e 192 dias entre 2025-07-14 e 2026-01-22. Desde 2015, a 1ª versão de um mês sai em mediana
  47 dias depois do dia 1º do mês (mínimo 32); 42 de 129 meses passaram de 60 dias.
- **Meses retirados:** de 1980 a 1991 (144 meses) os valores estavam nas versões antigas e a versão atual traz "."
  (retirados em 2019-07-23 e 2026-01-22). A série de hoje começa em 1992.
- **Licença:** "Copyright © 2016, International Monetary Fund. Reprinted with permission. Complete terms of use [...]
  at http://www.imf.org/external/terms.htm" (nota da série). Os termos do FMI não foram lidos.

## Decisão

1. **Pelo ALFRED, não pelo coletor do FRED.** O preço revisa e as datas são irregulares: uma regra de defasagem
   inventaria a data de publicação. O ALFRED dá cada versão com a data em que chegou ao FRED, como no CPI (ADR 0033).
2. **Base comum `collectors/fred/fred-alfred.js`** (`criarColetorAlfred`): o coletor do CPI passou a ser uma
   configuração dela, sem mudar o comportamento (reexecução no dev: 7.862 lidos, 0 criados). O café é a segunda:
   `fred-cafe-fmi` (`fred-cafe-fmi.collector.js`), séries `FRED.PCOFFOTMUSDM` e `FRED.PCOFFROBUSDM`, unidade `USc/lb`.
3. **Fonte própria, `FRED_ALFRED_FMI`.** `persistirPorEdicao` descarta as datas de versão já gravadas na fonte inteira:
   na fonte do CPI, uma versão do café no dia de uma versão do CPI seria descartada.
4. **`published_at` = a data da versão no FRED** (fim do dia em UTC), não estimada: é quando o dado ficou disponível
   por esta fonte, um limite superior da publicação do FMI (nunca antes do que se sabia). A 1ª versão mais de 60 dias
   depois do mês fica marcada em `metadata.limiteSuperior` (os meses até 2015-10, que entram na 1ª versão guardada, e
   os dos intervalos sem atualização).
5. **Mês retirado não é gravado** e vira aviso da execução (defeito conhecido da fonte). Gravá-lo deixaria o valor
   antigo como o atual para sempre (a camada é append-only). Vale para qualquer coletor da base (o CPI não tem nenhum).
6. **Um card**, "Café - preço mensal do FMI (arábica e robusta)" (`CAFE_PRECO_FMI`), com o arábica e o robusta no
   seletor de métrica. Tolerância de 100 dias para "em dia".
7. A primeira coleta é a carga histórica (baixa todas as versões): **não há backfill**. Exige `FRED_API_KEY`.

## Fora do escopo (de propósito)

- Converter para US$/saca ou para R$, juntar com o ICF ou o KC, ou qualquer outra leitura do preço: são cálculos, do
  David.
- Outros preços do FMI (o release 365 tem dezenas de commodities): só o café foi autorizado.

## Resultado (2026-10-01, banco de dev)

1ª execução: 3.284 linhas lidas, 830 criadas, 765 versões novas de meses já gravados, 1.128 ignoradas (versão com o
mesmo valor da anterior), 0 falhas, 2 avisos (os 144 meses retirados de cada série). Reexecução: 0 criados, 2.723
ignorados. 415 meses por série (1992-01 a 2026-07), o valor mais recente de cada mês igual ao CSV atual do FRED nos
415 (maior diferença 5×10⁻⁷).

## Consequências e limitações

- **Mensal:** serve para ciclos longos (a geada de 2021), não para regras diárias. O preço diário segue sendo o ICF.
- A data é a do FRED: nos intervalos sem atualização ela fica meses depois da publicação do FMI. Ler o FMI direto
  daria a data real, mas o FMI não guarda versões; fica como alternativa, se o David pedir.
- O histórico anterior a 1992 se perdeu na versão atual: não é recuperado.
- Licença do FMI não lida: antes de exibir a terceiros, ler os termos (como as reservas do FMI, ADR 0036).
