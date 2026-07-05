-- S6 cloud chat mode: proposals mirrored from cloud-copilot runs carry their
-- origin plus the cloud run/proposal ids needed for the idempotent `/applied`
-- callback after a local apply. Existing rows default to 'local'. The unique
-- index dedupes a re-streamed `copilot.proposal.created` frame (SSE resume can
-- redeliver) the same way (design_id, action_id) backstops local dedup in 0010.
ALTER TABLE assistant_write_proposal ADD COLUMN origin TEXT NOT NULL DEFAULT 'local';
--> statement-breakpoint
ALTER TABLE assistant_write_proposal ADD COLUMN cloud_run_id TEXT;
--> statement-breakpoint
ALTER TABLE assistant_write_proposal ADD COLUMN cloud_proposal_id TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_write_proposal_cloud
  ON assistant_write_proposal(design_id, cloud_proposal_id)
  WHERE cloud_proposal_id IS NOT NULL;
