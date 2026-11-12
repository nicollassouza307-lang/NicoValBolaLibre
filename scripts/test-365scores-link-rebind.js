"use strict";
const assert = require('node:assert/strict');
const linksApi = require('../scores365-agenda-links');
const fs = require('node:fs');
const path = require('node:path');
const teamKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const keyBuilder = event => `${String(event.dateEvent || event.date || '').slice(0,10)}|${teamKey(event.home)}|${teamKey(event.away)}|${String(event.competition || event.league || '').toLowerCase()}`;
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

const oldKey = '2026-11-12|real madrid|barcelona|la liga';
const links = {
  [oldKey]: {
    eventId: 'agenda-77', dateEvent: '2026-11-12', home: 'Real Madrid', away: 'Barcelona',
    competition: 'La Liga', gameId: 880077, source: '365scores-manual-confirmation'
  }
};
const refreshedEvent = {
  id: 'agenda-77', eventId: 'agenda-77', dateEvent: '2026-11-12',
  home: 'Real Madrid', away: 'Barcelona', competition: 'El Clásico / Campeonato'
};

const sameIdEntries = linksApi.findEntries(refreshedEvent, links, { teamKey, keyBuilder });
assert.equal(sameIdEntries.length, 1, 'O vínculo antigo deve ser encontrado pelo eventId mesmo quando a chave/competição mudou.');
assert.equal(sameIdEntries[0][0], oldKey);
assert.equal(linksApi.findEntry(refreshedEvent, links, { teamKey, keyBuilder }).value.gameId, 880077);

const regeneratedIdEvent = { ...refreshedEvent, id: 'agenda-new-77', eventId: 'agenda-new-77' };
assert.equal(linksApi.findEntries(regeneratedIdEvent, links, { teamKey, keyBuilder }).length, 1,
  'Se o ID da agenda for regenerado, mesmos clubes na mesma data ainda identificam a partida para migrar a chave.');

const genuinelyDifferent = {
  id: 'agenda-78', eventId: 'agenda-78', dateEvent: '2026-11-12',
  home: 'Real Madrid', away: 'Atletico Madrid', competition: 'La Liga'
};
assert.equal(linksApi.findEntries(genuinelyDifferent, links, { teamKey, keyBuilder }).length, 0,
  'Um jogo com adversário diferente não pode herdar o vínculo antigo.');
assert.equal(linksApi.sameAgendaEvent(links[oldKey], genuinelyDifferent, teamKey), false);

assert.doesNotMatch(html, /<script src="\/scores365-agenda-links\.js"><\/script>/, 'A recuperação de vínculos não deve depender de um arquivo externo.');
assert.match(html, /function scores365AgendaLinkEntriesForEvent\(event,links=/, 'A recuperação de vínculos deve estar embutida no app.');
assert.match(html, /function scores365LinkSameEvent\(existing,event\)/, 'O app deve reconhecer vínculo antigo pela identidade da partida.');
assert.match(html, /void loadEvents\(\)/, 'A carga da agenda deve iniciar mesmo se a renderização inicial falhar.');
assert.match(html, /scores365AgendaLinkEntriesForEvent\(row,links\)/, 'O Admin deve localizar vínculos antigos para exibir e desvincular.');
assert.match(html, /sameEventKeys=new Set\(sameEventEntries\.map/, 'A gravação manual deve excluir o próprio evento da verificação de duplicidade.');
assert.match(html, /Desvincule a outra partida antes de reutilizá-lo/, 'Conflitos reais devem identificar a necessidade de desvincular a outra partida.');

const otherDate = { ...regeneratedIdEvent, dateEvent: '2026-11-13' };
assert.equal(linksApi.findEntries(otherDate, links, { teamKey, keyBuilder }).length, 0,
  'O fallback por clubes não pode misturar partidas de datas diferentes.');

console.log('PASSOU: vínculo antigo da mesma partida pode ser recuperado/migrado; gameId de outra partida continua protegido.');
