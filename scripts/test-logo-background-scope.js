#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
assert.equal(pkg.version, '0.20.1');
assert.match(html, /img\.crest:not\(\.crest-github\),\s*img\.competition-divider-logo,\s*\.apifootball-team-head-crest\s*\{\s*background-color:\s*#fff/,
  'Fundos brancos ficam somente atrás de logos raster/competição, sem afetar SVG do GitHub.');
assert.match(html, /img\.crest\.crest-github\s*\{\s*background-color:\s*#0c1b27;\s*border:\s*1px solid #182436;/,
  'SVGs do GitHub ficam em placa escura para preservar escudos brancos, como Juventus.');
assert.doesNotMatch(html, /\.match-scoreboard \.match-team-home[^}]*background:\s*#fff/,
  'O cartão/área do time não deve ser clareado.');
assert.doesNotMatch(html, /\.match-center-panel\s*\{[^}]*background:\s*#(?:fff|f[0-9a-f]{3,6})/i,
  'O painel de informações abaixo do jogo deve manter o fundo escuro.');
assert.match(html, /\.match-center-panel \.apifootball-stat-card \.home \{\s*background:\s*var\(--stat-home-color/,
  'A barra do mandante continua colorida pela cor do clube.');
assert.match(html, /\.match-center-panel \.apifootball-stat-card \.away \{\s*background:\s*var\(--stat-away-color/,
  'A barra do visitante continua colorida pela cor do clube.');
console.log('PASSOU: fundo branco restrito às placas dos logos; Match Center preserva tema escuro; barras usam cores dos clubes.');
