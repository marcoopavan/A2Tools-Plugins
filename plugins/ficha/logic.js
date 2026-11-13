// Ficha do Personagem: as regras, sem a página. plugin.js usa; um teste
// carrega este arquivo sozinho.
(() => {
  const DAY = 86_400_000;
  const num = (v) => typeof v === "number" && Number.isFinite(v);

  // Só com o servidor conhecido: um medidor aberto antes do jogo diz o último
  // nome jogado sem saber onde.
  const charKey = (c) => (c && c.name && c.serverId ? `${c.name}@${c.serverId}` : null);

  // O dia do jogo vira às 07:00 UTC; a semana, na quarta às 07:00 UTC. A
  // chave é o dia (UTC) em que o período começou.
  function gameDay(now, minutes = 420) {
    return new Date(now - minutes * 60_000).toISOString().slice(0, 10);
  }
  function gameWeek(now, minutes = 420, weekday = 3) {
    let t = now - minutes * 60_000;
    while (new Date(t).getUTCDay() !== weekday) t -= DAY;
    return new Date(t).toISOString().slice(0, 10);
  }

  // Sem as entradas nulas: o medidor manda null no que o jogo ainda não disse.
  function clean(obj) {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) if (v != null) out[k] = v;
    return out;
  }

  // O que o medidor disse agora por cima do que já se sabia. Um campo nulo
  // (medidor aberto no meio da sessão) não apaga o valor antigo.
  function mergeCharacter(prev, c, now) {
    const out = { ...(prev || {}) };
    out.name = c.name;
    out.serverId = c.serverId;
    if (c.class) out.class = c.class;
    if (num(c.level)) out.level = c.level;
    if (num(c.combatPower) && c.combatPower > 0) out.combatPower = c.combatPower;
    if (num(c.gearScore) && c.gearScore > 0) out.gearScore = c.gearScore;
    const e = c.odyleEnergy;
    if (e && num(e.basic) && num(e.charged)) out.odyleEnergy = { basic: e.basic, charged: e.charged };
    for (const k of ["contentCounts", "contentTimes", "shopLimits", "crafts"]) {
      if (c[k] && typeof c[k] === "object") out[k] = { ...(out[k] || {}), ...clean(c[k]) };
    }
    if (num(c.kinahToday)) out.kinahToday = c.kinahToday;
    if (Array.isArray(c.abyssPoints) && num(c.abyssPoints[0])) {
      out.abyssPoints = [c.abyssPoints[0], num(c.abyssPoints[1]) ? c.abyssPoints[1] : null];
    }
    if (num(c.cooldownReduction)) out.cooldownReduction = c.cooldownReduction;
    // Os itens: a lista inteira (login) troca a guardada; só as mudanças
    // (medidor aberto no meio da sessão) atualizam as moedas e mais nada.
    if (Array.isArray(c.items) && c.items.length) {
      const whole = c.itemsWhole === true;
      if (whole || !Array.isArray(out.items)) {
        out.items = c.items;
        out.itemsWhole = whole;
      }
      out.wallet = { ...(whole ? {} : out.wallet || {}), ...wallet(c.items) };
      out.itemsAt = now;
      if (Array.isArray(c.arcana) && c.arcana.length && (whole || !Array.isArray(out.arcana))) out.arcana = c.arcana;
    }
    // A Compreensão do Tipo vem inteira no login.
    const u = c.petUnderstanding;
    if (u && Array.isArray(u.kinds) && u.kinds.length) {
      out.petUnderstanding = u;
      out.petUnderstandingAt = now;
    }
    out.seenAt = now;
    return out;
  }

  // As moedas são itens da bolsa (ids 9301000xx), como o jogo mostrou em
  // 13/11/2026 ao lado da lista. As sem nome conferido ficam pelo id.
  // Em lista, na ordem de mostrar.
  const CURRENCIES = [
    [930100031, "Kinah"],
    [930100001, "Kinah vinculado"],
    [930100003, "Pontos de Abismo"],
    [930100011, "Moedas da Festa Shugo"],
    [930100019, "Moedas do Juramento"],
    [930100017, "Fragmentos Oníricos"],
  ];
  // { id da moeda: quantidade } a partir de [[item, quantidade, recipiente]].
  function wallet(items) {
    const out = {};
    for (const it of Array.isArray(items) ? items : []) {
      if (!Array.isArray(it) || !num(it[0]) || !num(it[1])) continue;
      if (it[0] >= 930100000 && it[0] < 930200000) out[it[0]] = (out[it[0]] ?? 0) + it[1];
    }
    return out;
  }
  // A carteira de cada dia do jogo: a última vista no dia. Guarda `cap` dias.
  function noteWalletDay(map, w, now, cap = 60) {
    const out = { ...(map || {}) };
    if (!w || !Object.keys(w).length) return out;
    out[gameDay(now)] = { ...w };
    const keys = Object.keys(out).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - cap))) delete out[k];
    return out;
  }

  // As cartas de Arcano: 8101xxxxx Cálice ... 8105xxxxx Espelho; o conjunto
  // pelo último dígito (1 Vigor, 2 Magia), como as seis cartas lidas.
  const CARDS = { 1: "Cálice", 2: "Manuscrito", 3: "Bússola", 4: "Sino", 5: "Espelho" };
  const SETS = { 1: " do Vigor", 2: " da Magia" };
  const ATTRIBUTES = { 7: "Justiça", 8: "Liberdade", 9: "Ilusão", 11: "Tempo", 16: "Destino" };
  // As habilidades do Arqueiro conferidas nas linhas das cartas.
  const SKILLS = {
    14010000: "Flecha Certeira", 14020000: "Tiro de Precisão", 14050000: "Flecha Pontiaguda",
    14070000: "Flecha de Supressão", 14080000: "Flecha de Ruptura", 14090000: "Flecha de Marcação",
    14110000: "Flecha de Vento Tempestuoso", 14130000: "Flecha Laçadora", 14170000: "Armadilha de Explosão",
    14330000: "Rajada de Flechas", 14340000: "Disparo Rápido", 14710000: "Olho de Sentinela",
    14720000: "Tiro Concentrado", 14740000: "Olho da Concentração", 14750000: "Determinação do Caçador",
    14770000: "Olho da Contenção", 14780000: "Tiro à Queima-roupa", 14790000: "Pacto de Revitalização",
    14800000: "Alma do Caçador",
  };
  const cardName = (item) => {
    const kind = CARDS[Math.floor(item / 100000) % 10];
    return kind ? kind + (SETS[item % 10] || "") : `Carta ${item}`;
  };
  // Uma carta em palavras: { name, level, exp, attribute, worn, lines: ["Disparo Rápido +1"] }.
  function describeCard(card) {
    const lines = (Array.isArray(card.lines) ? card.lines : [])
      .filter((l) => Array.isArray(l) && num(l[0]) && num(l[1]))
      .map(([skill, levels]) => `${SKILLS[skill] || `Habilidade ${skill}`} +${levels}`);
    return {
      name: cardName(card.item),
      level: card.level ?? 0,
      exp: card.exp ?? 0,
      attribute: `${ATTRIBUTES[card.attribute] || `Atributo ${card.attribute}`} ${card.value}`,
      worn: card.worn === true,
      position: card.position ?? 0,
      lines,
    };
  }

  // Os atributos conferidos nas páginas da Compreensão do Tipo de 13/11/2026:
  // [nome, é porcentagem (valor em centésimos)].
  const STATS = {
    19: ["Ataque Adicional"], 28: ["Amplificação de Dano", true], 31: ["Ataque Máx."],
    32: ["Amplificação de Dano de Arma", true], 38: ["Ataque Crítico"], 41: ["Defesa de Acerto Crítico"],
    47: ["Tolerância a Dano Crítico", true], 50: ["Ataque contra Chefe"], 52: ["Defesa Adicional"],
    56: ["Ataque em JvA"], 57: ["Defesa em JvA"], 104: ["Precisão Adicional"], 110: ["Precisão em JvA"],
    128: ["Acerto Crítico"], 133: ["Resistência a Acerto Crítico"], 146: ["Acerto de Golpes Múltiplos", true],
    147: ["Resistência a Golpes Múltiplos", true], 193: ["PV"], 196: ["Aumento de PV", true], 199: ["PM"],
    379: ["Amplificação de Dano em JvA", true], 443: ["Golpe Potente", true], 591: ["Acerto Crítico Frontal"],
    592: ["Resistência a Acerto Crítico Frontal"],
  };
  const KINDS = { 2: "Intelectual" };
  // A essência que cada tipo gasta, como as cinco telas mostraram (a 6 é a
  // comum a todos): o tipo 3 gasta a 1, os outros a de mesmo número ou a anterior.
  const ESSENCE_OF = { 2: 2, 3: 1, 4: 3, 5: 4, 6: 5 };
  // "Ataque Máx. 12", "Amplificação de Dano 1,72%"; um atributo sem nome
  // conferido sai pelo id, com o valor como veio.
  function statLine(stat, value) {
    const known = STATS[stat];
    if (!known) return `Atributo ${stat} ${fmt(value)}`;
    return known[1] ? `${known[0]} ${(value / 100).toFixed(2).replace(".", ",")}%` : `${known[0]} ${fmt(value)}`;
  }
  // A página em uso de cada tipo, em palavras: [{ name, lines: [{ text, grade, locked }] }].
  function describeUnderstanding(u) {
    if (!u || !Array.isArray(u.kinds)) return [];
    return u.kinds.map((k) => {
      const pages = Array.isArray(k.pages) ? k.pages : [];
      const page = pages.find((p) => p.page === u.page) || pages[pages.length - 1] || { lines: [] };
      const lines = (Array.isArray(page.lines) ? page.lines : [])
        .filter((l) => Array.isArray(l) && l[0])
        .map(([stat, value, grade, locked]) => ({ text: statLine(stat, value), grade: grade ?? 0, locked: locked === true }));
      return { name: KINDS[k.kind] || `Tipo ${k.kind}`, page: page.page ?? null, held: u.essences ? u.essences[ESSENCE_OF[k.kind]] ?? null : null, lines };
    });
  }

  // A evolução: um ponto [quando, CP, GS] só quando um dos dois mudou. O que
  // veio nulo repete o último valor conhecido. Guarda os últimos `cap`.
  function pushProgress(list, cp, gs, now, cap = 400) {
    const out = Array.isArray(list) ? list.slice() : [];
    const last = out[out.length - 1];
    const c = num(cp) && cp > 0 ? cp : last ? last[1] : null;
    const g = num(gs) && gs > 0 ? gs : last ? last[2] : null;
    if (c == null && g == null) return out;
    if (last && last[1] === c && last[2] === g) return out;
    out.push([now, c, g]);
    return out.length > cap ? out.slice(out.length - cap) : out;
  }

  // O último ponto de cada dia do jogo, do mais novo ao mais antigo, com a
  // diferença de CP para o dia anterior.
  function byDay(list, days = 7) {
    const last = new Map();
    for (const p of Array.isArray(list) ? list : []) last.set(gameDay(p[0]), p);
    const keys = [...last.keys()].sort();
    const rows = keys.map((day, i) => {
      const [, cp, gs] = last.get(day);
      const prev = i > 0 ? last.get(keys[i - 1]) : null;
      return {
        day,
        cp,
        gs,
        cpDelta: prev && num(cp) && num(prev[1]) ? cp - prev[1] : null,
        gsDelta: prev && num(gs) && num(prev[2]) ? gs - prev[2] : null,
      };
    });
    return rows.reverse().slice(0, days);
  }

  // O maior valor visto em cada período (dia ou semana do jogo); guarda os
  // últimos `cap` períodos.
  function noteMax(map, key, value, cap = 90) {
    const out = { ...(map || {}) };
    if (!num(value)) return out;
    out[key] = Math.max(out[key] ?? 0, value);
    const keys = Object.keys(out).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - cap))) delete out[k];
    return out;
  }

  // Os atributos mudam a cada bônus em combate: no histórico fica só a
  // primeira folha vista em cada dia do jogo, para comparar um dia com outro.
  function noteStatsDay(map, sheet, now, cap = 30) {
    const out = { ...(map || {}) };
    const day = gameDay(now);
    if (out[day] || !sheet || !Object.keys(sheet).length) return out;
    out[day] = { ...sheet };
    const keys = Object.keys(out).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - cap))) delete out[k];
    return out;
  }

  // O que mudou entre duas folhas de atributos: { id: [antes, depois] }.
  function diffStats(prev, next) {
    const out = {};
    for (const id of new Set([...Object.keys(prev || {}), ...Object.keys(next || {})])) {
      const a = prev?.[id] ?? null;
      const b = next?.[id] ?? null;
      if (a !== b) out[id] = [a, b];
    }
    return out;
  }

  // Abates, assistências, mortes e Pontos de Abismo ganhos, por dia do jogo.
  function noteKda(map, kind, amount, now, cap = 60) {
    const out = { ...(map || {}) };
    const field = { kill: "kills", assist: "assists", death: "deaths", points: "points" }[kind];
    if (!field) return out;
    const day = gameDay(now);
    const row = { kills: 0, assists: 0, deaths: 0, points: 0, ...(out[day] || {}) };
    row[field] += kind === "points" ? (num(amount) ? amount : 0) : 1;
    out[day] = row;
    const keys = Object.keys(out).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - cap))) delete out[k];
    return out;
  }

  // 156291 -> "156.291"
  const fmt = (n) => (num(n) ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "—");
  const signed = (n) => (num(n) && n !== 0 ? (n > 0 ? "+" : "−") + fmt(Math.abs(n)) : "");

  globalThis.FichaLogic = {
    charKey, gameDay, gameWeek, clean, mergeCharacter, pushProgress, byDay, noteMax, noteStatsDay, diffStats, noteKda, fmt, signed,
    CURRENCIES, wallet, noteWalletDay, describeCard, statLine, describeUnderstanding,
  };
})();
