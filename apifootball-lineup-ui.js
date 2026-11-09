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
    if (playerOrId && typeof playerOrId === 'object' && typeof playerOrId.photoUrl === 'string') {
      try {
        const custom = new URL(playerOrId.photoUrl);
        if (custom.protocol === 'https:' && ['imagecache.365scores.com', 'media.api-sports.io'].includes(custom.hostname)) return custom.toString();
      } catch {}
    }
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
      const record = player?.player && typeof player.player === 'object' ? player.player : player;
      const gridMatch = String(record?.grid || player?.grid || '').match(/^(\d+)\s*:\s*(\d+)$/);
      const position = String(record?.pos || player?.pos || '').toUpperCase();
      const fallbackDepth = position.startsWith('G') ? 1 : position.startsWith('D') ? 2 : position.startsWith('M') ? 3 : position.startsWith('F') ? 4 : 2;
      return { ...player, __player: record, __index: index, __depth: gridMatch ? Number(gridMatch[1]) : fallbackDepth, __row: gridMatch ? Number(gridMatch[2]) : null };
    }).sort((a, b) => a.__depth - b.__depth || (a.__row ?? Number.MAX_SAFE_INTEGER) - (b.__row ?? Number.MAX_SAFE_INTEGER) || a.__index - b.__index);
  }

  function formationFallback(players, formation) {
    const source = Array.isArray(players) ? players : [];
    const lines = String(formation || '').split(/[-–—/]/).map(Number).filter(value => Number.isInteger(value) && value > 0 && value <= 6);
    if (!lines.length || source.length < 7) return source;
    const current = source.map((item, index) => {
      const record = item?.player && typeof item.player === 'object' ? item.player : item;
      const gridMatch = String(record?.grid || item?.grid || '').match(/^(\d+)\s*:\s*(\d+)$/);
      return { item, index, depth: gridMatch ? Number(gridMatch[1]) : null, row: gridMatch ? Number(gridMatch[2]) : null, pos: String(record?.pos || item?.pos || '').toUpperCase() };
    });
    const distinctDepths = new Set(current.map(item => item.depth).filter(Number.isFinite));
    if (distinctDepths.size > 1) return source;
    const goalkeeper = current.filter(item => item.pos.startsWith('G'));
    const defenders = current.filter(item => item.pos.startsWith('D'));
    const midfielders = current.filter(item => item.pos.startsWith('M'));
    const forwards = current.filter(item => item.pos.startsWith('F'));
    const unclassified = current.filter(item => !/^(G|D|M|F)/.test(item.pos));
    const orderedOutfield = [...defenders, ...midfielders, ...forwards, ...unclassified].filter(item => !goalkeeper.includes(item));
    const hasUsableRoles = defenders.length + midfielders.length + forwards.length >= Math.min(7, source.length - goalkeeper.length);
    let buckets = [];
    if (hasUsableRoles) {
      const expectedDefenders = lines[0] || 4;
      const expectedForwards = lines[lines.length - 1] || 1;
      const mids = [...midfielders];
      const backs = [...defenders];
      const front = [...forwards];
      const middleCounts = lines.slice(1, -1);
      buckets.push(backs.splice(0, expectedDefenders));
      if (middleCounts.length) {
        for (const count of middleCounts) buckets.push(mids.splice(0, count));
      }
      buckets.push(front.splice(0, expectedForwards));
      const leftovers = [...backs, ...mids, ...front, ...unclassified];
      if (leftovers.length) {
        let target = Math.max(0, buckets.length - 1);
        buckets[target] = [...(buckets[target] || []), ...leftovers];
      }
    } else {
      const outfield = orderedOutfield.length ? orderedOutfield : current.filter(item => !goalkeeper.includes(item));
      let offset = 0;
      buckets = lines.map(count => { const group = outfield.slice(offset, offset + count); offset += count; return group; });
      if (offset < outfield.length) buckets[buckets.length - 1].push(...outfield.slice(offset));
    }
    const result = [];
    const allBuckets = [...(goalkeeper.length ? [goalkeeper] : []), ...buckets];
    allBuckets.forEach((group, depthIndex) => {
      group.forEach((player, rowIndex) => {
        const record = player.item?.player && typeof player.item.player === 'object' ? player.item.player : player.item;
        result.push({ ...player.item, grid: `${depthIndex + 1}:${rowIndex + 1}`, player: player.item?.player && typeof player.item.player === 'object' ? { ...record } : player.item });
      });
    });
    return result.length === source.length ? result : source;
  }

  function playerPlacements(players, side = 'home', formation = '') {
    const prepared = formationFallback(players, formation);
    const ordered = sortLineupPlayers(prepared);
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
        const presetLane = count === 1 ? 50 : count === 2 ? [34, 66][index] : count === 3 ? [23, 50, 77][index] : 9 + (index / (count - 1)) * 82;
        const rowValues = group.map(item => item.__row).filter(Number.isFinite);
        const minRow = rowValues.length ? Math.min(...rowValues) : 0;
        const maxRow = rowValues.length ? Math.max(...rowValues) : 0;
        const lane = Number.isFinite(player.__row) && maxRow > minRow
          ? 12 + ((player.__row - minRow) / (maxRow - minRow)) * 76
          : presetLane;
        let xForward = 20 + ((depth - minDepth) / depthRange) * 60;
        const position = String(player.__player?.pos || player.pos || '').toUpperCase();
        if (position.startsWith('F')) xForward += 3;
        xForward = Math.max(14, Math.min(86, xForward));
        positions.push({ player, left: Number((side === 'away' ? 100 - xForward : xForward).toFixed(2)), top: Number(lane.toFixed(2)), depth: Number(xForward.toFixed(2)) });
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

  function normalizedPlayerName(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function eventPlayer(event, secondary = false) {
    const raw = secondary ? (event?.secondaryPlayer ?? event?.assist ?? event?.inPlayer) : (event?.player ?? event?.athlete);
    const object = raw && typeof raw === 'object' ? raw : null;
    return { id: safeId(secondary ? (event?.secondaryPlayerId || object?.id) : (event?.playerId || object?.id)), name: String(object?.name || object?.displayName || raw || (secondary ? event?.assistName : event?.playerName) || '') };
  }

  function playerEventMarkers(player, teamName, snapshot, role = 'starter') {
    const id = safeId(player?.id || player?.athleteId);
    const name = normalizedPlayerName(player?.name);
    const teamKey = normalizedPlayerName(teamName);
    const samePlayer = candidate => {
      if (id && candidate.id && id === candidate.id) return true;
      return Boolean(name && candidate.name && name === normalizedPlayerName(candidate.name));
    };
    const markers = [];
    for (const event of Array.isArray(snapshot?.events) ? snapshot.events : []) {
      const eventTeam = normalizedPlayerName(event?.team?.name || event?.team || '');
      if (teamKey && eventTeam && teamKey !== eventTeam) continue;
      const type = String(event?.type || event?.eventType || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const primary = eventPlayer(event, false);
      const secondary = eventPlayer(event, true);
      const minute = String(event?.minute || event?.time?.elapsed || '').trim();
      if (/substitution|substituicao|\bsubst\b/.test(type)) {
        if (samePlayer(primary)) markers.push({ icon: role === 'starter' ? '↓' : '⇄', label: role === 'starter' ? 'Saiu' : 'Substituição', minute, kind: 'substitution-out' });
        if (samePlayer(secondary)) markers.push({ icon: role === 'bench' ? '↑' : '⇄', label: role === 'bench' ? 'Entrou' : 'Substituição', minute, kind: 'substitution-in' });
      } else if (samePlayer(primary)) {
        if (/own goal|gol contra/.test(type)) markers.push({ icon: '⚽↩', label: 'Gol contra', minute, kind: 'own-goal' });
        else if (/goal|gol/.test(type)) markers.push({ icon: '⚽', label: 'Gol', minute, kind: 'goal' });
        else if (/yellow|amarelo/.test(type)) markers.push({ icon: '🟨', label: 'Cartão amarelo', minute, kind: 'yellow' });
        else if (/red|vermelho|expulsion/.test(type)) markers.push({ icon: '🟥', label: 'Cartão vermelho', minute, kind: 'red' });
        else if (/penalty missed|missed penalty|penalti perdido/.test(type)) markers.push({ icon: '✕', label: 'Pênalti perdido', minute, kind: 'missed-penalty' });
      } else if (samePlayer(secondary) && /goal|gol/.test(type) && !/own goal|gol contra/.test(type)) {
        markers.push({ icon: 'A', label: 'Assistência', minute, kind: 'assist' });
      }
    }
    return markers.slice(0, 3);
  }

  function renderPhoto(player, compact = false, markers = []) {
    const record = player?.player && typeof player.player === 'object' ? player.player : player;
    const name = String(record?.name || 'Jogador');
    const photo = playerPhotoUrl(record);
    const badges = (Array.isArray(markers) ? markers : []).map(marker => `<span class="apifootball-player-event-badge ${escapeHtml(marker.kind || '')}" title="${escapeHtml(`${marker.label || ''}${marker.minute ? ` · ${marker.minute}` : ''}`)}">${escapeHtml(marker.icon || '•')}${marker.minute ? `<small>${escapeHtml(marker.minute)}</small>` : ''}</span>`).join('');
    return `<span class="apifootball-player-avatar-wrap${compact ? ' compact' : ''}"><span class="apifootball-photo-frame${photo ? '' : ' is-fallback'}" aria-hidden="true">${photo ? `<img class="apifootball-player-photo" data-apifootball-player-photo src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : ''}<span class="apifootball-photo-fallback">${escapeHtml(initials(name))}</span></span>${badges}</span>`;
  }

  function renderPitchPlayer(entry, snapshot, teamName) {
    const player = entry.__player || (entry.player?.player && typeof entry.player.player === 'object' ? entry.player.player : entry.player) || {};
    const name = String(player.name || 'Jogador');
    const number = player.number === null || player.number === undefined || player.number === '' ? '—' : String(player.number);
    const label = `${name}, camisa ${number}`;
    const markers = playerEventMarkers(player, teamName, snapshot, 'starter');
    return `<div class="apifootball-pitch-player" style="--pitch-depth:${entry.depth ?? entry.left}%;--pitch-lane:${entry.top}%;left:${entry.left}%;top:${entry.top}%" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
      ${renderPhoto(player, false, markers)}
      <span class="apifootball-pitch-name">${escapeHtml(name)}</span>
      <span class="apifootball-pitch-number">${escapeHtml(number)}</span>
    </div>`;
  }

  function renderBenchPlayer(player, snapshot, teamName) {
    const record = player?.player && typeof player.player === 'object' ? player.player : player;
    const name = String(record?.name || 'Jogador');
    const number = record?.number === null || record?.number === undefined || record?.number === '' ? '—' : String(record.number);
    const position = String(record?.pos || player?.pos || '').toUpperCase();
    const markers = playerEventMarkers(record, teamName, snapshot, 'bench');
    return `<div class="apifootball-bench-player">${renderPhoto(player, true, markers)}<span class="apifootball-bench-number">${escapeHtml(number)}</span><span class="apifootball-bench-name">${escapeHtml(name)}</span>${position ? `<span class="apifootball-bench-position">${escapeHtml(position)}</span>` : ''}</div>`;
  }

  function renderTeamHead(lineup, fixtureTeam, label) {
    const name = String(lineup?.team?.name || fixtureTeam?.name || label);
    const logo = String(fixtureTeam?.logo || '');
    const formation = String(lineup?.formation || 'Formação não informada');
    return `<div class="apifootball-pitch-team-head"><div class="apifootball-team-head-crest">${logo ? `<img src="${escapeHtml(logo)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<span>${escapeHtml(initials(name))}</span>`}</div><div class="apifootball-team-head-info"><strong>${escapeHtml(name)}</strong><small>${escapeHtml(formation)}</small></div></div>`;
  }

  function renderSupportCard(lineup, fixtureTeam, label, snapshot = null) {
    const name = String(lineup?.team?.name || fixtureTeam?.name || label);
    const coachRecord = lineup?.coach && typeof lineup.coach === 'object' ? lineup.coach : { name: lineup?.coach };
    const coach = String(coachRecord.name || 'Técnico não informado');
    const coachPhoto = typeof coachRecord.photoUrl === 'string' ? coachRecord.photoUrl : '';
    const coachAvatar = coachPhoto ? renderPhoto({ name: coach, photoUrl: coachPhoto }, true, []) : '';
    const substitutes = Array.isArray(lineup?.substitutes) ? lineup.substitutes : [];
    return `<article class="apifootball-support-card">
      <div class="apifootball-support-head"><div><span class="apifootball-support-kicker">COMISSÃO TÉCNICA</span><h5>${escapeHtml(name)}</h5></div><span class="apifootball-support-count">${substitutes.length} reservas</span></div>
      <div class="apifootball-coach-row">${coachPhoto ? coachAvatar : `<span class="apifootball-coach-icon">${escapeHtml(initials(coach))}</span>`}<div><small>Técnico</small><strong>${escapeHtml(coach)}</strong></div></div>
      <div class="apifootball-section-title">Banco de reservas</div>
      ${substitutes.length ? `<div class="apifootball-bench-list">${substitutes.map(player => renderBenchPlayer(player, snapshot, name)).join('')}</div>` : '<div class="apifootball-lineup-empty">Reservas não informados.</div>'}
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
      const teamName = String(lineup.team?.name || (side === 'home' ? fixtureHome.name : fixtureAway.name) || '');
      const placed = playerPlacements(players, side, lineup.formation);
      return `<div class="apifootball-pitch-half ${side}">${placed.map(entry => renderPitchPlayer(entry, snapshot, teamName)).join('')}</div>`;
    };
    return `<div class="apifootball-lineups-view">
      <div class="apifootball-pitch-team-heads">${renderTeamHead(home, fixtureHome, 'Mandante')}${renderTeamHead(away, fixtureAway, 'Visitante')}</div>
      <div class="apifootball-pitch-scroll"><div class="apifootball-pitch" role="img" aria-label="Campo com os jogadores titulares posicionados conforme a formação">
        <div class="apifootball-pitch-outline"></div><div class="apifootball-pitch-center-line"></div><div class="apifootball-pitch-center-circle"></div><div class="apifootball-pitch-box home"></div><div class="apifootball-pitch-box away"></div>
        ${renderHalf(home, 'home')}${renderHalf(away, 'away')}
      </div></div>
      <div class="apifootball-support-grid">${renderSupportCard(home, fixtureHome, 'Mandante', snapshot)}${renderSupportCard(away, fixtureAway, 'Visitante', snapshot)}</div>
      <div class="apifootball-muted apifootball-lineup-footnote">Fotos obtidas pela fonte de dados do jogador quando disponível. Quando uma foto não existe, mostramos as iniciais em vez de associar uma imagem incerta.</div>
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

  function eventMinute(event) {
    const rawElapsed = event?.time?.elapsed;
    if (rawElapsed === null || rawElapsed === undefined || rawElapsed === '') return '—';
    const elapsed = Number(rawElapsed);
    if (!Number.isFinite(elapsed)) return '—';
    const extra = Number(event?.time?.extra);
    return `${elapsed}${Number.isFinite(extra) && extra > 0 ? `+${extra}` : ''}′`;
  }

  function eventTeamName(event, snapshot) {
    const teamId = safeId(event?.team?.id);
    const homeId = safeId(snapshot?.fixture?.home?.id);
    const awayId = safeId(snapshot?.fixture?.away?.id);
    if (teamId && teamId === homeId) return String(snapshot?.fixture?.home?.name || 'Mandante');
    if (teamId && teamId === awayId) return String(snapshot?.fixture?.away?.name || 'Visitante');
    return String(event?.team?.name || '');
  }

  function renderMatchEvents(snapshot) {
    const events = (Array.isArray(snapshot?.events) ? snapshot.events : []).filter(event => {
      const type = String(event?.type || '').toLowerCase();
      return ['goal', 'subst', 'substitution', 'card', 'var'].includes(type);
    }).slice().sort((a, b) => {
      const minuteA = Number(a?.time?.elapsed || 0) * 100 + Number(a?.time?.extra || 0);
      const minuteB = Number(b?.time?.elapsed || 0) * 100 + Number(b?.time?.extra || 0);
      return minuteA - minuteB;
    });
    const rows = events.map(event => {
      const type = String(event?.type || '').toLowerCase();
      const detail = String(event?.detail || '');
      const player = String(event?.player?.name || 'Jogador não informado');
      const assist = String(event?.assist?.name || '');
      const team = eventTeamName(event, snapshot);
      const minute = eventMinute(event);
      let icon = '⚽';
      let title = player;
      let note = '';
      let kind = 'goal';
      if (type === 'goal') {
        if (/missed penalty/i.test(detail)) { icon = '✖'; title = 'Pênalti perdido'; note = player; kind = 'missed-penalty'; }
        else if (/own goal/i.test(detail)) { icon = '⚽'; title = `Gol contra · ${player}`; kind = 'own-goal'; }
        else if (/penalty/i.test(detail)) { icon = '⚽'; title = `Gol de pênalti · ${player}`; kind = 'goal'; }
        if (assist && !/missed penalty/i.test(detail)) note = `Assistência: ${assist}`;
      } else if (type === 'subst' || type === 'substitution') {
        icon = '⇄'; kind = 'substitution';
        const incoming = assist || 'Jogador não informado';
        title = `Entrou: ${incoming}`;
        note = `Saiu: ${player}`;
      } else if (type === 'card') {
        icon = /red/i.test(detail) ? '🟥' : '🟨'; kind = 'card';
        title = /red/i.test(detail) ? 'Cartão vermelho' : 'Cartão amarelo';
        note = player;
      } else if (type === 'var') {
        icon = '📺'; kind = 'var'; title = 'Revisão do VAR'; note = detail || String(event?.comments || '');
      }
      return `<article class="apifootball-event-row ${kind}"><time>${escapeHtml(minute)}</time><span class="apifootball-event-icon" aria-hidden="true">${icon}</span><div class="apifootball-event-copy"><strong>${escapeHtml(title)}</strong>${note ? `<small>${escapeHtml(note)}</small>` : ''}</div><span class="apifootball-event-team">${escapeHtml(team)}</span></article>`;
    }).join('');
    if (!rows) return `<section class="apifootball-events-panel"><div class="apifootball-section-title">Gols, assistências e substituições</div><div class="apifootball-lineup-empty">A API ainda não disponibilizou lances para esta partida.</div></section>`;
    return `<section class="apifootball-events-panel"><div class="apifootball-events-heading"><div><div class="apifootball-section-title">Gols, assistências e substituições</div><small>Eventos oficiais fornecidos pela API-Football</small></div>${events.length ? `<span>${events.length} lance(s)</span>` : ''}</div><div class="apifootball-event-list">${rows}</div></section>`;
  }

  const TEAM_PRIMARY_COLORS = {
    'flamengo':'#c8102e','fluminense':'#7a003c','palmeiras':'#007a33','gremio':'#00a1e4','atletico mg':'#171717','corinthians':'#171717','santos':'#181818',
    'botafogo':'#171717','atletico mineiro':'#171717','atletico-mg':'#171717','internacional':'#d71920','cruzeiro':'#005ca9','vasco':'#171717',
    'bahia':'#075ca8','bragantino':'#8c1017','red bull bragantino':'#8c1017','athletico paranaense':'#d71920','fortaleza':'#00529b','ceara':'#171717',
    'sport recife':'#d71920','vitoria':'#d71920','goias':'#007a33','coritiba':'#007a33','america mineiro':'#007a33','sao paulo':'#e32636',
    'liverpool':'#c8102e','manchester united':'#da291c','manchester city':'#6cabdd','arsenal':'#ef0107','chelsea':'#034694','tottenham':'#132257',
    'newcastle':'#171717','aston villa':'#670e36','west ham':'#7a263a','everton':'#003399','brighton':'#0057b8','crystal palace':'#1b458f',
    'real madrid':'#d4a72c','barcelona':'#a50044','atletico madrid':'#c8102e','atletico de madrid':'#c8102e','sevilla':'#d71920','valencia':'#171717',
    'bayern munich':'#dc052d','borussia dortmund':'#f7d417','bayer leverkusen':'#e32219','rb leipzig':'#dd0741','schalke 04':'#004b9b',
    'inter':'#00529f','internazionale':'#00529f','ac milan':'#fb090b','milan':'#fb090b','juventus':'#171717','napoli':'#00a0df','roma':'#8e1b2f',
    'paris saint germain':'#004170','psg':'#004170','benfica':'#d50032','porto':'#0050a4','sporting cp':'#008e44','ajax':'#d2122e',
    'celtic':'#018749','rangers':'#005eb8','borussia monchengladbach':'#171717','monaco':'#e00025','marseille':'#009fe3','lyon':'#003c8f'
  };
  function normalizeTeamColorName(name) {
    return String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  }
  function teamPrimaryColor(name, fallback='#64748b') {
    const normalized=normalizeTeamColorName(name);
    if(TEAM_PRIMARY_COLORS[normalized])return TEAM_PRIMARY_COLORS[normalized];
    const alias=Object.keys(TEAM_PRIMARY_COLORS).find(key=>normalized===key || (normalized.length>5&&normalized.includes(key)) || (key.length>5&&key.includes(normalized)));
    return alias?TEAM_PRIMARY_COLORS[alias]:fallback;
  }

  function renderStatistics(snapshot) {
    const rows = statsRows(snapshot);
    if (!rows.length) return '<div class="apifootball-message">As estatísticas detalhadas ainda não estão disponíveis para esta partida. Isso pode depender da cobertura da competição ou do estágio do jogo.</div>';
    const homeName = String(snapshot?.fixture?.home?.name || snapshot?.home || 'Mandante');
    const awayName = String(snapshot?.fixture?.away?.name || snapshot?.away || 'Visitante');
    const homeColor=teamPrimaryColor(homeName,'#2563eb');
    const awayColor=teamPrimaryColor(awayName,'#dc2626');
    const list = rows.map(row => {
      const homeNumber = numericValue(row.home);
      const awayNumber = numericValue(row.away);
      const homeShare = homeNumber === null || awayNumber === null || homeNumber + awayNumber === 0
        ? 50 : Math.round((homeNumber / (homeNumber + awayNumber)) * 100);
      return `<article class="apifootball-stat-card" style="--stat-home-color:${homeColor};--stat-away-color:${awayColor}"><div class="apifootball-stat-values"><strong>${escapeHtml(row.home)}</strong><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.away)}</strong></div><div class="apifootball-stat-bar" aria-hidden="true"><span class="home" style="width:${homeShare}%"></span><span class="away" style="width:${100 - homeShare}%"></span></div></article>`;
    }).join('');
    return `<div class="apifootball-statistics-view" style="--stat-home-color:${homeColor};--stat-away-color:${awayColor}"><div class="apifootball-stat-team-labels"><strong>${escapeHtml(homeName)}</strong><strong>${escapeHtml(awayName)}</strong></div><div class="apifootball-stat-grid">${list}</div><div class="apifootball-muted">Comparativo das estatísticas fornecidas pela fonte esportiva selecionada. Um traço indica dado não informado.</div></div>`;
  }

  return { escapeHtml, playerPhotoUrl, initials, sortLineupPlayers, formationFallback, playerPlacements, resolveLineups, playerEventMarkers, renderLineups, statsRows, numericValue, normalizeTeamColorName, teamPrimaryColor, renderStatistics, eventMinute, renderMatchEvents };
});
