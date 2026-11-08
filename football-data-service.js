'use strict';

const API_BASE = 'https://api.football-data.org/v4';

class FootballDataService {
  constructor(options = {}) {
    this.getToken = options.getToken || (() => process.env.NVB_FOOTBALL_DATA_TOKEN || '');
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof this.fetchImpl !== 'function') throw new Error('Este Node.js não oferece fetch nativo.');
  }

  isConfigured() {
    return Boolean(String(this.getToken() || '').trim());
  }

  async testConnection() {
    const token = String(this.getToken() || '').trim();
    if (!token) throw Object.assign(new Error('Token do football-data.org não configurado neste computador.'), { status: 503, code: 'FOOTBALL_DATA_NOT_CONFIGURED' });

    let response;
    try {
      response = await this.fetchImpl(`${API_BASE}/competitions`, {
        method: 'GET',
        headers: { 'X-Auth-Token': token, 'Accept': 'application/json' },
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined
      });
    } catch (error) {
      if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
        throw Object.assign(new Error('A conexão com football-data.org demorou demais. Confira a internet e tente novamente.'), { status: 504, code: 'FOOTBALL_DATA_TIMEOUT' });
      }
      throw Object.assign(new Error(`Não foi possível alcançar football-data.org: ${error.message || 'erro de rede'}`), { status: 502, code: 'FOOTBALL_DATA_NETWORK' });
    }

    let payload = {};
    try { payload = await response.json(); } catch {}
    if (!response.ok) {
      const messages = {
        401: 'Token não reconhecido. Confira se você copiou o token completo.',
        403: 'O token foi reconhecido, mas sua conta/plano não tem acesso a este recurso.',
        429: 'Limite de requisições do football-data.org atingido. Aguarde a janela de renovação.'
      };
      const message = messages[response.status] || `football-data.org respondeu com HTTP ${response.status}.`;
      throw Object.assign(new Error(message), { status: response.status, code: `FOOTBALL_DATA_HTTP_${response.status}` });
    }

    const competitions = Array.isArray(payload.competitions) ? payload.competitions : [];
    return {
      ok: true,
      provider: 'football-data.org',
      competitionsCount: Number(payload.count ?? competitions.length),
      authenticatedClient: response.headers?.get?.('X-Authenticated-Client') || null,
      requestsAvailableMinute: Number(response.headers?.get?.('X-Requests-Available-Minute') || 0) || null,
      requestCounterResetSeconds: Number(response.headers?.get?.('X-RequestCounter-Reset') || 0) || null,
      keyNeverSentToBrowser: true
    };
  }
}

module.exports = { FootballDataService, API_BASE };
