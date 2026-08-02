# AGENTS.md

**This repository's agent instructions live in [`CLAUDE.md`](CLAUDE.md).** Read it first — it is the
single entry point and carries the architecture, layer rules, module system, SQLite and command-
pattern invariants, the security model, the MCP server, feature flags and the skills table.

For anything a human and an agent need identically — commands, environment variables, TypeScript
path aliases, module scaffolding, troubleshooting — see [`DEVELOPER.md`](DEVELOPER.md). For PR
process and conventions see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Nested agent files

Three trees carry their own `AGENTS.md`. Each covers **only what is local to that tree** and assumes
you have read `CLAUDE.md`:

| File                                | Covers                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------ |
| `electron/AGENTS.md`                | OS shell: in-process backend hosting, IPC, updater, packaging, MCP discovery, extraResources |
| `src/modules/designer/AGENTS.md`    | Designer conventions and invariants: net identity, pad addressing, DRC extension points, apply semantics, dataset capture |
| `src/modules/library/AGENTS.md`     | Library conventions: built-in seeding, `is_builtin` guards, import-path branches, fixture resolution |

There are no other nested `AGENTS.md` files. If you find one, it predates this consolidation —
`CLAUDE.md` wins.
