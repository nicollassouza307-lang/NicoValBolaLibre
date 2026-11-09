'use strict';

const assert = require('node:assert/strict');
const { matchAgendaEvents, normalizeMatchTeam, teamNameSimilarity } = require('../365scores-service');

const agenda = [
  { id: 'agenda-1', dateEvent: '2026-11-09', timeText: '19:00', home: 'Flamengo', away: 'Palmeiras', league: 'Brasileirão Série A' },
  { id: 'agenda-2', dateEvent: '2026-11-09', timeText: '21:00', home: 'Cúcuta Deportivo', away: 'Junior Barranquilla', league: 'Colombia Primera A' },
  { id: 'agenda-3', dateEvent: '2026-11-09', timeText: '16:00', home: 'Botafogo', away: 'Vasco', league: 'Brasileirão Série A' }
];
const games = [
  { gameId: 111, startTime: '2026-11-09T22:00:00Z', home: { name: 'Flamengo' }, away: { name: 'Palmeiras' }, competition: { id: 77, name: 'Brasileirao' } },
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
assert.equal(results[1].candidates[0].gameId, 222);
assert.equal(results[1].candidates[0].confidence, 'revisar', 'A inversão de mandante/visitante deve exigir revisão manual');
assert.equal(results[2].candidates.some(candidate => candidate.gameId === 333), false, 'Não deve associar jogo de outro dia');
assert.equal(results[2].candidates.some(candidate => candidate.gameId === 444), true, 'A inversão de mandante/visitante deve ser apresentada para revisão, não aprovada automaticamente');
assert.equal(results[2].candidates.find(candidate => candidate.gameId === 444).confidence, 'revisar');
console.log('PASSOU: correspondência por clubes, data, competição, horário, alias e revisão de mandante/visitante invertidos.');
