// Ficha do Personagem: o que o medidor sabe do seu personagem, gravado em
// disco a cada mudança (plugin-data/ficha/estado.json e historico.json), e
// mostrado numa janela. Nada sai do computador.
const L = globalThis.FichaLogic;
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// O medidor diz a classe em coreano.
const CLASSES = {
  "검성": "Gladiador", "수호성": "Templário", "살성": "Assassino", "궁성": "Arqueiro", "마도성": "Mago",
  "정령성": "Espiritualista", "치유성": "Clérigo", "호법성": "Encantador", "권성": "Lutador",
};
// Os ids de atributo que já têm nome conferido. Os outros aparecem pelo id.
const STAT_NAMES = { 215: "Redução de recarga", 385: "Aumento de recarga" };

// estado:    { v, last, chars: { "<nome>@<servidor>": ficha atual } }
// historico: { v, chars: { "<nome>@<servidor>": { progress, kinah, abyss, statsByDay, kda, wallet } } }
const state = { estado: { v: 1, last: null, chars: {} }, historico: { v: 1, chars: {} } };
let me = null; // a chave de quem está jogando
let lastSheet = null; // a folha de atributos que chegou antes de se saber quem joga

// ── Gravar ─────────────────────────────────────────────────────────────────
// Junta as mudanças próximas numa gravação só. Os atributos mudam a cada
// bônus em combate: por eles, no máximo uma gravação a cada 30 s.
const dirty = new Set();
let saveTimer = 0;
let saveAt = Infinity;
function flush() {
  clearTimeout(saveTimer);
  saveTimer = 0;
  saveAt = Infinity;
  for (const k of dirty) a2.storage.set(k, state[k]).catch((e) => console.warn(e));
  dirty.clear();
}
// Vale o prazo mais curto pedido: uma gravação lenta já marcada (atributos)
// não segura uma mudança do personagem.
function save(key, wait = 1500) {
  dirty.add(key);
  const at = Date.now() + wait;
  if (saveTimer && at >= saveAt) return;
  clearTimeout(saveTimer);
  saveAt = at;
  saveTimer = setTimeout(flush, wait);
}
window.addEventListener("pagehide", flush);
const hist = (key) => (state.historico.chars[key] ||= { progress: [], kinah: {}, abyss: {}, statsByDay: {}, kda: {} });

// ── O que o medidor diz ────────────────────────────────────────────────────
a2.on("character", (c) => {
  const key = L.charKey(c);
  if (!key) return;
  const now = Date.now();
  me = key;
  state.estado.last = key;
  const ficha = (state.estado.chars[key] = L.mergeCharacter(state.estado.chars[key], c, now));
  const h = hist(key);
  h.progress = L.pushProgress(h.progress, ficha.combatPower, ficha.gearScore, now);
  if (ficha.kinahToday != null) h.kinah = L.noteMax(h.kinah, L.gameDay(now), ficha.kinahToday);
  if (ficha.abyssPoints) h.abyss = L.noteMax(h.abyss, L.gameWeek(now), ficha.abyssPoints[0]);
  if (ficha.wallet) h.wallet = L.noteWalletDay(h.wallet, ficha.wallet, now);
  if (lastSheet) takeStats(lastSheet, now);
  save("estado");
  save("historico");
  render();
});

function takeStats(s, now) {
  if (!s || !s.stats || typeof s.stats !== "object") return;
  if (!me) {
    lastSheet = s;
    return;
  }
  lastSheet = null;
  const ficha = (state.estado.chars[me] ||= {});
  ficha.stats = { ...s.stats };
  ficha.statsAt = now;
  if (Number.isFinite(s.cooldownReduction)) ficha.cooldownReduction = s.cooldownReduction;
  const h = hist(me);
  const before = Object.keys(h.statsByDay).length;
  h.statsByDay = L.noteStatsDay(h.statsByDay, s.stats, now);
  save("estado", 30_000);
  if (Object.keys(h.statsByDay).length !== before) save("historico");
  renderStats();
}
a2.on("stats", (s) => takeStats(s, Date.now()));

a2.on("kda", (e, meta) => {
  if (!me || !e) return;
  const at = (meta && meta.at) || e.at || Date.now();
  const h = hist(me);
  h.kda = L.noteKda(h.kda, e.kind, e.amount, at);
  save("historico");
  renderToday();
});

a2.on("compact", (on) => document.body.classList.toggle("compacto", !!on));

// ── Mostrar ────────────────────────────────────────────────────────────────
function ago(at) {
  if (!at) return "";
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}
function delta(node, n) {
  node.textContent = L.signed(n);
  node.classList.toggle("sobe", n > 0);
  node.classList.toggle("desce", n < 0);
}
function row(dl, label, value, small, frac) {
  dl.append(el("dt", null, label));
  const dd = el("dd", null, value);
  if (small) dd.append(" ", el("small", null, small));
  dl.append(dd);
  if (frac != null) {
    const bar = el("div", "barra");
    const fill = el("span");
    fill.style.width = `${Math.max(0, Math.min(100, frac * 100)).toFixed(1)}%`;
    bar.append(fill);
    dl.append(bar);
  }
}

function renderToday() {
  const f = me && state.estado.chars[me];
  const dl = $(".hoje");
  dl.replaceChildren();
  if (!f) return;
  const h = hist(me);
  const day = L.gameDay(Date.now());
  if (f.kinahToday != null) row(dl, "Kinah do dia", L.fmt(f.kinahToday), "de 1.000.000", f.kinahToday / 1_000_000);
  if (f.abyssPoints) {
    const [p, lim] = f.abyssPoints;
    row(dl, "Pontos de Abismo da semana", L.fmt(p), lim ? `de ${L.fmt(lim)}` : "", lim ? p / lim : null);
  }
  if (f.odyleEnergy) row(dl, "Energia de Od", L.fmt(f.odyleEnergy.basic), `+ ${L.fmt(f.odyleEnergy.charged)} carregada`);
  const duty = f.contentCounts && f.contentCounts[0];
  if (Array.isArray(duty)) row(dl, "Missões de Dever", `${duty[0] ?? 0} feitas`, `${duty[1] ?? 0} aceitas`);
  const k = h.kda[day];
  if (k) row(dl, "Abates · assist. · mortes", `${k.kills} · ${k.assists} · ${k.deaths}`, k.points ? `+${L.fmt(k.points)} PA` : "");
  if (!dl.children.length) dl.append(el("dt", null, "O jogo ainda não disse nada hoje."), el("dd"));
}

// A bolsa: as moedas com nome conferido, na ordem de CURRENCIES.
function renderWallet() {
  const f = me && state.estado.chars[me];
  const dl = $(".bolsa");
  dl.replaceChildren();
  const w = (f && f.wallet) || {};
  $(".sec-bolsa").hidden = !Object.keys(w).length;
  if (!Object.keys(w).length) return;
  for (const [id, name] of L.CURRENCIES) {
    if (w[id] == null || id === 930100001) continue;
    const bound = id === 930100031 && w[930100001] ? `+ ${L.fmt(w[930100001])} vinculado` : "";
    row(dl, name, L.fmt(w[id]), bound);
  }
  const stacks = Array.isArray(f.items) ? f.items.length : 0;
  $(".bolsa-pe").textContent = [
    stacks ? `${stacks} itens gravados` : "",
    f.itemsWhole ? "" : "só o que mudou: a lista inteira vem no login",
    ago(f.itemsAt),
  ].filter(Boolean).join(" · ");
}

// As cartas de Arcano: as equipadas na ordem do jogo, depois as guardadas.
function renderArcana() {
  const f = me && state.estado.chars[me];
  const box = $(".arcana");
  box.replaceChildren();
  const cards = ((f && f.arcana) || []).map(L.describeCard).sort((a, b) => b.worn - a.worn || a.position - b.position);
  $(".sec-arcana").hidden = !cards.length;
  for (const c of cards) {
    const head = el("div", "carta");
    head.append(el("b", null, `${c.name} +${c.level}`), " ", el("small", null, [c.attribute, c.exp ? `${L.fmt(c.exp)} EXP` : "", c.worn ? "" : "guardada"].filter(Boolean).join(" · ")));
    box.append(head, el("div", "linhas", c.lines.join(" · ")));
  }
}

// A Compreensão do Tipo: a página em uso de cada tipo. Fechada até pedir.
function renderUnderstanding() {
  const f = me && state.estado.chars[me];
  const kinds = L.describeUnderstanding(f && f.petUnderstanding);
  $(".sec-compr").hidden = !kinds.length;
  const box = $(".compr");
  box.replaceChildren();
  for (const k of kinds) {
    const head = el("div", "carta");
    head.append(el("b", null, k.name), " ", el("small", null, [k.page ? `página ${k.page}` : "", k.held != null ? `${L.fmt(k.held)} de essência` : ""].filter(Boolean).join(" · ")));
    const lines = el("div", "linhas");
    k.lines.forEach((l, i) => {
      if (i) lines.append(" · ");
      lines.append(el("span", l.locked ? null : "aberta", l.text));
    });
    box.append(head, lines);
  }
}

function renderProgress() {
  const body = $(".evo tbody");
  body.replaceChildren();
  if (!me) return;
  const rows = L.byDay(hist(me).progress, 7);
  for (const r of rows) {
    const tr = el("tr");
    const [y, m, d] = r.day.split("-");
    tr.append(el("td", null, `${d}/${m}`), el("td", "n", L.fmt(r.cp)));
    const dc = el("td", "d");
    delta(dc, r.cpDelta);
    tr.append(dc, el("td", "n", L.fmt(r.gs)));
    const dg = el("td", "d");
    delta(dg, r.gsDelta);
    tr.append(dg);
    body.append(tr);
  }
  const top = rows[0];
  delta($(".cpd"), top ? top.cpDelta : null);
  delta($(".gsd"), top ? top.gsDelta : null);
}

function renderStats() {
  const f = me && state.estado.chars[me];
  const sheet = (f && f.stats) || {};
  const ids = Object.keys(sheet).sort((a, b) => a - b);
  const cd = f && Number.isFinite(f.cooldownReduction) ? ` · recarga −${String(f.cooldownReduction).replace(".", ",")}%` : "";
  $(".resumo").textContent = ids.length ? `${ids.length} atributos gravados${cd} · ${ago(f.statsAt)}` : "O jogo manda a folha no login.";
  const body = $(".attrs tbody");
  body.replaceChildren();
  for (const id of ids) {
    const tr = el("tr");
    tr.append(el("td", null, STAT_NAMES[id] || `Atributo ${id}`), el("td", "n", L.fmt(sheet[id])));
    body.append(tr);
  }
}

function render() {
  const f = me && state.estado.chars[me];
  $(".vazio").hidden = !!f;
  $("main").hidden = !f;
  if (!f) {
    $(".nome").textContent = "Ficha do Personagem";
    $(".sub").textContent = "";
    $(".pe").textContent = "";
    return;
  }
  $(".nome").textContent = f.name;
  $(".sub").textContent = [CLASSES[f.class] || f.class, f.level ? `Nv. ${f.level}` : null].filter(Boolean).join(" · ");
  $(".cp").textContent = L.fmt(f.combatPower);
  $(".gs").textContent = L.fmt(f.gearScore);
  renderToday();
  renderWallet();
  renderArcana();
  renderUnderstanding();
  renderProgress();
  renderStats();
  $(".pe").textContent = `Gravado em plugin-data/ficha · visto ${ago(f.seenAt)}`;
}

$(".ver-compr").addEventListener("click", () => {
  const t = $(".compr");
  t.hidden = !t.hidden;
  $(".ver-compr").textContent = t.hidden ? "ver" : "ocultar";
});
$(".ver").addEventListener("click", () => {
  const t = $(".attrs");
  t.hidden = !t.hidden;
  $(".ver").textContent = t.hidden ? "ver" : "ocultar";
});

// ── Começo ─────────────────────────────────────────────────────────────────
(async () => {
  const [estado, historico] = await Promise.all([a2.storage.get("estado").catch(() => null), a2.storage.get("historico").catch(() => null)]);
  if (estado && estado.chars) state.estado = { v: 1, last: estado.last ?? null, chars: estado.chars };
  if (historico && historico.chars) state.historico = { v: 1, chars: historico.chars };
  // Até o jogo dizer quem joga, mostra o último personagem visto.
  if (!me && state.estado.last && state.estado.chars[state.estado.last]) me = state.estado.last;
  render();
  a2.ready();
  setInterval(render, 60_000);
})();
