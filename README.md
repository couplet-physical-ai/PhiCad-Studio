<div align="center">
  <img src="electron/icon.png" alt="OpenPCB" width="120" />
  <h1>OpenPCB</h1>
  <p><strong>Modular, open desktop PCB design suite — schematic capture, PCB layout, and a unified component library in one app.</strong></p>

  <p>
    <img alt="version" src="https://img.shields.io/badge/version-0.1.0--beta-blue" />
    <img alt="license" src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue" />
    <img alt="electron" src="https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white" />
    <img alt="bun" src="https://img.shields.io/badge/Bun-runtime-black?logo=bun&logoColor=white" />
    <img alt="react" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" />
    <img alt="vite" src="https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white" />
    <img alt="tailwind" src="https://img.shields.io/badge/Tailwind-4-38BDF8?logo=tailwindcss&logoColor=white" />
    <img alt="typescript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white" />
  </p>
</div>

---

OpenPCB is a desktop app that takes you from idea → schematic → PCB → fabrication-ready output, in one workspace. No separate tools for schematic capture, layout, and library management — it's all here, and it's free and open.

> Status: pre-1.0, active development. Schematic capture and component library are stable; PCB layout is partially shipped (trace routing, vias, layer switching, live DRC, ratsnest).

## Download

Grab the latest build from [**Releases**](https://github.com/OpenPCB-app/OpenPCB/releases/latest):

| Platform | File                          |
| -------- | ----------------------------- |
| macOS    | `.dmg` / `.zip` (arm64 + x64) |
| Windows  | `Setup.exe`                   |
| Linux    | `.deb` / `.rpm` / `.AppImage` |

Every release ships `SHA256SUMS.txt` — verify your download with `shasum -a 256 -c SHA256SUMS.txt`.

> Builds are currently **unsigned** (beta). macOS Gatekeeper and Windows SmartScreen will warn on first launch — see [Known issues](#known-issues-on-first-launch) below and [`electron/README-BETA-INSTALL.md`](electron/README-BETA-INSTALL.md) for the fix.

## Highlights

- **Schematic capture** — symbol placement, Manhattan wire routing, net labels, junctions, net extraction, ERC scaffolding, full undo/redo.
- **PCB layout** — trace routing (Manhattan + 45°), via placement with layer switch, pad rendering, MST ratsnest, board outline, component placement, live DRC, IPC-2221B-aware net classes.
- **Component library** — symbols, footprints (IPC-7351B preset generator + drawn editor), variants, KiCad `.kicad_sym` / `.kicad_mod` import, built-in seeded components.
- **Fast, modern canvas** — single React Three Fiber renderer shared by every editor, smooth pan/zoom, no lag on large boards.
- **AI Assistant** _(dev preview)_ — OpenAI / Ollama / LM Studio providers, read-only tools today, write-tool scaffolding behind confirm/reject.
- **Cross-platform desktop** — macOS (arm64/x64), Windows x64, Linux x64. Auto-update is live on Windows and Linux; macOS auto-update lands with Developer ID signing.

## Screenshots

> _Screenshots are intentionally omitted in this repo — open the app to see the schematic editor, PCB canvas, and library palette._
>
> _(Placeholder — real screenshots/GIFs of the schematic editor, PCB canvas, and library palette should go here to help new visitors evaluate the app at a glance.)_

## Known issues on first launch

- Binaries in `v0.1.x-beta` are **unsigned**. macOS Gatekeeper and Windows SmartScreen will warn — see [`electron/README-BETA-INSTALL.md`](electron/README-BETA-INSTALL.md).
- Linux AppImage needs `chmod +x` after download.
- `electron-updater` auto-update is not live on macOS yet; install new versions manually there.

## License

OpenPCB is **dual-licensed**:

- **AGPL-3.0-or-later** for community / open-source use. See [`LICENSE`](LICENSE) for the full text.
- **Commercial license** available for organizations that cannot meet AGPL's source-disclosure obligations or who want a license without copyleft requirements. See [`LICENSE-COMMERCIAL.md`](LICENSE-COMMERCIAL.md) — contact `licensing@openpcb.app`.

## For developers

Want to run OpenPCB from source, understand its architecture, or add a module? See [`DEVELOPER.md`](DEVELOPER.md). Want to open a PR? See [`CONTRIBUTING.md`](CONTRIBUTING.md) for setup, conventions, and the pre-PR checklist. By contributing you agree to license your contributions under AGPL-3.0-or-later.

For architecture-shaping changes, open an issue first.
