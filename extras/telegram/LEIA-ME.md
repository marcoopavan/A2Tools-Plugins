# Avisos do Aion 2 pelo Telegram

Um bot que avisa no celular antes dos eventos e dos chefes, mesmo com o PC
desligado. Roda na VPS. Não tem relação com a conta do jogo.

## O que ele faz

- Avisa X minutos antes dos eventos e chefes de horário fixo: Shugo Festa,
  Invasão Dimensional, Fenda, Cerco de Artefatos, Vigilante Kairah, Senhor
  Guardião Nahma, Executores, Argo e os reinícios.
- Avisa dos chefes de campo (Gartua e os outros 23), lendo a cada 5 minutos a
  lista pública onde os medidores dos jogadores publicam os tempos.
- Repassa as novidades do jogo: códigos de recompensa, Drops da Twitch,
  atualizações e eventos, de `../novidades/novidades.json`.
- Tudo aparece na lista; você liga e desliga cada um por botão. Já vêm ligados
  os chefes do Abismo e o Gartua.
- Só avisa dentro dos seus horários: segunda a sexta das 20:30 à 01:00, sábado
  e domingo das 13:00 às 02:00. Dá para mudar.

## Instalar (uma vez)

1. No Telegram, fale com o @BotFather: `/newbot`, escolha um nome e um nome de
   usuário terminado em `bot`. Ele devolve o token. Não mande o token para
   ninguém.
2. Na VPS:

   ```
   mkdir -p /docker/aion-avisos && cd /docker/aion-avisos
   curl -fsSLO https://raw.githubusercontent.com/marcoopavan/a2tools-plugins/nossa-versao/extras/telegram/aion_avisos.py
   curl -fsSLO https://raw.githubusercontent.com/marcoopavan/a2tools-plugins/nossa-versao/extras/telegram/agenda.json
   nano token.txt
   ```

   Cole o token, salve com Ctrl+O e Enter, saia com Ctrl+X. Depois:

   ```
   chmod 600 token.txt
   docker run -d --name aion-avisos --restart unless-stopped -v /docker/aion-avisos:/app -w /app python:3.12-slim python -u aion_avisos.py
   docker logs aion-avisos
   ```

   Tem que aparecer "Bot de avisos do Aion 2 no ar."
3. No Telegram, abra o seu bot e mande `/start`. Quem mandar o primeiro
   `/start` vira o dono, e o bot passa a ignorar qualquer outra pessoa.

## Usar

- `/lista`: eventos e chefes do Abismo, com botão de ligar e desligar.
- `/campo`: chefes de campo.
- `/proximos`: o que vem a seguir.
- `/novidades`: códigos, Drops e eventos que estão valendo e que você ainda
  não pegou. Cada um vem com o botão "Já peguei": tocou, ele some daqui e o
  bot não avisa mais dele. Tocou errado, o mesmo botão vira "Desfazer".
- `/antes 15`: avisar 15 minutos antes (de fábrica, 10).
- `/janela`: horários em que ele pode avisar. `/janela sempre` tira o limite.
- `/pausa` e `/voltar`.

## Manutenção

- Atualizar o bot: baixe de novo o `aion_avisos.py` (o primeiro `curl` acima) e
  rode `docker restart aion-avisos`.
- Atualizar o calendário depois de um patch: baixe de novo o `agenda.json`
  (o segundo `curl` acima) e rode `docker restart aion-avisos`.
- Parar de vez: `docker rm -f aion-avisos`.
- Trocar de dono: apague `estado.json` e reinicie.

`agenda.json` é gerado por `gerar_agenda.mjs` a partir do calendário do plugin
Event Timers. Os testes ficam em `test_aion_avisos.py`
(`python3 -m unittest test_aion_avisos`, dentro desta pasta).
