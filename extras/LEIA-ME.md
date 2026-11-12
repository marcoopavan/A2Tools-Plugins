# Nossa versão: extras

## Tempo dos chefes de campo sem abrir o mapa

O medidor da nossa versão não faz nenhuma conexão. Sem isso, ele só fica sabendo
quando um chefe de campo volta (o Gartua, por exemplo) quando você abre o mapa
no jogo.

`baixar-lista-de-chefes.bat` resolve isso por fora do medidor:

- de 15 em 15 minutos ele lê o arquivo público onde os medidores de outros
  jogadores publicam os tempos (`cdn.a2tools.app/feeds/boss-timers/<servidor>.json`);
- grava em `%APPDATA%\com.a2tools.dps-meter\plugin-data\event-timers\shared-feed.json`;
- o plugin Event Timers da nossa versão lê esse arquivo do disco.

O arquivo `.bat` tem 6 linhas de comando e dá para ler inteiro no Bloco de Notas.
Ele só lê: não envia dados do personagem nem da conta. O servidor do arquivo
enxerga o que qualquer site enxerga, o seu endereço de internet e o número do
servidor do jogo (2405 = Marchutan, Asmodiano, América do Sul).

Como usar: dê dois cliques no arquivo antes de jogar e deixe a janela aberta.
Para parar, feche a janela. Nada é instalado e nada inicia sozinho com o Windows.

Os chefes com horário fixo (Nahma, Argo e os Executores, Kairah) não precisam
disso: o calendário deles já vem dentro do plugin.

## Avisos no celular

A pasta `telegram/` tem o bot que avisa pelo Telegram, rodando na VPS. O passo a
passo está em `telegram/LEIA-ME.md`.
