-- Dataset capture (WP-D4 / SPEC_ML0_DATASET_FOUNDATION §6): session registry,
-- auto-copper attribution, and the offline-first upload queue. Purely additive.
-- The AutoCopperRegistry lives in SQLite (not in-memory) because undo history
-- survives restarts (designer_session_histories) and two DesignerStore instances
-- share this DB.

create table designer_capture_sessions (
  session_ulid text primary key,
  design_id text not null,
  started_at text not null,
  ended_at text,
  log_dir text not null,
  seq integer not null default 0,
  commands_since_snapshot integer not null default 0,
  bytes_on_disk integer not null default 0,
  capped integer not null default 0
);
create index designer_capture_sessions_design_idx
  on designer_capture_sessions (design_id);

create table designer_capture_autolayout_jobs (
  job_id text primary key,
  design_id text not null,
  applied_candidate_id text,
  capture_session_ulid text not null,
  applied_at text not null,
  snapshot_hash text,
  engine_version text,
  result_summary_json text,
  preexisting_net_copper_json text not null default '{}'
);
create index designer_capture_autolayout_jobs_design_idx
  on designer_capture_autolayout_jobs (design_id);

create table designer_capture_auto_copper (
  geometry_id text primary key,
  design_id text not null,
  kind text not null,
  net_id text,
  job_id text not null,
  applied_candidate_id text,
  created_by_command_id text not null,
  status text not null default 'active',
  touches_json text not null default '[]',
  created_at text not null,
  updated_at text not null
);
create index designer_capture_auto_copper_design_net_idx
  on designer_capture_auto_copper (design_id, net_id);
create index designer_capture_auto_copper_cmd_idx
  on designer_capture_auto_copper (created_by_command_id);

create table designer_capture_upload_queue (
  id text primary key,
  kind text not null,
  payload_path text not null,
  design_id text,
  session_ulid text,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at text,
  last_error text,
  created_at text not null,
  updated_at text not null
);
create index designer_capture_upload_queue_status_idx
  on designer_capture_upload_queue (status, next_attempt_at);
