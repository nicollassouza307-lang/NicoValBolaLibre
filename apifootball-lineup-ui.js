'use strict';

(function attachLineupUi(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NVBLineupUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLineupUi() {
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function safeId(value) {
    const id = Number(value || 0);
    return Number.isSafeInteger(id) && id > 0 ? id : 0;
  }

  function playerPhotoUrl(playerOrId) {
    const id = safeId(typeof playerOrId === 'object' ? playerOrId?.id : playerOrId);
    return id ? `https://media.api-sports.io/football/players/${id}.png` : '';
  }

  function initials(name) {
    const words = String(name || 'Jogador').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return 'JV';
    return (words.length === 1 ? words[0].slice(0, 2) : `${words[0][0]}${words[words.length - 1][0]}`).toUpperCase();
  }

  function sortLineupPlayers(players) {
    return (Array.isArray(players) ? players : []).map((player, index) => {
      const gridMatch = String(player?.grid || '').match(/^(\d+)\s*:\s*(\d+)$/);
      const position = String(player?.pos || '').toUpperCase();
      const fallbackDepth = position.startsWith('G') ? 1 : position.startsWith('D') ? 2 : position.startsWith('M') ? 3 : position.startsWith('F') ? 4 : 2;
      return {
        ...player,
        __index: index,
        __depth: gridMatch ? Number(gridMatch[1]) : fallbackDepth,
        __row: gridMatch ? Number(gridMatch[2]) : null
      };
    }).sort((a, b) => a.__depth - b.__depth ||
      (a.__row ?? Number.MAX_SAFE_INTEGER) - (b.__row ?? Number.MAX_SAFE_INTEGER) || a.__index - b.__index);
  }

  function playerPlacements(players, side = 'home') {
    const ordered = sortLineupPlayers(players);
    if (!ordered.length) return [];
    const depths = ordered.map(player => player.__depth);
    const minDepth = Math.min(...depths);
    const maxDepth = Math.max(...depths);
    const depthRange = Math.max(1, maxDepth - minDepth);
    const byDepth = new Map();
    for (const player of ordered) {
      if (!byDepth.has(player.__depth)) byDepth.set(player.__depth, []);
      byDepth.get(player.__depth).push(player);
    }
    const positions = [];
    for (const depth of [...byDepth.keys()].sort((a, b) => a - b)) {
      const group = byDepth.get(depth);
      const count = group.length;
      group.forEach((player, index) => {
        const xForward = 12 + ((depth - minDepth) / depthRange) * 76;
        const y = count === 1 ? 50 : 18 + (index / (count - 1)) * 64;
        positions.push({
          player,
          left: Number((side === 'away' ? 100 - xForward : xForward).toFixed(2)),
          top: Number(y.toFixed(2))
        });
      });
    }
    return positions;
  }

  function resolveLineups(snapshot) {
    const rows = Array.isArray(snapshot?.lineups) ? snapshot.lineups.slice(0, 2) : [];
    const homeId = safeId(snapshot?.fixture?.home?.id);
    const awayId = safeId(snapshot?.fixture?.away?.id);
    const homeName = String(snapshot?.fixture?.home?.name || snapshot?.home || '').trim().toLowerCase();
    const awayName = String(snapshot?.fixture?.away?.name || snapshot?.away || '').trim().toLowerCase();
    const used = new Set();
    function take(id, name, fallbackIndex) {
      let index = rows.findIndex((row, rowIndex) => !used.has(rowIndex) && id && safeId(row?.team?.id) === id);
      if (index < 0 && name) index = rows.findIndex((row, rowIndex) => !used.has(rowIndex) && String(row?.team?.name || '').trim().toLowerCase() === name);
      if (index < 0 && rows[fallbackIndex] && !used.has(fallbackIndex)) index = fallbackIndex;
      if (index >= 0) { used.add(index); return rows[index]; }
      return null;
    }
    return [take(homeId, homeName, 0), take(awayId, awayName, 1)];
  }

  function renderPhoto(player, compact = false) {
    const id = safeId(player?.id);
    const name = String(player?.name || 'Jogador');
    const photo = playerPhotoUrl(id);
    const number = player?.number === null || player?.number === undefined || player?.number === '' ? '—' : String(player.number);
    return `<div class="apifootball-photo-frame${photo ? '' : ' is-fallback'}" aria-hidden="true">${photo ? `<img class="apifootball-player-photo" data-apifootball-player-photo src="${photo}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<span class="apifootball-photo-fallback">${escapeHtml(initials(name))}</span></div>`;
  }

  function renderPitchPlayer(entry) {
    const player = entry.player || {};
    const name = String(player.name || 'Jogador');
    const number = player.number === null || player.number === undefined || player.number === '' ? '—' : String(player.number);
    const position = String(player.pos || '').toUpperCase();
    const label = `${name}, camisa ${number}`;
    return `<div class="apifootball-pitch-player" style="left:${entry.left}%;top:${entry.top}%" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      ${renderPhoto(player)}
      <span class="apifootball-pitch-number">${escapeHtml(number)}</span>
      <span class="apifootball-pitch-name">${escapeHtml(name)}</span>
      ${position ? `<span class="apifootball-pitch-position">${escapeHtml(position)}</span>` : ''}
    </div>`;
  }

  function renderBenchPlayer(player) {
    const name = String(player?.name || 'Jogador');
    const number = player?.number === null || player?.number === undefined || player?.number === '' ? '—' : String(player.number);
    const position = String(player?.pos || '').toUpperCase();
    return `<div class="apifootball-bench-player">${renderPhoto(player, true)}<span class="apifootball-bench-number">${escapeHtml(number)}</span><span class="apifootball-bench-name">${escapeHtml(name)}</span>${position ? `<span class="apifootball-bench-position">${escapeHtml(position)}</span>` : ''}</div>`;
  }

  function renderTeamHead(lineup, fixtureTeam, label) {
    const name = String(lineup?.team?.name || fixtureTeam?.name || label);
    const logo = String(fixtureTeam?.logo || '');
    const formation = String(lineup?.formation || 'Formação não informada');
    return `<div class="apifootball-pitch-team-head"><div class="apifootball-team-head-crest">${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${escapeHtml(initials(name))}</span>`}</div><div class="apifootball-team-head-info"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(formation)}</small></div></div>`;
  }

  function renderSupportCard(lineup, fixtureTeam, label) {
    const name = String(lineup?.team?.name || fixtureTeam?.name || label);
    const coach = String(lineup?.coach?.name || 'Técnico não informado');
    const substitutes = Array.isArray(lineup?.substitutes) ? lineup.substitutes : [];
    return `<article class="apifootball-support-card">
      <div class="apifootball-support-head"><div><span class="apifootball-support-kicker">COMISSÃO TÉCNICA</span><h5>${escapeHtml(name)}</h5></div><span class="apifootball-support-count">${substitutes.length} reservas</span></div>
      <div class="apifootball-coach-row"><span class="apifootball-coach-icon">T</span><div><small>Técnico</small><strong>${escapeHtml(coach)}</strong></div></div>
      <div class="apifootball-section-title">Banco de reservas</div>
      ${substitutes.length ? `<div class="apifootball-bench-list">${substitutes.map(renderBenchPlayer).join('')}</div>` : '<div class="apifootball-lineup-empty">Reservas não informados.</div>'}
    </article>`;
  }

  function renderLineups(snapshot) {
    const lineups = resolveLineups(snapshot);
    if (!lineups.some(Boolean)) return '<div class="apifootball-message">A escalação ainda não foi divulgada ou não está disponível para esta competição.</div>';
    const fixtureHome = snapshot?.fixture?.home || { name: snapshot?.home || 'Mandante' };
    const fixtureAway = snapshot?.fixture?.away || { name: snapshot?.away || 'Visitante' };
    const home = lineups[0];
    const away = lineups[1];
    const renderHalf = (lineup, side) => {
      if (!lineup) return `<div class="apifootball-pitch-half ${side} apifootball-pitch-half-empty"><div class="apifootball-half-empty-label">Escalação não disponível</div></div>`;
      const players = Array.isArray(lineup.startXI) ? lineup.startXI : [];
      const placed = playerPlacements(players, side);
      return `<div class="apifootball-pitch-half ${side}">${placed.map(renderPitchPlayer).join('')}</div>`;
    };
    return `<div class="apifootball-lineups-view">
      <div class="apifootball-pitch-team-heads">${renderTeamHead(home, fixtureHome, 'Mandante')}${renderTeamHead(away, fixtureAway, 'Visitante')}</div>
      <div class="apifootball-pitch-scroll"><div class="apifootball-pitch" role="img" aria-label="Campo com os jogadores titulares posicionados conforme a formação">
        <div class="apifootball-pitch-outline"></div><div class="apifootball-pitch-center-line"></div><div class="apifootball-pitch-center-circle"></div><div class="apifootball-pitch-box home"></div><div class="apifootball-pitch-box away"></div>
        ${renderHalf(home, 'home')}${renderHalf(away, 'away')}
      </div></div>
      <div class="apifootball-support-grid">${renderSupportCard(home, fixtureHome, 'Mandante')}${renderSupportCard(away, fixtureAway, 'Visitante')}</div>
      <div class="apifootball-muted apifootball-lineup-footnote">Fotos obtidas pelo ID do jogador na mídia da API-Football. Quando uma foto não existe, mostramos as iniciais em vez de associar uma imagem incerta.</div>
    </div>`;
  }

  function statsRows(snapshot) {
    const teams = Array.isArray(snapshot?.statistics) ? snapshot.statistics : [];
    const homeId = safeId(snapshot?.fixture?.home?.id);
    const awayId = safeId(snapshot?.fixture?.away?.id);
    const homeTeam = teams.find(team => homeId && safeId(team?.team?.id) === homeId) || teams[0];
    const awayTeam = teams.find(team => awayId && safeId(team?.team?.id) === awayId) || teams.find(team => team !== homeTeam) || teams[1];
    const home = homeTeam?.values || [];
    const away = awayTeam?.values || [];
    const get = (arr, names) => {
      const row = arr.find(item => names.includes(String(item.type || '').toLowerCase()));
      return row?.value ?? '—';
    };
    const specs = [
      ['Posse de bola', ['ball possession']], ['Finalizações', ['total shots']], ['No gol', ['shots on goal']],
      ['Finalizações para fora', ['shots off goal']], ['Escanteios', ['corner kicks']], ['Faltas', ['fouls']],
      ['Amarelos', ['yellow cards']], ['Vermelhos', ['red cards']], ['Impedimentos', ['offsides']],
      ['Passes', ['total passes', 'passes']], ['Precisão dos passes', ['passes %', 'pass accuracy']]
    ];
    return specs.map(([label, names]) => ({ label, home: get(home, names), away: get(away, names) }))
      .filter(row => row.home !== '—' || row.away !== '—');
  }

  function numericValue(value) {
    if (value === null || value === undefined || value === '—') return null;
    const match = String(value).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return match ? Math.max(0, Number(match[0])) : null;
  }

  function renderStatistics(snapshot) {
    const rows = statsRows(snapshot);
    if (!rows.length) return '<div class="apifootball-message">As estatísticas detalhadas ainda não estão disponíveis para esta partida. Isso pode depender da cobertura da competição ou do estágio do jogo.</div>';
    const homeName = String(snapshot?.fixture?.home?.name || snapshot?.home || 'Mandante');
    const awayName = String(snapshot?.fixture?.away?.name || snapshot?.away || 'Visitante');
    const list = rows.map(row => {
      const homeNumber = numericValue(row.home);
      const awayNumber = numericValue(row.away);
      const homeShare = homeNumber === null || awayNumber === null || homeNumber + awayNumber === 0
        ? 50 : Math.round((homeNumber / (homeNumber + awayNumber)) * 100);
      return `<article class="apifootball-stat-card"><div class="apifootball-stat-values"><strong>${escapeHtml(row.home)}</strong><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.away)}</strong></div><div class="apifootball-stat-bar" aria-hidden="true"><span class="home" style="width:${homeShare}%"></span><span class="away" style="width:${100 - homeShare}%"></span></div></article>`;
    }).join('');
    return `<div class="apifootball-statistics-view"><div class="apifootball-stat-team-labels"><strong>${escapeHtml(homeName)}</strong><strong>${escapeHtml(awayName)}</strong></div><div class="apifootball-stat-grid">${list}</div><div class="apifootball-muted">Comparativo das estatísticas fornecidas pela API-Football. Um traço indica dado não informado.</div></div>`;
  }

  return { escapeHtml, playerPhotoUrl, initials, sortLineupPlayers, playerPlacements, resolveLineups, renderLineups, statsRows, numericValue, renderStatistics };
});
