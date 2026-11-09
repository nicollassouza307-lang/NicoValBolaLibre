'use strict';
const assert = require('node:assert/strict');
const { filterAgendaByMarkets, marketCodeForNetwork } = require('../agenda-market-filter');
const events = [
  { id: 'ar', tvNetworks: [{ name: 'ESPN', country: 'Argentina' }, { name: 'TNT Sports Argentina', country: '' }] },
  { id: 'br', tvNetworks: [{ name: 'SporTV', country: 'Brasil' }] },
  { id: 'latam', tvNetworks: [{ name: 'ESPN Deportes', country: 'América Latina' }] },
  { id: 'unknown', tvNetworks: [{ name: 'Canal sem país', country: '' }] },
  { id: 'mixed', tvNetworks: [{ name: 'ESPN Brasil', country: 'Brasil' }, { name: 'TyC Sports', country: 'Argentina' }] }
];
assert.equal(marketCodeForNetwork(events[0].tvNetworks[0]), 'AR');
assert.equal(marketCodeForNetwork({ name: 'TNT Sports Argentina' }), 'AR');
assert.equal(marketCodeForNetwork({ name: 'ESPN', countryCode: 'AR' }), 'AR');
assert.equal(marketCodeForNetwork({ name: 'TyC Sports' }), 'AR');
assert.equal(marketCodeForNetwork({ name: 'SporTV' }), 'BR');
const argentina = filterAgendaByMarkets(events, ['AR']);
assert.deepEqual(argentina.map(x => x.id), ['ar', 'latam', 'unknown', 'mixed']);
assert.deepEqual(argentina.find(x => x.id === 'mixed').tvNetworks.map(x => x.name), ['TyC Sports']);
const brazil = filterAgendaByMarkets(events, ['BR']);
assert.deepEqual(brazil.map(x => x.id), ['br', 'latam', 'unknown', 'mixed']);
assert.deepEqual(brazil.find(x => x.id === 'mixed').tvNetworks.map(x => x.name), ['ESPN Brasil']);
assert.equal(filterAgendaByMarkets(events, ['BR', 'AR']).length, events.length);
console.log('PASSOU: filtro de emissoras BR/AR mantém canais LATAM/desconhecidos e remove canais exclusivos do outro mercado.');
