-- game-server/schema.sql
-- One row per game. `version` is the compare-and-swap token; `json` mirrors it.
-- Apply with:
--   npx wrangler d1 execute arena --file=schema.sql --remote

CREATE TABLE IF NOT EXISTS state (
  kind       TEXT PRIMARY KEY,
  json       TEXT NOT NULL,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO state (kind, json, version, updated_at)
VALUES (
  'ttt',
  '{"board":[null,null,null,null,null,null,null,null,null],"over":false,"line":null,"result":null,"game":1,"record":{"visitors":0,"bot":0,"draws":0},"version":1}',
  1,
  0
);

INSERT OR IGNORE INTO state (kind, json, version, updated_at)
VALUES (
  'chess',
  '{"fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","selected":null,"last":null,"recent":[],"game":1,"record":{"white":0,"black":0,"draw":0},"result":null,"lastMoveByVisitor":null,"lastMoveByIp":null,"version":1}',
  1,
  0
);
