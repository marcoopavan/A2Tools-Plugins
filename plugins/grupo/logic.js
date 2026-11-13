// Grupo: as regras, sem a página. plugin.js usa; um teste carrega este
// arquivo sozinho.
(() => {
  const num = (v) => typeof v === "number" && Number.isFinite(v);

  // O grupo como o medidor manda no evento character (campo party): só
  // conta com dois ou mais. Na ordem das posições do jogo.
  function roster(c) {
    const list = c && Array.isArray(c.party) ? c.party.filter((m) => m && typeof m.name === "string" && m.name) : [];
    if (list.length < 2) return [];
    return list
      .map((m) => ({
        name: m.name,
        slot: num(m.slot) ? m.slot : 99,
        level: num(m.level) && m.level > 0 ? m.level : null,
        gearScore: num(m.gearScore) && m.gearScore > 0 ? m.gearScore : null,
        combatPower: num(m.combatPower) && m.combatPower > 0 ? m.combatPower : null,
        me: !!(c.name && m.name.trim() === String(c.name).trim()),
      }))
      .sort((a, b) => a.slot - b.slot || a.name.localeCompare(b.name));
  }

  // Quem está no grupo, sem os números: muda só quando alguém entra ou sai.
  const signature = (list) => list.map((m) => m.name).sort().join("|");

  // A média de quem já tem o número (o jogo manda GS e CP de cada um com a
  // lista; um 0 é quem ainda não chegou).
  function average(list, field) {
    const values = list.map((m) => m[field]).filter(num);
    return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  }

  // O que fazer com a janela quando o grupo muda: "show" quando alguém entra
  // ou sai (e há grupo), "hide" quando o grupo acaba, null se nada mudou.
  function windowMove(before, after) {
    if (before === after) return null;
    return after ? "show" : "hide";
  }

  // 156291 -> "156.291"
  const fmt = (n) => (num(n) ? Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "—");

  globalThis.GrupoLogic = { roster, signature, average, windowMove, fmt };
})();
