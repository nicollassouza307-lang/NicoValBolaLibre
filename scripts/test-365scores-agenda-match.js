'use strict';

const assert = require('node:assert/strict');
const { matchAgendaEvents, normalizeMatchTeam, teamNameSimilarity } = require('../365scores-service');

const agenda = [
  { id: 'agenda-1', dateEvent: '2026-11-09', timeText: '19:00', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirão Série A' },
  { id: 'agenda-2', dateEvent: '2026-11-09', timeText: '21:00', home: 'Cúcuta Deportivo', away: 'Junior Barranquilla', league: 'Colombia Primera A' },
  { id: 'agenda-3', dateEvent: '2026-11-09', timeText: '16:00', home: 'Botafogo', away: 'Vasco', league: 'Brasileirão Série A' }
];
const games = [
  { gameId: 111, startTime: '2026-11-09T22:00:00Z', home: { id: 10, name: 'Flamengo' }, away: { id: 20, name: 'Palmeiras' }, competition: { id: 77, name: 'Brasileirao' } },
  { gameId: 222, startTime: '2026-11-09T23:00:00Z', home: { name: 'Junior Barranquilla' }, away: { name: 'Cucuta' }, competition: { id: 88, name: 'Colombia Primera A' } },
  { gameId: 333, startTime: '2026-11-10T18:00:00Z', home: { name: 'Botafogo' }, away: { name: 'Vasco da Gama' }, competition: { id: 77, name: 'Brasileirao' } },
  { gameId: 444, startTime: '2026-11-09T19:00:00Z', home: { name: 'Vasco' }, away: { name: 'Botafogo' }, competition: { id: 77, name: 'Brasileirao' } }
];

assert.equal(normalizeMatchTeam('Cúcuta Deportivo'), 'cucuta');
assert.equal(teamNameSimilarity('Cúcuta Deportivo', 'Cucuta'), 1);
const results = matchAgendaEvents(agenda, games);
assert.equal(results.length, 3);
assert.equal(results[0].candidates[0].gameId, 111);
assert.equal(results[0].candidates[0].confidence, 'alta');
assert.equal(results[0].candidates[0].autoEligible, true, 'Correspondência exata, competição igual e horário próximo pode ser vinculada automaticamente.');
assert.equal(results[0].candidates[0].homeId, 10);
assert.equal(results[0].candidates[0].awayId, 20);
assert.equal(results[1].candidates[0].gameId, 222);
assert.equal(results[1].candidates[0].confidence, 'revisar', 'A inversão de mandante/visitante deve exigir revisão manual');
assert.equal(results[1].candidates[0].autoEligible, false, 'Times invertidos nunca podem ser vinculados automaticamente.');
assert.equal(results[2].candidates.some(candidate => candidate.gameId === 333), false, 'Não deve associar jogo de outro dia');
assert.equal(results[2].candidates.some(candidate => candidate.gameId === 444), true, 'A inversão de mandante/visitante deve ser apresentada para revisão, não aprovada automaticamente');
assert.equal(results[2].candidates.find(candidate => candidate.gameId === 444).confidence, 'revisar');
assert.equal(results[2].candidates.find(candidate => candidate.gameId === 444).autoEligible, false);
const ambiguous = matchAgendaEvents([agenda[0]], [games[0], { ...games[0], gameId: 999 }]);
assert.equal(ambiguous[0].candidates[0].autoEligible, false, 'Empate entre candidatas impede associação automática.');
const cupCompetition = matchAgendaEvents(
  [{ ...agenda[0], league: 'Premier League' }],
  [{ gameId: 555, startTime: '2026-11-09T22:00:00Z', home: { name: 'Flamengo' }, away: { name: 'Palmeiras' }, competition: { id: 99, name: 'Premier League Cup' } }]
);
assert.equal(cupCompetition[0].candidates[0].competitionMatch, true, 'Compatibilidade aproximada pode continuar aparecendo para revisão manual.');
assert.equal(cupCompetition[0].candidates[0].competitionAutoMatch, false, 'Competições com nomes parecidos, mas diferentes, nunca podem gerar vínculo automático.');
assert.equal(cupCompetition[0].candidates[0].autoEligible, false);
const premierLeague = matchAgendaEvents(
  [{ ...agenda[0], league: 'English Premier League' }],
  [{ gameId: 556, startTime: '2026-11-09T22:00:00Z', home: { name: 'Flamengo' }, away: { name: 'Palmeiras' }, competition: { id: 100, name: 'Premier League' } }]
);
assert.equal(premierLeague[0].candidates[0].autoEligible, true, 'Alias estrito da Premier League deve permitir associação segura.');
const laLiga = matchAgendaEvents(
  [{ ...agenda[0], league: 'LaLiga' }],
  [{ gameId: 557, startTime: '2026-11-09T22:00:00Z', home: { name: 'Flamengo' }, away: { name: 'Palmeiras' }, competition: { id: 101, name: 'La Liga' } }]
);
assert.equal(laLiga[0].candidates[0].autoEligible, true, 'Alias estrito da LaLiga deve permitir associação segura.');

// Nomes curtos/oficiais usados por feeds diferentes não podem ser descartados.
const shortNames = matchAgendaEvents(
  [{ id: 'agenda-short', dateEvent: '2026-11-09', timeText: '20:00', home: 'Corinthians', away: 'Botafogo', league: 'Brasileirão Série A' }],
  [{ gameId: 700, startTime: '2026-11-09T20:00:00', home: { name: 'Corinthians Paulista' }, away: { name: 'Botafogo FR' }, competition: { name: 'Brasileirao' } }]
);
assert.equal(shortNames[0].candidates[0].gameId, 700, 'Nome oficial/curto com sufixos não deve resultar em Sem candidato.');
assert.equal(shortNames[0].candidates[0].autoEligible, true, 'Sufixos oficiais removidos de forma inequívoca podem permitir vínculo automático.');
assert.equal(shortNames[0].diagnostics.sameDateGames, 1);

// O dia local é considerado explicitamente mesmo quando o servidor opera em UTC.
const localWallTime = matchAgendaEvents(
  [{ id: 'agenda-wall-time', dateEvent: '2026-11-09', timeText: '21:30', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirão Série A' }],
  [{ gameId: 701, startTime: '2026-11-09T21:30:00', home: { name: 'Flamengo' }, away: { name: 'Palmeiras' }, competition: { name: 'Brasileirao' } }]
);
assert.equal(localWallTime[0].candidates[0].gameId, 701, 'Data/hora sem offset deve ser interpretada em America/Sao_Paulo.');
assert.equal(localWallTime[0].candidates[0].autoEligible, true);

// Partidas perto da meia-noite podem atravessar a data UTC, mas continuam em revisão.
const adjacentDate = matchAgendaEvents(
  [{ id: 'agenda-near-midnight', dateEvent: '2026-11-09', timeText: '23:50', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirão Série A' }],
  [{ gameId: 702, startTime: '2026-11-10T00:10:00-03:00', home: { name: 'Flamengo' }, away: { name: 'Palmeiras' }, competition: { name: 'Brasileirao' } }]
);
assert.equal(adjacentDate[0].candidates[0].gameId, 702, 'Data vizinha deve ser considerada quando os clubes e horário batem.');
assert.equal(adjacentDate[0].candidates[0].autoEligible, false, 'Data vizinha nunca pode gerar vínculo automático.');
assert.equal(adjacentDate[0].diagnostics.adjacentDateGames, 1);


const noCandidate = matchAgendaEvents(
  [{ id: 'agenda-no-candidate', dateEvent: '2026-11-09', timeText: '20:00', home: 'Time A', away: 'Time B', league: 'Competição X' }],
  [{ gameId: 799, startTime: '2026-11-09T20:00:00-03:00', home: { name: 'Outro Clube' }, away: { name: 'Mais Outro' }, competition: { name: 'Outra Liga' } }]
);
assert.equal(noCandidate[0].candidates.length, 0);
assert.equal(noCandidate[0].diagnostics.sourceGames, 1, 'O diagnóstico deve mostrar quantos jogos foram recebidos.');
assert.equal(noCandidate[0].diagnostics.sameDateGames, 1, 'O diagnóstico deve separar os jogos na mesma data.');
assert.ok(noCandidate[0].diagnostics.bestTeamScore >= 0, 'O diagnóstico deve registrar a melhor semelhança encontrada.');

console.log('PASSOU: correspondência por clubes, aliases, sufixos oficiais, fuso local, virada de data, competição, horário, diagnóstico e revisão de ambiguidades.');
