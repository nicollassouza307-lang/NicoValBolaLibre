const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = [
  ['version 0.22.7', pkg.version === '0.22.7' && html.includes('V0.22.7')],
  ['seven Admin tabs', ['general','scores365','matches','data','standings','cache','diagnostics'].every(id => html.includes(`id:'${id}'`))],
  ['Admin navigation roles', html.includes("setAttribute('role','tablist')") && html.includes('data-admin-page')],
  ['horizontal date strip', html.includes('id="scheduleDateStrip"') && html.includes('renderScheduleDateStrip')],
  ['compact football-style agenda cards', html.includes('.game-card{padding:9px 12px') && html.includes('.games-grid{grid-template-columns:minmax(0,1fr);gap:7px}') && html.includes('agenda-score-wrap')],
  ['Argentinian broadcaster market filter', fs.existsSync(path.join(root, 'agenda-market-filter.js')) && fs.readFileSync(path.join(root, 'agenda-market-filter.js'), 'utf8').includes('marketCodeForNetwork') && fs.readFileSync(path.join(root, 'server.js'), 'utf8').includes('filterAgendaByMarkets')],
  ['365Scores safe agenda matching', html.includes('autoEligible') && html.includes('persistAutoScores365Links')],
  ['active match center no longer uses API-Football badges', !html.includes('logoMarkup(e.home,e.homeBadge || apiFootballTeamLogoFor') && /scores365TeamLogoFor\(e,'home'\)/.test(html)],
  ['collapsible competition groups', html.includes('class="competition-section"') && html.includes('nvb_competition_collapsed_v1')],
  ['365Scores does not add agenda games', html.includes('Nunca cria jogos na agenda.') && html.includes('Fonte esportiva principal:')],
  ['cache summary and diagnostics', html.includes('renderAdminCacheSummary') && html.includes('copyAdminDiagnostics')],
  ['PT-BR and Argentinian Spanish remain the only interface languages', /option value="pt-BR"/.test(html) && /option value="es-AR"/.test(html) && !/option value="es-ES"/.test(html)]
];
let failed = 0;
for (const [name, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) failed++; }
if (failed) process.exit(1);
console.log(`\n${checks.length}/${checks.length} checks passed.`);
