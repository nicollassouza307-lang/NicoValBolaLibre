'use strict';

const path = require('node:path');
const { execFileSync } = require('node:child_process');
let repository = String(process.env.GITHUB_REPOSITORY || '').trim();
if (!repository) {
  try {
    const remote = execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const match = remote.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) repository = `${match[1]}/${match[2]}`;
  } catch {}
}
const repo = repository.split('/');
const publish = repo.length === 2 && repo[0] && repo[1]
  ? [{ provider: 'github', owner: repo[0], repo: repo[1], releaseType: 'release' }]
  : undefined;

module.exports = {
  appId: 'com.nicovalbolalibre.desktop',
  productName: 'NicoValBolaLibre',
  directories: { output: path.resolve(__dirname, '..', 'dist') },
  files: [
    'electron/**/*',
    'package.json',
    'node_modules/**/*'
  ],
  extraResources: [
    { from: path.resolve(__dirname, '..', 'server.js'), to: 'app-server/server.js' },
    { from: path.resolve(__dirname, 'cloud-sync-defaults.json'), to: 'app-server/cloud-sync-defaults.json' },
    { from: path.resolve(__dirname, 'icon.ico'), to: 'icon.ico' },
    { from: path.resolve(__dirname, '..', 'index.html'), to: 'app-server/index.html' },
    { from: path.resolve(__dirname, '..', 'competition-ranking.js'), to: 'app-server/competition-ranking.js' },
    { from: path.resolve(__dirname, '..', 'team-logo-index.js'), to: 'app-server/team-logo-index.js' },
    { from: path.resolve(__dirname, '..', 'apifootball-service.js'), to: 'app-server/apifootball-service.js' },
    { from: path.resolve(__dirname, '..', 'multi-api-engine.js'), to: 'app-server/multi-api-engine.js' },
    { from: path.resolve(__dirname, '..', 'football-data-service.js'), to: 'app-server/football-data-service.js' },
    { from: path.resolve(__dirname, '..', 'thesportsdb-service.js'), to: 'app-server/thesportsdb-service.js' },
    { from: path.resolve(__dirname, '..', 'apifootball-lineup-ui.js'), to: 'app-server/apifootball-lineup-ui.js' },
    { from: path.resolve(__dirname, '..', '.env.example'), to: 'app-server/.env.example' }
  ],
  asar: true,
  win: {
    icon: path.resolve(__dirname, 'icon.ico'),
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-${version}-Setup.${ext}'
  },
  nsis: {
    installerIcon: path.resolve(__dirname, 'icon.ico'),
    uninstallerIcon: path.resolve(__dirname, 'icon.ico'),
    installerHeaderIcon: path.resolve(__dirname, 'icon.ico'),
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'NicoValBolaLibre',
    runAfterFinish: true
  },
  publish
};
