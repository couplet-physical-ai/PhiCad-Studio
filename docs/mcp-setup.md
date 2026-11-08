# Connect an MCP client

PhiCad-Studio ships an MCP server (upstream OpenPCB's assistant module) that exposes design
resources, read tools, and — once explicitly enabled — a small set of write tools. Studio does not
embed a model runtime and does not request, copy, or store model-provider credentials. Any
MCP-capable client with stdio transport support can use the bundled shim.

## Prerequisites

- A running PhiCad-Studio instance (`npm run dev` or a desktop build). Dev builds expose the
  authenticated loopback MCP endpoint for tests, but do not lay out the packaged stdio launcher.
- Your MCP client configured to add a stdio or Streamable HTTP server.

## Configure

1. Open **Settings → MCP client → MCP server**.
2. Enable **MCP server**. Leave writes disabled for read-only discovery.
3. Copy the generated entry into your client's MCP config (protect the file with mode `600`):

```json
{
  "mcpServers": {
    "phicad-studio": {
      "command": "/absolute/path/from/studio/openpcb-mcp"
    }
  }
}
```

4. Restart your client if necessary, then list its available MCP tools.
5. Read `openpcb://studio/capabilities` before selecting a workflow.

The `openpcb-mcp` filename and `openpcb://` resource scheme are retained as compatibility
identifiers from upstream OpenPCB.

## Security behavior

Electron creates a fresh random token each launch and writes the URL, process ID, and token to the
user-data `mcp.json` portfile with mode `0600`. The stdio shim discovers that file and injects the
token into loopback HTTP requests; the token is never copied into client configuration. The
endpoint also rejects missing/wrong tokens and non-loopback browser origins.

The stdio shim inherits its process environment because that is how most MCP clients start stdio
servers, but it forwards no environment values to the Circuit Engine worker. The Circuit Engine is
a separate browser worker with no filesystem, no Electron bridge, no environment, and blocked
`fetch`.

## Read versus write

- **MCP enabled, writes off:** inspect design resources, BOM/ERC/DRC, and authority/engine
  capabilities.
- **Writes on:** supported native write tools are advertised. Successful changes go through native
  commands/history. Circuit JSON materialization (writing a build-preview into the native design)
  is not available in V1 regardless of this setting.

Stop Studio to invalidate the live endpoint. A stale portfile is ignored when its recorded process
is gone.
