'use strict';

(function attachTeamLogoIndex(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.NVBTeamLogoIndex = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : null), function createTeamLogoIndex() {
  const DEFAULT_RAW_BASE = 'https://raw.githubusercontent.com/JoseArroyave/football-logos/refs/heads/main/';
  const fuzzyIndexCache = new WeakMap();

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

    // Primeiro tentamos correspondência exata. A busca aproximada fica separada e só
    // pode ser usada quando a interface consegue restringir a busca ao país da competição.
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

  function levenshteinDistance(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const current = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
      }
      previous = current;
    }
    return previous[b.length];
  }

  function similarityScore(left, right) {
    const a = String(left || '').trim();
    const b = String(right || '').trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    const maxLength = Math.max(a.length, b.length);
    const editScore = 1 - (levenshteinDistance(a, b) / maxLength);
    const aTokens = new Set(a.split(/\s+/).filter(Boolean));
    const bTokens = new Set(b.split(/\s+/).filter(Boolean));
    const intersection = [...aTokens].filter(token => bTokens.has(token)).length;
    const tokenScore = (2 * intersection) / Math.max(1, aTokens.size + bTokens.size);
    return (editScore * 0.7) + (tokenScore * 0.3);
  }

  function findClosestLogo(name, countryHint, index, options = {}) {
    const normalizeName = options.normalizeName;
    const normalizeCountry = options.normalizeCountry;
    if (typeof normalizeName !== 'function' || typeof normalizeCountry !== 'function') {
      throw new TypeError('normalizeName e normalizeCountry são obrigatórias.');
    }
    if (!(index instanceof Map)) return '';
    const country = normalizeCountry(countryHint);
    // Aproximação só é permitida quando sabemos o país. Isso evita pegar um clube
    // homônimo de outra liga/país por causa de uma semelhança textual.
    if (!country) return '';
    const aliases = options.aliases || {};
    const variants = nameVariants(name, normalizeName, aliases);
    const target = variants[variants.length - 1] || normalizeName(name);
    if (!target || target.length < 5) return '';
    const minimumScore = Number(options.minimumScore || 0.82);
    const minimumGap = Number(options.minimumGap || 0.055);
    let cache = fuzzyIndexCache.get(index);
    if (!cache) { cache = new Map(); fuzzyIndexCache.set(index, cache); }
    const cacheKey = `${country}::${target}::${minimumScore}::${minimumGap}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const candidates = [];
    for (const entries of index.values()) {
      for (const item of entries) {
        if (item.country !== country) continue;
        const candidateVariants = nameVariants(item.base, normalizeName, aliases);
        const score = Math.max(...candidateVariants.map(candidate => similarityScore(target, candidate)));
        if (score >= minimumScore) candidates.push({ item, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    if (!candidates.length) { cache.set(cacheKey, ''); return ''; }
    // Recusa empates/nomes quase iguais: não associa um escudo duvidoso.
    if (candidates[1] && candidates[0].score - candidates[1].score < minimumGap) { cache.set(cacheKey, ''); return ''; }
    const safePath = candidates[0].item.path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const result = `${options.rawBase || DEFAULT_RAW_BASE}${safePath}`;
    cache.set(cacheKey, result);
    return result;
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

  return { indexTree, nameVariants, findExactLogo, findClosestLogo, similarityScore, uniqueHttpsCandidates, DEFAULT_RAW_BASE };
});
