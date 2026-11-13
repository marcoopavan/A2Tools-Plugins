import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL("../plugins/grupo/logic.js", import.meta.url), "utf8"), context);
const L = context.GrupoLogic;
const plain = (v) => JSON.parse(JSON.stringify(v));

const party = [
  { name: "Templario", slot: 3, level: 45, gearScore: 2353, combatPower: 116017 },
  { name: "marcoopavan", slot: 1, level: 45, gearScore: 2831, combatPower: 156291 },
  { name: "Novato", slot: 2, level: 45, gearScore: 0, combatPower: 0 },
];

test("o grupo só conta com dois ou mais, na ordem das posições", () => {
  assert.deepEqual(plain(L.roster({ name: "marcoopavan", party: [party[1]] })), []);
  assert.deepEqual(plain(L.roster({ name: "marcoopavan", party: null })), []);
  assert.deepEqual(plain(L.roster(null)), []);
  const list = L.roster({ name: "marcoopavan", party });
  assert.deepEqual(list.map((m) => m.name), ["marcoopavan", "Novato", "Templario"]);
  assert.deepEqual(list.map((m) => m.me), [true, false, false]);
  assert.equal(list[1].gearScore, null, "um 0 é quem ainda não chegou");
});

test("a média usa só quem já tem o número", () => {
  const list = L.roster({ name: "marcoopavan", party });
  assert.equal(L.average(list, "gearScore"), 2592);
  assert.equal(L.average(list, "combatPower"), 136154);
  assert.equal(L.average([], "gearScore"), null);
});

test("a janela abre quando o grupo muda e fecha quando acaba", () => {
  const a = L.signature(L.roster({ party: party.slice(0, 2) }));
  const b = L.signature(L.roster({ party }));
  assert.equal(L.windowMove("", a), "show");
  assert.equal(L.windowMove(a, a), null, "os números mudando não reabrem");
  assert.equal(L.windowMove(a, b), "show");
  assert.equal(L.windowMove(b, ""), "hide");
  assert.equal(L.windowMove("", ""), null);
});

test("números em português", () => {
  assert.equal(L.fmt(156291), "156.291");
  assert.equal(L.fmt(null), "—");
});
