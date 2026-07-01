-- Mention references embedded in assistant messages.
-- Stores a frozen snapshot of each referenced entity at the time the message was sent.
CREATE TABLE assistant_message_mention (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES assistant_message(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_text TEXT NOT NULL,
  snapshot_data TEXT NOT NULL,
  snapshot_created_at TEXT NOT NULL,
  entity_version TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_mention_message ON assistant_message_mention(message_id);
CREATE INDEX idx_mention_entity ON assistant_message_mention(entity_type, entity_id);
CREATE INDEX idx_mention_entity_type ON assistant_message_mention(entity_type);
