'use strict';

(function attachTeamLogoIndex(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NVBTeamLogoIndex = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function createTeamLogoIndex() {
  const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/JoseArroyave/football-logos/refs/heads/main/';

  function indexTree(tree, normalizeName) {
    if (typeof normalizeName !== 'function') throw new TypeError('normalizeName precisa ser uma função.');
    const index = new Map();
    for (const item of Array.isArray(tree) ? tree : []) {
      const path = String(item?.path || '');
      if (item?.type !== 'blob' || !/^logos\/[^/]+\/.+\.svg$/i.test(path)) continue;
      const parts = path.split('/');
      if (parts.length < 3) continue;
      const country = normalizeName(parts[1]).replace(/\s+/g, '-');
      const base = parts[parts.length - 1].replace(/\.svg$/i, '');
      const key = normalizeName(base);
      if (!country || !key) continue;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ path, country, base });
    }
    return index;
  }

  function nameVariants(name, normalizeName, aliases = {}) {
    const raw = normalizeName(name);
    if (!raw) return [];
    const alias = aliases[raw];
    const variants = [
      alias,
      raw,
      raw.replace(/\b(club|football|futbol|futebol|sport|de|the)\b/g, ' ').replace(/\s+/g, ' ').trim(),
      raw.replace(/\b(fc|cf|sc|ac|afc|fk|sv|bk)\b/g, ' ').replace(/\s+/g, ' ').trim(),
      raw.replace(/\b(fc|cf|sc|ac|afc|fk|sv|bk|club|football|futbol|futebol|sport|de|the)\b/g, ' ').replace(/\s+/g, ' ').trim()
    ];
    return [...new Set(variants.filter(Boolean))];
  }

  function findExactLogo(name, countryHint, index, options = {}) {
    const normalizeName = options.normalizeName;
    const normalizeCountry = options.normalizeCountry;
    if (typeof normalizeName !== 'function' || typeof normalizeCountry !== 'function') {
      throw new TypeError('normalizeName e normalizeCountry são obrigatórias.');
    }
    if (!(index instanceof Map)) return '';

    const country = normalizeCountry(countryHint);
    const aliases = options.aliases || {};
    const rawBase = options.rawBase || DEFAULT_RAW_BASE;

    // Apenas correspondência exata após normalização/aliases. Nunca usamos busca aproximada:
    // clubes homônimos em países diferentes poderiam receber o escudo errado.
    for (const variant of nameVariants(name, normalizeName, aliases)) {
      const matches = index.get(variant);
      if (!matches?.length) continue;
      const selected = country
        ? matches.filter(item => item.country === country)
        : matches;
      if (selected.length !== 1) continue;
      const safePath = selected[0].path.split('/').map(segment => encodeURIComponent(segment)).join('/');
      return `${rawBase}${safePath}`;
    }
    return '';
  }

  function uniqueHttpsCandidates(values) {
    const result = [];
    for (const value of values || []) {
      if (typeof value !== 'string' || !value.trim()) continue;
      try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password) continue;
        if (!result.includes(url.href)) result.push(url.href);
      } catch {}
    }
    return result;
  }

  return { indexTree, nameVariants, findExactLogo, uniqueHttpsCandidates, DEFAULT_RAW_BASE };
});
