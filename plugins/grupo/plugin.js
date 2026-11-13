// Grupo: o GS e o CP de cada um do grupo. A janela abre sozinha quando
// alguém entra ou sai e some depois de alguns segundos, para não ficar na
// frente do jogo. Nada sai do computador.
const L = globalThis.GrupoLogic;
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// prefs: { auto: abrir sozinha, keep: ficar aberta enquanto houver grupo, seconds }
const prefs = { auto: true, keep: false, seconds: 25 };
let list = [];
let shownFor = "";
let hideTimer = 0;

function render() {
  const body = $(".membros tbody");
  body.replaceChildren();
  $(".vazio").hidden = list.length > 0;
  $(".membros").hidden = list.length === 0;
  for (const m of list) {
    const tr = el("tr", m.me ? "eu" : null);
    tr.append(el("td", "nome", m.name), el("td", "n", m.level ? String(m.level) : "—"), el("td", "n", L.fmt(m.gearScore)), el("td", "n", L.fmt(m.combatPower)));
    body.append(tr);
  }
  const foot = $(".media");
  foot.replaceChildren();
  if (list.length) {
    foot.append(el("td", "nome", `Média de ${list.length}`), el("td"), el("td", "n", L.fmt(L.average(list, "gearScore"))), el("td", "n", L.fmt(L.average(list, "combatPower"))));
  }
}

function move(kind) {
  clearTimeout(hideTimer);
  if (!prefs.auto) return;
  if (kind === "show") {
    Promise.resolve(a2.window?.show?.()).catch(() => {});
    if (!prefs.keep) hideTimer = setTimeout(() => Promise.resolve(a2.window?.hide?.()).catch(() => {}), prefs.seconds * 1000);
  } else if (kind === "hide") {
    Promise.resolve(a2.window?.hide?.()).catch(() => {});
  }
}

a2.on("character", (c) => {
  list = L.roster(c);
  const now = L.signature(list);
  const kind = L.windowMove(shownFor, now);
  shownFor = now;
  render();
  if (kind) move(kind);
});

function bind(sel, key) {
  const box = $(sel);
  box.checked = !!prefs[key];
  box.addEventListener("change", () => {
    prefs[key] = box.checked;
    a2.storage.set("prefs", prefs).catch(() => {});
  });
}

(async () => {
  const saved = await a2.storage.get("prefs").catch(() => null);
  if (saved && typeof saved === "object") {
    if (typeof saved.auto === "boolean") prefs.auto = saved.auto;
    if (typeof saved.keep === "boolean") prefs.keep = saved.keep;
  }
  bind(".auto", "auto");
  bind(".keep", "keep");
  render();
  a2.ready();
})();
