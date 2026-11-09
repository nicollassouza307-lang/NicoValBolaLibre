const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const checks = [
  ['version 0.19.0', pkg.version === '0.19.0' && html.includes('V0.19.0')],
  ['seven Admin tabs', ['general','scores365','matches','data','standings','cache','diagnostics'].every(id => html.includes(`id:'${id}'`))],
  ['Admin navigation roles', html.includes("setAttribute('role','tablist')") && html.includes('data-admin-page')],
  ['horizontal date strip', html.includes('id="scheduleDateStrip"') && html.includes('renderScheduleDateStrip')],
  ['collapsible competition groups', html.includes('class="competition-section"') && html.includes('nvb_competition_collapsed_v1')],
  ['365Scores does not add agenda games', html.includes('A 365Scores não cria partidas nem altera as fontes originais da agenda.')],
  ['cache summary and diagnostics', html.includes('renderAdminCacheSummary') && html.includes('copyAdminDiagnostics')],
  ['PT-BR and Argentinian Spanish remain the only interface languages', /option value="pt-BR"/.test(html) && /option value="es-AR"/.test(html) && !/option value="es-ES"/.test(html)]
];
let failed = 0;
for (const [name, pass] of checks) { console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); if (!pass) failed++; }
if (failed) process.exit(1);
console.log(`\n${checks.length}/${checks.length} checks passed.`);
