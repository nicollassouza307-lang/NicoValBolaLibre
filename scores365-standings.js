'use strict';

(function attachStandings(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NVBScores365Standings = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createStandingsApi() {
  const asArray = value => Array.isArray(value) ? value : [];
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  const first = (...values) => values.find(value => value !== null && value !== undefined && String(value).trim() !== '');
  function normalizeRow(raw) {
    const row = raw && typeof raw === 'object' ? raw : {};
    const competitor = row.competitor || row.team || row.participant || row.competitorData || {};
    const played = first(row.gamePlayed, row.played, row.playedGames, row.matchesPlayed, row.gamesPlayed);
    const wins = first(row.gamesWon, row.won, row.wins, row.win);
    const draws = first(row.gamesEven, row.drawn, row.draws, row.ties, row.equal);
    const losses = first(row.gamesLost, row.lost, row.losses, row.loss);
    const goalsFor = first(row.goalsFor, row.scored, row.goalsScored, row.for);
    const goalsAgainst = first(row.goalsAgainst, row.conceded, row.goalsConceded, row.against);
    let goalDifference = first(row.ratio, row.goalDifference, row.goalsDiff, row.goalDiff, row.difference);
    if (goalDifference === undefined && goalsFor !== undefined && goalsAgainst !== undefined) goalDifference = Number(goalsFor) - Number(goalsAgainst);
    return {
      ...row,
      competitor: {
        id: positive(competitor.id || competitor.competitorId || row.competitorId),
        name: String(first(competitor.name, competitor.displayName, competitor.shortName, row.teamName, row.competitorName, 'Equipe')),
        shortName: String(first(competitor.shortName, competitor.name, row.teamName, ''))
      },
      position: positive(first(row.position, row.rank, row.place, row.order)),
      points: Number(first(row.points, row.pts, row.totalPoints, row.score, 0)) || 0,
      gamePlayed: Number(played) || 0,
      gamesWon: Number(wins) || 0,
      gamesEven: Number(draws) || 0,
      gamesLost: Number(losses) || 0,
      goalsFor: Number(goalsFor) || 0,
      goalsAgainst: Number(goalsAgainst) || 0,
      ratio: Number(goalDifference) || 0
    };
  }
  function isStandingRow(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    return Boolean(value.competitor || value.team || value.participant || value.competitorData || value.position !== undefined || value.rank !== undefined || value.points !== undefined || value.pts !== undefined);
  }
  function rowsFrom(value) {
    if (!Array.isArray(value)) return [];
    if (value.every(isStandingRow)) return value.map(normalizeRow);
    return value.flatMap(item => Array.isArray(item) ? rowsFrom(item) : []);
  }
  function normalizeGroups(payload, filters = {}) {
    const root = payload?.data && typeof payload.data === 'object' ? payload.data : payload || {};
    const found = [];
    const visited = new Set();
    const childKeys = ['standings','standingsGroups','leagueStandings','groups','divisions','leagues','tables','standingsRows','rankings','ranking','leaderboard','stages','rounds','sections','classifications','data','items'];
    function visit(node, inherited = {}, depth = 0) {
      if (depth > 7 || node === null || node === undefined) return;
      if (Array.isArray(node)) {
        const rowArray = rowsFrom(node);
        if (rowArray.length && node.every(item => isStandingRow(item))) {
          found.push({ ...inherited, rows: rowArray });
          return;
        }
        node.forEach((item, index) => {
          const itemLabel = item && typeof item === 'object' ? first(item.groupName, item.divisionName, item.leagueName, item.stageName, item.name, item.displayName, item.title, item.label) : '';
          visit(item, { ...inherited, label: inherited.label || (itemLabel ? '' : `Grupo ${index + 1}`) }, depth + 1);
        });
        return;
      }
      if (typeof node !== 'object' || visited.has(node)) return;
      visited.add(node);
      const ownLabel = String(first(node.groupName, node.divisionName, node.leagueName, node.stageName, node.name, node.displayName, node.title, node.label, '')).trim();
      const parentLabel = String(inherited.label || '').trim();
      const combinedLabel = ownLabel && parentLabel && ownLabel !== parentLabel && !ownLabel.startsWith(`${parentLabel} · `)
        ? `${parentLabel} · ${ownLabel}` : (ownLabel || parentLabel);
      const meta = {
        seasonNum: positive(first(node.seasonNum, node.season?.num, node.season?.id, inherited.seasonNum)),
        stageNum: positive(first(node.stageNum, node.stage?.num, node.stage?.id, inherited.stageNum)),
        seasonName: String(first(node.seasonName, node.season?.name, inherited.seasonName, '')),
        stageName: String(first(node.stageName, node.stage?.name, inherited.stageName, '')),
        label: combinedLabel
      };
      let directRows = [];
      for (const key of ['rows','standingsRows','competitors','teams','table','entries','ranking','rankings','leaderboard','classifications']) {
        const value = node[key];
        if (Array.isArray(value)) {
          const candidate = rowsFrom(value);
          if (candidate.length) { directRows = candidate; break; }
        }
      }
      if (directRows.length) found.push({ ...meta, rows: directRows });
      for (const key of childKeys) {
        const child = node[key];
        if (child === undefined || child === node.rows || child === node.competitors || child === node.teams || child === node.table || child === node.entries || child === node.ranking) continue;
        if (child && typeof child === 'object') visit(child, meta, depth + 1);
      }
    }
    const source = first(root.standings, root.standingsGroups, root.leagueStandings, root.groups, root.tables, root.competitionStandings, root.rankings, root.leaderboard, root) || root;
    visit(source, {
      seasonNum: positive(first(root.seasonNum, root.season?.num)),
      stageNum: positive(first(root.stageNum, root.stage?.num)),
      seasonName: String(first(root.seasonName, root.season?.name, '')),
      stageName: String(first(root.stageName, root.stage?.name, '')),
      label: ''
    });
    let groups = found.filter(group => group.rows?.length);
    const seasonNum = positive(filters.seasonNum);
    const stageNum = positive(filters.stageNum);
    if (seasonNum) {
      const matching = groups.filter(group => !group.seasonNum || group.seasonNum === seasonNum);
      if (matching.length) groups = matching;
    }
    if (stageNum) {
      const matching = groups.filter(group => !group.stageNum || group.stageNum === stageNum);
      if (matching.length) groups = matching;
    }
    groups = groups.map((group, index) => {
      // Deduplica somente dentro do mesmo grupo. Uma seleção pode aparecer em
      // outra divisão/fase sem que isso seja uma duplicata do quadro atual.
      const seen = new Set();
      const rows = group.rows.filter(row => {
        const key = `${row.competitor.id || row.competitor.name}|${row.position}|${row.points}|${row.gamePlayed}`;
        if (seen.has(key)) return false;
        seen.add(key); return true;
      }).sort((a, b) => (a.position && b.position ? a.position - b.position : b.points - a.points || b.ratio - a.ratio));
      return { ...group, label: group.label || (groups.length > 1 ? `Grupo ${index + 1}` : ''), rows };
    }).filter(group => group.rows.length);
    return groups;
  }
  return { normalizeRow, normalizeGroups };
});
