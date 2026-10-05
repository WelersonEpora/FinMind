# 0070 — As pendências da safrinha do milho (F2) e o VHI como contexto

**Status:** aceita (2026-10-05).

## Contexto

O fator "Safrinha brasileira" do milho (F2, ADR 0056, adendo de 2026-10-04) tinha três perguntas ao David:

1. sem dado de clima brasileiro na base, o alerta agroclimático da R-SAF v0 (déficit hídrico de março a maio; geada
   de junho a julho no PR, no MS e em SP) fica fora da regra, declarado, ou vira fonte nova?
2. a "revisão acumulada de −2% em 2 levantamentos seguidos" é a acumulada contra a 1ª estimativa passando do limiar
   em 2 levantamentos seguidos, como lê o cálculo?
3. o viés de baixa fraco vale com qualquer revisão para cima abaixo dos limiares, como no cálculo, ou só com revisões
   seguidas (3, no exemplo)?

Pelo CLAUDE.md, a decisão do usuário vale como a do David quando registrada num ADR.

**O teste do VHI como alerta.** A base já tem a saúde da vegetação da NOAA sobre a área de milho de MT e do PR
(ADR 0025), semanal desde 1982. Pela NOAA, um VHI abaixo de 40 é estresse. Testado como alerta de déficit hídrico (VHI
abaixo de 40 nas 2 semanas mais recentes em MT ou no PR, de março a maio), ele dispararia em **19 de 27 safrinhas**
desde 2000. Ele pega as secas (2016, 2020 no PR, 2021, 2024), mas também as safras recordes de 2022 e 2023, e 2012. Só
abril e maio dá 17 de 27. Com VHI abaixo de 35 dá 12 de 27, perde 2024 e ainda pega 2022. A causa provável é a máscara
de cultura: é fixa (MapSPAM 2010) e não separa a safrinha da soja recém-colhida. Como sinal de alta, o VHI daria
pressão falsa quase todo ano.

## Decisão (usuário, Welerson, 2026-10-05)

1. **Alerta agroclimático: fora da conta, declarado, sem fonte nova.** O VHI de MT e do PR vai ao F2 **como
   contexto**, fora da conta: as 2 semanas mais recentes de cada estado, com a marca "abaixo de 40", num quadro da
   camada B, no prompt e na tela. O texto diz por que ele não é alerta. Para cada levantamento da Conab vale o VHI
   publicado antes de o levantamento seguinte sair; para o último, o mais recente até a data. A geada de junho e julho
   chega pelos eventos de mercado do INMET, que o F2 já recebe (ADR 0049). O plantio na janela segue fora, sem o dado.
2. **Revisão acumulada:** a leitura do cálculo está confirmada. É a acumulada contra a 1ª estimativa passando do
   limiar em 2 levantamentos seguidos, a mesma medida do exemplo do especialista.
3. **Viés de baixa fraco:** vale com qualquer revisão para cima abaixo dos limiares, como no cálculo. As "3 revisões
   seguidas" vêm do anexo do FEL 1, que o especialista criticou ("o texto diz '2 ou mais revisões' e o resultado diz 'a
   partir de 3'"). Ele também escreveu que "a 3ª revisão seguida traz pouca informação nova".

As três saem das Pendências do F2 e viram decisões. O cálculo `safrinha_milho_conab` vai à v2 (só com o contexto, sem
mudar a decisão), e a metodologia do milho, à v6.

## Consequências

- O F2 não tem mais pendências com o especialista. O alerta agroclimático continua sem dado que o meça. Um indicador
  climático brasileiro (chuva do INMET, por exemplo) seria fonte nova e só entra com uma demanda e uma autorização
  próprias.
- A IA vê a saúde da lavoura de MT e do PR em todo prompt do milho, com o aviso de que ela não é alerta.
