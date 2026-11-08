-- NicoValBolaLibre shared configuration database
CREATE TABLE IF NOT EXISTS shared_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{"schemaVersion":1,"stations":[],"sources":{},"teamLogoOverrides":{}}'
);

INSERT OR IGNORE INTO shared_config (id, revision, updated_at, config_json)
VALUES (1, 0, '', '{"schemaVersion":1,"stations":[],"sources":{},"teamLogoOverrides":{}}');
