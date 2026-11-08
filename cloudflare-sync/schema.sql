-- NicoValBolaLibre shared configuration database
CREATE TABLE IF NOT EXISTS shared_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"stations":[],"sources":{},"teamLogoOverrides":{}}'
);

INSERT OR IGNORE INTO shared_config (id, revision, updated_at, config_json)
VALUES (1, 0, '', '{"schemaVersion":1,"stations":[],"sources":{},"teamLogoOverrides":{}}');


-- Cache compartilhado de respostas por provedor (não armazena chaves de API).
CREATE TABLE IF NOT EXISTS provider_cache (
  provider TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (provider, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_cache_expires_at ON provider_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_provider_cache_provider ON provider_cache (provider);
