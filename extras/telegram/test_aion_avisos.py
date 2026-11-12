import copy
import unittest
from datetime import datetime, timedelta, timezone

import aion_avisos as a

BR = timezone(timedelta(hours=-3))
AGENDA = a.carregar_agenda()
EV = {e["id"]: e for e in AGENDA["eventos"]}


def br(dia, hora, minuto=0):
    """Novembro de 2026: dia 12 é quinta-feira."""
    return datetime(2026, 11, dia, hora, minuto, tzinfo=BR)


class Falso:
    def __init__(self):
        self.chamadas = []

    def chamar(self, metodo, **dados):
        self.chamadas.append((metodo, dados))
        return []


def novo_bot(agora, lista=None, novidades=None):
    tg, estado = Falso(), copy.deepcopy(a.ESTADO_INICIAL)
    bot = a.Bot(tg, AGENDA, estado, salvar=lambda e: None, agora=lambda: agora[0],
                lista=lambda servidor: lista if lista is not None else (_ for _ in ()).throw(OSError("sem rede")),
                novidades=lambda: novidades[0] if novidades and novidades[0] is not None else (_ for _ in ()).throw(OSError("sem rede")))
    return bot, tg


def msg(chat, texto):
    return {"update_id": 1, "message": {"chat": {"id": chat}, "from": {"first_name": "Marco"}, "text": texto}}


class Agenda(unittest.TestCase):
    def test_calendario_do_jogo(self):
        self.assertEqual(a.proximas(EV["boss-king"], br(12, 12), BR)[0], br(12, 22, 30))       # Argo, todo dia
        self.assertEqual(a.proximas(EV["boss-nahma"], br(12, 12), BR)[0], br(13, 21))           # sexta
        self.assertEqual(a.proximas(EV["boss-nahma"], br(13, 22), BR)[0], br(15, 21))           # domingo
        self.assertEqual(a.proximas(EV["boss-tamasa-argo-kaira"], br(12, 12), BR)[0], br(12, 21, 30))  # quinta
        self.assertEqual(a.proximas(EV["boss-tamasa-argo-kaira"], br(12, 22), BR)[0], br(14, 21, 30))  # sábado
        self.assertEqual(a.proximas(EV["boss-kaira"], br(12, 21, 30), BR)[0], br(12, 22))
        self.assertEqual(a.proximas(EV["festival-asmodian"], br(12, 23, 30), BR)[0], br(13, 0))

    def test_reinicios_em_utc(self):
        self.assertEqual(a.proximas(EV["daily"], br(12, 12), BR)[0], br(13, 4))
        self.assertEqual(a.proximas(EV["weekly"], br(12, 12), BR)[0], br(18, 4))                # quarta, 04:00

    def test_chefes_de_campo_do_lado_dele(self):
        nomes = {c["id"]: c["nome"] for c in AGENDA["chefes_campo"]}
        self.assertEqual(nomes["111021"], "Gartua Imortal")
        self.assertEqual(len(nomes), 24)


class Janela(unittest.TestCase):
    def test_horarios_de_fabrica(self):
        e = copy.deepcopy(a.ESTADO_INICIAL)
        self.assertFalse(a.dentro_da_janela(e, br(12, 15), BR))        # quinta à tarde
        self.assertTrue(a.dentro_da_janela(e, br(12, 21), BR))         # quinta à noite
        self.assertTrue(a.dentro_da_janela(e, br(13, 0, 30), BR))      # madrugada de sexta, janela de quinta
        self.assertFalse(a.dentro_da_janela(e, br(13, 1, 30), BR))
        self.assertTrue(a.dentro_da_janela(e, br(14, 0, 30), BR))      # madrugada de sábado, janela de sexta
        self.assertTrue(a.dentro_da_janela(e, br(14, 14), BR))         # sábado à tarde
        self.assertTrue(a.dentro_da_janela(e, br(16, 1, 30), BR))      # madrugada de segunda, janela de domingo
        self.assertFalse(a.dentro_da_janela(e, br(16, 10), BR))

    def test_sempre_e_faixas(self):
        e = copy.deepcopy(a.ESTADO_INICIAL)
        e["janela"] = {"semana": None, "fds": None}
        self.assertTrue(a.dentro_da_janela(e, br(16, 10), BR))
        self.assertEqual(a.ler_faixa("20:30-01:00"), [1230, 60])
        self.assertEqual(a.ler_faixa("21-1"), [1260, 60])
        self.assertIsNone(a.ler_faixa("noite"))
        self.assertIsNone(a.ler_faixa("25:00-01:00"))

    def test_sempre_num_dia_nao_invade_o_dia_seguinte(self):
        e = copy.deepcopy(a.ESTADO_INICIAL)
        e["janela"]["semana"] = None                                   # semana livre, fim de semana 13:00-02:00
        self.assertTrue(a.dentro_da_janela(e, br(13, 10), BR))         # sexta de manhã
        self.assertFalse(a.dentro_da_janela(e, br(14, 10), BR))        # sábado de manhã: vale a faixa do sábado
        self.assertTrue(a.dentro_da_janela(e, br(14, 14), BR))         # sábado à tarde
        self.assertTrue(a.dentro_da_janela(e, br(16, 1, 30), BR))      # madrugada de segunda, faixa de domingo
        e["janela"] = {"semana": [1230, 60], "fds": None}              # o contrário: fim de semana livre
        self.assertTrue(a.dentro_da_janela(e, br(15, 10), BR))         # domingo de manhã
        self.assertFalse(a.dentro_da_janela(e, br(16, 10), BR))        # segunda de manhã


class Avisos(unittest.TestCase):
    def test_avisa_uma_vez_dez_minutos_antes(self):
        agora = [br(12, 22, 19)]
        bot, tg = novo_bot(agora, lista={"bosses": {}})
        bot.receber(msg(7, "/start"))
        tg.chamadas.clear()
        bot.tique()
        self.assertEqual(tg.chamadas, [])                                # 11 minutos antes: ainda não
        agora[0] = br(12, 22, 21)
        bot.tique()
        textos = [d["text"] for m, d in tg.chamadas if m == "sendMessage"]
        self.assertEqual(len(textos), 1)
        self.assertIn("Argo, Rei dos Espíritos em 9 min (22:30)", textos[0])
        bot.tique()
        self.assertEqual(len([1 for m, _ in tg.chamadas if m == "sendMessage"]), 1)   # não repete

    def test_fora_da_janela_nao_envia_nem_acumula(self):
        agora = [br(12, 10, 25)]                                         # Argo das 10:30, quinta de manhã
        bot, tg = novo_bot(agora, lista={"bosses": {}})
        bot.receber(msg(7, "/start"))
        tg.chamadas.clear()
        bot.tique()
        self.assertEqual(tg.chamadas, [])
        self.assertTrue(any(k.startswith("boss-king@") for k in bot.estado["enviados"]))

    def test_desligado_de_fabrica_e_pausa(self):
        agora = [br(12, 20, 55)]                                         # Shugo Festa das 21:00, desligada
        bot, tg = novo_bot(agora, lista={"bosses": {}})
        bot.receber(msg(7, "/start"))
        tg.chamadas.clear()
        bot.tique()
        self.assertEqual([d["text"] for m, d in tg.chamadas if "Shugo" in d.get("text", "")], [])
        bot.estado["ligados"]["festival-asmodian"] = True
        bot.estado["pausado"] = True
        bot.tique()
        self.assertEqual([m for m, _ in tg.chamadas if m == "sendMessage"], [])

    def test_gartua_pela_lista_publica(self):
        agora = [br(12, 21, 0)]
        nasce = br(12, 21, 8).timestamp()
        lista = {"bosses": {"111021": {"state": "dead", "upSince": None, "nextSpawn": nasce, "reportedAt": nasce - 9000, "confirmed": True}}}
        bot, tg = novo_bot(agora, lista=lista)
        bot.receber(msg(7, "/start"))
        tg.chamadas.clear()
        bot.tique()
        textos = [d["text"] for m, d in tg.chamadas if m == "sendMessage"]
        self.assertTrue(any("Gartua Imortal previsto em 8 min (21:08)" in t for t in textos), textos)
        ms = {"bosses": {"111021": dict(lista["bosses"]["111021"], nextSpawn=nasce * 1000)}}
        e = copy.deepcopy(a.ESTADO_INICIAL)
        self.assertEqual(len(a.avisos_campo(AGENDA, e, agora[0], ms)), 1)

    def test_lista_fora_do_ar_nao_derruba(self):
        agora = [br(12, 22, 21)]
        bot, tg = novo_bot(agora, lista=None)
        bot.receber(msg(7, "/start"))
        bot.tique()
        self.assertTrue(bot.erro_lista)
        self.assertIn("não consegui ler a lista", a.texto_proximos(AGENDA, bot.estado, agora[0], bot.lista, bot.erro_lista))


class Conversa(unittest.TestCase):
    def test_so_o_dono(self):
        agora = [br(12, 21)]
        bot, tg = novo_bot(agora, lista={"bosses": {}})
        bot.receber(msg(99, "/lista"))                                   # antes do /start: ninguém é dono
        self.assertEqual(tg.chamadas, [])
        bot.receber(msg(7, "/start"))
        self.assertEqual(bot.estado["dono"], 7)
        n = len(tg.chamadas)
        bot.receber(msg(99, "/start"))
        bot.receber(msg(99, "/lista"))
        self.assertEqual(len(tg.chamadas), n)                            # outro chat: silêncio
        self.assertEqual(bot.estado["dono"], 7)

    def test_lista_e_botao(self):
        agora = [br(12, 21)]
        bot, tg = novo_bot(agora, lista={"bosses": {}})
        bot.receber(msg(7, "/start"))
        bot.receber(msg(7, "/lista"))
        teclas = tg.chamadas[-1][1]["reply_markup"]["inline_keyboard"]
        self.assertEqual(len(teclas), len(AGENDA["eventos"]) + len(a.TIPOS_NOVIDADE))
        rotulos = {t[0]["callback_data"]: t[0]["text"] for t in teclas}
        self.assertTrue(rotulos["t:boss-nahma"].startswith("\U0001f514"))        # ligado de fábrica
        self.assertTrue(rotulos["t:festival-asmodian"].startswith("\U0001f515"))  # desligado de fábrica
        cq = {"id": "1", "data": "t:festival-asmodian", "message": {"message_id": 5, "chat": {"id": 7}}}
        bot.receber({"update_id": 2, "callback_query": cq})
        self.assertTrue(a.ligado(bot.estado, "festival-asmodian"))
        self.assertEqual([m for m, _ in tg.chamadas[-2:]], ["editMessageReplyMarkup", "answerCallbackQuery"])
        cq["message"]["chat"]["id"] = 99
        bot.receber({"update_id": 3, "callback_query": cq})              # botão de outro chat não muda nada
        self.assertTrue(a.ligado(bot.estado, "festival-asmodian"))
        bot.receber(msg(7, "/campo"))
        self.assertEqual(len(tg.chamadas[-1][1]["reply_markup"]["inline_keyboard"]), 24)

    def test_comandos_de_ajuste(self):
        agora = [br(12, 21)]
        bot, tg = novo_bot(agora, lista={"bosses": {}})
        bot.receber(msg(7, "/start"))
        bot.receber(msg(7, "/antes 15"))
        self.assertEqual(bot.estado["antes_min"], 15)
        bot.receber(msg(7, "/janela fds 12:00-03:00"))
        self.assertEqual(bot.estado["janela"]["fds"], [720, 180])
        bot.receber(msg(7, "/janela sempre"))
        self.assertEqual(bot.estado["janela"], {"semana": None, "fds": None})
        bot.receber(msg(7, "/proximos"))
        self.assertIn("Senhor Guardião Nahma", tg.chamadas[-1][1]["text"])
        bot.receber(msg(7, "/qualquercoisa"))
        self.assertIn("Não conheço", tg.chamadas[-1][1]["text"])

    def test_leituras_se_apresentam_pelo_nome(self):
        import io
        vistos = []

        def falso(req, timeout=0):
            vistos.append((req.full_url, req.get_header("User-agent")))
            return io.BytesIO(b'{"bosses": {"111021": {"state": "up", "upSince": 1794366801}}, "itens": []}')
        original = a.urllib.request.urlopen
        a.urllib.request.urlopen = falso
        try:
            self.assertIn("111021", a.ler_lista(2405)["bosses"])
            self.assertEqual(a.ler_novidades()["itens"], [])
        finally:
            a.urllib.request.urlopen = original
        self.assertEqual(vistos[0][0], "https://cdn.a2tools.app/feeds/boss-timers/2405.json")
        self.assertTrue(all(nome and nome.startswith("aion-avisos/") for _, nome in vistos), vistos)

    def test_token_nao_aparece_em_erro(self):
        tg = a.Telegram("123:SEGREDO")
        try:
            tg.chamar("getMe")
        except RuntimeError as e:
            self.assertNotIn("SEGREDO", str(e))


class Novidades(unittest.TestCase):
    VELHO = {"id": "codigo-TAKEFLIGHTAION2", "tipo": "codigo", "titulo": "Código TAKEFLIGHTAION2", "ativo": False}
    VALENDO = {"id": "evento-lancamento", "tipo": "evento", "titulo": "Recompensas de lançamento", "texto": "Resgate no jogo.",
               "expira": "02/12/2026", "fonte": "https://exemplo/noticia", "ativo": True}
    NOVO = {"id": "codigo-NOVO123", "tipo": "codigo", "titulo": "Código novo: NOVO123", "texto": "4 Energias de Od.", "ativo": True}

    def test_primeira_leitura_so_manda_o_que_esta_valendo(self):
        agora = [br(12, 21)]
        arq = [{"itens": [self.VELHO, self.VALENDO]}]
        bot, tg = novo_bot(agora, lista={"bosses": {}}, novidades=arq)
        bot.receber(msg(7, "/start"))
        tg.chamadas.clear()
        bot.tique()
        textos = [d["text"] for m, d in tg.chamadas if m == "sendMessage"]
        self.assertEqual(len(textos), 1)
        self.assertIn("Recompensas de lançamento", textos[0])
        self.assertIn("Vale até 02/12/2026", textos[0])
        self.assertIn("https://exemplo/noticia", textos[0])
        bot.tique()
        self.assertEqual(len([1 for m, _ in tg.chamadas if m == "sendMessage"]), 1)   # não repete

    def test_codigo_novo_chega_e_espera_a_janela(self):
        agora = [br(12, 15)]                                             # fora da janela
        arq = [{"itens": [self.VELHO]}]
        bot, tg = novo_bot(agora, lista={"bosses": {}}, novidades=arq)
        bot.receber(msg(7, "/start"))
        tg.chamadas.clear()
        bot.tique()
        arq[0] = {"itens": [self.VELHO, self.NOVO]}
        bot._novidades_em = 0
        bot.tique()
        self.assertEqual([m for m, _ in tg.chamadas if m == "sendMessage"], [])       # guardado
        agora[0] = br(12, 20, 40)                                        # janela abriu
        bot.tique()
        textos = [d["text"] for m, d in tg.chamadas if m == "sendMessage"]
        self.assertEqual(len(textos), 1)
        self.assertIn("NOVO123", textos[0])

    def test_tipo_desligado_e_arquivo_ruim(self):
        e = copy.deepcopy(a.ESTADO_INICIAL)
        e["novidades_vistas"] = []
        e["ligados"]["nov:codigo"] = False
        self.assertEqual(a.novidades_a_enviar(e, {"itens": [self.NOVO]}), [])
        self.assertEqual(a.novidades_a_enviar(e, {"itens": [{"id": 1}, "x", {"id": "a", "tipo": "outro", "titulo": "t"}]}), [])
        self.assertEqual(a.novidades_a_enviar(e, None), [])
        self.assertIn("Nada valendo", a.texto_novidades_ativas({"itens": [self.VELHO]}))

    def test_sem_rede_nao_derruba(self):
        agora = [br(12, 21)]
        bot, tg = novo_bot(agora, lista={"bosses": {}}, novidades=[None])
        bot.receber(msg(7, "/start"))
        bot.tique()
        bot.receber(msg(7, "/novidades"))
        self.assertIn("Ainda não li", tg.chamadas[-1][1]["text"])


if __name__ == "__main__":
    unittest.main()
