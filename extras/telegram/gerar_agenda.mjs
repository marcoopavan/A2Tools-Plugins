// Gera agenda.json para o bot de avisos, a partir do calendário do plugin
// Event Timers (plugins/event-timers/schedule.js, que vem das tabelas do jogo).
// Uso: node extras/telegram/gerar_agenda.mjs [lado] [servidor]
//   lado: asmodian (padrão) ou elyos; servidor: 2405 (padrão, Marchutan).
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const lado = process.argv[2] || "asmodian";
const servidor = Number(process.argv[3] || 2405);
const origem = new URL("../../plugins/event-timers/schedule.js", import.meta.url);
const contexto = vm.createContext({});
vm.runInContext(`${readFileSync(origem, "utf8")}\nglobalThis.saida = { EVENTS, FIELD_BOSSES, EVENT_TEXT };`, contexto);
const { EVENTS, FIELD_BOSSES, EVENT_TEXT } = contexto.saida;
const texto = (chave) => EVENT_TEXT[chave]?.pt || EVENT_TEXT[chave]?.en || chave;
const tipo = { event: "evento", boss: "chefe", reset: "reinicio" };

const eventos = EVENTS.filter((e) => !e.side || e.side === lado).map((e) => ({
  id: e.id,
  nome: texto(e.name),
  tipo: tipo[e.kind] || e.kind,
  onde: (e.where || []).map(texto),
  dias: e.days,
  inicios: e.starts,
  minutos: e.minutes || 0,
  utc: !!e.utc,
  tambem: (e.also || []).map(texto),
}));
const chefes_campo = Object.entries(FIELD_BOSSES)
  .filter(([, b]) => b.side === lado)
  .map(([id, b]) => ({ id, nome: texto(b.name), nivel: b.level, onde: texto(b.where) }))
  .sort((a, b) => b.nivel - a.nivel || a.nome.localeCompare(b.nome, "pt"));

const agenda = {
  aviso: "Gerado por gerar_agenda.mjs a partir de plugins/event-timers/schedule.js. Não edite à mão.",
  lado,
  servidor,
  fuso_horas: -3,
  eventos,
  chefes_campo,
};
writeFileSync(new URL("agenda.json", import.meta.url), `${JSON.stringify(agenda, null, 1)}\n`);
console.log(`${eventos.length} eventos, ${chefes_campo.length} chefes de campo`);
