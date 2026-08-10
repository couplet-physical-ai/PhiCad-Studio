-- MCP server switches. Both default OFF: the server opens a scripted path into
-- designs from any local process, so it is opt-in, and advertising write tools
-- is a second, separate opt-in on top of that.
--
-- mcp_enabled     — serve /api/modules/assistant/mcp at all.
-- mcp_allow_writes— advertise effect="write" tools to MCP clients. When 0 the
--                   write tools are not registered, so a client never sees a
--                   tool it would only be refused on.
ALTER TABLE assistant_settings ADD COLUMN mcp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assistant_settings ADD COLUMN mcp_allow_writes INTEGER NOT NULL DEFAULT 0;
