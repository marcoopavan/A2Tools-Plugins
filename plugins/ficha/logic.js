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
    out.seenAt = now;
    return out;
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
  };
})();
