# Ficha do Personagem

A ficha do personagem que está jogando, gravada em disco e mostrada numa
janela. É a nossa: não faz parte do catálogo oficial.

O que grava, a cada mudança que o jogo manda:

- classe, nível, CP e GS;
- Kinah ganho no dia, Pontos de Abismo da semana e o limite;
- Energia de Od (básica e carregada);
- contadores de conteúdo, limites de loja e criações da semana, como o
  medidor os recebe;
- a folha de atributos inteira, pelo id que o jogo usa, e a redução de
  recarga;
- abates, assistências, mortes e Pontos de Abismo ganhos, por dia do jogo.

E o histórico: um ponto de CP e GS a cada mudança (últimos 400), o Kinah de
cada dia, os Pontos de Abismo de cada semana e a primeira folha de atributos
de cada dia (últimos 30).

Onde fica: `%APPDATA%\com.a2tools.dps-meter\plugin-data\ficha\estado.json`
e `historico.json`. São arquivos de texto; dá para abrir no Bloco de Notas.

O que não faz: não lê inventário, não manda nada para fora, não tem conexão.
Roda com a janela oculta também: basta ter sido aberta uma vez.
