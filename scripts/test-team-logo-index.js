'use strict';

const assert = require('node:assert/strict');
const logoIndex = require('../team-logo-index');

function teamKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' e ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
function countrySlugHint(value) {
  const key = teamKey(value);
  const map = { brasil: 'brazil', brazil: 'brazil', england: 'england', inglaterra: 'england', spain: 'spain', espanha: 'spain' };
  return map[key] || key.replace(/\s+/g, '-');
}
const aliases = { 'man utd': 'manchester united', 'barca': 'barcelona' };
const tree = [
  { type: 'blob', path: 'logos/england/Arsenal.svg' },
  { type: 'blob', path: 'logos/england/Manchester United.svg' },
  { type: 'blob', path: 'logos/spain/Barcelona.svg' },
  { type: 'blob', path: 'logos/brazil/Flamengo.svg' },
  { type: 'blob', path: 'logos/argentina/Flamengo.svg' },
  { type: 'blob', path: 'logos/england/United.svg' },
  { type: 'blob', path: 'logos/scotland/United.svg' },
  { type: 'blob', path: 'images/Flamengo.svg' },
  { type: 'blob', path: 'logos/brazil/Palmeiras.png' },
  { type: 'tree', path: 'logos/brazil/NotAFile.svg' }
];
const index = logoIndex.indexTree(tree, teamKey);
const options = { normalizeName: teamKey, normalizeCountry: countrySlugHint, aliases };

assert.equal(index.size, 5, 'Indexa apenas arquivos SVG dentro de logos/<país>.');
assert.equal(
  logoIndex.findExactLogo('Arsenal FC', 'England', index, options),
  `${logoIndex.DEFAULT_RAW_BASE}logos/england/Arsenal.svg`,
  'Normaliza sufixos como FC e encontra o escudo no país correto.'
);
assert.equal(
  logoIndex.findExactLogo('Man Utd', 'England', index, options),
  `${logoIndex.DEFAULT_RAW_BASE}logos/england/Manchester%20United.svg`,
  'Aplica aliases conhecidos sem busca aproximada.'
);
assert.equal(
  logoIndex.findExactLogo('Flamengo', 'Brasil', index, options),
  `${logoIndex.DEFAULT_RAW_BASE}logos/brazil/Flamengo.svg`,
  'Usa país para separar clubes homônimos.'
);
assert.equal(logoIndex.findExactLogo('Flamengo', 'Spain', index, options), '', 'Nunca usa escudo de país incompatível.');
assert.equal(logoIndex.findExactLogo('United', '', index, options), '', 'Recusa nomes ambíguos quando não há país.');
assert.equal(logoIndex.findExactLogo('Time que não existe', 'Brasil', index, options), '', 'Não inventa correspondência para clube ausente.');

assert.deepEqual(
  logoIndex.uniqueHttpsCandidates([
    'https://raw.githubusercontent.com/repo/logo.svg',
    'https://raw.githubusercontent.com/repo/logo.svg',
    'http://unsafe.example/logo.png',
    'javascript:alert(1)',
    'https://user:pass@example.com/crest.svg'
  ]),
  ['https://raw.githubusercontent.com/repo/logo.svg'],
  'Aceita somente URLs HTTPS sem credenciais e remove duplicatas.'
);

console.log('PASSOU: index GitHub, normalização por nome, aliases, separação por país, recusa de homônimos/nomes desconhecidos e validação HTTPS.');
