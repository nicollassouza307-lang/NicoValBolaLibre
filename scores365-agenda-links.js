(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.Scores365AgendaLinks = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function defaultTeamKey(value) {
    return String(value || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function eventIdOf(value) {
    return String(value?.eventId || value?.id || '').trim();
  }

  function dateOf(value) {
    const raw = String(value?.dateEvent || value?.date || value?.startTime || value?.start || '').trim();
    return raw ? raw.slice(0, 10) : '';
  }

  const COMPETITION_SUFFIXES = [
    'UEFA Women Champions League','UEFA Women’s Champions League','UEFA Champions League Feminina','UEFA Champions League Femenina',
    'Champions League Feminina','Champions League Femenina','Champions League Feminino','Women Champions League','Champions League Women',
    'UEFA Women Europa League','UEFA Women Nations League','UEFA Nations League','Nations League',
    'UEFA European Qualifiers','European Qualifiers','UEFA World Cup Qualifiers','UEFA Euro Qualifiers','Euro Qualifiers',
    'UEFA Champions League','UEFA Europa League','UEFA Conference League','CONCACAF Champions Cup','FIFA Club World Cup',
    'Primera Division Argentina','Liga Profesional Argentina','Primera Nacional Argentina','Copa de la Liga Profesional','Copa Argentina','Primera Division',
    'Liga Betplay DIMAYOR','Campeonato Brasileiro Serie A','Campeonato Brasileiro Serie B','Brasileirao Serie A','Brasileirao Serie B',
    'Copa do Nordeste','Copa do Brasil','Campeonato Paulista','Campeonato Carioca','Campeonato Mineiro','Campeonato Gaucho','Brasileirao','Campeonato Brasileiro',
    'Bundesliga','Serie A Italiana','Serie B Italiana','Francia Ligue 1','Ligue 1','Ligue 2','La Liga EA Sports','LaLiga Hypermotion','LaLiga',
    'Premier League','EFL Championship','Championship','League One','League Two','EFL Cup','FA Cup','Community Shield',
    'Copa Libertadores','Copa Sudamericana','Recopa Sudamericana','Saudi Pro League','Eredivisie','Primeira Liga','Liga Portugal',
    'Liga MX Apertura','Liga MX Clausura','Liga MX','MLS','Copa del Rey','Coppa Italia','KNVB Beker','DFB Pokal','Coupe de France','Scottish Premiership','Turkish Super Lig'
  ];

  function cleanTeamKey(value, competitionHints = [], teamKey) {
    const normalize = typeof teamKey === 'function' ? teamKey : defaultTeamKey;
    let key = normalize(value || '');
    const suffixes = [...new Set([...(Array.isArray(competitionHints) ? competitionHints : [competitionHints]), ...COMPETITION_SUFFIXES]
      .map(item => normalize(item || '')).filter(Boolean))].sort((a, b) => b.length - a.length);
    for (const suffix of suffixes) {
      if (key.endsWith(` ${suffix}`)) {
        const candidate = key.slice(0, -(suffix.length + 1)).trim();
        if (candidate.length >= 2) { key = candidate; break; }
      }
    }
    return key;
  }

  function teamPairOf(value, teamKey, competitionHints = []) {
    const normalize = typeof teamKey === 'function' ? teamKey : defaultTeamKey;
    const hints = [value?.competition, value?.league, ...((Array.isArray(competitionHints) ? competitionHints : [competitionHints]))];
    const home = cleanTeamKey(value?.home || '', hints, normalize);
    const away = cleanTeamKey(value?.away || '', hints, normalize);
    return { home, away };
  }

  function sameAgendaEvent(existing, event, teamKey) {
    if (!existing || !event) return false;
    const existingId = eventIdOf(existing);
    const eventId = eventIdOf(event);
    if (existingId && eventId && existingId === eventId) return true;

    const existingDate = dateOf(existing);
    const eventDate = dateOf(event);
    if (!existingDate || !eventDate || existingDate !== eventDate) return false;

    const hints = [existing?.competition, existing?.league, event?.competition, event?.league];
    const a = teamPairOf(existing, teamKey, hints);
    const b = teamPairOf(event, teamKey, hints);
    if (!a.home || !a.away || !b.home || !b.away) return false;
    return (a.home === b.home && a.away === b.away) ||
      (a.home === b.away && a.away === b.home);
  }

  function findEntries(event, links, options = {}) {
    const store = links && typeof links === 'object' && !Array.isArray(links) ? links : {};
    const teamKey = options.teamKey;
    const keyBuilder = options.keyBuilder;
    const found = new Map();

    if (typeof keyBuilder === 'function') {
      const directKey = keyBuilder(event);
      if (directKey && store[directKey]) found.set(directKey, store[directKey]);
    }

    for (const [key, value] of Object.entries(store)) {
      if (sameAgendaEvent(value, event, teamKey)) found.set(key, value);
    }
    return [...found.entries()];
  }

  function findEntry(event, links, options = {}) {
    const entries = findEntries(event, links, options);
    if (!entries.length) return null;
    const id = eventIdOf(event);
    const directKey = typeof options.keyBuilder === 'function' ? options.keyBuilder(event) : '';
    entries.sort((a, b) => {
      const score = ([key, value]) => key === directKey ? 0 :
        (id && eventIdOf(value) === id ? 1 : 2);
      return score(a) - score(b);
    });
    return { key: entries[0][0], value: entries[0][1] };
  }

  return { sameAgendaEvent, findEntries, findEntry, cleanTeamKey };
});
