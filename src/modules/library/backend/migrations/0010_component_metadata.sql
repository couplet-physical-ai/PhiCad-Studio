-- 0010_component_metadata.sql
-- Component metadata carried by .opclib packs since @openpcb/opclib-pack 0.3.0:
-- subcategory (e.g. "mosfet-n"), curated datasheet URL, and search keywords.
-- Nullable: components from older packs keep NULL until re-imported.

ALTER TABLE library_components ADD COLUMN subcategory TEXT;
--> statement-breakpoint
ALTER TABLE library_components ADD COLUMN datasheet_url TEXT;
--> statement-breakpoint
ALTER TABLE library_components ADD COLUMN keywords_json TEXT;
