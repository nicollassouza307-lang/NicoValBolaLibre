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

  function teamPairOf(value, teamKey) {
    const normalize = typeof teamKey === 'function' ? teamKey : defaultTeamKey;
    const home = normalize(value?.home || '');
    const away = normalize(value?.away || '');
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

    const a = teamPairOf(existing, teamKey);
    const b = teamPairOf(event, teamKey);
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

  return { sameAgendaEvent, findEntries, findEntry };
});
