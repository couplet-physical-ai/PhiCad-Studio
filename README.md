<div align="center">
  <h1>PhiCad-Studio</h1>
  <p><strong>OpenPCB-based visual PCB workspace for schematic capture, PCB layout, design review, and manufacturing export.</strong></p>

  <p>
    <img alt="status" src="https://img.shields.io/badge/status-experimental-orange" />
    <img alt="license" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue" />
    <img alt="platforms" src="https://img.shields.io/badge/platforms-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey" />
  </p>
</div>

---

Created at [Exowatt](https://exowatt.com). Published under the vendor-neutral
[couplet-physical-ai](https://github.com/couplet-physical-ai) organization.

**Built on [OpenPCB](https://github.com/OpenPCB-app/OpenPCB).** PhiCad-Studio preserves OpenPCB's
local ECS, command history, DRC, library snapshots, and manufacturing export, and adds a bounded,
offline Circuit JSON preview on top. Fork source, history, the upstream source link, original
copyright notices, [`LICENSE`](LICENSE), and [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)
retain their AGPL-3.0-or-later terms.

Studio takes a board from idea to fabrication in one local workspace: draw the schematic, lay out
the PCB, check it against manufacturing rules, and export the files your fab house asks for.

## Status

**Experimental.** This OpenPCB fork carries generic improvements as a patch on upstream history.
A release workflow is present, but no releases or downloadable artifacts have been published yet;
run it from source (below). No support commitment.

## What this fork adds over upstream OpenPCB

- **Circuit JSON preview** (`src/shared/tscircuit-runtime/`): a lazy, offline, sandboxed worker
  that validates externally supplied [Circuit JSON](https://github.com/tscircuit/tscircuit) and
  renders a read-only build preview. It never writes to the native design, never evaluates code,
  and makes no network request. This is preview-only: native DRC, layout, and manufacturing export
  remain OpenPCB's own, unmodified authority.
- A handful of upstream-style fixes and hardening carried over from the private fork history (see
  `git log` for the individual patch commits on top of the upstream merge base).

## Install and run

Node.js 22+ and [Bun](https://bun.sh) are required; this is a source checkout, not a packaged app.

```bash
npm ci
npm run dev           # backend (Bun) + frontend (Vite), browser mode
# or
npm run build && npm run dev:electron   # desktop shell
```

See [`DEVELOPER.md`](DEVELOPER.md) for the full command list, environment variables, and module
layout (most of it is unmodified upstream OpenPCB documentation).

## What the OpenPCB foundation provides

**Schematic capture.** Place symbols, route wires on a Manhattan grid, add net labels and
junctions. Nets are extracted from geometry, ERC runs over the result, and edits go through
commands with inverse patches so undo and redo survive restart.

**PCB layout.** Route traces in Manhattan and 45° modes, place vias with a layer switch, inspect
the ratsnest, and draw a board outline. Placements synchronize from the schematic so layout
reflects the native netlist.

**Design rule checking.** Native DRC runs live and as a batch check with fabricator profiles,
net-class-aware clearances, electrical checks, and stable violation identities.

**Manufacturing export.** Gerber X2, Excellon drill, bill of materials, and pick-and-place can be
bundled into a ZIP. Only the native design is fabrication-authoritative; the Circuit JSON preview
can never enable or claim this export.

**Component library and 3D.** The built-in OpenPCB library includes symbols, footprints, and 3D
models (`resources/core-library/` — an upstream OpenPCB asset, kept with upstream attribution).
Studio retains KiCad library import, IPC-7351B footprint generation, built-in editors, and
STEP-to-GLB preview.

**Cross-platform desktop.** macOS (arm64 and x64), Windows x64, and Linux x64, via Electron.
Historical internal identifiers such as the `openpcb://` deep-link scheme and app-data keys remain
for compatibility with upstream OpenPCB installs.

## MCP / AI agent connection

Packaged and dev builds include an `openpcb-mcp` stdio shim and an in-process Streamable HTTP MCP
server (`src/modules/assistant/backend/mcp/`), both from upstream OpenPCB's own assistant module.
Settings → **MCP client** → **MCP server** lets you enable it (off by default) and copy a ready-made client config
for any MCP client. The shim reads a mode-`0600`, per-launch portfile and forwards an ephemeral
bearer token; it does not read or store model-provider credentials. See
[`docs/mcp-setup.md`](docs/mcp-setup.md) for setup steps.

Settings → **MCP client** exposes only this protected bridge; there is no in-app model chat or
OpenAI-compatible endpoint configuration in the panel. Connect your own MCP client and manage its
model credentials outside Studio.

## Known limitations

- Circuit JSON validation is structural/build-preview only: copper, pours, keepouts, slots,
  cutouts, courtyards, layer-stack semantics, and connectivity are reported as blockers for native
  materialization rather than silently discarded. There is no write path from the preview into the
  native design.
- The bundled `resources/core-library/openpcb-core-library-0.1.0-beta.1.opclib` has no signature
  recognized by this build's trust check; a from-source run still works, but packaged-build
  signature verification (an upstream OpenPCB feature) will show `no-signature` until OpenPCB
  itself ships a signed archive.
- Builds here are from source only; this fork does not currently publish signed, packaged
  releases.

## License and attribution

Distributed under **AGPL-3.0-or-later**; see [`LICENSE`](LICENSE) for the full text. OpenPCB and
its contributors retain their copyright and upstream history — this repository is a fork, not a
derivative identity, and does not use OpenPCB's name or logo as its own branding. Network users
interacting with a modified, served build of this AGPL software are entitled to corresponding
source for that exact build; this repository **is** that source.

Circuit JSON preview dependencies and their licenses are listed in
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Documentation

| Document | For |
| --- | --- |
| [`DEVELOPER.md`](DEVELOPER.md) | Upstream architecture and command reference |
| [`docs/designer/`](docs/designer/) | Schematic/PCB implementation notes (mostly upstream) |
| [`SECURITY.md`](SECURITY.md) | Vulnerability reporting |

For upstream OpenPCB behavior, see [OpenPCB-app/OpenPCB](https://github.com/OpenPCB-app/OpenPCB).

## Contributing

See [CONTRIBUTING](https://github.com/couplet-physical-ai/.github/blob/main/CONTRIBUTING.md). Contributions
require DCO sign-off (`git commit -s`); no CLA is required.

## Security

Please report vulnerabilities privately using
[GitHub private vulnerability reporting](https://github.com/couplet-physical-ai/PhiCad-Studio/security/advisories/new),
or contact software@exowatt.com. See the
[security policy](https://github.com/couplet-physical-ai/.github/blob/main/SECURITY.md); do not open a public
issue.
