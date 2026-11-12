'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('../package.json');
const { normalizeGame } = require('../365scores-service');
const { stripRepeatedTeamSuffix, extractCompetitionAndAway } = require('../server');
const lineup = require('../apifootball-lineup-ui');

assert.equal(version, '0.22.7');

// Feeds can duplicate the away-team suffix with or without spaces.
assert.equal(stripRepeatedTeamSuffix('Racing Avellaneda Avellaneda'), 'Racing Avellaneda');
assert.equal(stripRepeatedTeamSuffix('Manchester City Manchester City'), 'Manchester City');
assert.equal(stripRepeatedTeamSuffix('RacingAvellanedaRacingAvellaneda'), 'RacingAvellaneda');
assert.equal(stripRepeatedTeamSuffix('Palmeiras'), 'Palmeiras');
assert.deepEqual(extractCompetitionAndAway('Racing AvellanedaPrimera División', ''), { away: 'Racing Avellaneda', competition: 'Primera División' });
assert.deepEqual(extractCompetitionAndAway('MonterreyLiga MX', ''), { away: 'Monterrey', competition: 'Liga MX' });
assert.deepEqual(extractCompetitionAndAway('Al AhlyCONCACAF Champions Cup', ''), { away: 'Al Ahly', competition: 'CONCACAF Champions Cup' });

// Regressão da captura enviada pelo usuário: competição UEFA estava sendo colada ao visitante.
assert.deepEqual(extractCompetitionAndAway('Bélgica UEFA Nations League', ''), { away: 'Bélgica', competition: 'UEFA Nations League' });
assert.deepEqual(extractCompetitionAndAway('ChipreUEFA Nations League', ''), { away: 'Chipre', competition: 'UEFA Nations League' });
assert.deepEqual(extractCompetitionAndAway('Bielorrússia UEFA Nations League', ''), { away: 'Bielorrússia', competition: 'UEFA Nations League' });
assert.deepEqual(extractCompetitionAndAway('FinlândiaUEFA Nations League', ''), { away: 'Finlândia', competition: 'UEFA Nations League' });
assert.deepEqual(extractCompetitionAndAway('Arsenal Feminino Champions League Feminina', ''), { away: 'Arsenal Feminino', competition: 'Champions League Feminina' });

// Keep 365Scores competition structure attached to each normalized match.
const normalized = normalizeGame({
  id: 500,
  startTime: '2026-11-12T20:00:00-03:00',
  homeCompetitor: { id: 10, name: 'Home FC' },
  awayCompetitor: { id: 20, name: 'Away FC' },
  competitions: [{
    id: 9, name: 'National League', country: { name: 'Country' },
    category: { id: 3, name: 'Women U20' },
    division: { id: 4, name: 'Division A' },
    group: { id: 5, name: 'Group B' },
    stage: { id: 6, name: 'Semi-finals' },
    season: { id: 7, name: '2026' }
  }],
  round: { name: 'Semi-finals' }
});
assert.equal(normalized.category, 'women_youth');
assert.equal(normalized.competition.categoryName, 'Women U20');
assert.equal(normalized.competition.divisionName, 'Division A');
assert.equal(normalized.competition.groupName, 'Group B');
assert.equal(normalized.competition.stageName, 'Semi-finals');
assert.equal(normalized.competition.seasonName, '2026');
assert.equal(normalized.competition.country, 'Country');
assert.equal(normalized.round, 'Fase: Semi-finals');

// The goalkeeper is kept behind the defense, with extra separation from the defensive line.
const placements = lineup.playerPlacements([
  { player: { name: 'Goalkeeper', pos: 'G', grid: '1:1' } },
  { player: { name: 'Defender 1', pos: 'D', grid: '2:1' } },
  { player: { name: 'Defender 2', pos: 'D', grid: '2:2' } },
  { player: { name: 'Midfielder', pos: 'M', grid: '3:1' } },
  { player: { name: 'Forward', pos: 'F', grid: '4:1' } }
], 'home', '4-3-3');
const depth = name => placements.find(item => item.player.player.name === name).depth;
assert.equal(depth('Goalkeeper'), 8.5);
assert.equal(depth('Defender 1'), 30);
assert.ok(depth('Defender 1') - depth('Goalkeeper') >= 20, 'A defesa precisa ficar mais distante do goleiro.');
assert.ok(depth('Defender 1') < depth('Midfielder'));
assert.ok(depth('Midfielder') < depth('Forward'));

const index = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
assert.match(index, /data-remove-agenda-match=/, 'Cada card precisa expor a ação de remover partida.');
assert.match(index, /restoreAgendaMatch\(/, 'A remoção precisa ser reversível no Admin.');
assert.match(index, /Partidas removidas da agenda/, 'O painel Admin precisa mostrar as partidas ocultadas.');
assert.match(index, /state\.events\.filter\(event=>!isAgendaMatchHidden\(event\)\)\.map/, 'Partidas ocultadas não devem ser enviadas à associação automática 365Scores.');
assert.match(index, /function scores365CompetitionMetaForEvent/, 'Metadados de competição da 365Scores precisam chegar ao agrupador.');
assert.match(index, /linkedCompetition/, 'Metadados do vínculo não podem sumir quando os detalhes da partida chegam incompletos.');
assert.match(index, /linkedCompetitionMeta/, 'O resumo do jogo também deve usar metadados guardados no vínculo da agenda.');
assert.match(index, /meaningfulStage/, 'Etapas relevantes podem formar subdivisões da competição.');
assert.match(index, /return bucketKey \? `\$\{baseKey\}\|\$\{bucketKey\}` : baseKey;/, 'Competições sem metadados preservam as chaves antigas da ordem manual.');
assert.match(index, /fact\('🏷','Divisão'/, 'A divisão recebida também aparece nos dados da partida.');
assert.match(index, /width:48px!important;height:48px!important/, 'As fotos dos titulares devem ficar maiores.');
assert.match(index, /width:40px!important;height:40px!important/, 'As fotos dos titulares também devem ganhar tamanho em telas móveis.');

console.log('PASSOU: nomes repetidos e sufixos de competição nos visitantes, metadados de categoria/divisão/grupo/fase/temporada 365Scores, remoção reversível de partidas, filtros de partidas ocultas e formação ampliada com defesa mais distante do goleiro.');
