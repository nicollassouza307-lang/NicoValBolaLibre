(function attachCompetitionRanking(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NVBCompetitionRanking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createCompetitionRanking() {
  // Prioridade padrão editorial das competições. Competições não listadas ficam
  // depois destas e são ordenadas pelo horário da primeira partida.
  // O ranking manual salvo pelo usuário sempre prevalece sobre esta ordem.
  const DEFAULT_PRIORITY = [
    { rank: 0, patterns: ['world cup', 'fifa world cup', 'copa do mundo'] },
    { rank: 10, patterns: ['champions league', 'liga dos campeoes'] },
    { rank: 20, patterns: ['copa libertadores', 'conmebol libertadores', 'libertadores'] },
    { rank: 30, patterns: ['premier league', 'epl'] },
    { rank: 40, patterns: ['laliga', 'la liga'] },
    { rank: 50, patterns: ['bundesliga'] },
    { rank: 70, patterns: ['ligue 1'] },
    { rank: 80, patterns: ['brasileirao serie a', 'brasileirao', 'campeonato brasileiro serie a', 'brazil serie a', 'serie a brazil', 'serie a brasil', 'brasil serie a'] },
    { rank: 90, patterns: ['copa do brasil', 'copa brasil', 'brazil cup', 'brasil cup'] },
    { rank: 60, patterns: ['italy serie a', 'italia serie a', 'serie a italy', 'serie a italia', 'serie a'] },
    { rank: 100, patterns: ['europa league', 'uefa europa league'] },
    { rank: 110, patterns: ['conference league'] },
    { rank: 120, patterns: ['copa sudamericana', 'conmebol sudamericana', 'sudamericana'] },
    { rank: 130, patterns: ['eredivisie'] },
    { rank: 140, patterns: ['primeira liga', 'liga portugal'] },
    { rank: 150, patterns: ['championship'] },
    { rank: 160, patterns: ['serie b', 'brasileirao serie b', 'brazil serie b'] }
  ];

  function normalize(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  function defaultPriority(name) {
    const normalized = normalize(name);
    for (const item of DEFAULT_PRIORITY) {
      if (item.patterns.some(pattern => {
        const needle = normalize(pattern);
        return normalized === needle || normalized.includes(needle);
      })) return item.rank;
    }
    return 1000;
  }

  function timeValue(group) {
    const value = Number(group && group.firstTime);
    return Number.isFinite(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
  }

  function sort(groups, savedOrder) {
    const list = Array.isArray(groups) ? [...groups] : [];
    const order = Array.isArray(savedOrder) ? savedOrder : [];
    const rank = new Map(order.map((key, index) => [String(key), index]));
    return list.sort((a, b) => {
      const aHasRank = rank.has(String(a.key));
      const bHasRank = rank.has(String(b.key));
      if (aHasRank && bHasRank) return rank.get(String(a.key)) - rank.get(String(b.key));
      if (aHasRank) return -1;
      if (bHasRank) return 1;

      const aPriority = defaultPriority(a.name || a.key);
      const bPriority = defaultPriority(b.name || b.key);
      if (aPriority !== bPriority) return aPriority - bPriority;

      return timeValue(a) - timeValue(b) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
    });
  }

  function move(savedOrder, visibleGroups, key, direction) {
    const next = Array.isArray(savedOrder) ? [...savedOrder] : [];
    const visibleKeys = (Array.isArray(visibleGroups) ? visibleGroups : []).map(group => String(group.key));
    for (const visibleKey of visibleKeys) if (!next.includes(visibleKey)) next.push(visibleKey);
    const visibleIndex = visibleKeys.indexOf(String(key));
    const targetVisibleIndex = visibleIndex + (Number(direction) < 0 ? -1 : 1);
    if (visibleIndex < 0 || targetVisibleIndex < 0 || targetVisibleIndex >= visibleKeys.length) return next;
    const otherKey = visibleKeys[targetVisibleIndex];
    const from = next.indexOf(String(key));
    const to = next.indexOf(otherKey);
    if (from < 0 || to < 0) return next;
    [next[from], next[to]] = [next[to], next[from]];
    return next;
  }

  return Object.freeze({ sort, move, defaultPriority });
});
