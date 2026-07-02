# OneMind Knowledge Base

**Generated:** 2026-01-19  
**Commit:** 21724e3  
**Branch:** master

## Overview

Tauri 2 desktop AI chat app: React 19 + Vite 7 frontend, Bun TypeScript sidecar (HTTP/WS kernel), Rust native shell. Tri-layer architecture with HTTP-first communication.

## Architecture

```
React UI (Vite, port 1420)
    ↓ HTTP/WebSocket (dynamic port)
Bun Sidecar (TypeScript backend)
    ↓ stdio JSON-RPC
Rust Core (Tauri window + secrets)
```

**Key insight:** React→Bun via HTTP; Bun→Rust via stdio. Tauri spawns sidecar, manages window/secrets only.

## Structure

```
OneMind/
├── src-react/          # React 19 + Vite 7 + Tailwind v4 (see src-react/AGENTS.md)
├── src-ts/             # Bun sidecar: HTTP kernel, DDD layers (see src-ts/AGENTS.md)
├── src-tauri/          # Rust Tauri: bridge, sidecar spawn (see src-tauri/AGENTS.md)
├── modules/            # Plugin system: manifest.json + ts/module.ts + react/Space.tsx
├── scripts/            # Codegen: module-cli, gen-types, gen-bridge → .dist/
├── schema/             # JSON schemas for manifests
└── docs/               # Architecture docs, specifications
```

## Where to Look

| Task | Location | Notes |
|------|----------|-------|
| Chat streaming | `src-ts/src/domain/services/stream-service.ts` | SSE event bridge |
| Task execution | `src-ts/src/domain/services/queue/task-executor.ts` | Provider streaming |
| AI providers | `src-ts/src/infrastructure/ai-providers/engines/` | OpenAI, Ollama, OpenRouter |
| React hooks | `src-react/src/hooks/useStreamChat.ts` | SSE consumer, message state |
| UI components | `src-react/src/components/ai-elements/` | Message, prompt-input |
| Tauri bridge | `src-tauri/crates/bridge/` | Rust↔TS IPC |
| Module system | `modules/_kit/`, `src-ts/src/modules/` | Creation, loading, lifecycle |
| Database | `src-ts/src/db/` | Drizzle ORM, SQLite, repositories |

## Commands

```bash
# Development
npm run setup              # Install + compile scripts + codegen
npm run dev                # Full stack: Tauri + Bun + Vite
npm run dev:frontend       # Vite only (fastest for UI)

# Codegen (run after Rust/module changes)
npm run gen                # All: modules + bindings + bridge + SDK
npm run gen:check          # CI guard: fails if drift

# Testing
npm run test:ts            # Bun tests in src-ts/
npm run typecheck          # TypeScript validation

# Modules
npm run module:create      # Interactive module creation
npm run module:validate    # Validate manifests

# Database
npm run db:generate        # Generate migrations
npm run db:migrate         # Apply migrations
```

## Conventions

### TypeScript
- Path aliases: `@/` (React), `@shared/types`, `@modules/*`
- Strict mode ON: `noUncheckedIndexedAccess`, `noImplicitOverride`
- ES2022 target, bundler resolution

### Naming
- Files: kebab-case (`.ts`, `.tsx`)
- Components: PascalCase
- Functions/variables: camelCase
- Module IDs: lowercase dotted namespace (`space.hello`)

### Generated Files (DO NOT EDIT)
- `src-react/src/generated/*`
- `src-ts/src/tauri-bindings.ts`
- `src-ts/shared/sdk/generated/*`
- `scripts/.dist/*`

## Anti-Patterns (THIS PROJECT)

| Forbidden | Reason |
|-----------|--------|
| Edit generated files | Overwritten by `npm run gen` |
| `(value as any)` casts | Type safety violations (see OpenAI provider issues) |
| Bind sidecar to `0.0.0.0` | Security: use `127.0.0.1` only |
| Log/persist API keys | Security: in-memory only, Rust stronghold |
| Skip `npm run gen:check` | CI guard for generated file drift |
| Create MessageTask without chat context | Spec violation: load full history first |

## Critical Requirements

1. **Chat context loading**: MessageTask creation MUST load all previous messages
2. **Per-chat serialization**: Only ONE MessageTask per chat executes at a time (ChatTaskLock)
3. **Crash recovery**: Running tasks marked 'paused' on restart, auto-resume
4. **UUID v7**: All entity IDs use time-ordered UUIDs

## Known Issues

| Issue | Location | Status |
|-------|----------|--------|
| Image compression not implemented | `openai.ts:226` | TODO: add sharp library |
| Unsafe `as any` casts in tool calls | `openai.ts:244-253` | Needs type narrowing |
| Dual test directories | `src-ts/test/` + `src-ts/tests/` | Consolidate |
| Manual bridge registration | `src-tauri/src/lib.rs` | TODO: auto-registration |

## Pre-Commit Checklist

- [ ] After `scripts/*.ts` edits: `npm run scripts:build`
- [ ] After Rust `#[specta]` changes: `npm run gen`
- [ ] After module manifest changes: `npm run gen && npm run module:validate`
- [ ] Always: `npm run gen:check`

## OpenCode Configuration

This project uses OpenCode with **oh-my-opencode** plugin for multi-agent orchestration. See `opencode.json` and `oh-my-opencode.json` for full config.

### Plugin: oh-my-opencode

Provides Sisyphus orchestrator, specialized agents, lifecycle hooks, and MCP integrations.

**Key Features:**
- **TODO Continuation Enforcer**: Forces completion of unchecked items
- **Comment Checker**: Prevents excessive AI comments
- **Edit Error Recovery**: Auto-fix lint/type errors after edits
- **Background Agents**: Parallel exploration via `explore` and `librarian`
- **Interactive Terminal**: tmux integration for long-running processes

### Agents

| Agent | Model | Purpose |
|-------|-------|---------|
| `build` (primary) | github-copilot/claude-opus-4.5 | Full development with all tools |
| `plan` (primary) | github-copilot/claude-sonnet-4-5 | Analysis without changes |
| `oracle` (subagent) | github-copilot/gpt-5.1-codex-max | Architecture, debugging, reasoning |
| `frontend-ui-ux-engineer` | opencode/gemini-2.5-pro | Visual/styling changes (Tailwind, React) |
| `explore` | github-copilot/claude-sonnet-4-5 | Fast codebase exploration |
| `librarian` | github-copilot/claude-sonnet-4-5 | External docs, GitHub examples |
| `document-writer` | github-copilot/claude-sonnet-4-5 | README, API docs, AGENTS.md |
| `tauri-specialist` | github-copilot/claude-sonnet-4-5 | Bridge commands, Rust/TS IPC |
| `multimodal-looker` | opencode/gemini-2.5-flash | PDF, image, diagram analysis |

### MCP Integrations

| MCP | Purpose |
|-----|---------|
| `context7` | Official library documentation |
| `websearch` | Web search via Exa |
| `grep_app` | GitHub code search |

### Custom Commands

| Command | Description |
|---------|-------------|
| `/gen` | Run full codegen pipeline |
| `/typecheck` | TypeScript + Rust type checking |
| `/module <name>` | Create new OneMind module |
| `/test [filter]` | Run Bun tests |
| `/dev` | Start development stack |
| `/bridge <task>` | Tauri bridge command work |
| `/task-system` | Analyze task system architecture |
| `/init-deep` | Generate hierarchical AGENTS.md files |

### Skills (On-Demand)

| Skill | Trigger |
|-------|---------|
| `module-create` | Creating OneMind modules |
| `tauri-bridge` | Bridge commands, Specta bindings |
| `task-system` | Task queue, state machine, dependencies |
| `playwright` | Browser automation, testing, screenshots |
| `frontend-ui-ux` | React/Tailwind styling patterns |
| `tool-create` | Creating AI tools for LLM function calling |

### Delegation Pattern (7-Section)

When delegating to subagents, use this structure:

```
1. TASK: Atomic, specific goal
2. EXPECTED OUTCOME: Concrete deliverables
3. REQUIRED SKILLS: Which skill to invoke
4. REQUIRED TOOLS: Explicit tool whitelist
5. MUST DO: Exhaustive requirements
6. MUST NOT DO: Forbidden actions
7. CONTEXT: File paths, patterns, constraints
```
