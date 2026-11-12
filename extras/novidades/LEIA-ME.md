# Novidades do Aion 2

`novidades.json` é a lista do que saiu de novo para o Global: códigos de
recompensa, campanhas de Drops da Twitch, atualizações do jogo e eventos. Uma
tarefa diária do Claude confere as fontes e acrescenta o que for novo; o bot do
Telegram (`../telegram`) lê este arquivo e repassa.

Cada item:

- `id`: único e estável (ex.: `codigo-NOMEDOCODIGO`, `drops-nome-ano-mes`,
  `patch-AAAA-MM-DD`, `evento-nome`). O bot usa o `id` para não repetir.
- `tipo`: `codigo`, `drops`, `patch` ou `evento`.
- `titulo`: uma linha. `texto`: o que é e o que fazer, em português.
- `expira`: data final em `DD/MM/AAAA`, quando houver.
- `fonte`: o endereço de onde veio.
- `visto_em`: `AAAA-MM-DD` em que entrou na lista.
- `ativo`: `true` enquanto está valendo; `false` depois que vence.

Códigos só do Global. Os da Coreia e de Taiwan não funcionam na conta do Global.
