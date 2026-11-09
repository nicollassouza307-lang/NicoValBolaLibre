'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DAY_MS = 24 * 60 * 60 * 1000;
const PROVIDER_CATALOG = Object.freeze([
  {
    id: 'api-football', name: 'API-Football', role: 'principal', state: 'active',
    description: 'Escalações, eventos, placares e estatísticas.',
    quota: { dailyLimit: 100, appSoftLimit: 70, reserve: 30, perMinuteSoftLimit: 8 }
  },
  {
    id: 'football-data', name: 'football-data.org', role: 'resultados', state: 'active',
    description: 'Resultados, calendários e classificações das competições cobertas.', quota: null
  },
  {
    id: 'thesportsdb', name: 'TheSportsDB', role: 'imagens', state: 'active',
    description: 'Escudos e imagens via API V1 gratuita (chave pública 123 integrada).', quota: { perMinuteLimit: 25, dailyLimit: null }
  },
  {
    id: '365scores', name: '365Scores', role: 'experimental', state: 'planned',
    description: 'Teste manual de endpoints web não oficiais para partidas e competições; uso sujeito a autorização.',
    quota: { perMinuteSoftLimit: 12, dailySoftLimit: 200, note: 'Teto local experimental, não é limite oficial da 365Scores.' }
  },
  {
    id: 'github-logos', name: 'GitHub Logos', role: 'fallback', state: 'available',
    description: 'Repositórios públicos de escudos como último recurso.', quota: null
  }
]);

function safeProviderId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id)) throw new Error('Identificador de provedor inválido.');
  return id;
}

class MultiApiEngine {
  constructor(options = {}) {
    this.dataDir = options.dataDir || path.join(process.cwd(), '.nvb-data');
    this.now = options.now || (() => Date.now());
    this.cacheFile = path.join(this.dataDir, 'multi-api-cache.json');
    this.usageFile = path.join(this.dataDir, 'multi-api-usage.json');
    this.cache = new Map(Object.entries(this.loadJson(this.cacheFile, {})));
    this.usage = this.loadJson(this.usageFile, {});
  }

  loadJson(file, fallback) {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
    } catch { return fallback; }
  }

  saveJson(file, value) {
    fs.mkdirSync(this.dataDir, { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporary, file);
  }

  cacheKey(provider, key) {
    const id = safeProviderId(provider);
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || normalizedKey.length > 220) throw new Error('Chave de cache inválida.');
    return `${id}:${normalizedKey}`;
  }

  importLegacyCache(provider, entries) {
    const id = safeProviderId(provider);
    if (!entries || typeof entries !== 'object' || Array.isArray(entries)) return 0;
    let imported = 0;
    for (const [key, entry] of Object.entries(entries)) {
      const normalized = String(key || '').trim();
      if (!normalized || normalized.length > 220 || !entry || typeof entry !== 'object') continue;
      const expiresAt = Number(entry.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt <= this.now() || !Object.prototype.hasOwnProperty.call(entry, 'data')) continue;
      const compoundKey = this.cacheKey(id, normalized);
      const existing = this.cache.get(compoundKey);
      if (existing && Number(existing.expiresAt) >= expiresAt) continue;
      this.cache.set(compoundKey, { expiresAt, updatedAt: Number(entry.updatedAt || this.now()), data: entry.data });
      imported++;
    }
    if (imported) { this.pruneCache(); this.persistCache(); }
    return imported;
  }

  get(provider, key) {
    const id = this.cacheKey(provider, key);
    const entry = this.cache.get(id);
    if (!entry || Number(entry.expiresAt) <= this.now()) {
      if (entry) { this.cache.delete(id); this.persistCache(); }
      return null;
    }
    return entry.data;
  }

  getRecord(provider, key) {
    const id = this.cacheKey(provider, key);
    const entry = this.cache.get(id);
    if (!entry || Number(entry.expiresAt) <= this.now()) return null;
    return { data: entry.data, expiresAt: Number(entry.expiresAt), updatedAt: Number(entry.updatedAt || 0) };
  }

  set(provider, key, data, ttlMs) {
    const id = this.cacheKey(provider, key);
    const ttl = Math.max(0, Math.min(Number(ttlMs) || 0, 30 * DAY_MS));
    if (!ttl) return false;
    this.cache.set(id, { expiresAt: this.now() + ttl, updatedAt: this.now(), data });
    this.pruneCache();
    this.persistCache();
    return true;
  }

  importRecord(provider, key, record) {
    if (!record || typeof record !== 'object' || !Object.prototype.hasOwnProperty.call(record, 'data')) return false;
    const expiresAt = Number(record.expiresAt);
    const ttl = Math.max(0, Math.min(expiresAt - this.now(), 30 * DAY_MS));
    return this.set(provider, key, record.data, ttl);
  }

  delete(provider, key) {
    const id = this.cacheKey(provider, key);
    const removed = this.cache.delete(id);
    if (removed) this.persistCache();
    return removed;
  }

  pruneCache() {
    const now = this.now();
    for (const [key, entry] of this.cache) if (!entry || Number(entry.expiresAt) <= now) this.cache.delete(key);
    while (this.cache.size > 1200) this.cache.delete(this.cache.keys().next().value);
  }

  persistCache() {
    const stored = {};
    for (const [key, entry] of this.cache) if (entry && Number(entry.expiresAt) > this.now()) stored[key] = entry;
    this.saveJson(this.cacheFile, stored);
  }

  recordUsage(provider, usage) {
    const id = safeProviderId(provider);
    const today = new Date(this.now()).toISOString().slice(0, 10);
    this.usage[id] = { ...(this.usage[id] || {}), dayUtc: today, ...usage, syncedAt: new Date(this.now()).toISOString() };
    this.saveJson(this.usageFile, this.usage);
  }

  reserveRequest(provider, options = {}) {
    const id = safeProviderId(provider);
    const now = this.now();
    const today = new Date(now).toISOString().slice(0, 10);
    const previous = this.getProviderUsage(id) || {};
    const minuteCalls = Array.isArray(previous.minuteCalls) ? previous.minuteCalls.filter(time => Number(time) >= now - 60_000) : [];
    const perMinuteLimit = Number(options.perMinuteLimit || 0);
    const dailyLimit = Number(options.dailySoftLimit || options.dailyLimit || 0);
    const reserved = Math.max(0, Number(options.reserve || 0));
    const used = Number(previous.requestsUsed || 0);
    if (perMinuteLimit > 0 && minuteCalls.length >= perMinuteLimit) {
      throw Object.assign(new Error(`Limite de ${perMinuteLimit} chamadas por minuto atingido para ${id}.`), { code: 'PROVIDER_MINUTE_LIMIT', status: 429 });
    }
    if (options.countDaily !== false && dailyLimit > 0 && used >= Math.max(0, dailyLimit - reserved)) {
      throw Object.assign(new Error(`Limite diário interno de ${Math.max(0, dailyLimit - reserved)} chamadas atingido para ${id}.`), { code: 'PROVIDER_DAILY_LIMIT', status: 429 });
    }
    minuteCalls.push(now);
    const next = { dayUtc:today, requestsUsed:used + (options.countDaily === false ? 0 : 1), minuteCalls, dailyLimit:dailyLimit || null, reserve:reserved, syncedAt:new Date(now).toISOString() };
    this.usage[id] = { ...(this.usage[id] || {}), ...next };
    this.saveJson(this.usageFile, this.usage);
    return { ...next, remaining:dailyLimit > 0 ? Math.max(0, dailyLimit - reserved - next.requestsUsed) : null };
  }

  getProviderUsage(provider) {
    const id = safeProviderId(provider);
    const value = this.usage[id];
    const today = new Date(this.now()).toISOString().slice(0, 10);
    return value && value.dayUtc === today ? value : null;
  }

  providerStatus() {
    this.pruneCache();
    return PROVIDER_CATALOG.map(provider => {
      const prefix = `${provider.id}:`;
      const entries = [...this.cache.keys()].filter(key => key.startsWith(prefix)).length;
      return {
        id: provider.id, name: provider.name, role: provider.role, state: provider.state,
        description: provider.description, quota: provider.quota,
        cacheEntries: entries, usage: this.getProviderUsage(provider.id)
      };
    });
  }

  status() {
    const providers = this.providerStatus();
    return {
      engine: 'NicoVal Multi-API Engine',
      version: 1,
      cacheEntries: this.cache.size,
      providers,
      activeProviders: providers.filter(item => item.state === 'active').length,
      plannedProviders: providers.filter(item => item.state === 'planned').length
    };
  }
}

module.exports = { MultiApiEngine, PROVIDER_CATALOG, DAY_MS, safeProviderId };
