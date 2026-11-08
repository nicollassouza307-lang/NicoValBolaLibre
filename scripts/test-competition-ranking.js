"use strict";
const assert = require('node:assert/strict');
const ranking = require('../competition-ranking');

const defaultGroups = [
  { key: 'eredivisie', name: 'Netherlands Eredivisie', firstTime: 100 },
  { key: 'copa-do-brasil', name: 'Copa do Brasil', firstTime: 500 },
  { key: 'bundesliga', name: 'Germany Bundesliga', firstTime: 300 },
  { key: 'laliga', name: 'Spain LaLiga', firstTime: 200 },
  { key: 'premier', name: 'England Premier League', firstTime: 400 },
  { key: 'unknown', name: 'Campeonato Regional', firstTime: 50 }
];

assert.deepEqual(
  ranking.sort(defaultGroups, []).map(group => group.key),
  ['premier', 'laliga', 'bundesliga', 'copa-do-brasil', 'eredivisie', 'unknown'],
  'A ordem automática prioriza competições principais em vez de colocar sempre o jogo mais cedo primeiro.'
);
assert.deepEqual(
  ranking.sort([
    {key:'laliga',name:'LaLiga',firstTime:300},
    {key:'eredivisie',name:'Eredivisie',firstTime:100},
    {key:'bundesliga',name:'Bundesliga',firstTime:200}
  ], []).map(group => group.key),
  ['laliga', 'bundesliga', 'eredivisie'],
  'LaLiga e Bundesliga aparecem antes da Eredivisie mesmo quando a Eredivisie começa mais cedo.'
);
assert.deepEqual(
  ranking.sort([
    {key:'copa',name:'Copa do Brasil',firstTime:900},
    {key:'eredivisie',name:'Eredivisie',firstTime:100}
  ], []).map(group => group.key),
  ['copa', 'eredivisie'],
  'Copa do Brasil não fica automaticamente atrás da Eredivisie por causa do horário.'
);
assert.deepEqual(
  ranking.sort(defaultGroups, ['eredivisie', 'copa-do-brasil']).map(group => group.key),
  ['eredivisie', 'copa-do-brasil', 'premier', 'laliga', 'bundesliga', 'unknown'],
  'A ordem manual salva pelo usuário prevalece sobre a prioridade padrão.'
);
assert.deepEqual(
  ranking.sort([
    {key:'regional-b',name:'Copa Regional B',firstTime:300},
    {key:'regional-a',name:'Copa Regional A',firstTime:100}
  ], []).map(group => group.key),
  ['regional-a', 'regional-b'],
  'Competições sem prioridade conhecida continuam ordenadas pelo horário.'
);
assert.equal(ranking.defaultPriority('Netherlands Eredivisie'), 130);
assert.equal(ranking.defaultPriority('Copa do Brasil'), 90);
assert.equal(ranking.defaultPriority('Brasileirao Serie A'), 80);
assert.equal(ranking.defaultPriority('Italy Serie A'), 60);

const movementGroups = [
  { key: 'serie-a', name: 'Serie A', firstTime: 300 },
  { key: 'libertadores', name: 'Libertadores', firstTime: 200 },
  { key: 'premier-league', name: 'Premier League', firstTime: 100 }
];
assert.deepEqual(
  ranking.move([], ranking.sort(movementGroups, []), 'libertadores', -1),
  ['libertadores', 'premier-league', 'serie-a'],
  'Mover para cima parte da ordem padrão visível.'
);
assert.deepEqual(
  ranking.move(['serie-a', 'premier-league', 'libertadores'], ranking.sort(movementGroups, ['serie-a', 'premier-league']), 'premier-league', 1),
  ['serie-a', 'libertadores', 'premier-league'],
  'Mover para baixo troca a posição na ordem persistida.'
);
assert.deepEqual(
  ranking.move(['a', 'hidden', 'b'], [{key:'a'}, {key:'b'}], 'a', 1),
  ['b', 'hidden', 'a'],
  'Mover seções visíveis não deve remover nem reorganizar competições ocultas.'
);
console.log('PASSOU: prioridade automática das competições, Eredivisie abaixo das ligas principais, Copa do Brasil acima da Eredivisie, ordem manual, desempate por horário e movimentação.');
