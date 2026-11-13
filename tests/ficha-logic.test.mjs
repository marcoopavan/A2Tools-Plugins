import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../plugins/ficha/logic.js", import.meta.url), "utf8"), context);
const L = context.FichaLogic;
const plain = (v) => JSON.parse(JSON.stringify(v));

const HOUR = 3_600_000;
// 13/11/2026 13:00 UTC (10:00 em Brasília): depois da virada das 07:00 UTC.
const now = Date.UTC(2026, 10, 13, 13, 0, 0);

test("a chave só existe com o servidor conhecido", () => {
  assert.equal(L.charKey({ name: "marcoopavan", serverId: 2405 }), "marcoopavan@2405");
  assert.equal(L.charKey({ name: "marcoopavan" }), null);
  assert.equal(L.charKey(null), null);
});

test("o dia do jogo vira às 07:00 UTC e a semana na quarta", () => {
  assert.equal(L.gameDay(Date.UTC(2026, 10, 13, 6, 59)), "2026-11-12");
  assert.equal(L.gameDay(Date.UTC(2026, 10, 13, 7, 0)), "2026-11-13");
  // 13/11/2026 é sexta: a semana começou na quarta 11/11.
  assert.equal(L.gameWeek(now), "2026-11-11");
  // Quarta às 06:59 UTC ainda é a semana anterior.
  assert.equal(L.gameWeek(Date.UTC(2026, 10, 11, 6, 59)), "2026-11-04");
  assert.equal(L.gameWeek(Date.UTC(2026, 10, 11, 7, 0)), "2026-11-11");
});

test("um campo nulo não apaga o que já se sabia", () => {
  const first = L.mergeCharacter(null, {
    name: "marcoopavan", serverId: 2405, class: "궁성", level: 45, combatPower: 156291, gearScore: 2831,
    odyleEnergy: { basic: 135, charged: 95 }, contentCounts: { 0: [5, 5], 4: [4, 0], 8: null },
    kinahToday: 88309, abyssPoints: [10220, 2000000], cooldownReduction: 3.8,
  }, now);
  assert.equal(first.combatPower, 156291);
  assert.deepEqual(plain(first.contentCounts), { 0: [5, 5], 4: [4, 0] }, "o nulo não entra");
  // Medidor aberto no meio da sessão: quase tudo nulo.
  const later = L.mergeCharacter(first, {
    name: "marcoopavan", serverId: 2405, combatPower: null, gearScore: 0, odyleEnergy: null,
    contentCounts: { 4: [3, 0] }, kinahToday: null, abyssPoints: null,
  }, now + HOUR);
  assert.equal(later.combatPower, 156291);
  assert.equal(later.gearScore, 2831, "0 não é um GS");
  assert.deepEqual(plain(later.odyleEnergy), { basic: 135, charged: 95 });
  assert.deepEqual(plain(later.contentCounts), { 0: [5, 5], 4: [3, 0] }, "só o que mudou");
  assert.equal(later.kinahToday, 88309);
  assert.deepEqual(plain(later.abyssPoints), [10220, 2000000]);
  assert.equal(later.seenAt, now + HOUR);
  assert.equal(first.seenAt, now, "o anterior não muda");
});

test("a evolução ganha um ponto só quando CP ou GS muda", () => {
  let p = L.pushProgress([], 155886, 2831, now);
  p = L.pushProgress(p, 155886, 2831, now + 1);
  assert.equal(p.length, 1);
  p = L.pushProgress(p, 156291, 2831, now + 2);
  assert.deepEqual(plain(p), [[now, 155886, 2831], [now + 2, 156291, 2831]]);
  // O que veio nulo repete o último conhecido: não é uma mudança.
  p = L.pushProgress(p, null, null, now + 3);
  assert.equal(p.length, 2);
  p = L.pushProgress(p, null, 2832, now + 4);
  assert.deepEqual(plain(p.at(-1)), [now + 4, 156291, 2832]);
  assert.deepEqual(plain(L.pushProgress([], null, null, now)), []);
  // O limite corta os mais antigos.
  let q = [];
  for (let i = 0; i < 10; i++) q = L.pushProgress(q, 100 + i, 1, now + i, 4);
  assert.deepEqual(q.map((x) => x[1]), [106, 107, 108, 109]);
});

test("por dia: o último ponto de cada dia e a diferença para o anterior", () => {
  const d = (day, h) => Date.UTC(2026, 10, day, h);
  const list = [[d(11, 20), 154906, 2825], [d(12, 23), 153385, 2825], [d(13, 3), 155886, 2831], [d(13, 13), 156291, 2831]];
  // 13/11 03:00 UTC ainda é o dia 12 do jogo.
  assert.deepEqual(plain(L.byDay(list)), [
    { day: "2026-11-13", cp: 156291, gs: 2831, cpDelta: 405, gsDelta: 0 },
    { day: "2026-11-12", cp: 155886, gs: 2831, cpDelta: 980, gsDelta: 6 },
    { day: "2026-11-11", cp: 154906, gs: 2825, cpDelta: null, gsDelta: null },
  ]);
  assert.equal(L.byDay(list, 2).length, 2);
  assert.deepEqual(plain(L.byDay(null)), []);
});

test("o maior valor de cada período, com limite de períodos", () => {
  let m = L.noteMax({}, "2026-11-13", 520);
  m = L.noteMax(m, "2026-11-13", 88309);
  m = L.noteMax(m, "2026-11-13", 1017);
  assert.deepEqual(plain(m), { "2026-11-13": 88309 });
  assert.deepEqual(plain(L.noteMax(m, "2026-11-14", null)), { "2026-11-13": 88309 });
  let w = {};
  for (let i = 1; i <= 5; i++) w = L.noteMax(w, `2026-11-0${i}`, i, 3);
  assert.deepEqual(Object.keys(w), ["2026-11-03", "2026-11-04", "2026-11-05"]);
});

test("dos atributos fica só a primeira folha de cada dia", () => {
  let s = L.noteStatsDay({}, { 215: 300, 7: 1200 }, now);
  s = L.noteStatsDay(s, { 215: 300, 7: 1500 }, now + HOUR);
  assert.deepEqual(plain(s), { "2026-11-13": { 215: 300, 7: 1200 } });
  s = L.noteStatsDay(s, { 215: 320, 7: 1250 }, now + 24 * HOUR);
  assert.deepEqual(Object.keys(s), ["2026-11-13", "2026-11-14"]);
  assert.deepEqual(plain(L.noteStatsDay({}, {}, now)), {}, "folha vazia não conta");
  assert.deepEqual(plain(L.diffStats({ 215: 300, 7: 1200 }, { 215: 320, 7: 1200, 9: 4 })), { 215: [300, 320], 9: [null, 4] });
});

test("abates, mortes e pontos somam por dia do jogo", () => {
  let k = L.noteKda({}, "kill", null, now);
  k = L.noteKda(k, "death", null, now);
  k = L.noteKda(k, "death", null, now);
  k = L.noteKda(k, "assist", null, now);
  k = L.noteKda(k, "points", 913, now);
  k = L.noteKda(k, "zone", null, now);
  assert.deepEqual(plain(k), { "2026-11-13": { kills: 1, assists: 1, deaths: 2, points: 913 } });
});

test("números no formato daqui", () => {
  assert.equal(L.fmt(156291), "156.291");
  assert.equal(L.fmt(2831), "2.831");
  assert.equal(L.fmt(95), "95");
  assert.equal(L.fmt(null), "—");
  assert.equal(L.signed(405), "+405");
  assert.equal(L.signed(-1521), "−1.521");
  assert.equal(L.signed(0), "");
});

// A bolsa e as cartas, como o medidor as manda desde a leitura de itens.
const ITEMS = [[930100031, 542223, 1], [930100001, 13643, 1], [930100003, 6719, 1], [930100019, 17880, 1], [511490001, 137, 1], [610730011, 2, 15]];
const SINO = { item: 810430001, worn: true, position: 44, level: 2, exp: 8600, attribute: 7, value: 22, lines: [[14710000, 1], [14770000, 1], [14790000, 1], [14750000, 3]] };

test("a carteira soma só as moedas", () => {
  assert.deepEqual(plain(L.wallet(ITEMS)), { 930100031: 542223, 930100001: 13643, 930100003: 6719, 930100019: 17880 });
  assert.deepEqual(plain(L.wallet(null)), {});
  assert.deepEqual(plain(L.wallet([[930100031, 5, 1], [930100031, 7, 18], ["x"], null])), { 930100031: 12 });
});

test("a lista inteira troca a guardada; as mudanças só mexem nas moedas", () => {
  const c = { name: "marcoopavan", serverId: 2405 };
  const first = L.mergeCharacter(null, { ...c, items: ITEMS, itemsWhole: true, arcana: [SINO] }, now);
  assert.equal(first.items.length, 6);
  assert.equal(first.itemsWhole, true);
  assert.equal(first.wallet[930100031], 542223);
  assert.equal(first.arcana.length, 1);
  // Medidor aberto no meio da sessão seguinte: só o Kinah vinculado mudou.
  const later = L.mergeCharacter(first, { ...c, items: [[930100001, 1643, 1]], itemsWhole: false, arcana: [] }, now + HOUR);
  assert.equal(later.items.length, 6, "a lista inteira guardada fica");
  assert.equal(later.wallet[930100001], 1643);
  assert.equal(later.wallet[930100031], 542223);
  assert.equal(later.arcana.length, 1);
  // Sem itens no evento, nada muda.
  const none = L.mergeCharacter(later, { ...c, items: null, itemsWhole: null, arcana: null }, now + 2 * HOUR);
  assert.equal(none.wallet[930100001], 1643);
});

test("a carteira de cada dia do jogo guarda a última vista", () => {
  let map = L.noteWalletDay({}, { 930100031: 10 }, now);
  map = L.noteWalletDay(map, { 930100031: 25 }, now + HOUR);
  map = L.noteWalletDay(map, { 930100031: 40 }, now + 24 * HOUR);
  assert.deepEqual(plain(map), { "2026-11-13": { 930100031: 25 }, "2026-11-14": { 930100031: 40 } });
  assert.deepEqual(plain(L.noteWalletDay(map, {}, now)), plain(map));
});

test("uma carta em palavras", () => {
  const d = plain(L.describeCard(SINO));
  assert.equal(d.name, "Sino do Vigor");
  assert.equal(d.attribute, "Justiça 22");
  assert.deepEqual(d.lines, ["Olho de Sentinela +1", "Olho da Contenção +1", "Pacto de Revitalização +1", "Determinação do Caçador +3"]);
  assert.equal(L.describeCard({ item: 810230002, attribute: 16, value: 20, lines: [[99, 1]] }).name, "Manuscrito da Magia");
  assert.equal(L.describeCard({ item: 810230002, attribute: 3, value: 20, lines: [[99, 1]] }).lines[0], "Habilidade 99 +1");
});

test("a Compreensão do Tipo em palavras, pela página em uso", () => {
  const u = {
    page: 3,
    essences: { 2: 1456, 6: 23645 },
    kinds: [
      { kind: 2, pages: [{ page: 1, lines: [[193, 32, 3, true]] }, { page: 3, lines: [[31, 12, 4, true], [28, 172, 4, true], [47, 199, 5, false], [0, 0, 0, false], [999, 7, 1, true]] }] },
      { kind: 5, pages: [{ page: 3, lines: [[379, 254, 4, true]] }] },
    ],
  };
  const d = plain(L.describeUnderstanding(u));
  assert.equal(d[0].name, "Intelectual");
  assert.equal(d[0].held, 1456);
  assert.deepEqual(d[0].lines.map((l) => l.text), ["Ataque Máx. 12", "Amplificação de Dano 1,72%", "Tolerância a Dano Crítico 1,99%", "Atributo 999 7"]);
  assert.deepEqual(d[0].lines.map((l) => l.locked), [true, true, false, true]);
  assert.equal(d[1].name, "Tipo 5");
  assert.equal(L.describeUnderstanding({ page: 3, essences: { 1: 605, 3: 600 }, kinds: [{ kind: 3, pages: [{ page: 3, lines: [] }] }] })[0].held, 605, "o tipo 3 gasta a essência 1");
  assert.equal(d[1].lines[0].text, "Amplificação de Dano em JvA 2,54%");
  assert.deepEqual(plain(L.describeUnderstanding(null)), []);
  const c = { name: "marcoopavan", serverId: 2405 };
  const kept = L.mergeCharacter(L.mergeCharacter(null, { ...c, petUnderstanding: u }, now), { ...c, petUnderstanding: null }, now + HOUR);
  assert.equal(kept.petUnderstanding.page, 3);
});
