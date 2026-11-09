'use strict';

function normalizeMarketCodes(value) {
  const values = Array.isArray(value) ? value : String(value || 'BR,AR').split(',');
  const normalized = [...new Set(values.map(item => String(item || '').trim().toUpperCase()).filter(item => item === 'BR' || item === 'AR'))];
  return normalized.length ? normalized : ['BR', 'AR'];
}

function marketCodeForNetwork(network) {
  const item = network && typeof network === 'object' ? network : { name: String(network || '') };
  const countryCode = String(item.countryCode || item.country_code || item.isoCountryCode || '').trim().toUpperCase();
  if (['AR','ARG'].includes(countryCode)) return 'AR';
  if (['BR','BRA'].includes(countryCode)) return 'BR';
  const text = `${item.country || ''} ${item.countryName || item.country_name || ''} ${item.market || ''} ${item.region || ''} ${item.name || ''} ${item.displayName || ''}`
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(argentina|argentinian|arg)\b/.test(text)) return 'AR';
  if (/\b(brasil|brazil|brasileir[oa]|br)\b/.test(text)) return 'BR';
  const channel = String(item.name || item.displayName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(tyc sports|telefe|tv publica|el trece|america tv|deportv|flow|dgo|tnt sports argentina|fox sports argentina)\b/.test(channel)) return 'AR';
  if (/\b(sportv|premiere|bandsports|cazetv|caze tv|canal goat|nosso futebol|nsports|sbt|record tv|rede tv|tnt sports brasil|espn brasil)\b/.test(channel)) return 'BR';
  if (/america latina|latin america|latam|latinoamerica/.test(text)) return 'LATAM';
  return '';
}

function filterAgendaByMarkets(events, markets) {
  const selected = normalizeMarketCodes(markets);
  const requested = new Set(selected);
  if (requested.has('BR') && requested.has('AR')) return Array.isArray(events) ? events : [];
  return (Array.isArray(events) ? events : []).map(event => {
    const networks = Array.isArray(event?.tvNetworks) ? event.tvNetworks : [];
    const compatible = networks.filter(network => {
      const market = marketCodeForNetwork(network);
      // Canais pan-regionais e canais sem país explícito permanecem elegíveis.
      return !market || market === 'LATAM' || requested.has(market);
    });
    return compatible.length ? { ...event, tvNetworks: compatible } : null;
  }).filter(Boolean);
}

module.exports = { normalizeMarketCodes, marketCodeForNetwork, filterAgendaByMarkets };
