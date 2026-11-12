@echo off
rem Baixa a lista publica de tempos de chefe para uma pasta do PC, de 15 em 15 minutos.
rem O medidor nao faz nenhuma conexao: quem conecta e so este arquivo.
rem Ele so LE um arquivo publico. Nao envia nada seu; na URL vai apenas o numero do servidor.
rem Para parar, feche esta janela.
set SERVIDOR=2405
set PASTA=%APPDATA%\com.a2tools.dps-meter\plugin-data\event-timers
if not exist "%PASTA%" mkdir "%PASTA%"
:de_novo
curl.exe -f -s -S -m 20 -o "%PASTA%\shared-feed.tmp" https://cdn.a2tools.app/feeds/boss-timers/%SERVIDOR%.json && move /y "%PASTA%\shared-feed.tmp" "%PASTA%\shared-feed.json" >nul && echo %time% lista atualizada
timeout /t 900 /nobreak >nul
goto de_novo
