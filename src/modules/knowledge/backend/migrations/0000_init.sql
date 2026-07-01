CREATE TABLE IF NOT EXISTS knowledge_page (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  parent_id TEXT,
  is_project_root INTEGER DEFAULT 0,
  order_key TEXT NOT NULL,
  title TEXT NOT NULL,
  icon TEXT,
  properties_json TEXT DEFAULT '{}',
  content_engine TEXT NOT NULL DEFAULT 'tiptap',
  content_version INTEGER NOT NULL DEFAULT 1,
  content_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_kp_workspace_project ON knowledge_page(workspace_id, project_id);
CREATE INDEX IF NOT EXISTS idx_kp_parent ON knowledge_page(parent_id);
CREATE INDEX IF NOT EXISTS idx_kp_deleted ON knowledge_page(deleted_at);
CREATE INDEX IF NOT EXISTS idx_kp_title ON knowledge_page(title);
CREATE INDEX IF NOT EXISTS idx_kp_order ON knowledge_page(parent_id, order_key);
