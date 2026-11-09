'use strict';

// Servidor local do NicoValBolaLibre e agregador de agendas públicas.
// SportsAPI permanece como rota opcional; a agenda principal usa Rei dos Canais e PelotaLibre.
// Requer Node.js 18+ (usa fetch nativo). Não precisa instalar dependências.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const { ApiFootballService } = require('./apifootball-service');
const { FootballDataService, cleanStandingRows } = require('./football-data-service');
const { TheSportsDBService, normalizeTeam: normalizeSportsDbTeam, countryKey: sportsDbCountryKey, fold: sportsDbFold } = require('./thesportsdb-service');
const { Scores365Service, matchAgendaEvents } = require('./365scores-service');

const ROOT = __dirname;
const HOST = '127.0.0.1';
const API_BASE = 'https://sportsapi.com.br/api/v1';
const MARKET_NAMES = { BR: 'Brasil', AR: 'Argentina' };
const gamesCache = new Map();
const GAME_CACHE_MS = 3 * 60 * 1000;

function loadEnvFile() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnvFile();

const API_FOOTBALL_DATA_DIR = process.env.NVB_USER_DATA_DIR || path.join(__dirname, '.nvb-data');
const apiFootballService = new ApiFootballService({
  dataDir: API_FOOTBALL_DATA_DIR,
  getApiKey: () => String(process.env.NVB_APIFOOTBALL_KEY || process.env.APIFOOTBALL_API_KEY || '').trim()
});
const footballDataService = new FootballDataService({
  getToken: () => String(process.env.NVB_FOOTBALL_DATA_TOKEN || '').trim(),
  engine: apiFootballService.multiApiEngine
});
const theSportsDBService = new TheSportsDBService({ engine: apiFootballService.multiApiEngine });
const scores365Service = new Scores365Service({ engine: apiFootballService.multiApiEngine });

const REQUESTED_PORT = Number(process.env.PORT || 8787);
let ACTIVE_PORT = REQUESTED_PORT;
const API_KEY = String(process.env.SPORTSAPI_KEY || '').trim();

// Agregador de agendas públicas. Importa metadados de partidas, canais, logos e EPG.
// URLs de embeds de terceiros não são repassadas ao navegador nem salvas no catálogo local.
const REI_API_BASE = 'https://api.reidoscanais.my';
const LA18HD_AGENDA_URL = 'https://la18hd.su/eventos/json/agenda123.json';
const PUBLIC_AGENDA_SOURCES = [
  { id: 'rei', label: 'Rei dos Canais', priority: 100 },
  { id: 'pelota-video', label: 'PelotaLibre.video', priority: 70, url: 'https://pelotalibre.video/agenda/' },
  { id: 'pelota-ar', label: 'PelotaLibre.ar', priority: 60, url: 'https://pelotalibre.ar/agenda/' }
];
const combinedCache = new Map();
const COMBINED_CACHE_MS = 3 * 60 * 1000;
const REI_CHANNEL_CACHE_MS = 5 * 60 * 1000;
let reiChannelCache = null;
let reiHealthCache = null;

const BROADCASTER_GROUPS = [
    {family:"globo",label:"Globo",aliases:["globo", "tv globo", "tvglobo", "rede globo", "globoplay", "globo play", "globoplay premium", "globo internacional", "globo sp", "globo rj", "globo nordeste", "globo ao vivo"]},
    {family:"sportv",label:"SporTV",aliases:["sportv", "spor tv", "sportv 1", "sportv 2", "sportv 3", "sportv 4", "spor tv 1", "spor tv 2", "spor tv 3", "sportv1", "sportv2", "sportv3", "sportv4"]},
    {family:"premiere",label:"Premiere",aliases:["premiere", "premiere br", "premiere fc", "premiere clubes", "premiere play", "premiere 1", "premiere 2", "premiere 3", "premiere 4", "premiere 5", "premiere 6", "premiere 7", "premiere 8", "premiere 9", "premiere 10", "premiere 11", "premiere 12"]},
    {family:"espn",label:"ESPN",aliases:["espn", "espn 1", "espn 2", "espn 3", "espn 4", "espn 5", "espn 6", "espn 7", "espn 8", "espn1", "espn2", "espn3", "espn4", "espn5", "espn6", "espn7", "espn8", "espn premium", "espn deportes", "espn sur", "espn extra", "espn brasil", "espn brazil", "espn argentina", "espn mexico", "espn mx", "espn hd"]},
    {family:"disney",label:"Disney+",aliases:["disney+", "disney plus", "disney+ premium", "disney plus premium", "star+", "star plus", "disneyplus", "disney premium"]},
    {family:"tyc",label:"TyC Sports",aliases:["tyc sports", "tyc sports internacional", "tyc sports play", "tyc sports 2", "tyc sports premium", "tyc sports hd", "tyc sports 1", "tycsports"]},
    {family:"tnt",label:"TNT Sports",aliases:["tnt sports", "tnt sports premium", "tnt sports premium cl", "tnt sports argentina", "tnt sports brasil", "tnt sports chile", "tnt sports en hbo max", "tnt sports go", "tntsports", "tnt sports 1", "tnt sports 2"]},
    {family:"max",label:"Max",aliases:["max", "max streaming", "hbo max", "max app"]},
    {family:"dsports",label:"DSports",aliases:["dsports", "dsports 1", "dsports 2", "dsports 3", "dsports plus", "dsports+", "directv sports", "directv sports 1", "directv sports 2", "directv sports plus"]},
    {family:"dgo",label:"DGO",aliases:["dgo", "directv go", "directvgo"]},
    {family:"fox",label:"Fox Sports",aliases:["fox sports", "fox sports premium", "fox deportes", "fox sports argentina", "fox sports 1", "fox sports 2", "fox sports 3", "fox sports mexico", "foxsports"]},
    {family:"caze",label:"CazéTV",aliases:["cazetv", "caze tv", "cazé tv", "cazé tv 1", "cazetv 1"]},
    {family:"goat",label:"Canal GOAT",aliases:["canal goat", "goat", "goat sports"]},
    {family:"xsports",label:"XSports",aliases:["xsports", "x sports", "xsports tv"]},
    {family:"band",label:"Band",aliases:["band", "tv band", "rede band", "bandeirantes", "tv bandeirantes"]},
    {family:"bandsports",label:"BandSports",aliases:["bandsports", "band sports", "bandsports hd"]},
    {family:"record",label:"Record",aliases:["record", "record tv", "rede record", "record news", "recordesportes"]},
    {family:"sbt",label:"SBT",aliases:["sbt", "sbt sports", "sbt esportes", "sistema brasileiro de televisao"]},
    {family:"redetv",label:"RedeTV!",aliases:["redetv", "rede tv", "redetv!", "rede tv!"]},
    {family:"tvbrasil",label:"TV Brasil",aliases:["tv brasil", "tvbrasil", "ebc tv"]},
    {family:"tvcultura",label:"TV Cultura",aliases:["tv cultura", "tvcultura"]},
    {family:"nossofutebol",label:"Nosso Futebol",aliases:["nosso futebol", "nossofutebol"]},
    {family:"nsports",label:"NSports",aliases:["nsports", "n sports", "n-sports"]},
    {family:"combate",label:"Combate",aliases:["combate", "combate channel"]},
    {family:"paramount",label:"Paramount+",aliases:["paramount+", "paramount plus", "paramountplus"]},
    {family:"prime",label:"Prime Video",aliases:["prime video", "amazon prime video", "primevideo"]},
    {family:"dazn",label:"DAZN",aliases:["dazn", "dazn 1", "dazn 2"]},
    {family:"fanatiz",label:"Fanatiz",aliases:["fanatiz", "fanatiz 01", "fanatiz 02", "fanatiz 1", "fanatiz 2"]},
    {family:"flow",label:"Flow",aliases:["flow", "flow sports", "flow deportes"]},
    {family:"telefe",label:"Telefe",aliases:["telefe", "mitelefe", "mi telefe"]},
    {family:"tvpublica",label:"TV Pública",aliases:["tv publica", "tvp argentina", "tv publica argentina", "tvp", "tv pública"]},
    {family:"eltrece",label:"El Trece",aliases:["el trece", "eltrece", "canal 13 argentina"]},
    {family:"america_tv",label:"América TV",aliases:["america tv", "américa tv", "america television"]},
    {family:"deportv",label:"DeporTV",aliases:["deportv", "depor tv"]},
    {family:"canal9_ar",label:"Canal 9",aliases:["canal 9 argentina", "elnueve", "el nueve"]},
    {family:"canal26",label:"Canal 26",aliases:["canal 26"]},
    {family:"tudn",label:"TUDN",aliases:["tudn", "televisa deportes network"]},
    {family:"telemundo",label:"Telemundo",aliases:["telemundo", "telemundo deportes"]},
    {family:"universo",label:"Universo",aliases:["universo", "universo now"]},
    {family:"univision",label:"Univision",aliases:["univision", "univision deportes"]},
    {family:"vix",label:"ViX",aliases:["vix", "vix premium"]},
    {family:"azteca",label:"Azteca Deportes",aliases:["azteca deportes", "tv azteca", "azteca 7", "azteca siete"]},
    {family:"claro",label:"Claro Sports",aliases:["claro sports", "clarosports"]},
    {family:"win",label:"Win Sports",aliases:["win sports", "win sports+", "win sports plus", "winsports"]},
    {family:"rcn",label:"RCN",aliases:["rcn", "rcn nuestra tele", "canal rcn", "rcn deportes"]},
    {family:"caracol",label:"Caracol",aliases:["caracol", "caracol tv", "gol caracol", "caracol deportes"]},
    {family:"chv",label:"Chilevisión",aliases:["chilevision", "chilevisión", "chv"]},
    {family:"tvn_chile",label:"TVN Chile",aliases:["tvn chile", "television nacional de chile"]},
    {family:"canal13_chile",label:"Canal 13 Chile",aliases:["canal 13 chile", "13.cl", "canal 13 cl"]},
    {family:"mega_chile",label:"Mega Chile",aliases:["mega chile", "mega cl"]},
    {family:"l1max",label:"L1 MAX",aliases:["l1 max", "l1max", "liga 1 max"]},
    {family:"golperu",label:"GOLPERU",aliases:["golperu", "gol peru"]},
    {family:"movistar_deportes",label:"Movistar Deportes",aliases:["movistar deportes", "movistar+ deportes"]},
    {family:"ecdf",label:"El Canal del Fútbol",aliases:["el canal del futbol", "el canal del fútbol", "ecdf"]},
    {family:"goltv",label:"GolTV",aliases:["goltv", "gol tv", "goltv ecuador"]},
    {family:"tigo",label:"Tigo Sports",aliases:["tigo sports", "tigo sport"]},
    {family:"vtv",label:"VTV Plus",aliases:["vtv plus", "vtv+", "vtv uruguay"]},
    {family:"tenfield",label:"Tenfield",aliases:["tenfield"]},
    {family:"bein",label:"beIN Sports",aliases:["bein sports", "beinsports", "bein sports 1", "bein sports 2", "bein sports 3"]},
    {family:"sky",label:"Sky Sports",aliases:["sky sports", "skysports"]},
    {family:"nbc",label:"NBC Sports",aliases:["nbc sports", "nbc"]},
    {family:"cbs",label:"CBS Sports",aliases:["cbs sports", "cbs sports golazo"]},
    {family:"eurosport",label:"Eurosport",aliases:["eurosport", "eurosport 1", "eurosport 2"]},
    {family:"canalplus",label:"Canal+ Sport",aliases:["canal+ sport", "canal plus sport", "canal plus foot"]},
    {family:"setanta",label:"Setanta Sports",aliases:["setanta sports", "setanta"]},
    {family:"arena",label:"Arena Sport",aliases:["arena sport", "arena sports"]},
    {family:"supersport",label:"SuperSport",aliases:["supersport", "super sport"]},
    {family:"laliga_tv",label:"LaLiga TV",aliases:["laliga tv", "laliga tv hypermotion", "la liga tv"]},
    {family:"premier_sports",label:"Premier Sports",aliases:["premier sports"]}
  ];
function foldLabel(value) {
  return String(value || '').replace(/([a-zÀ-ÿ0-9])([A-Z][a-zÀ-ÿ])/g,'$1 $2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/([a-z])([0-9])/g,'$1 $2').replace(/([0-9])([a-z])/g,'$1 $2')
    .replace(/[^a-z0-9+]+/g,' ').replace(/\s+/g,' ').trim();
}
function containsLabel(text, alias) {
  const haystack = ` ${foldLabel(text)} `;
  const needle = ` ${foldLabel(alias)} `;
  return Boolean(foldLabel(alias)) && haystack.includes(needle);
}
const BROADCASTER_ALIAS_INDEX = BROADCASTER_GROUPS.flatMap(group=>group.aliases.map(alias=>({group,alias:foldLabel(alias)}))).sort((a,b)=>b.alias.length-a.alias.length);
function broadcasterInfo(rawName, country='') {
  const name = String(rawName || '').trim();
  const folded=foldLabel(name);
  const match=BROADCASTER_ALIAS_INDEX.find(item=>containsLabel(name,item.alias));
  const group=match?.group || null;
  let displayName=name;
  if(group?.family==='globo') displayName='Globo';
  else if(group?.family==='disney' && ['star+','star plus','disneyplus','disney plus','disney+ premium','disney plus premium'].includes(folded)) displayName='Disney+';
  else if(group?.family==='sportv') { const m=folded.match(/^spor ?tv(?:\s+(\d+))?$/); if(m) displayName=m[1]?`SporTV ${m[1]}`:'SporTV'; }
  else if(group?.family==='espn') { const m=folded.match(/^espn(?:\s+(\d+))?$/); if(m) displayName=m[1]?`ESPN ${m[1]}`:'ESPN'; }
  else if(group?.family==='premiere') { const m=folded.match(/^premiere(?:\s+(\d+))?$/); if(m) displayName=m[1]?`Premiere ${m[1]}`:'Premiere'; }
  else if(group?.family==='dsports') { const m=folded.match(/^dsports(?:\s+(\d+))?$/); if(m) displayName=m[1]?`DSports ${m[1]}`:'DSports'; else if(['directv sports','directv sports 1','directv sports 2'].includes(folded)) displayName='DSports'; }
  else if(group?.family==='fox') { const m=folded.match(/^fox sports(?:\s+(\d+))?$/); if(m) displayName=m[1]?`Fox Sports ${m[1]}`:'Fox Sports'; }
  else if(group?.family==='band' && ['rede band','tv band','tv bandeirantes','bandeirantes'].includes(folded)) displayName='Band';
  else if(group?.family==='tyc' && ['tycsports','tyc'].includes(folded)) displayName='TyC Sports';
  else if(group?.family==='tnt' && folded==='tntsports') displayName='TNT Sports';
  else if(group?.family==='bandsports' && folded==='bandsports') displayName='BandSports';
  else if(group?.family==='redetv' && ['redetv','redetv!'].includes(folded)) displayName='RedeTV!';
  else if(group?.family==='telefe' && folded==='mitelefe') displayName='Telefe';
  else if(group?.family==='nsports' && folded==='nsports') displayName='NSports';
  else if(group?.family==='dgo' && folded==='directvgo') displayName='DGO';
  return { name, displayName, country, family: group ? group.family : '', brand: group ? group.label : name, aliases:group?.aliases||[] };
}
function dedupeNetworks(networks) {
  const map = new Map();
  for (const item of networks || []) {
    const name = String(item?.name || '').trim();
    if (!name || /^(servidor|server|mirror|player|embed|fonte|source)\s*\d*$/i.test(name)) continue;
    const info = broadcasterInfo(name, item.country || '');
    const folded=foldLabel(name);
    const sameFamilyAlias = info.family==='globo';
    const key = sameFamilyAlias ? 'family:globo' : folded;
    if (!map.has(key)) map.set(key, { name:info.displayName, displayName:info.displayName, originalName:name!==info.displayName?name:'', country:info.country, family:info.family, brand:info.brand, aliases:info.aliases, logo: String(item.logo || '') });
  }
  return [...map.values()];
}
function localDateFromRaw(value, timestamp) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})(?::\d{2})?/);
  if (match) return { date: match[1], time: match[2].padStart(5,'0'), start: `${match[1]}T${match[2].padStart(5,'0')}:00` };
  const seconds = Number(timestamp || 0);
  if (seconds > 0) {
    const d = new Date(seconds * 1000);
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23' }).formatToParts(d);
    const get = type => parts.find(part => part.type === type)?.value || '';
    const date = `${get('year')}-${get('month')}-${get('day')}`;
    const time = `${get('hour')}:${get('minute')}`;
    return { date, time, start: `${date}T${time}:00-03:00` };
  }
  return { date:'', time:'', start:'' };
}
// Normalização de nomes de clubes para deduplicar a mesma partida entre fontes.
// Remove siglas institucionais no início do nome e aplica aliases conhecidos.
// Não remove palavras distintivas como United, City ou River genericamente.
const TEAM_CANONICAL_ALIASES = new Map(Object.entries({
  'us lecce':'lecce', 'u s lecce':'lecce', 'unione sportiva lecce':'lecce', 'lecce calcio':'lecce',
  'us sassuolo':'sassuolo', 'u s sassuolo':'sassuolo', 'unione sportiva sassuolo':'sassuolo',
  'us cremonese':'cremonese', 'u s cremonese':'cremonese',
  'ac milan':'milan', 'a c milan':'milan', 'milan ac':'milan',
  'as roma':'roma', 'a s roma':'roma',
  'ssc napoli':'napoli', 's s c napoli':'napoli',
  'ss lazio':'lazio', 's s lazio':'lazio',
  'man utd':'manchester united', 'manchester utd':'manchester united', 'man united':'manchester united',
  'tottenham hotspur':'tottenham',
  'atletico de madrid':'atletico madrid', 'atletico madrid cf':'atletico madrid',
  'celta de vigo':'celta vigo', 'rc celta de vigo':'celta vigo',
  'athletic de bilbao':'athletic bilbao', 'athletic club':'athletic bilbao', 'athletic club bilbao':'athletic bilbao',
  'bayern munchen':'bayern munich', 'fc bayern munchen':'bayern munich',
  'paris saint germain':'psg', 'paris sg':'psg',
  'racing de santander':'racing santander', 'real racing club santander':'racing santander',
  'internazionale milano':'internazionale', 'inter milan':'internazionale'
}));
function normalizeTeamForKey(value) {
  let key = foldLabel(value);
  // Junta iniciais institucionais pontuadas: U.S. -> US, S.S.C. -> SSC, R.C.D. -> RCD.
  key = key.replace(/^((?:[a-z]\s+){1,2}[a-z])(\s+)/, (_, initials, gap) => initials.replace(/\s+/g, '') + gap);
  // Aplica aliases antes dos prefixos genéricos, preservando nomes oficiais como Athletic Club.
  if (TEAM_CANONICAL_ALIASES.has(key)) return TEAM_CANONICAL_ALIASES.get(key);
  // Prefixos societários comuns em clubes da Itália, Espanha, Portugal e América Latina.
  key = key.replace(/^(?:us|as|ac|ssc|ss|fc|cf|sc|ec|ca|cd|afc|rcd|rc|ud|vfb)\s+/, '');
  key = key.replace(/^(?:unione sportiva|societa sportiva|associazione sportiva|associazione calcio)\s+/, '');
  // Sufixos/termos institucionais que não distinguem o clube.
  key = key.replace(/\b(football club|club|fc|cf|sc|ec|ca|cd|afc|deportivo)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return TEAM_CANONICAL_ALIASES.get(key) || key;
}
function eventMatchKey(event) {
  const home = normalizeTeamForKey(event.home || '');
  const away = normalizeTeamForKey(event.away || '');
  if (!home || !away || !event.dateEvent) return '';
  return `${event.dateEvent}|${[home,away].sort().join('|')}`;
}
function splitReiTitle(title) {
  const value = String(title || '').replace(/\s+/g, ' ').trim();
  // A API pode entregar title como "Time A x Time B" sem objeto teams.
  // Aceita x, vs, vs. e versus, mas só divide quando há exatamente dois lados.
  const parts = value.split(/\s+(?:x|vs\.?|versus)\s+/i).map(part => part.trim()).filter(Boolean);
  return parts.length === 2 ? { home: parts[0], away: parts[1] } : { home:'', away:'' };
}
function normalizeProviderName(value) {
  return String(value || '').trim()
    .replace(/\s*[\[(]\s*(?:alternativo|alternative|backup|espelho|reserva|mirror)\s*[\])]\s*$/i, '')
    .replace(/\s*[-–]\s*(?:alternativo|alternative|backup|espelho|reserva)\s*$/i, '')
    .trim();
}
function cleanReiEvent(row, requestedDate) {
  const teams = row?.teams || {};
  const homeObj = teams.home || row.homeTeam || row.home_team || {};
  const awayObj = teams.away || row.awayTeam || row.away_team || {};
  const fromTitle = splitReiTitle(row?.title || row?.name || '');
  const home = String(homeObj.name || row.home || row.homeTeamName || fromTitle.home || '').trim();
  const away = String(awayObj.name || row.away || row.awayTeamName || fromTitle.away || '').trim();
  const time = localDateFromRaw(row.start_time || row.startTime, row.start_timestamp || row.timestamp);
  if (!home || !away || time.date !== requestedDate) return null;
  const category = String(row.category || '').trim();
  if (category && !/futebol|football|soccer|f[úu]tbol/i.test(category)) return null;
  if (/\b(NHL|NBA|NFL|MLB|NCAA|UFC|MMA|HOCKEY|BASKETBALL|BASEBALL)\b/i.test(`${row.title || ''} ${row.competition || ''}`)) return null;
  // Aproveita nomes de provedores como metadados de emissoras; URLs embed não são copiadas.
  const providerNames = (Array.isArray(row.embeds) ? row.embeds : []).map(x => ({
    name: normalizeProviderName(x?.provider || x?.name || ''),
    country: x?.country || '',
    logo: x?.logo || x?.logo_url || ''
  }));
  const networkRows = [
    ...(Array.isArray(row.tvNetworks) ? row.tvNetworks : []),
    ...(Array.isArray(row.broadcasts) ? row.broadcasts : []),
    ...providerNames
  ].map(x => typeof x === 'string' ? { name:normalizeProviderName(x) } : {
    name: normalizeProviderName(x?.name || x?.title || x?.channel || x?.provider || ''),
    country:x?.country || x?.market || '',
    logo:x?.logo || x?.logo_url || ''
  });
  const networks = dedupeNetworks(networkRows);
  return {
    id: `rei-${String(row.id || row.event_id || `${home}-${away}-${requestedDate}`).replace(/[^\w-]/g,'-')}`,
    title: `${home} x ${away}`,
    home, away,
    homeTeamId: String(homeObj.id || row.homeTeamId || ''), awayTeamId: String(awayObj.id || row.awayTeamId || ''),
    homeBadge: String(homeObj.logo || homeObj.logo_url || row.home_logo || ''), awayBadge: String(awayObj.logo || awayObj.logo_url || row.away_logo || ''),
    league: String(row.competition?.name || row.competition || row.league?.name || row.league || 'Futebol'),
    leagueCountry: String(row.competition?.country || row.country || ''),
    venue: String(row.venue?.name || row.venue || ''),
    poster: safeHttpsUrl(row.poster || row.image || ''),
    start_time: time.start, start_timestamp: Number(row.start_timestamp || 0) || null,
    dateEvent: time.date, timeText: time.time,
    status: String(row.status || 'upcoming'),
    popular: Boolean(row.popular),
    home_score: row.teams?.home?.score ?? row.home_score ?? null,
    away_score: row.teams?.away?.score ?? row.away_score ?? null,
    tvNetworks: networks,
    __provider: 'Rei dos Canais', __priority: 100, __sources: ['Rei dos Canais']
  };
}
function decodeHtml(text) {
  const named = { '&nbsp;':' ', '&amp;':'&', '&quot;':'"', '&#39;':"'", '&apos;':"'", '&lt;':'<', '&gt;':'>' };
  return String(text || '').replace(/&(?:nbsp|amp|quot|#39|apos|lt|gt);/g, m => named[m] || m)
    .replace(/&#(\d+);/g, (_,n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_,n) => String.fromCharCode(parseInt(n,16)));
}
function htmlToPublicText(html) {
  return decodeHtml(String(html || '')
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<(?:br|\/?(?:article|section|li|div|p|h[1-6]|time|a|button|span|strong|small|td|tr|header|footer))\b[^>]*>/gi,'\n')
    .replace(/<[^>]+>/g,' '))
    .replace(/\r/g,'')
    .replace(/[ \t]+/g,' ')
    .replace(/\n\s*\n+/g,'\n')
    .trim();
}
const COMPETITION_PATTERNS = [
  'Primera División Argentina','Primera Division Argentina','Liga Profesional Argentina','Primera División','Primera Division',
  'Liga Betplay DIMAYOR','Brasileirão','Brasileirao','Campeonato Brasileiro','Bundesliga','Serie A Italiana','Serie A',
  'Francia Ligue 1','Ligue 1','La Liga EA Sports','LaLiga Hypermotion','LaLiga','Premier League','Championship',
  'Copa Libertadores','Copa Sudamericana','Liga Chile','Liga Uruguay','Liga Paraguay','Liga Colombia','Liga Arabia Saudita',
  'Copa Liga','MLS','Liga MX','FA Cup','Copa del Rey','Coppa Italia'
];
const CHANNEL_ALIASES = BROADCASTER_GROUPS.flatMap(group => group.aliases.map(alias => ({ alias, family:group.family, brand:group.label }))).sort((a,b)=>foldLabel(b.alias).length-foldLabel(a.alias).length);
const CHANNEL_DISPLAY_NAMES = {
  'espn':'ESPN','espn 1':'ESPN 1','espn 2':'ESPN 2','espn 3':'ESPN 3','espn 4':'ESPN 4','espn 5':'ESPN 5','espn 6':'ESPN 6','espn 7':'ESPN 7','espn 8':'ESPN 8','espn premium':'ESPN Premium','espn deportes':'ESPN Deportes',
  'tyc sports':'TyC Sports','tyc sports internacional':'TyC Sports Internacional','tyc sports play':'TyC Sports Play','tnt sports':'TNT Sports','tnt sports premium':'TNT Sports Premium',
  'fox deportes':'Fox Deportes','fox sports':'Fox Sports','fox sports 1':'Fox Sports 1','fox sports 2':'Fox Sports 2','fox sports 3':'Fox Sports 3',
  'dsports':'DSports','dsports 1':'DSports 1','dsports 2':'DSports 2','dsports 3':'DSports 3','dsports plus':'DSports Plus','directv sports':'DSports','dgo':'DGO',
  'sportv':'SporTV','sportv 1':'SporTV 1','sportv 2':'SporTV 2','sportv 3':'SporTV 3','sportv 4':'SporTV 4',
  'globoplay':'Globo','globo play':'Globo','rede globo':'Globo','tv globo':'Globo','globo':'Globo',
  'cazetv':'CazéTV','caze tv':'CazéTV','canal goat':'Canal GOAT','goat':'Canal GOAT','xsports':'XSports','x sports':'XSports',
  'premiere':'Premiere','premiere br':'Premiere BR','premiere fc':'Premiere FC','premiere clubes':'Premiere Clubes',
  'disney+':'Disney+','disney+ premium':'Disney+','disney plus':'Disney+','star+':'Disney+','star plus':'Disney+',
  'paramount+':'Paramount+','paramount plus':'Paramount+','prime video':'Prime Video','amazon prime video':'Prime Video',
  'win sports':'Win Sports','win sports+':'Win Sports+','win sports plus':'Win Sports+','rcn nuestra tele':'RCN','rcn':'RCN',
  'tv publica':'TV Pública','tvp argentina':'TV Pública','telefe':'Telefe','universo':'Universo','band':'Band','band sports':'BandSports','bandsports':'BandSports',
  'record':'Record','record tv':'Record','record news':'Record News','sbt':'SBT','nosso futebol':'Nosso Futebol','nsports':'NSports','n sports':'NSports',
  'tudn':'TUDN','telemundo':'Telemundo','univision':'Univision','vix':'ViX','azteca deportes':'Azteca Deportes',
  'chilevision':'Chilevisión','tvn chile':'TVN Chile','canal 13 chile':'Canal 13 Chile','mega chile':'Mega Chile',
  'l1 max':'L1 MAX','l1max':'L1 MAX','golperu':'GOLPERU','gol peru':'GOLPERU','movistar deportes':'Movistar Deportes',
  'el canal del futbol':'El Canal del Fútbol','ecdf':'El Canal del Fútbol','goltv':'GolTV','gol tv':'GolTV','tigo sports':'Tigo Sports','vtv plus':'VTV Plus'
};
function prettyChannelName(alias) { const key=foldLabel(alias); return CHANNEL_DISPLAY_NAMES[key] || alias.split(' ').map(w=>w ? w[0].toUpperCase()+w.slice(1) : '').join(' '); }
function findPelotaNetworks(segment) {
  const found = new Map();
  for (const entry of CHANNEL_ALIASES) {
    const alias = foldLabel(entry.alias);
    if (!alias || !containsLabel(segment, alias)) continue;
    const rawName=prettyChannelName(entry.alias);
    const info=broadcasterInfo(rawName,'Argentina');
    const key = (info.family==='globo' && info.displayName==='Globo') ? 'globo' : alias;
    if (!found.has(key)) found.set(key, { name: info.displayName || rawName, displayName:info.displayName || rawName, country:'Argentina', family:entry.family, brand:entry.brand, aliases:info.aliases||[], logo:'' });
  }
  return [...found.values()];
}
function extractCompetitionAndAway(rightText, segment) {
  let cut = -1;
  let competition = '';
  // Primeiro tenta localizar os nomes exatamente no texto original. Isso também resolve páginas
  // que concatenam o último sobrenome e a competição, ex.: "RacingAvellanedaPrimera División".
  for (const name of [...COMPETITION_PATTERNS].sort((a,b)=>b.length-a.length)) {
    const idx = rightText.toLocaleLowerCase('es').indexOf(name.toLocaleLowerCase('es'));
    if (idx >= 0 && (cut < 0 || idx < cut)) { cut = idx; competition = name; }
  }
  if (cut < 0) {
    const foldedRight = foldLabel(rightText);
    for (const name of [...COMPETITION_PATTERNS].sort((a,b)=>b.length-a.length)) {
      const idx = foldedRight.indexOf(foldLabel(name));
      if (idx >= 0 && (cut < 0 || idx < cut)) { cut = idx; competition = name; }
    }
  }
  if (cut < 0) {
    const marker = /horario programado|ao vivo|en vivo|live|scheduled|finalizado/i.exec(rightText);
    if (marker) cut = marker.index;
  }
  if (cut < 0) {
    const folded = foldLabel(rightText);
    const channel = CHANNEL_ALIASES.map(x=>foldLabel(x.alias)).filter(Boolean).sort((a,b)=>b.length-a.length).find(a=>folded.includes(a));
    if (channel) cut = rightText.toLowerCase().indexOf(channel);
  }
  const away = (cut >= 0 ? rightText.slice(0,cut) : rightText).replace(/horario programado/ig,'').trim().replace(/[|·•]+$/,'').trim();
  return { away, competition: competition || 'Futebol' };
}
function parsePelotaAgendaHtml(html, sourceId, sourceLabel, requestedDate) {
  const text = htmlToPublicText(html);
  let pageDate = (text.match(/\b(20\d{2}-\d{2}-\d{2})\s*[·•-]\s*Argentina\b/i) || [])[1] || '';
  if (!pageDate) {
    const spanishMonths = {enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    const longDate = text.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(20\d{2})\b/i);
    if (longDate) pageDate = `${longDate[3]}-${spanishMonths[longDate[2].toLowerCase()]}-${String(longDate[1]).padStart(2,'0')}`;
  }
  if (!pageDate) return { events:[], pageDate:'', warning:`${sourceLabel}: a data da agenda não foi identificada.` };
  if (pageDate !== requestedDate) return { events:[], pageDate, warning:`${sourceLabel}: agenda publicada para ${pageDate}; solicitada ${requestedDate}.` };
  const times = [...text.matchAll(/\b(\d{1,2}:\d{2})(?:\s*ARG)?\b/gi)];
  const events = [];
  for (let i=0;i<times.length;i++) {
    const match = times[i];
    const startAt = match.index + match[0].length;
    const endAt = i+1<times.length ? times[i+1].index : text.length;
    const segment = text.slice(startAt,endAt).replace(/\s+/g,' ').trim();
    const vs = /\s+vs\.?\s+/i.exec(segment);
    if (!vs) continue;
    let home = segment.slice(0,vs.index).trim();
    const rightText = segment.slice(vs.index + vs[0].length).trim();
    let leadingCompetition = '';
    for (const comp of [...COMPETITION_PATTERNS].sort((a,b)=>b.length-a.length)) {
      const escaped = comp.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const prefix = new RegExp('^\\s*'+escaped+'\\s*[:：–-]?\\s*','i');
      if (prefix.test(home)) { leadingCompetition = comp; home = home.replace(prefix,'').trim(); break; }
    }
    const extracted = extractCompetitionAndAway(rightText, segment);
    const away = extracted.away;
    const competition = leadingCompetition || extracted.competition;
    if (!home || !away || home.length>90 || away.length>90) continue;
    const networks = dedupeNetworks(findPelotaNetworks(segment));
    if (!networks.length) continue;
    const time = match[1].padStart(5,'0');
    events.push({
      id:`${sourceId}-${foldLabel(home)}-${foldLabel(away)}-${requestedDate}`.replace(/[^a-z0-9-]/g,'-'),
      title:`${home} x ${away}`, home, away,
      league:competition, leagueCountry:'Argentina',
      start_time:`${requestedDate}T${time}:00-03:00`, dateEvent:requestedDate, timeText:time,
      status:'upcoming', tvNetworks:networks,
      __provider:sourceLabel, __priority:sourceId==='pelota-video'?70:60, __sources:[sourceLabel]
    });
  }
  return { events, pageDate, warning: events.length ? '' : `${sourceLabel}: página carregada, mas nenhum evento com equipes e emissoras foi reconhecido.` };
}
async function fetchTextExternal(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { headers:{ 'Accept':'text/html,application/xhtml+xml', 'User-Agent':'NicoValBolaLibre local schedule reader/0.10' }, signal:controller.signal, redirect:'follow' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally { clearTimeout(timeout); }
}
async function fetchJsonExternal(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { headers:{ 'Accept':'application/json', 'User-Agent':'NicoValBolaLibre local schedule reader/0.10' }, signal:controller.signal, redirect:'follow' });
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { throw new Error('A fonte retornou conteúdo que não é JSON.'); }
    if (!response.ok) throw new Error(body?.message || body?.error || `HTTP ${response.status}`);
    return body;
  } finally { clearTimeout(timeout); }
}
function rowsFromReiResponse(body) {
  return Array.isArray(body?.data) ? body.data : Array.isArray(body?.events) ? body.events : Array.isArray(body?.matches) ? body.matches : [];
}
function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password) return '';
    return url.href;
  } catch { return ''; }
}
function cleanReiProgram(program) {
  if (!program || typeof program !== 'object') return null;
  return {
    title: String(program.title || '').trim(),
    description: String(program.description || '').trim(),
    formattedTime: String(program.formatted_time || program.formattedTime || '').trim(),
    startTime: Number(program.start_time || program.startTimestamp || 0) || null,
    endTime: Number(program.end_time || program.endTimestamp || 0) || null,
    imageUrl: safeHttpsUrl(program.image || program.image_url || '')
  };
}
function cleanReiChannel(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').trim();
  const name = String(row.name || '').trim();
  if (!id || !name) return null;
  const epg = row.epg && typeof row.epg === 'object' ? row.epg : {};
  return {
    id,
    name,
    description: String(row.description || '').trim(),
    logoUrl: safeHttpsUrl(row.logo_url || row.logoUrl || ''),
    category: String(row.category || 'Outros').trim(),
    epg: {
      current: cleanReiProgram(epg.current),
      next: cleanReiProgram(epg.next)
    }
  };
}
async function fetchReiChannelCatalog(force = false) {
  if (!force && reiChannelCache && Date.now() - reiChannelCache.savedAt < REI_CHANNEL_CACHE_MS) {
    return { ...reiChannelCache.payload, cached: true };
  }
  const body = await fetchJsonExternal(`${REI_API_BASE}/channels`);
  const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body?.channels) ? body.channels : [];
  if (!body?.success && !Array.isArray(body?.data) && !Array.isArray(body?.channels)) {
    throw new Error('A API do Rei dos Canais retornou um formato de canais inesperado.');
  }
  const channels = rows.map(cleanReiChannel).filter(Boolean);
  const payload = {
    success: true,
    data: channels,
    total: Number(body.total ?? channels.length),
    fetchedAt: new Date().toISOString(),
    note: 'Metadados de canais e EPG. Endereços de embeds de terceiros não são repassados.'
  };
  reiChannelCache = { savedAt: Date.now(), payload };
  return { ...payload, cached: false };
}
async function fetchReiHealth(force = false) {
  if (!force && reiHealthCache && Date.now() - reiHealthCache.savedAt < 30_000) {
    return { ...reiHealthCache.payload, cached: true };
  }
  const body = await fetchJsonExternal(`${REI_API_BASE}/health`);
  const payload = { success: true, data: body, fetchedAt: new Date().toISOString() };
  reiHealthCache = { savedAt: Date.now(), payload };
  return { ...payload, cached: false };
}
function reiChannelMatchKey(value) {
  const folded = foldLabel(value);
  const info = broadcasterInfo(value);
  if (!info?.family) return `name:${folded}`;
  const family = info.family;
  if (family === 'globo') return 'globo:main';
  if (family === 'sportv') { const m = folded.match(/^sportv?\s*(\d+)$/); return m ? `sportv:${Number(m[1])}` : 'sportv:main'; }
  if (family === 'premiere') { const m = folded.match(/^premiere\s*(\d+)$/); return m ? `premiere:${Number(m[1])}` : 'premiere:main'; }
  if (family === 'espn') {
    if (/\bespn\s*premium\b/.test(folded)) return 'espn:premium';
    if (/\bespn\s*deportes\b/.test(folded)) return 'espn:deportes';
    if (/\bespn\s*(?:mexico|mx)\b/.test(folded)) return 'espn:mexico';
    const m = folded.match(/^espn\s*(\d+)$/); return m ? `espn:${Number(m[1])}` : 'espn:main';
  }
  if (family === 'disney') { const m = folded.match(/disney\s*\+?\s*(\d+)/); return m ? `disney:${Number(m[1])}` : 'disney:main'; }
  if (family === 'fox') { if (/fox\s*deportes/.test(folded)) return 'fox:deportes'; const m = folded.match(/^fox\s*sports\s*(\d+)$/); return m ? `fox:${Number(m[1])}` : 'fox:main'; }
  if (family === 'dsports') { const m = folded.match(/^dsports\s*(\d+)$/); return m ? `dsports:${Number(m[1])}` : 'dsports:main'; }
  return `${family}:main`;
}
function enrichReiEventNetworks(events, channels) {
  if (!Array.isArray(channels) || !channels.length) return events;
  const byName = new Map(channels.map(channel => [foldLabel(channel.name), channel]));
  const byBroadcaster = new Map();
  for (const channel of channels) {
    const key = reiChannelMatchKey(channel.name);
    if (key && !byBroadcaster.has(key)) byBroadcaster.set(key, channel);
  }
  for (const event of events) {
    event.tvNetworks = (event.tvNetworks || []).map(network => {
      const channel = byName.get(foldLabel(network.name)) || byBroadcaster.get(reiChannelMatchKey(network.name));
      if (!channel) return network;
      return {
        ...network,
        logo: network.logo || channel.logoUrl || '',
        channelId: channel.id,
        epgCurrent: channel.epg?.current || null,
        epgNext: channel.epg?.next || null
      };
    });
  }
  return events;
}
async function fetchReiEvents(date) {
  const failures = [];
  let allRows = [];
  let successfulQueries = 0;
  // Primeiro consulta o endpoint base, exatamente como a resposta JSON compartilhada pelo usuário.
  // Isso evita depender de filtros status que algumas versões da API podem ignorar ou tratar diferente.
  try {
    const body = await fetchJsonExternal(`${REI_API_BASE}/sports`);
    allRows.push(...rowsFromReiResponse(body));
    successfulQueries++;
  } catch (error) {
    failures.push(`/sports: ${error.message}`);
  }
  let initialEvents = dedupeRawReiRows(allRows).map(row => cleanReiEvent(row, date)).filter(Boolean);
  // Se /sports não trouxer eventos para a data pedida, tenta as consultas por status documentadas.
  if (!initialEvents.length) {
    const statuses = ['live', 'upcoming', 'finished'];
    const attempts = await Promise.allSettled(statuses.map(status =>
      fetchJsonExternal(`${REI_API_BASE}/sports?status=${status}`)
    ));
    for (let index = 0; index < attempts.length; index++) {
      const result = attempts[index];
      if (result.status === 'fulfilled') {
        successfulQueries++;
        allRows.push(...rowsFromReiResponse(result.value));
      } else failures.push(`/sports?status=${statuses[index]}: ${result.reason?.message || 'falha'}`);
    }
    initialEvents = dedupeRawReiRows(allRows).map(row => cleanReiEvent(row, date)).filter(Boolean);
  }
  // Não repete uma terceira consulta ao mesmo host quando /sports e os filtros
  // documentados falharam. Isso evita alongar o primeiro carregamento sem benefício.
  // Também elimina variações de nomes dentro da própria resposta do Rei (ex.: Lecce/US Lecce).
  initialEvents = mergeCombinedEvents(initialEvents, []);
  const rows = dedupeRawReiRows(allRows);
  const warning = initialEvents.length ? '' : `Rei dos Canais: nenhum evento reconhecível em ${date}. Registros recebidos: ${rows.length}.${failures.length ? ` Falhas: ${failures.join(' / ')}` : ''}`;
  return { events:initialEvents, total:initialEvents.length, rawTotal:rows.length, warning, successfulQueries, failures };
}
function dedupeRawReiRows(rows) {
  const rawById = new Map();
  for (const row of rows || []) {
    const key = String(row?.id || row?.event_id || `${row?.title || ''}|${row?.start_time || row?.start_timestamp || ''}`);
    if (key && !rawById.has(key)) rawById.set(key, row);
  }
  return [...rawById.values()];
}

async function fetchPelotaSource(source, date) {
  try {
    const html = await fetchTextExternal(source.url);
    return parsePelotaAgendaHtml(html, source.id, source.label, date);
  } catch (error) {
    return { events:[], pageDate:'', warning:`${source.label}: ${error.message}` };
  }
}
function mergeCombinedEvents(reiEvents, pelotaEvents) {
  const byKey = new Map();
  const insert = event => {
    const key = eventMatchKey(event);
    if (!key) return;
    const previous = byKey.get(key);
    if (!previous) { byKey.set(key, event); return; }
    // O evento da fonte com maior prioridade mantém equipes, escudos, horário e competição.
    const primary = (event.__priority || 0) > (previous.__priority || 0) ? event : previous;
    const secondary = primary === event ? previous : event;
    primary.tvNetworks = dedupeNetworks([...(primary.tvNetworks || []), ...(secondary.tvNetworks || [])]);
    primary.__sources = [...new Set([...(primary.__sources || [primary.__provider]), ...(secondary.__sources || [secondary.__provider])].filter(Boolean))];
    byKey.set(key, primary);
  };
  for (const event of reiEvents) insert(event);
  for (const event of pelotaEvents) insert(event);
  return [...byKey.values()].filter(e=>Array.isArray(e.tvNetworks)&&e.tvNetworks.length)
    .sort((a,b)=>String(a.start_time||'').localeCompare(String(b.start_time||'')));
}
const LA18HD_STREAM_LABELS = {
  espn:'ESPN', espn1:'ESPN 1', espn2:'ESPN 2', espn3:'ESPN 3', espn4:'ESPN 4', espn5:'ESPN 5', espn6:'ESPN 6', espn7:'ESPN 7', espn8:'ESPN 8',
  espnpremium:'ESPN Premium', espnpremium2:'ESPN Premium', espnmx:'ESPN México', espnargentina:'ESPN Argentina', espndeportes:'ESPN Deportes',
  foxdeportes:'Fox Deportes', foxsports:'Fox Sports', foxsports1:'Fox Sports 1', foxsports2:'Fox Sports 2', foxsports3:'Fox Sports 3', foxsportspremium:'Fox Sports Premium',
  disney10:'Disney+ 10', disney12:'Disney+ 12', disney15:'Disney+ 15', disney16:'Disney+ 16', disney:'Disney+',
  telemundo:'Telemundo', universo:'Universo', tudn:'TUDN', tycsports:'TyC Sports', tycpremium:'TyC Sports Premium',
  tntsports:'TNT Sports', tntsportsargentina:'TNT Sports Argentina', dsports:'DSports', dsports1:'DSports 1', dsports2:'DSports 2', dsports3:'DSports 3', dsportsplus:'DSports Plus',
  globoplay:'Globo', globo:'Globo', tvglobo:'Globo', redeglobo:'Globo', sportv:'SporTV', sportv1:'SporTV 1', sportv2:'SporTV 2', sportv3:'SporTV 3', sportv4:'SporTV 4',
  premiere:'Premiere', premierebr:'Premiere BR', premiere1:'Premiere 1', premiere2:'Premiere 2', premiere3:'Premiere 3', premiere4:'Premiere 4', premiere5:'Premiere 5',
  bandsports:'BandSports', band:'Band', cazetv:'CazéTV', goat:'Canal GOAT', xsports:'XSports', fanatiz:'Fanatiz', flow:'Flow', dgo:'DGO',
  telefe:'Telefe', tvpublica:'TV Pública', eltrece:'El Trece', americatv:'América TV', deportv:'DeporTV', l1max:'L1 MAX', golperu:'GOLPERU', win:'Win Sports',
  bein:'beIN Sports', dazn:'DAZN', sky:'Sky Sports'
};
function la18hdChannelFromPublicLink(rawLink) {
  // Lê apenas o identificador público do canal para nomear a emissora.
  // Não guarda, devolve nem transforma o endereço em link clicável/player.
  try {
    const url = new URL(String(rawLink || ''));
    if (url.hostname.toLowerCase() !== 'la18hd.su' || url.pathname !== '/vivo/canales.php') return null;
    const slug = String(url.searchParams.get('stream') || '').trim().toLowerCase();
    if (!slug || !/^[a-z0-9_-]{2,50}$/.test(slug)) return null;
    let name = LA18HD_STREAM_LABELS[slug] || '';
    if (!name && /^espn\d+$/.test(slug)) name = `ESPN ${slug.slice(4)}`;
    if (!name && /^disney\d+$/.test(slug)) name = `Disney+ ${slug.slice(6)}`;
    if (!name && /^sportv\d+$/.test(slug)) name = `SporTV ${slug.slice(6)}`;
    if (!name && /^premiere\d+$/.test(slug)) name = `Premiere ${slug.slice(8)}`;
    if (!name) name = slug.replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const info = broadcasterInfo(name, 'América Latina');
    return { name, country:'América Latina', family:info.family, brand:info.brand, slug };
  } catch { return null; }
}
function la18hdCompetitionCountry(competition) {
  const text = foldLabel(competition);
  if (/argentina|liga profesional|primera nacional/.test(text)) return 'Argentina';
  if (/liga mx|mexico|mexico/.test(text)) return 'México';
  if (/brasileirao|copa do brasil|brasil/.test(text)) return 'Brasil';
  if (/premier league|fa cup|championship|england/.test(text)) return 'Inglaterra';
  if (/laliga|copa del rey|spain|espana/.test(text)) return 'Espanha';
  if (/serie a|coppa italia|italy|italia/.test(text)) return 'Itália';
  if (/bundesliga|germany|alemanha/.test(text)) return 'Alemanha';
  if (/ligue 1|france|franca/.test(text)) return 'França';
  return '';
}
function parseLa18hdAgenda(body, requestedDate) {
  const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.events) ? body.events : [];
  if (!rows.length) return { events:[], total:0, warning:'LA18HD: resposta JSON sem uma lista de registros reconhecida.' };
  const grouped = new Map();
  let currentDateRows = 0;
  let skippedNonFootball = 0;
  let skippedWithoutChannel = 0;
  for (const row of rows) {
    const date = String(row?.date || '').slice(0,10);
    if (date !== requestedDate) continue;
    currentDateRows++;
    const title = String(row?.title || '').trim();
    const colon = title.indexOf(':');
    if (colon < 1) continue;
    const competition = title.slice(0,colon).trim();
    const matchup = title.slice(colon+1).trim();
    // A categoria do feed não é confiável: o exemplo marcou jogos da NHL como "futbol".
    // Mantemos futebol e descartamos modalidades claramente não futebolísticas.
    if (/\b(NHL|NBA|NFL|MLB|NCAA|UFC|MMA|FORMULA\s*1|F1|MOTOGP|ATP|WTA|NHL)\b/i.test(`${competition} ${matchup}`)) {
      skippedNonFootball++;
      continue;
    }
    const teams = matchup.split(/\s+vs\.?\s+/i);
    if (teams.length !== 2) continue;
    const home = teams[0].trim();
    const away = teams[1].trim();
    if (!home || !away || home.length > 90 || away.length > 90) continue;
    const time = String(row?.time || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!time) continue;
    const timeText = `${String(time[1]).padStart(2,'0')}:${time[2]}`;
    const channel = la18hdChannelFromPublicLink(row?.link);
    // Links de outros domínios/mirrors são ignorados; só usamos o slug como rótulo de canal
    // quando o registro aponta para a própria página pública de catálogo do LA18HD.
    if (!channel) { skippedWithoutChannel++; continue; }
    const key = `${date}|${normalizeTeamForKey(home)}|${normalizeTeamForKey(away)}`;
    let event = grouped.get(key);
    if (!event) {
      const rawStatus = String(row?.status || '').toLowerCase();
      const status = /en vivo|ao vivo|live/.test(rawStatus) ? 'live' : /final|terminad|finished|finalizado/.test(rawStatus) ? 'finished' : 'upcoming';
      event = {
        id:`la18hd-${foldLabel(home)}-${foldLabel(away)}-${date}`.replace(/[^a-z0-9-]/g,'-'),
        title:`${home} x ${away}`, home, away,
        league:competition, leagueCountry:la18hdCompetitionCountry(competition),
        start_time:`${date}T${timeText}:00-03:00`, dateEvent:date, timeText,
        status, tvNetworks:[], __provider:'LA18HD', __priority:80, __sources:['LA18HD']
      };
      grouped.set(key,event);
    }
    event.tvNetworks = dedupeNetworks([...(event.tvNetworks||[]), channel]);
  }
  const events = [...grouped.values()].filter(event=>event.tvNetworks.length);
  const warning = events.length ? '' : currentDateRows
    ? `LA18HD: ${currentDateRows} registro(s) encontrados em ${requestedDate}, mas nenhum jogo de futebol com canal identificável.`
    : `LA18HD: o JSON não contém registros para ${requestedDate}.`;
  return { events, total:rows.length, totalForDate:currentDateRows, skippedNonFootball, skippedWithoutChannel, warning };
}
async function fetchLa18hdEvents(date) {
  try {
    const separator = LA18HD_AGENDA_URL.includes('?') ? '&' : '?';
    const body = await fetchJsonExternal(`${LA18HD_AGENDA_URL}${separator}_=${Date.now()}`);
    return parseLa18hdAgenda(body,date);
  } catch (error) {
    return { events:[], total:0, warning:`LA18HD: ${error.message}` };
  }
}

async function getCombinedAgenda(date, markets) {
  const useArgentina = markets.includes('AR');
  const reiPromise = fetchReiEvents(date).then(x=>({ok:!x.warning,...x})).catch(e=>({ok:false,events:[],warning:`Rei dos Canais: ${e.message}`}));
  const pelotaSources = useArgentina ? PUBLIC_AGENDA_SOURCES.filter(s=>s.id.startsWith('pelota-')) : [];
  const pelotaPromise = Promise.all(pelotaSources.map(source=>fetchPelotaSource(source,date).then(x=>({ok:!x.warning,source:source.id,...x}))));
  const la18Promise = useArgentina ? fetchLa18hdEvents(date) : Promise.resolve({events:[],total:0,warning:''});
  const reiChannelsPromise = fetchReiChannelCatalog().then(x=>({ok:true,...x})).catch(error=>({ok:false,data:[],total:0,warning:`Catálogo Rei: ${error.message}`}));
  const [reiResult,pelotaResults,la18Result,reiChannelsResult] = await Promise.all([reiPromise,pelotaPromise,la18Promise,reiChannelsPromise]);
  const reiEvents = enrichReiEventNetworks(reiResult.events || [], reiChannelsResult.data || []);
  const la18Events = la18Result.events || [];
  const pelotaEvents = pelotaResults.flatMap(x=>x.events || []);
  // Prioridade por registro: Rei (100) > LA18HD (80) > PelotaLibre.video (70) > .ar (60).
  // Em caso de duplicata, preserva a partida da fonte prioritária e combina os nomes de canais.
  const matches = mergeCombinedEvents(reiEvents,[...la18Events,...pelotaEvents]);
  return {
    matches, total:matches.length, date, markets,
    sourcePriority:['Rei dos Canais','LA18HD','PelotaLibre.video','PelotaLibre.ar'],
    sources:{
      rei:{ok:reiResult.ok,total:reiEvents.length,rawTotal:reiResult.total || 0,successfulQueries:reiResult.successfulQueries || 0,warning:reiResult.warning || ''},
      reiChannels:{ok:reiChannelsResult.ok,total:reiChannelsResult.total || 0,cached:Boolean(reiChannelsResult.cached),warning:reiChannelsResult.warning || ''},
      la18:{ok:!la18Result.warning,total:la18Events.length,rawTotal:la18Result.total || 0,totalForDate:la18Result.totalForDate || 0,skippedNonFootball:la18Result.skippedNonFootball || 0,warning:la18Result.warning || ''},
      pelota:pelotaResults.map(x=>({id:x.source,ok:x.ok,total:(x.events||[]).length,pageDate:x.pageDate||'',warning:x.warning||''}))
    },
    note:'Agregados metadados públicos de partidas, canais, logos, EPG e nomes de emissoras. Endereços de embeds de terceiros não são repassados.'
  };
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(payload);
}

function readRequestJson(req, maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('O envio ultrapassa o limite de 5 MB.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('JSON inválido.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function normalizeCloudSyncBase(value) {
  let parsed;
  try { parsed = new URL(String(value || '').trim()); }
  catch { throw new Error('Informe o endereço HTTPS do serviço de sincronização.'); }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('O serviço de sincronização precisa usar HTTPS e não pode conter usuário, senha, consulta ou fragmento.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function loadDesktopCloudSyncDefaults() {
  const candidates = [
    path.join(ROOT, 'cloud-sync-defaults.json'),
    path.join(ROOT, 'build', 'cloud-sync-defaults.json')
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      const url = normalizeCloudSyncBase(parsed.url || '');
      const readToken = String(parsed.readToken || '').trim();
      if (url && readToken.length >= 32) return { url, readToken, preconfigured: true };
    } catch {}
  }
  return { url: '', readToken: '', preconfigured: false };
}

async function cloudSyncFetch(url, options = {}) {
  const { timeoutMs: customTimeoutMs, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(customTimeoutMs) || 12000));
  try {
    const response = await fetch(url, { ...fetchOptions, signal: controller.signal, cache: 'no-store' });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text || '{}'); }
    catch { throw new Error(`O serviço de sincronização respondeu com conteúdo inválido (HTTP ${response.status}).`); }
    if (!response.ok) throw new Error(body.error || `O serviço de sincronização respondeu HTTP ${response.status}.`);
    return body;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('O serviço de sincronização excedeu o tempo limite configurado.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function readSharedProviderCache(cloudSync, key, provider = 'api-football') {
  const settings = cloudSync && typeof cloudSync === 'object' ? cloudSync : {};
  const url = String(settings.url || '').trim();
  const readToken = String(settings.readToken || '').trim();
  if (!url || readToken.length < 24) return null;
  try {
    const base = normalizeCloudSyncBase(url);
    const query = new URLSearchParams({ provider: String(provider || 'api-football'), key });
    const result = await cloudSyncFetch(`${base}/v1/provider-cache?${query}`, { headers:{ 'Authorization':`Bearer ${readToken}` }, timeoutMs:4500 });
    return result?.hit && result.record ? result.record : null;
  } catch { return null; }
}

async function writeSharedProviderCache(cloudSync, key, record, provider = 'api-football') {
  const settings = cloudSync && typeof cloudSync === 'object' ? cloudSync : {};
  const url = String(settings.url || '').trim();
  const adminToken = String(settings.adminToken || '').trim();
  if (!url || adminToken.length < 24 || !record || Number(record.expiresAt) <= Date.now()) return false;
  try {
    const base = normalizeCloudSyncBase(url);
    const ttlSeconds = Math.max(1, Math.min(30 * 24 * 60 * 60, Math.floor((Number(record.expiresAt) - Date.now()) / 1000)));
    await cloudSyncFetch(`${base}/v1/provider-cache`, {
      method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${adminToken}` },
      body:JSON.stringify({ provider:String(provider || 'api-football'), key, data:record.data, ttlSeconds }), timeoutMs:4500
    });
    return true;
  } catch { return false; }
}

async function fetchSportsApi(endpoint) {
  if (!API_KEY) return { status: 503, body: { configured: false, error: 'SPORTSAPI_KEY não configurada no arquivo .env.' } };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'X-API-Key': API_KEY, 'Accept': 'application/json' },
      signal: controller.signal,
      cache: 'no-store'
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = { error: 'A SportsAPI retornou uma resposta não JSON.' }; }
    return { status: response.status, body };
  } catch (error) {
    return { status: 502, body: { error: error.name === 'AbortError' ? 'Tempo limite ao consultar a SportsAPI.' : 'Falha de rede ao consultar a SportsAPI.', detail: error.message } };
  } finally {
    clearTimeout(timeout);
  }
}

function buildApiFootballSnapshot(event, resolved, details) {
  const fixture = details?.fixture && Number(details.fixture.id) === Number(resolved.fixture.id) ? details.fixture : resolved.fixture;
  const lineups = Array.isArray(details.lineups) ? details.lineups.slice(0, 2).map(team => ({
    team: { id: Number(team?.team?.id || 0), name: String(team?.team?.name || '').slice(0, 100) },
    formation: String(team?.formation || '').slice(0, 20),
    coach: { id: Number(team?.coach?.id || 0), name: String(team?.coach?.name || '').slice(0, 100) },
    startXI: (Array.isArray(team?.startXI) ? team.startXI : []).slice(0, 11).map(row => ({
      id: Number(row?.player?.id || 0), name: String(row?.player?.name || '').slice(0, 100),
      number: row?.player?.number === null || row?.player?.number === undefined || row?.player?.number === '' ? null : Number(row.player.number), pos: String(row?.player?.pos || '').slice(0, 12), grid: String(row?.player?.grid || '').slice(0, 12)
    })),
    substitutes: (Array.isArray(team?.substitutes) ? team.substitutes : []).slice(0, 20).map(row => ({
      id: Number(row?.player?.id || 0), name: String(row?.player?.name || '').slice(0, 100),
      number: row?.player?.number === null || row?.player?.number === undefined || row?.player?.number === '' ? null : Number(row.player.number), pos: String(row?.player?.pos || '').slice(0, 12)
    }))
  })) : [];
  const statistics = Array.isArray(details.statistics) ? details.statistics.slice(0, 2).map(team => ({
    team: { id: Number(team?.team?.id || 0), name: String(team?.team?.name || '').slice(0, 100) },
    values: (Array.isArray(team?.statistics) ? team.statistics : []).slice(0, 35).map(row => ({
      type: String(row?.type || '').slice(0, 80),
      value: row?.value === null || row?.value === undefined ? null : String(row.value).slice(0, 40)
    }))
  })) : [];
  return {
    provider: 'API-Football', eventId: String(event.id || '').slice(0, 180),
    date: String(event.dateEvent || '').slice(0, 10), home: String(event.home || '').slice(0, 100), away: String(event.away || '').slice(0, 100),
    fixtureId: Number(fixture.id),
    fixture: {
      date: fixture.date, status: fixture.status, statusLong: fixture.statusLong, elapsed: fixture.elapsed,
      venue: fixture.venue, referee: fixture.referee, goals: fixture.goals, score: fixture.score || { halftime: { home: null, away: null }, fulltime: { home: null, away: null }, extratime: { home: null, away: null }, penalty: { home: null, away: null } },
      league: fixture.league, home: fixture.home, away: fixture.away
    },
    lineups, statistics, events: (Array.isArray(details.events) ? details.events : []).slice(0, 120).map(item => ({
      time: { elapsed: item?.time?.elapsed === null || item?.time?.elapsed === undefined ? null : Number(item.time.elapsed), extra: item?.time?.extra === null || item?.time?.extra === undefined ? null : Number(item.time.extra) },
      team: { id: Number(item?.team?.id || 0), name: String(item?.team?.name || '').slice(0, 100) },
      player: { id: Number(item?.player?.id || 0), name: String(item?.player?.name || '').slice(0, 100) },
      assist: { id: Number(item?.assist?.id || 0), name: String(item?.assist?.name || '').slice(0, 100) },
      type: String(item?.type || '').slice(0, 24), detail: String(item?.detail || '').slice(0, 80), comments: String(item?.comments || '').slice(0, 160)
    })), detailErrors: Array.isArray(details.errors) ? details.errors.slice(0, 2).map(item => ({ section: String(item.section || ''), message: String(item.message || '').slice(0, 240), code: String(item.code || '').slice(0, 60) })) : [],
    fetchedAt: new Date().toISOString()
  };
}

function safeStaticPath(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  if (decoded === '/') decoded = '/index.html';
  const normalized = path.normalize(decoded).replace(/^([.][.][/\\])+/, '');
  const file = path.resolve(ROOT, `.${normalized}`);
  return file.startsWith(path.resolve(ROOT) + path.sep) ? file : null;
}

const requestHandler = async (req, res) => {
  const requestUrl = new URL(req.url, `http://${HOST}:${ACTIVE_PORT}`);
  const pathname = requestUrl.pathname;

  // Defaults públicos de leitura para o app desktop. A chave administrativa nunca
  // é incluída neste arquivo nem nesta resposta.
  if (pathname === '/api/cloud-sync/defaults' && req.method === 'GET') {
    return json(res, 200, { ok: true, ...loadDesktopCloudSyncDefaults() });
  }

  // A API cloud é acessada pelo servidor local. O token administrativo nunca precisa
  // ser colocado em código remoto nem exposto ao navegador de outro domínio.
  if (pathname === '/api/cloud-sync/health' && req.method === 'GET') {
    try {
      const base = normalizeCloudSyncBase(requestUrl.searchParams.get('url'));
      return json(res, 200, await cloudSyncFetch(`${base}/health`));
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message }); }
  }

  if (pathname === '/api/cloud-sync/pull' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req);
      const base = normalizeCloudSyncBase(body.url);
      const readToken = String(body.readToken || '').trim();
      if (readToken.length < 24) return json(res, 400, { ok:false, error:'A chave de leitura precisa ter pelo menos 24 caracteres.' });
      return json(res, 200, await cloudSyncFetch(`${base}/v1/config`, { headers:{ 'Authorization':`Bearer ${readToken}` } }));
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message }); }
  }

  if (pathname === '/api/cloud-sync/publish' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req);
      const base = normalizeCloudSyncBase(body.url);
      const token = String(body.adminToken || '').trim();
      if (token.length < 24) return json(res, 400, { ok:false, error:'A chave administrativa precisa ter pelo menos 24 caracteres.' });
      if (!body.config || typeof body.config !== 'object') return json(res, 400, { ok:false, error:'Não há dados para publicar.' });
      const result = await cloudSyncFetch(`${base}/v1/publish`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${token}` },
        body:JSON.stringify({ config:body.config })
      });
      return json(res, 200, result);
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message }); }
  }

  if (pathname === '/api/football-data/status' && req.method === 'GET') {
    const usage = apiFootballService.multiApiEngine.getProviderUsage('football-data') || {};
    return json(res, 200, { ok: true, configured: footballDataService.isConfigured(), provider: 'football-data.org', usage: { requestsLastMinute: Array.isArray(usage.minuteCalls) ? usage.minuteCalls.length : 0, perMinuteSoftLimit: 8 }, keyNeverSentToBrowser: true });
  }

  if (pathname === '/api/football-data/test' && req.method === 'POST') {
    try {
      const result = await footballDataService.testConnection();
      return json(res, 200, result);
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível testar o football-data.org.', code: error.code || '', keyNeverSentToBrowser: true });
    }
  }

  if (pathname === '/api/football-data/competitions' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const cloudSync = body.cloudSync || {};
      const cacheKey = 'competitions:v1';
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, 'football-data');
        if (shared) apiFootballService.multiApiEngine.importRecord('football-data', cacheKey, shared);
      }
      const result = await footballDataService.getCompetitions({ force: Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, 'football-data');
      return json(res, 200, { ok: true, provider: 'football-data.org', ...result, keyNeverSentToBrowser: true });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível carregar as competições do football-data.org.', code: error.code || '', keyNeverSentToBrowser: true });
    }
  }

  if (pathname === '/api/football-data/matches-for-agenda' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 256 * 1024);
      const date = String(body.date || '').trim();
      const events = Array.isArray(body.events) ? body.events.slice(0, 500) : [];
      const cloudSync = body.cloudSync || {};
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { ok:false, error:'Selecione uma data válida para buscar as partidas.' });
      if (!events.length) return json(res, 400, { ok:false, error:'Carregue a agenda antes de buscar dados do football-data.org.' });
      const cacheKey = `matches:${date}:v1`;
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, 'football-data');
        if (shared) apiFootballService.multiApiEngine.importRecord('football-data', cacheKey, shared);
      }
      const result = await footballDataService.getMatchesForDate(date, { force: Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, 'football-data');
      const matches = FootballDataService.matchesForAgenda(events, result.matches);
      return json(res, 200, {
        ok: true, provider: 'football-data.org', date,
        providerMatchesCount: result.count, matchedCount: matches.length,
        unmatchedAgendaCount: Math.max(0, events.length - matches.length), matches,
        competitions: result.competitions, cached: Boolean(result.cached || shared), shared: Boolean(shared),
        keyNeverSentToBrowser: true
      });
    } catch (error) {
      return json(res, error.status || 502, { ok:false, error:error.message || 'Não foi possível buscar os resultados do football-data.org.', code:error.code || '', keyNeverSentToBrowser:true });
    }
  }

  if (pathname === '/api/football-data/standings' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const code = String(body.competitionCode || '').trim().toUpperCase();
      const cloudSync = body.cloudSync || {};
      const cacheKey = `standings:${code}:current:v1`;
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, 'football-data');
        if (shared) apiFootballService.multiApiEngine.importRecord('football-data', cacheKey, shared);
      }
      const cached = !body.refresh ? apiFootballService.multiApiEngine.get('football-data', cacheKey) : null;
      if (cached) return json(res, 200, { ok:true, provider:'football-data.org', ...cleanStandingRows(cached), cached:true, shared:Boolean(shared), keyNeverSentToBrowser:true });
      const result = await footballDataService.getStandings(code, { force: Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, 'football-data');
      return json(res, 200, { ok:true, provider:'football-data.org', ...result, cached:Boolean(result.cached || shared), shared:Boolean(shared), keyNeverSentToBrowser:true });
    } catch (error) {
      return json(res, error.status || 502, { ok:false, error:error.message || 'Não foi possível carregar a classificação do football-data.org.', code:error.code || '', keyNeverSentToBrowser:true });
    }
  }

  if (pathname === '/api/365scores/status' && req.method === 'GET') {
    const provider = apiFootballService.multiApiEngine.providerStatus().find(item => item.id === '365scores') || null;
    return json(res, 200, {
      ok: true, provider: '365Scores', experimental: true, enabled: true,
      officialDeveloperApi: false, apiKeyRequiredByObservedClient: false,
      note: 'Endpoints web não oficiais, documentados por comunidade. Consultas somente sob demanda; autorização de reutilização ainda não confirmada.',
      localThrottle: { perMinuteSoftLimit: scores365Service.perMinuteLimit, dailySoftLimit: scores365Service.dailySoftLimit, officialLimitKnown: false },
      cacheEntries: provider?.cacheEntries || 0, usage: provider?.usage || null
    });
  }

  if (pathname === '/api/365scores/test' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 8 * 1024);
      return json(res, 200, await scores365Service.testConnection({ force: Boolean(body.refresh) }));
    } catch (error) {
      return json(res, error.status || 502, { ok: false, provider: '365Scores', error: error.message || 'Não foi possível testar a 365Scores.', code: error.code || '' });
    }
  }

  if (pathname === '/api/365scores/games-for-date' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const date = String(body.date || '').trim();
      const cacheKey = scores365Service.gamesForDateCacheKey(date);
      const cloudSync = body.cloudSync || {};
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, '365scores');
        if (shared) apiFootballService.multiApiEngine.importRecord('365scores', cacheKey, shared);
      }
      const result = await scores365Service.getGamesForDate(date, { force: Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, '365scores');
      return json(res, 200, {
        ok: true, provider: '365Scores', experimental: true, date: result.date,
        games: result.games, count: result.count, rawCount: result.rawCount,
        cached: Boolean(result.cached || shared), shared: Boolean(shared),
        agendaChanged: false, message: 'Consulta de diagnóstico: nenhuma partida foi adicionada ou alterada na agenda.'
      });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, provider: '365Scores', error: error.message || 'Não foi possível buscar partidas na 365Scores.', code: error.code || '' });
    }
  }

  if (pathname === '/api/365scores/match-agenda' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 192 * 1024);
      const date = String(body.date || '').trim();
      const agendaEvents = Array.isArray(body.agendaEvents) ? body.agendaEvents.slice(0, 250) : [];
      if (!agendaEvents.length) return json(res, 400, { ok:false, error:'Carregue uma agenda com partidas antes de procurar correspondências.' });
      const cacheKey = scores365Service.gamesForDateCacheKey(date);
      const cloudSync = body.cloudSync || {};
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, '365scores');
        if (shared) apiFootballService.multiApiEngine.importRecord('365scores', cacheKey, shared);
      }
      const result = await scores365Service.getGamesForDate(date, { force: Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, '365scores');
      const matches = matchAgendaEvents(agendaEvents, result.games);
      const candidateCount = matches.reduce((sum, item) => sum + item.candidates.length, 0);
      return json(res, 200, {
        ok:true, provider:'365Scores', experimental:true, date,
        agendaCount:agendaEvents.length, sourceGamesCount:result.count,
        matches, candidateCount, cached:Boolean(result.cached || shared), shared:Boolean(shared),
        agendaChanged:false,
        message:'Correspondências sugeridas para revisão. Nenhum gameId foi vinculado e a agenda permaneceu intacta.'
      });
    } catch (error) {
      return json(res, error.status || 502, { ok:false, provider:'365Scores', error:error.message || 'Não foi possível comparar a agenda com a 365Scores.', code:error.code || '' });
    }
  }

  if (pathname === '/api/365scores/game' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const gameId = Number(body.gameId || 0);
      const matchupId = String(body.matchupId || '').trim();
      const cacheKey = scores365Service.gameCacheKey(gameId, matchupId);
      const cloudSync = body.cloudSync || {};
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, '365scores');
        if (shared) apiFootballService.multiApiEngine.importRecord('365scores', cacheKey, shared);
      }
      const result = await scores365Service.getGame(gameId, { matchupId, force: Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, '365scores');
      return json(res, 200, { ok: true, provider: '365Scores', experimental: true, details: result.details, cached: Boolean(result.cached || shared), shared: Boolean(shared) });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, provider: '365Scores', error: error.message || 'Não foi possível consultar os detalhes da partida.', code: error.code || '' });
    }
  }

  if (pathname === '/api/365scores/standings' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const competitionId = Number(body.competitionId || 0);
      const options = { seasonNum: body.seasonNum, stageNum: body.stageNum, force: Boolean(body.refresh) };
      const cacheKey = scores365Service.standingsCacheKey(competitionId, options);
      const cloudSync = body.cloudSync || {};
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, '365scores');
        if (shared) apiFootballService.multiApiEngine.importRecord('365scores', cacheKey, shared);
      }
      const result = await scores365Service.getStandings(competitionId, options);
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, '365scores');
      return json(res, 200, { ok: true, provider: '365Scores', data: result.data, cached: Boolean(result.cached || shared), shared: Boolean(shared) });
    } catch (error) { return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível carregar a classificação da 365Scores.', code: error.code || '' }); }
  }

  if (pathname === '/api/365scores/brackets' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const competitionId = Number(body.competitionId || 0);
      const result = await scores365Service.getBrackets(competitionId, { force: Boolean(body.refresh) });
      return json(res, 200, { ok: true, provider: '365Scores', data: result.data, cached: result.cached });
    } catch (error) { return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível carregar o chaveamento da 365Scores.', code: error.code || '' }); }
  }

  if (pathname === '/api/365scores/competition-stats' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const competitionId = Number(body.competitionId || 0);
      const result = await scores365Service.getCompetitionStats(competitionId, { force: Boolean(body.refresh) });
      return json(res, 200, { ok: true, provider: '365Scores', data: result.data, cached: result.cached });
    } catch (error) { return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível carregar as estatísticas da competição.', code: error.code || '' }); }
  }

  if (pathname === '/api/providers/status' && req.method === 'GET') {
    const status = apiFootballService.multiApiEngine.status();
    status.providers = status.providers.map(provider => provider.id === 'football-data' && footballDataService.isConfigured()
      ? { ...provider, state: 'active', configured: true, description: 'Resultados, calendário e classificações das competições permitidas pela conta.' }
      : provider);
    return json(res, 200, { ok: true, ...status });
  }

  if (pathname === '/api/cloud-sync/provider-cache/get' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const base = normalizeCloudSyncBase(body.url);
      const readToken = String(body.readToken || '').trim();
      const provider = String(body.provider || '').trim().toLowerCase();
      const key = String(body.key || '').trim();
      if (readToken.length < 24) return json(res, 400, { ok:false, error:'Chave de leitura inválida.' });
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(provider) || !key || key.length > 220) return json(res, 400, { ok:false, error:'Identificador de cache inválido.' });
      const query = new URLSearchParams({ provider, key });
      const result = await cloudSyncFetch(`${base}/v1/provider-cache?${query}`, { headers:{ 'Authorization':`Bearer ${readToken}` } });
      return json(res, 200, result);
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message || 'Não foi possível ler o cache compartilhado.' }); }
  }

  if (pathname === '/api/cloud-sync/provider-cache/put' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 768 * 1024);
      const base = normalizeCloudSyncBase(body.url);
      const adminToken = String(body.adminToken || '').trim();
      const provider = String(body.provider || '').trim().toLowerCase();
      const key = String(body.key || '').trim();
      if (adminToken.length < 24) return json(res, 403, { ok:false, error:'Somente o computador administrador pode atualizar o cache compartilhado.' });
      if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(provider) || !key || key.length > 220) return json(res, 400, { ok:false, error:'Identificador de cache inválido.' });
      const result = await cloudSyncFetch(`${base}/v1/provider-cache`, {
        method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':`Bearer ${adminToken}` },
        body:JSON.stringify({ provider, key, data:body.data, ttlSeconds:body.ttlSeconds })
      });
      return json(res, 200, result);
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message || 'Não foi possível salvar o cache compartilhado.' }); }
  }

  if (pathname === '/api/apifootball/livescore' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const cloudSync = body.cloudSync || {};
      const cacheKey = 'livescore:all:v1';
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, 'api-football');
        if (shared) apiFootballService.importCacheRecord(cacheKey, shared);
      }
      const result = await apiFootballService.liveFixtures({ force: Boolean(body.refresh) });
      if (!shared && apiFootballService.getCacheRecord(cacheKey)) await writeSharedProviderCache(cloudSync, cacheKey, apiFootballService.getCacheRecord(cacheKey), 'api-football');
      const fixtures = result.fixtures.map(item => ({
        fixture: { id: Number(item?.fixture?.id || 0), date: String(item?.fixture?.date || ''), status: { short: String(item?.fixture?.status?.short || ''), long: String(item?.fixture?.status?.long || ''), elapsed: Number(item?.fixture?.status?.elapsed || 0) || null }, venue: String(item?.fixture?.venue?.name || '') },
        league: { id: Number(item?.league?.id || 0), name: String(item?.league?.name || ''), country: String(item?.league?.country || ''), logo: String(item?.league?.logo || '') },
        teams: { home: { id: Number(item?.teams?.home?.id || 0), name: String(item?.teams?.home?.name || ''), logo: String(item?.teams?.home?.logo || '') }, away: { id: Number(item?.teams?.away?.id || 0), name: String(item?.teams?.away?.name || ''), logo: String(item?.teams?.away?.logo || '') } },
        goals: { home: item?.goals?.home ?? null, away: item?.goals?.away ?? null }
      }));
      return json(res, 200, { ok: true, provider: 'API-Football', fixtures, count: fixtures.length, cached: result.cached, shared: Boolean(shared), usage: result.usage, keyNeverSentToBrowser: true });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível carregar o livescore.', code: error.code || '', usage: apiFootballService.getUsage(), keyNeverSentToBrowser: true });
    }
  }

  if (pathname === '/api/thesportsdb/status' && req.method === 'GET') {
    return json(res, 200, { ok: true, configured: true, provider: 'TheSportsDB', apiVersion: 'v1-free', freeKeyBuiltIn: true, keyRequiredFromUser: false, rateLimitPerMinute: 25 });
  }

  if (pathname === '/api/thesportsdb/test' && req.method === 'POST') {
    try { return json(res, 200, await theSportsDBService.testConnection()); }
    catch (error) { return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível testar TheSportsDB.', code: error.code || '' }); }
  }

  if (pathname === '/api/thesportsdb/team-badge' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const cloudSync = body.cloudSync || {};
      const name = String(body.teamName || '').trim();
      const country = String(body.country || '').trim();
      const normalized = normalizeSportsDbTeam(name);
      const countryCacheKey = sportsDbCountryKey(country) || 'any';
      const apiFootballId = String(Number(body.apiFootballId || 0) || '').slice(0, 16);
      const cacheKey = `team-badge:${normalized}:${countryCacheKey}:${apiFootballId || 'noid'}:${body.preferTheSportsDb ? 'preferred' : 'standard'}`.slice(0, 190);
      if (!name) return json(res, 400, { ok:false, error:'Informe o nome do clube.' });
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, 'thesportsdb');
        if (shared) apiFootballService.multiApiEngine.importRecord('thesportsdb', cacheKey, shared);
      }
      const result = await theSportsDBService.getTeamBadge({ teamName:name, country, league:body.league, apiFootballId }, { force:Boolean(body.refresh), preferTheSportsDb:Boolean(body.preferTheSportsDb) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, 'thesportsdb');
      return json(res, 200, { ok:true, found:result.found, teamName:result.teamName, resolvedName:result.resolvedName, country:result.country, league:result.league, badgeUrl:result.badgeUrl, source:result.source, confidence:result.confidence, cached:result.cached || Boolean(shared), shared:Boolean(shared) });
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message || 'Não foi possível buscar o escudo no TheSportsDB.', code:error.code || '' }); }
  }

  if (pathname === '/api/thesportsdb/league-badge' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 16 * 1024);
      const cloudSync = body.cloudSync || {};
      const name = String(body.leagueName || '').trim();
      const country = String(body.country || '').trim();
      const cacheKey = `league-badge:${sportsDbFold(name)}:${sportsDbCountryKey(country)}`.slice(0, 190);
      if (!name || !country) return json(res, 400, { ok:false, error:'Informe o nome da competição e o país.' });
      let shared = null;
      if (!body.refresh) {
        shared = await readSharedProviderCache(cloudSync, cacheKey, 'thesportsdb');
        if (shared) apiFootballService.multiApiEngine.importRecord('thesportsdb', cacheKey, shared);
      }
      const result = await theSportsDBService.getLeagueBadge({ leagueName:name, country }, { force:Boolean(body.refresh) });
      if (!shared && result.record) await writeSharedProviderCache(cloudSync, cacheKey, result.record, 'thesportsdb');
      return json(res, 200, { ok:true, found:result.found, leagueName:result.leagueName, resolvedName:result.resolvedName, country:result.country, badgeUrl:result.badgeUrl, source:result.source, confidence:result.confidence, cached:result.cached || Boolean(shared), shared:Boolean(shared) });
    } catch (error) { return json(res, error.status || 502, { ok:false, error:error.message || 'Não foi possível buscar a imagem da competição.', code:error.code || '' }); }
  }

  if (pathname === '/api/apifootball/status' && req.method === 'GET') {
    return json(res, 200, {
      configured: Boolean(String(process.env.NVB_APIFOOTBALL_KEY || process.env.APIFOOTBALL_API_KEY || '').trim()),
      provider: 'API-Football', keyNeverSentToBrowser: true,
      usage: apiFootballService.getUsage()
    });
  }

  if (pathname === '/api/apifootball/test' && req.method === 'POST') {
    try {
      const result = await apiFootballService.testConnection();
      return json(res, 200, { ...result, configured: true, keyNeverSentToBrowser: true });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível testar a API-Football.', code: error.code || '' });
    }
  }

  if (pathname === '/api/apifootball/match-data' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 64 * 1024);
      const event = body.event || {};
      const cloudSync = body.cloudSync || {};
      if (!event.id || !event.home || !event.away || !event.dateEvent) {
        return json(res, 400, { ok: false, error: 'A partida da agenda não contém os dados mínimos para cruzamento.' });
      }
      const fixtureCacheKey = `fixtures:${String(event.dateEvent).slice(0,10)}:all:v2`;
      if (!body.refreshMatch) {
        const sharedFixtures = await readSharedProviderCache(cloudSync, fixtureCacheKey);
        if (sharedFixtures) apiFootballService.importCacheRecord(fixtureCacheKey, sharedFixtures);
      }
      const resolved = await apiFootballService.resolveMatch(event, { force: Boolean(body.refreshMatch) });
      await writeSharedProviderCache(cloudSync, fixtureCacheKey, apiFootballService.getCacheRecord(fixtureCacheKey));
      if (!resolved.matched) return json(res, 200, { ok: true, matched: false, message: resolved.reason, usage: apiFootballService.getUsage() });
      const detailsCacheKey = `fixture-details:${Number(resolved.fixture.id)}`;
      if (!body.forceDetails) {
        const sharedDetails = await readSharedProviderCache(cloudSync, detailsCacheKey);
        if (sharedDetails) apiFootballService.importCacheRecord(detailsCacheKey, sharedDetails);
      }
      let details;
      try {
        details = await apiFootballService.getMatchDetails(resolved.fixture.id, resolved.fixture.status, { force: Boolean(body.forceDetails) });
      } catch (error) {
        return json(res, error.status || 502, {
          ok: false, matched: true, fixture: resolved.fixture,
          error: error.message || 'A partida foi identificada, mas não foi possível buscar os detalhes.',
          code: error.code || '', usage: apiFootballService.getUsage()
        });
      }
      await writeSharedProviderCache(cloudSync, detailsCacheKey, apiFootballService.getCacheRecord(detailsCacheKey));
      const snapshot = buildApiFootballSnapshot(event, resolved, details);
      return json(res, 200, {
        ok: true, matched: true, fixture: resolved.fixture, snapshot,
        partial: details.errors?.length > 0, detailErrors: details.errors || [],
        usage: apiFootballService.getUsage()
      });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Falha ao consultar a API-Football.', code: error.code || '', usage: apiFootballService.getUsage() });
    }
  }

  if (pathname === '/api/apifootball/standings' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 32 * 1024);
      const cloudSync = body.cloudSync || {};
      const cacheKey = `standings:${Number(body.leagueId)}:${Number(body.season)}`;
      const sharedRecord = await readSharedProviderCache(cloudSync, cacheKey);
      if (sharedRecord) apiFootballService.importCacheRecord(cacheKey, sharedRecord);
      const result = await apiFootballService.getStandings(body.leagueId, body.season);
      await writeSharedProviderCache(cloudSync, cacheKey, apiFootballService.getCacheRecord(cacheKey));
      return json(res, 200, { ok: true, ...result });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível consultar a classificação.', code: error.code || '', usage: apiFootballService.getUsage() });
    }
  }

  if (pathname === '/api/apifootball/share' && req.method === 'POST') {
    try {
      const body = await readRequestJson(req, 512 * 1024);
      const base = normalizeCloudSyncBase(body.url);
      const adminToken = String(body.adminToken || '').trim();
      if (adminToken.length < 24) return json(res, 403, { ok: false, error: 'Este computador está em modo somente leitura. Apenas o administrador pode compartilhar dados estatísticos.' });
      if ((!body.match || typeof body.match !== 'object') && (!body.standings || typeof body.standings !== 'object')) return json(res, 400, { ok: false, error: 'Snapshot estatístico inválido.' });
      const published = await cloudSyncFetch(`${base}/v1/sports-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
        body: JSON.stringify({ match: body.match, standings: body.standings })
      });
      return json(res, 200, { ok: true, ...published });
    } catch (error) {
      return json(res, error.status || 502, { ok: false, error: error.message || 'Não foi possível compartilhar os dados estatísticos.' });
    }
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return json(res, 405, { error: 'Método não permitido.' });
  }

  if (pathname === '/api/reidocanais/channels') {
    try {
      const result = await fetchReiChannelCatalog(requestUrl.searchParams.get('refresh') === '1');
      const category = String(requestUrl.searchParams.get('category') || '').trim().toLocaleLowerCase('pt-BR');
      const data = category ? result.data.filter(channel => channel.category.toLocaleLowerCase('pt-BR') === category) : result.data;
      return json(res, 200, { ...result, data, total: data.length, cached: Boolean(result.cached) });
    } catch (error) {
      return json(res, 502, { success:false, error:`Não foi possível carregar o catálogo do Rei dos Canais: ${error.message}` });
    }
  }

  if (pathname === '/api/reidocanais/health') {
    try { return json(res, 200, await fetchReiHealth(requestUrl.searchParams.get('refresh') === '1')); }
    catch (error) { return json(res, 502, { success:false, error:`API Rei dos Canais indisponível: ${error.message}` }); }
  }

  if (pathname === '/api/reidocanais/sports') {
    const date = requestUrl.searchParams.get('date') || new Date().toLocaleDateString('en-CA', {timeZone:'America/Sao_Paulo'});
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { success:false, error:'Data inválida. Use YYYY-MM-DD.' });
    try {
      const [eventsResult, channelsResult] = await Promise.all([fetchReiEvents(date), fetchReiChannelCatalog()]);
      const events = enrichReiEventNetworks(eventsResult.events || [], channelsResult.data || []);
      return json(res, 200, { success:true, data:events, total:events.length, date, warning:eventsResult.warning || '', channelsTotal:channelsResult.total || 0 });
    } catch (error) { return json(res, 502, { success:false, error:`Não foi possível consultar partidas: ${error.message}` }); }
  }

  if (pathname === '/api/agenda/combined') {
    const date = requestUrl.searchParams.get('date') || new Date().toISOString().slice(0,10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error:'Data inválida. Use YYYY-MM-DD.' });
    const requested = String(requestUrl.searchParams.get('markets') || 'BR,AR').split(',').map(v=>v.trim().toUpperCase()).filter((v,i,a)=>['BR','AR'].includes(v)&&a.indexOf(v)===i);
    const markets = requested.length ? requested : ['BR','AR'];
    const key = `${date}|${markets.slice().sort().join(',')}`;
    const cached = combinedCache.get(key);
    if (cached && Date.now()-cached.savedAt < COMBINED_CACHE_MS) return json(res,200,{...cached.payload,cached:true});
    try {
      // Uma fonte externa que fique pendurada nunca deve manter a página no spinner.
      const payload = await withTimeout(
        getCombinedAgenda(date,markets),
        20000,
        'As fontes de agenda demoraram mais de 20 segundos. Tente novamente.'
      );
      combinedCache.set(key,{savedAt:Date.now(),payload});
      if (combinedCache.size>24) {
        const oldest=[...combinedCache.entries()].sort((a,b)=>a[1].savedAt-b[1].savedAt)[0];
        if(oldest) combinedCache.delete(oldest[0]);
      }
      return json(res,200,payload);
    } catch (error) {
      console.error('NicoValBolaLibre /api/agenda/combined:', error?.stack || error);
      return json(res,502,{
        error:`Não foi possível concluir a consulta das agendas: ${error?.message || 'erro desconhecido'}`,
        matches:[], total:0, date, markets,
        sources:{
          rei:{ok:false,total:0,warning:'Consulta do Rei dos Canais falhou ou expirou.'},
          reiChannels:{ok:false,total:0,warning:'Catálogo de canais indisponível.'},
          la18:{ok:false,total:0,warning:'Agenda LA18HD indisponível.'},
          pelota:[]
        }
      });
    }
  }

  if (pathname === '/api/sportsapi/status') {
    return json(res, 200, { configured: Boolean(API_KEY), provider: 'SportsAPI', keyNeverSentToBrowser: true });
  }

  if (pathname === '/api/sportsapi/games') {
    const date = requestUrl.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json(res, 400, { error: 'Data inválida. Use YYYY-MM-DD.' });
    if (!API_KEY) return json(res, 503, { configured: false, error: 'SPORTSAPI_KEY não configurada no arquivo .env.' });

    const requested = String(requestUrl.searchParams.get('markets') || 'BR,AR')
      .split(',').map(value => value.trim().toUpperCase()).filter((value, index, arr) => Object.hasOwn(MARKET_NAMES, value) && arr.indexOf(value) === index);
    const markets = requested.length ? requested : ['BR', 'AR'];
    const cacheKey = `${date}|${markets.slice().sort().join(',')}`;
    const cached = gamesCache.get(cacheKey);
    if (cached && Date.now() - cached.savedAt < GAME_CACHE_MS) {
      return json(res, 200, { ...cached.payload, cached: true });
    }

    async function fetchMarket(marketCode) {
      const marketName = MARKET_NAMES[marketCode];
      const matches = [];
      let offset = 0;
      for (let page = 0; page < 5; page += 1) {
        const query = new URLSearchParams({
          sport: 'football',
          date,
          statusIn: 'live,scheduled,finished',
          hasBroadcast: 'true',
          tvNetwork: marketName,
          sortBy: 'startTime',
          sortOrder: 'asc',
          limit: '100',
          offset: String(offset)
        });
        const result = await fetchSportsApi(`/games/filter?${query.toString()}`);
        if (result.status < 200 || result.status >= 300) {
          const message = result.body?.message || result.body?.error || `HTTP ${result.status}`;
          throw new Error(`${marketName}: ${message}`);
        }
        const rows = Array.isArray(result.body?.matches) ? result.body.matches : Array.isArray(result.body?.data) ? result.body.data : null;
        if (!rows) throw new Error(`${marketName}: formato de partidas inesperado.`);

        const broadcasterFacets = Array.isArray(result.body?.facets?.broadcasters) ? result.body.facets.broadcasters : [];
        const broadcasterMeta = new Map(broadcasterFacets.map(item => [String(item.id ?? item.name ?? '').toLowerCase(), item]));
        for (const row of rows) {
          const rawNetworks = Array.isArray(row.tvNetworks) ? row.tvNetworks : [];
          if (!rawNetworks.length) continue; // Safety check: never show a match without broadcaster data.
          const networks = rawNetworks.map(network => {
            const key = String(network?.id ?? network?.name ?? '').toLowerCase();
            const facet = broadcasterMeta.get(key) || broadcasterMeta.get(String(network?.name || '').toLowerCase()) || {};
            return {
              ...network,
              country: network?.country || network?.market || facet.country || ''
            };
          });
          matches.push({ ...row, tvNetworks: networks, __broadcastMarkets: [marketCode] });
        }

        const pagination = result.body.pagination || {};
        const hasNext = Boolean(pagination.hasNext ?? (pagination.nextOffset != null));
        if (!hasNext || rows.length === 0) break;
        const nextOffset = Number(pagination.nextOffset ?? (offset + rows.length));
        if (!Number.isFinite(nextOffset) || nextOffset <= offset) break;
        offset = nextOffset;
      }
      return matches;
    }

    const outcomes = await Promise.allSettled(markets.map(fetchMarket));
    const successes = outcomes.filter(item => item.status === 'fulfilled');
    const failures = outcomes.filter(item => item.status === 'rejected').map(item => item.reason?.message || 'Falha desconhecida');
    if (!successes.length) return json(res, 502, { error: failures.join(' | ') || 'Não foi possível consultar canais dos mercados selecionados.' });

    const byId = new Map();
    for (const outcome of successes) {
      for (const match of outcome.value) {
        const id = String(match.id || match.matchId || match.match_id || `${match.homeTeam?.name || ''}-${match.awayTeam?.name || ''}-${match.startTime || ''}`);
        const previous = byId.get(id);
        if (!previous) {
          byId.set(id, match);
          continue;
        }
        const networks = new Map();
        for (const network of [...(previous.tvNetworks || []), ...(match.tvNetworks || [])]) {
          const key = `${String(network.id || '').toLowerCase()}|${String(network.name || '').toLowerCase()}|${String(network.country || '').toLowerCase()}`;
          networks.set(key, network);
        }
        previous.tvNetworks = [...networks.values()];
        previous.__broadcastMarkets = [...new Set([...(previous.__broadcastMarkets || []), ...(match.__broadcastMarkets || [])])];
      }
    }

    const combined = [...byId.values()].sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));
    const payload = {
      matches: combined,
      total: combined.length,
      date,
      markets,
      marketLabels: markets.map(code => MARKET_NAMES[code]),
      requiredFilters: { sport: 'football', hasBroadcast: true, tvNetwork: 'selected market', statusIn: 'live,scheduled,finished' },
      marketErrors: failures,
      cached: false
    };
    gamesCache.set(cacheKey, { savedAt: Date.now(), payload });
    if (gamesCache.size > 20) {
      const oldest = [...gamesCache.entries()].sort((a, b) => a[1].savedAt - b[1].savedAt)[0];
      if (oldest) gamesCache.delete(oldest[0]);
    }
    return json(res, 200, payload);
  }

  const detailMatch = pathname.match(/^\/api\/sportsapi\/details\/([A-Za-z0-9_-]{1,100})$/);
  if (detailMatch) {
    const result = await fetchSportsApi(`/games/${encodeURIComponent(detailMatch[1])}/details?sport=football`);
    return json(res, result.status, result.body);
  }

  const file = safeStaticPath(pathname);
  if (!file) return json(res, 403, { error: 'Caminho não permitido.' });
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return json(res, 404, { error: 'Arquivo não encontrado.' });
    const ext = path.extname(file).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
};

const server = http.createServer(requestHandler);

// Se outra instância do NicoValBolaLibre (ou outro programa) já estiver usando
// a porta configurada, tenta automaticamente as próximas portas livres.
// Isso evita o crash EADDRINUSE ao abrir duas pastas/versões do projeto.
function listenWithFallback(port, remainingAttempts = 20) {
  ACTIVE_PORT = port;
  const onListenError = (error) => {
    if (error && error.code === 'EADDRINUSE' && remainingAttempts > 0) {
      const nextPort = port + 1;
      console.warn(`Porta ${port} já está em uso. Tentando ${nextPort}...`);
      setTimeout(() => listenWithFallback(nextPort, remainingAttempts - 1), 120);
      return;
    }
    console.error('Não foi possível iniciar o servidor NicoValBolaLibre:', error?.message || error);
    if (error?.code === 'EADDRINUSE') {
      console.error(`As portas ${REQUESTED_PORT} a ${port} já estão ocupadas. Feche outra instância do NicoValBolaLibre ou altere PORT no .env.`);
    }
    process.exitCode = 1;
  };

  server.once('error', onListenError);
  server.listen(port, HOST, () => {
    server.removeListener('error', onListenError);
    const SITE_NAME = process.env.SITE_NAME || '';
    const siteUrl = SITE_NAME ? `http://${SITE_NAME}${port === 80 ? '' : ':' + port}` : `http://${HOST}:${port}`;
    console.log(`NicoValBolaLibre V0.18.11 local: ${siteUrl}`);
    if (SITE_NAME) console.log(`(também funciona em http://${HOST}:${port})`);
    if (port !== REQUESTED_PORT) {
      console.log(`A porta padrão ${REQUESTED_PORT} estava ocupada; esta instância está usando a porta ${port}.`);
    }
    console.log('Agenda combinada: Rei dos Canais > LA18HD JSON > PelotaLibre.video > PelotaLibre.ar (metadados públicos).');
    console.log('Rei API: /api/reidocanais/channels (canais + EPG), /api/reidocanais/sports?date=YYYY-MM-DD e /api/reidocanais/health.');
    console.log('Use fontes de vídeo autorizadas no painel de administração.');
    console.log('Deixe esta janela aberta enquanto usa o NicoValBolaLibre. Ctrl+C encerra o servidor.');
    // V0.15: abre o navegador sozinho (desative com NO_BROWSER=1).
    if (!process.env.NO_BROWSER) {
      try {
        const { spawn } = require('child_process');
        const target = siteUrl;
        const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', target]]
          : process.platform === 'darwin' ? ['open', [target]] : ['xdg-open', [target]];
        const child = spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true });
        child.on('error', () => {});
        child.unref();
      } catch (_) { /* se não abrir, use o endereço acima manualmente */ }
    }
  });
}

if (require.main === module || process.env.NVB_SERVER_AUTOSTART === '1') {
  listenWithFallback(REQUESTED_PORT);
}

module.exports = { server, listenWithFallback };
