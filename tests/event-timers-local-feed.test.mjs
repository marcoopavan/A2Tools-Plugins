import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

// Nossa versão: a lista compartilhada lida de um arquivo local.
const source = readFileSync(new URL("../plugins/event-timers/plugin.js", import.meta.url), "utf8");
const start = source.indexOf("function usableLocalFeed(");
const end = source.indexOf("let feedReading = false;");
assert.ok(start > 0 && end > start, "as funções do arquivo local estão onde o teste espera");

function api(stored) {
  const context = vm.createContext({});
  vm.runInContext(`const a2 = { storage: { get: async (key) => { if (key !== "shared-feed") throw new Error(key); const v = ${JSON.stringify(stored)}; if (v === "THROW") throw new Error("disk"); return v; } } };
    ${source.slice(start, end)}
    globalThis.api = { usableLocalFeed, localFeed };`, context);
  return context.api;
}
const gartua = { state: "dead", upSince: null, nextSpawn: 1794500000, reportedAt: 1794490000, confirmed: true };

test("the published file as downloaded is used", async () => {
  const out = await api({ bosses: { "111021": gartua } }).localFeed(2405);
  assert.equal(out.bosses["111021"].nextSpawn, 1794500000);
});
test("no file, a broken file or a read error means no local feed", async () => {
  assert.equal(await api(null).localFeed(2405), null);
  assert.equal(await api("THROW").localFeed(2405), null);
  assert.equal(await api({ bosses: [] }).localFeed(2405), null);
  assert.equal(await api([1, 2]).localFeed(2405), null);
  assert.equal(await api({ error: "not found" }).localFeed(2405), null);
});
test("a file of another server is not used", async () => {
  assert.equal(await api({ server: 1201, bosses: { "101021": gartua } }).localFeed(2405), null);
  assert.ok(await api({ server: 2405, bosses: { "111021": gartua } }).localFeed(2405));
});
test("readFeed falls back to the local file and reads it again sooner", () => {
  assert.match(source, /const local = await localFeed\(server\);/);
  assert.match(source, /feedTimer = setTimeout\(readFeed, LOCAL_FEED_EVERY_MS\)/);
});
