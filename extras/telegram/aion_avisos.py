#!/usr/bin/env python3
"""Avisos do Aion 2 pelo Telegram.

Um bot pequeno, só com a biblioteca padrão do Python. Ele:
- avisa um tempo antes dos eventos e chefes de horário fixo (agenda.json, que
  vem do calendário do jogo usado pelo plugin Event Timers);
- avisa dos chefes de campo (Gartua e os outros) lendo a lista pública onde os
  medidores dos jogadores publicam os tempos;
- é configurado pelo próprio Telegram: /lista e /campo mostram tudo, com um
  botão para ligar ou desligar o aviso de cada item.

Ele só fala com o Telegram e lê a lista pública de chefes. Não sabe nada da sua
conta do jogo. O token fica em token.txt, na mesma pasta, e nunca é impresso.
"""
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

PASTA = os.path.dirname(os.path.abspath(__file__))
ARQ_AGENDA = os.path.join(PASTA, "agenda.json")
ARQ_ESTADO = os.path.join(PASTA, "estado.json")
ARQ_TOKEN = os.path.join(PASTA, "token.txt")
LISTA_URL = "https://cdn.a2tools.app/feeds/boss-timers/{servidor}.json"
LISTA_A_CADA_S = 300
# Novidades do jogo (códigos de recompensa, Drops da Twitch, atualizações): um
# arquivo no fork do Marco, mantido por uma tarefa diária. O bot só repassa.
NOVIDADES_URL = "https://raw.githubusercontent.com/marcoopavan/a2tools-plugins/nossa-versao/extras/novidades/novidades.json"
NOVIDADES_A_CADA_S = 600
TIPOS_NOVIDADE = [
    ("nov:codigo", "codigo", "Códigos de recompensa", "\U0001f381"),
    ("nov:drops", "drops", "Drops da Twitch", "\U0001f4fa"),
    ("nov:patch", "patch", "Atualizações do jogo", "\U0001f6e0\ufe0f"),
    ("nov:evento", "evento", "Eventos e conteúdo novo", "\U0001f4e3"),
]
ESPERA_TELEGRAM_S = 20
# O que já vem ligado: os chefes do Abismo e o Gartua. O resto aparece na
# lista, desligado, e você liga o que quiser.
LIGADOS_DE_FABRICA = {"boss-kaira", "boss-nahma", "boss-tamasa-argo-kaira", "boss-king", "111021",
                      "nov:codigo", "nov:drops", "nov:patch", "nov:evento"}
ESTADO_INICIAL = {
    "dono": None,
    "ligados": {},
    "antes_min": 10,
    "janela": {"semana": [20 * 60 + 30, 1 * 60], "fds": [13 * 60, 2 * 60]},
    "pausado": False,
    "enviados": {},
    "novidades_vistas": None,
    "offset": 0,
}

AJUDA = (
    "Comandos:\n"
    "/lista - eventos e chefes do Abismo, com botão de ligar e desligar\n"
    "/campo - chefes de campo (Gartua e os outros)\n"
    "/novidades - códigos, Drops da Twitch e atualizações que estão valendo\n"
    "/proximos - o que vem a seguir\n"
    "/antes 10 - avisar quantos minutos antes\n"
    "/janela - em que horários posso te avisar\n"
    "/pausa e /voltar - parar e retomar todos os avisos\n"
    "/ajuda - esta lista"
)


# ── agenda ────────────────────────────────────────────────────────────────

def carregar_agenda(caminho=ARQ_AGENDA):
    with open(caminho, encoding="utf-8") as f:
        return json.load(f)


def fuso(agenda):
    return timezone(timedelta(hours=agenda.get("fuso_horas", -3)))


def dia_js(data):
    """0 = domingo, como no calendário do jogo."""
    return (data.weekday() + 1) % 7


def proximas(evento, agora, tz, ate_dias=8):
    """As próximas ocorrências de um evento de horário fixo, em ordem."""
    base_tz = timezone.utc if evento.get("utc") else tz
    local = agora.astimezone(base_tz)
    saida = []
    for d in range(-1, ate_dias):
        dia = (local + timedelta(days=d)).date()
        if dia_js(dia) not in evento["dias"]:
            continue
        for minuto in evento["inicios"]:
            quando = datetime(dia.year, dia.month, dia.day, tzinfo=base_tz) + timedelta(minutes=minuto)
            if quando > agora - timedelta(minutes=1):
                saida.append(quando)
    return sorted(saida)


def nome_completo(evento):
    if evento.get("tambem"):
        return f"{evento['nome']} (com {', '.join(evento['tambem'])})"
    return evento["nome"]


# ── estado ────────────────────────────────────────────────────────────────

def carregar_estado(caminho=ARQ_ESTADO):
    estado = json.loads(json.dumps(ESTADO_INICIAL))
    try:
        with open(caminho, encoding="utf-8") as f:
            salvo = json.load(f)
        if isinstance(salvo, dict):
            estado.update(salvo)
    except (OSError, ValueError):
        pass
    return estado


def salvar_estado(estado, caminho=ARQ_ESTADO):
    tmp = caminho + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    os.replace(tmp, caminho)


def ligado(estado, item_id):
    if item_id in estado["ligados"]:
        return bool(estado["ligados"][item_id])
    return item_id in LIGADOS_DE_FABRICA


def dentro_da_janela(estado, agora, tz):
    """Se o horário de agora está dentro de uma janela de avisos."""
    local = agora.astimezone(tz)
    for atras in (0, 1):
        dia = (local - timedelta(days=atras)).date()
        chave = "fds" if dia_js(dia) in (0, 6) else "semana"
        janela = estado["janela"].get(chave)
        if janela is None:  # "sempre"
            return True
        ini, fim = janela
        comeco = datetime(dia.year, dia.month, dia.day, tzinfo=tz) + timedelta(minutes=ini)
        termino = datetime(dia.year, dia.month, dia.day, tzinfo=tz) + timedelta(minutes=fim)
        if fim <= ini:
            termino += timedelta(days=1)
        if comeco <= local < termino:
            return True
    return False


def hm(minutos):
    return f"{minutos // 60:02d}:{minutos % 60:02d}"


def texto_janela(estado):
    def uma(chave, rotulo):
        j = estado["janela"].get(chave)
        return f"{rotulo}: sempre" if j is None else f"{rotulo}: {hm(j[0])} às {hm(j[1])}"
    return uma("semana", "Segunda a sexta") + "\n" + uma("fds", "Sábado e domingo")


def ler_faixa(texto):
    """'20:30-01:00' -> [1230, 60]; None se não for uma faixa."""
    try:
        a, b = texto.replace(" ", "").split("-")
        (h1, m1), (h2, m2) = (p.split(":") if ":" in p else (p, "0") for p in (a, b))
        ini, fim = int(h1) * 60 + int(m1), int(h2) * 60 + int(m2)
    except (ValueError, TypeError):
        return None
    if not (0 <= ini < 1440 and 0 <= fim <= 1440):
        return None
    return [ini, fim % 1440]


# ── avisos ────────────────────────────────────────────────────────────────

def avisos_fixos(agenda, estado, agora):
    """Os avisos de horário fixo que vencem agora: [(chave, texto)]."""
    tz = fuso(agenda)
    antes = timedelta(minutes=int(estado["antes_min"]))
    saida = []
    for ev in agenda["eventos"]:
        if not ligado(estado, ev["id"]):
            continue
        for quando in proximas(ev, agora, tz, ate_dias=2):
            chave = f"{ev['id']}@{int(quando.timestamp())}"
            if chave in estado["enviados"]:
                continue
            if quando - antes <= agora < quando + timedelta(minutes=1):
                falta = max(0, round((quando - agora).total_seconds() / 60))
                hora = quando.astimezone(tz).strftime("%H:%M")
                onde = f" - {', '.join(ev['onde'])}" if ev.get("onde") else ""
                quanto = "agora" if falta == 0 else f"em {falta} min"
                saida.append((chave, f"⏰ {nome_completo(ev)} {quanto} ({hora}){onde}"))
            break
    return saida


def segundos(valor):
    """Um horário da lista, em segundos (ela usa segundos; milissegundos também servem)."""
    if not isinstance(valor, (int, float)) or isinstance(valor, bool) or valor <= 0:
        return None
    return valor / 1000 if valor > 1e11 else valor


def avisos_campo(agenda, estado, agora, lista):
    """Os avisos dos chefes de campo, pela lista pública: [(chave, texto)]."""
    if not lista or not isinstance(lista.get("bosses"), dict):
        return []
    tz = fuso(agenda)
    antes = int(estado["antes_min"]) * 60
    agora_s = agora.timestamp()
    saida = []
    for chefe in agenda["chefes_campo"]:
        if not ligado(estado, chefe["id"]):
            continue
        dado = lista["bosses"].get(chefe["id"])
        if not isinstance(dado, dict):
            continue
        nasce = segundos(dado.get("nextSpawn"))
        if dado.get("state") == "dead" and nasce:
            chave = f"{chefe['id']}@{int(nasce)}"
            if chave not in estado["enviados"] and nasce - antes <= agora_s < nasce + 60:
                falta = max(0, round((nasce - agora_s) / 60))
                hora = datetime.fromtimestamp(nasce, tz).strftime("%H:%M")
                quanto = "agora" if falta == 0 else f"em {falta} min"
                saida.append((chave, f"⏰ {chefe['nome']} previsto {quanto} ({hora}) - {chefe['onde']}"))
        vivo = segundos(dado.get("upSince"))
        if dado.get("state") == "up" and vivo and 0 <= agora_s - vivo < 600:
            chave = f"{chefe['id']}!{int(vivo)}"
            if chave not in estado["enviados"]:
                saida.append((chave, f"⚔️ {chefe['nome']} está vivo - {chefe['onde']}"))
    return saida


def limpar_enviados(estado, agora):
    limite = agora.timestamp() - 3 * 86400
    estado["enviados"] = {k: v for k, v in estado["enviados"].items() if v > limite}


def texto_proximos(agenda, estado, agora, lista, erro_lista):
    tz = fuso(agenda)
    linhas = []
    itens = []
    for ev in agenda["eventos"]:
        if ligado(estado, ev["id"]):
            for quando in proximas(ev, agora, tz, ate_dias=8)[:1]:
                itens.append((quando.timestamp(), nome_completo(ev)))
    if lista and isinstance(lista.get("bosses"), dict):
        for chefe in agenda["chefes_campo"]:
            dado = lista["bosses"].get(chefe["id"])
            if not ligado(estado, chefe["id"]) or not isinstance(dado, dict):
                continue
            if dado.get("state") == "up":
                itens.append((agora.timestamp(), f"{chefe['nome']} (vivo agora)"))
            elif (segundos(dado.get("nextSpawn")) or 0) > agora.timestamp():
                itens.append((segundos(dado["nextSpawn"]), chefe["nome"]))
    for ts, nome in sorted(itens)[:12]:
        quando = datetime.fromtimestamp(ts, tz)
        falta = int((ts - agora.timestamp()) // 60)
        quanto = "agora" if falta <= 0 else (f"em {falta} min" if falta < 90 else f"em {falta // 60} h {falta % 60:02d}")
        dia = "" if quando.date() == agora.astimezone(tz).date() else quando.strftime(" %d/%m")
        linhas.append(f"{quando.strftime('%H:%M')}{dia} - {nome} ({quanto})")
    if not linhas:
        linhas.append("Nenhum aviso ligado. Use /lista e /campo.")
    if erro_lista:
        linhas.append("\nChefes de campo: não consegui ler a lista pública agora.")
    return "\n".join(linhas)


# ── novidades ─────────────────────────────────────────────────────────────

def itens_validos(arquivo):
    """Os itens bem formados do arquivo de novidades."""
    if not isinstance(arquivo, dict) or not isinstance(arquivo.get("itens"), list):
        return []
    tipos = {t[1] for t in TIPOS_NOVIDADE}
    return [i for i in arquivo["itens"]
            if isinstance(i, dict) and isinstance(i.get("id"), str) and i.get("tipo") in tipos
            and isinstance(i.get("titulo"), str)]


def texto_novidade(item):
    marca = next(t[3] for t in TIPOS_NOVIDADE if t[1] == item["tipo"])
    linhas = [f"{marca} {item['titulo']}"]
    if item.get("texto"):
        linhas.append(str(item["texto"]))
    if item.get("expira"):
        linhas.append(f"Vale até {item['expira']}.")
    if item.get("fonte"):
        linhas.append(f"Fonte: {item['fonte']}")
    return "\n".join(linhas)[:3500]


def novidades_a_enviar(estado, arquivo):
    """As novidades ainda não repassadas, de tipos ligados: [(id, texto)].

    Na primeira leitura, o que já estava no arquivo conta como visto, menos o
    que ainda está valendo: assim o bot não despeja o histórico inteiro."""
    itens = itens_validos(arquivo)
    if estado.get("novidades_vistas") is None:
        estado["novidades_vistas"] = [i["id"] for i in itens if not i.get("ativo")]
    vistas = set(estado["novidades_vistas"])
    chave = {t[1]: t[0] for t in TIPOS_NOVIDADE}
    return [(i["id"], texto_novidade(i)) for i in itens
            if i["id"] not in vistas and ligado(estado, chave[i["tipo"]])]


def texto_novidades_ativas(arquivo):
    ativos = [i for i in itens_validos(arquivo) if i.get("ativo")]
    if not ativos:
        return "Nada valendo agora: nenhum código ativo e nenhuma campanha de Drops aberta, pelo que foi conferido."
    return "\n\n".join(texto_novidade(i) for i in ativos)[:3900]


# ── teclados ──────────────────────────────────────────────────────────────

def teclado(itens, estado):
    linhas = []
    for item_id, nome in itens:
        marca = "\U0001f514" if ligado(estado, item_id) else "\U0001f515"
        linhas.append([{"text": f"{marca} {nome}"[:60], "callback_data": f"t:{item_id}"}])
    return {"inline_keyboard": linhas}


def itens_fixos(agenda):
    return [(ev["id"], nome_completo(ev)) for ev in agenda["eventos"]] + [(t[0], t[2]) for t in TIPOS_NOVIDADE]


def itens_campo(agenda):
    return [(c["id"], f"{c['nome']} (nv. {c['nivel']})") for c in agenda["chefes_campo"]]


# ── Telegram ──────────────────────────────────────────────────────────────

class Telegram:
    def __init__(self, token):
        self._base = f"https://api.telegram.org/bot{token}/"

    def chamar(self, metodo, **dados):
        corpo = urllib.parse.urlencode(
            {k: json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v for k, v in dados.items()}
        ).encode()
        espera = int(dados.get("timeout", 0)) + 15
        try:
            with urllib.request.urlopen(urllib.request.Request(self._base + metodo, data=corpo), timeout=espera) as r:
                resposta = json.load(r)
        except urllib.error.HTTPError as e:
            # Sem a URL na mensagem: ela contém o token.
            raise RuntimeError(f"Telegram respondeu {e.code} em {metodo}") from None
        except (urllib.error.URLError, OSError, ValueError) as e:
            raise RuntimeError(f"sem resposta do Telegram em {metodo}: {type(e).__name__}") from None
        if not resposta.get("ok"):
            raise RuntimeError(f"Telegram recusou {metodo}")
        return resposta.get("result")


def ler_novidades(url=NOVIDADES_URL):
    with urllib.request.urlopen(url, timeout=20) as r:
        dado = json.load(r)
    if not isinstance(dado, dict) or not isinstance(dado.get("itens"), list):
        raise ValueError("o arquivo de novidades veio em outro formato")
    return dado


def ler_lista(servidor):
    with urllib.request.urlopen(LISTA_URL.format(servidor=int(servidor)), timeout=20) as r:
        dado = json.load(r)
    if not isinstance(dado, dict) or not isinstance(dado.get("bosses"), dict):
        raise ValueError("a lista veio em outro formato")
    return dado


class Bot:
    def __init__(self, tg, agenda, estado, salvar=salvar_estado, agora=lambda: datetime.now(timezone.utc), lista=ler_lista,
                 novidades=ler_novidades):
        self.tg, self.agenda, self.estado = tg, agenda, estado
        self._salvar, self._agora, self._ler_lista, self._ler_novidades = salvar, agora, lista, novidades
        self.lista, self.erro_lista, self._lista_em = None, False, 0.0
        self.novidades, self._novidades_em = None, 0.0

    def dizer(self, texto, **extra):
        self.tg.chamar("sendMessage", chat_id=self.estado["dono"], text=texto, **extra)

    # comandos e botões
    def receber(self, update):
        if "callback_query" in update:
            return self._botao(update["callback_query"])
        msg = update.get("message") or {}
        chat = (msg.get("chat") or {}).get("id")
        texto = (msg.get("text") or "").strip()
        if chat is None or not texto:
            return
        if self.estado["dono"] is None and texto.split()[0].split("@")[0] == "/start":
            self.estado["dono"] = chat
            self._salvar(self.estado)
            nome = (msg.get("from") or {}).get("first_name") or ""
            self.dizer(f"Pronto, {nome}. Este bot agora só responde a você.\n\n"
                       "Já deixei ligados os chefes do Abismo e o Gartua. Use /lista e /campo para escolher o resto.\n\n" + AJUDA)
            return
        if chat != self.estado["dono"]:
            return
        partes = texto.split()
        comando, resto = partes[0].split("@")[0].lower(), partes[1:]
        agora = self._agora()
        if comando in ("/start", "/ajuda", "/help"):
            self.dizer(AJUDA)
        elif comando == "/lista":
            self.dizer("Eventos e chefes do Abismo. Toque para ligar ou desligar:", reply_markup=teclado(itens_fixos(self.agenda), self.estado))
        elif comando == "/campo":
            self.dizer("Chefes de campo. Toque para ligar ou desligar:", reply_markup=teclado(itens_campo(self.agenda), self.estado))
        elif comando == "/novidades":
            self.dizer(texto_novidades_ativas(self.novidades) if self.novidades else "Ainda não li o arquivo de novidades. Tente de novo em alguns minutos.")
        elif comando == "/proximos":
            self.dizer(texto_proximos(self.agenda, self.estado, agora, self.lista, self.erro_lista))
        elif comando == "/antes":
            if resto and resto[0].isdigit() and 0 <= int(resto[0]) <= 120:
                self.estado["antes_min"] = int(resto[0])
                self._salvar(self.estado)
                self.dizer(f"Aviso {self.estado['antes_min']} minutos antes.")
            else:
                self.dizer(f"Hoje aviso {self.estado['antes_min']} minutos antes. Para mudar: /antes 15")
        elif comando == "/janela":
            self._janela(resto)
        elif comando == "/pausa":
            self.estado["pausado"] = True
            self._salvar(self.estado)
            self.dizer("Avisos pausados. /voltar para retomar.")
        elif comando == "/voltar":
            self.estado["pausado"] = False
            self._salvar(self.estado)
            self.dizer("Avisos de volta.")
        else:
            self.dizer("Não conheço esse comando.\n\n" + AJUDA)

    def _janela(self, resto):
        uso = ("Horários em que posso te avisar:\n" + texto_janela(self.estado) +
               "\n\nPara mudar:\n/janela semana 20:30-01:00\n/janela fds 13:00-02:00\n/janela sempre")
        if not resto:
            return self.dizer(uso)
        if resto[0].lower() == "sempre":
            self.estado["janela"] = {"semana": None, "fds": None}
        elif resto[0].lower() in ("semana", "fds") and len(resto) > 1:
            faixa = None if resto[1].lower() == "sempre" else ler_faixa(resto[1])
            if faixa is None and resto[1].lower() != "sempre":
                return self.dizer("Não entendi o horário.\n\n" + uso)
            self.estado["janela"][resto[0].lower()] = faixa
        else:
            return self.dizer(uso)
        self._salvar(self.estado)
        self.dizer("Feito.\n" + texto_janela(self.estado))

    def _botao(self, cq):
        chat = ((cq.get("message") or {}).get("chat") or {}).get("id")
        dado = cq.get("data") or ""
        if chat != self.estado["dono"] or not dado.startswith("t:"):
            return
        item = dado[2:]
        fixos, campo = dict(itens_fixos(self.agenda)), dict(itens_campo(self.agenda))
        if item not in fixos and item not in campo:
            return
        self.estado["ligados"][item] = not ligado(self.estado, item)
        self._salvar(self.estado)
        itens = itens_fixos(self.agenda) if item in fixos else itens_campo(self.agenda)
        self.tg.chamar("editMessageReplyMarkup", chat_id=chat, message_id=cq["message"]["message_id"],
                       reply_markup=teclado(itens, self.estado))
        nome = fixos.get(item) or campo.get(item)
        self.tg.chamar("answerCallbackQuery", callback_query_id=cq["id"],
                       text=("Ligado: " if ligado(self.estado, item) else "Desligado: ") + nome)

    # relógio
    def tique(self):
        if self.estado["dono"] is None:
            return
        agora = self._agora()
        if any(ligado(self.estado, c["id"]) for c in self.agenda["chefes_campo"]) and time.time() - self._lista_em >= LISTA_A_CADA_S:
            self._lista_em = time.time()
            try:
                self.lista, self.erro_lista = self._ler_lista(self.agenda["servidor"]), False
            except Exception:
                self.erro_lista = True
        calado = self.estado["pausado"] or not dentro_da_janela(self.estado, agora, fuso(self.agenda))
        self._repassar_novidades(calado)
        pendentes = avisos_fixos(self.agenda, self.estado, agora) + avisos_campo(self.agenda, self.estado, agora, self.lista)
        if not pendentes:
            return
        for chave, texto in pendentes:
            if not calado:
                self.dizer(texto)
            self.estado["enviados"][chave] = agora.timestamp()
        limpar_enviados(self.estado, agora)
        self._salvar(self.estado)

    def _repassar_novidades(self, calado):
        """Novidade não se perde: fora da janela, espera a janela abrir."""
        if time.time() - self._novidades_em >= NOVIDADES_A_CADA_S:
            self._novidades_em = time.time()
            try:
                self.novidades = self._ler_novidades()
            except Exception:
                return
        if not self.novidades:
            return
        primeira = self.estado.get("novidades_vistas") is None
        pendentes = novidades_a_enviar(self.estado, self.novidades)
        if primeira:
            self._salvar(self.estado)
        if calado or not pendentes:
            return
        for item_id, texto in pendentes:
            self.dizer(texto, disable_web_page_preview=True)
            self.estado["novidades_vistas"].append(item_id)
        self.estado["novidades_vistas"] = self.estado["novidades_vistas"][-500:]
        self._salvar(self.estado)


def ler_token():
    token = os.environ.get("AION_TELEGRAM_TOKEN", "").strip()
    if not token and os.path.exists(ARQ_TOKEN):
        with open(ARQ_TOKEN, encoding="utf-8") as f:
            token = f.read().strip()
    if not token:
        raise SystemExit("Falta o token: cole o token do bot no arquivo token.txt, nesta pasta.")
    return token


def main():
    bot = Bot(Telegram(ler_token()), carregar_agenda(), carregar_estado())
    print("Bot de avisos do Aion 2 no ar." + ("" if bot.estado["dono"] else " Mande /start para ele no Telegram."), flush=True)
    while True:
        try:
            updates = bot.tg.chamar("getUpdates", offset=bot.estado["offset"], timeout=ESPERA_TELEGRAM_S,
                                    allowed_updates=["message", "callback_query"])
            for u in updates or []:
                bot.estado["offset"] = u["update_id"] + 1
                try:
                    bot.receber(u)
                except Exception as e:  # um comando com erro não derruba o bot
                    print(f"erro ao responder: {e}", flush=True)
            if updates:
                salvar_estado(bot.estado)
            bot.tique()
        except Exception as e:
            print(f"erro: {e}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
