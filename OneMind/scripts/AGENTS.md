# Scripts & Codegen

Codegen pipeline orchestrating module manifests, Rust-to-TS bindings, and SDK generation.

## Overview
Compiles TypeScript automation tools to `.dist/` to drive the multi-language build process.

## Where to Look

| Script | Purpose | Key Dependency |
|--------|---------|----------------|
| `module-cli.ts` | Entry point for module creation & selective codegen | Root `package.json` |
| `gen-types.ts` | Exports Rust types via Specta + aggregates module types | `export_bindings` bin |
| `gen-bridge.ts` | Generates TS bridge interfaces from Rust introspection | `bridge-introspect` bin |
| `gen-modules.ts` | Validates/collects `manifest.json` into a single registry | `ajv` (JSON Schema) |
| `gen-sdk.ts` | Creates typed module SDKs and HTTP/WS clients | `bridge-introspect` |

## Codegen Flow

1. **`npm run scripts:build`**: Compiles `scripts/*.ts` to `.dist/` via `tsc`.
2. **`npm run gen`**: Executes the sequential pipeline:
    - **Bindings**: `cargo run --bin export_bindings` -> `tauri-bindings.ts`.
    - **Types**: `gen-types.ts` exports module-specific Rust types.
    - **Bridge**: `gen-bridge.ts` reads Rust metadata -> `BridgeInterface.ts`.
    - **Registry**: `gen-modules.ts` crawls `/modules` -> `modules.ts`.
    - **SDK**: `gen-sdk.ts` generates per-module SDKs in `src-react`.

## Outputs

- `src-ts/core/generated/`: `tauri-bindings.ts`, `BridgeInterface.ts`, `types/*.ts`
- `src-ts/shared/generated/modules.ts`: The unified module registry
- `src-react/src/generated/sdk/`: Per-module typed TS clients
- `scripts/.dist/`: Compiled JS scripts for execution

## Conventions

- **CI Guard**: `npm run gen:check` must pass (enforces no drift in generated files).
- **Manual Edits**: NEVER edit files in `generated/` folders; they are overwritten.
- **Sidecar Prep**: `compile-bun-sidecar.ts` handles the Bun binary bundling for Tauri.
- **Dependencies**: Scripts must be compiled before running (`npm run scripts:build`).
