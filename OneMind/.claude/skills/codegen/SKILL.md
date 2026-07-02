---
name: codegen
description: Run OneMind code generation pipeline. Use after changing modules, Rust types with specta, bridge commands, or scripts. Ensures generated files stay in sync.
allowed-tools: Bash(npm run *), Read, Glob
metadata:
  audience: all-developers
  workflow: build
  complexity: low
---

# Codegen Pipeline Runner

## Role

You are a **Build Pipeline Specialist** who understands OneMind's code generation system. You know:
- What triggers regeneration
- Which files are generated
- How to verify sync status
- How to troubleshoot failures

## Objective

Execute codegen operations that:
1. Regenerate all derived files
2. Verify no drift from committed state
3. Troubleshoot failures

## Success Criteria

Codegen is successful when:
- [ ] `npm run gen` completes without errors
- [ ] `npm run gen:check` passes (no drift)
- [ ] TypeScript compiles: `npm run typecheck`

## Generated Files (NEVER EDIT)

```
src-react/src/generated/              # Module registry
src-react/src/bridge/generated/       # Tauri bindings
src-ts/src/tauri-bindings.ts          # Rust types for TS
src-ts/shared/types/generated/        # Shared types
src-ts/shared/sdk/generated/          # HTTP client SDK
scripts/.dist/                        # Compiled scripts
```

## When to Run Codegen

| Change Type | Run |
|-------------|-----|
| Module `manifest.json` edited | `npm run gen` |
| Module added/removed | `npm run gen` |
| Rust type with `#[specta::specta]` | `npm run gen` |
| Bridge command added | `npm run gen` |
| Script in `scripts/*.ts` | `npm run scripts:build && npm run gen` |
| Before commit | `npm run gen:check` |

## Workflow

### Full Regeneration

```bash
# Regenerate everything
npm run gen
```

**What this runs:**
1. `modules:generate` - Module registry
2. `bindings:generate` - Rust→TS types (Specta)
3. `bridge:generate` - Bridge bindings
4. `sdk:generate` - HTTP client SDK
5. `gen:openapi` - OpenAPI spec
6. `gen:sdk:orval` - Orval SDK

### Verify Sync Status

```bash
# Check if generated files match committed
npm run gen:check
```

**If fails:** Generated files have drifted. Run `npm run gen` and commit.

### Individual Generators

```bash
npm run modules:generate   # Module registry only
npm run types:generate     # Types only
npm run bridge:generate    # Bridge only
```

## Troubleshooting

### Problem: gen:check Fails

**Cause:** Source changed but gen not run.

**Fix:**
```bash
npm run gen
git add src-react/src/generated/
git add src-ts/src/tauri-bindings.ts
# etc.
git commit -m "chore: sync generated files"
```

### Problem: TypeScript Errors After Gen

**Cause:** Type mismatch between generated and source.

**Fix:**
```bash
# Check TypeScript errors
npm run typecheck

# Often need to fix source types, then regen
npm run gen
```

### Problem: Script Changes Not Reflected

**Cause:** Scripts need compilation before gen.

**Fix:**
```bash
npm run scripts:build
npm run gen
```

### Problem: Module Not Appearing

**Cause:** Invalid manifest or not exported.

**Fix:**
```bash
# Validate manifest
npm run module:validate

# Check manifest.json has:
# - apiVersion: 2
# - Valid namespace pattern
# - ui.moduleEntry points to ts/module.ts
```

### Problem: Rust Types Not Generating

**Cause:** Missing specta attribute.

**Fix:**
```rust
// Must have BOTH attributes
#[tauri::command]
#[specta::specta]  // <-- This one!
pub async fn my_command() -> Result<MyType, String> { ... }

// Types must derive specta::Type
#[derive(Serialize, Deserialize, specta::Type)]  // <-- This one!
pub struct MyType { ... }
```

## Command Reference

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `npm run gen` | Full pipeline | After any source change |
| `npm run gen:check` | Verify sync | Before commit, in CI |
| `npm run scripts:build` | Compile scripts | After editing scripts/*.ts |
| `npm run modules:generate` | Module registry | Module changes only |
| `npm run module:validate` | Check manifests | Debug module issues |
| `npm run typecheck` | TS validation | Verify types work |

## Pre-Commit Checklist

```bash
# 1. Ensure scripts compiled (if changed)
npm run scripts:build

# 2. Regenerate all
npm run gen

# 3. Verify no drift
npm run gen:check

# 4. Type check
npm run typecheck

# 5. Ready to commit
```

## Constraints

**NEVER:**
- Edit files in `generated/` directories manually
- Skip gen:check before committing
- Commit generated files that don't match source
- Run gen without scripts:build if scripts changed

**ALWAYS:**
- Run full `npm run gen` after source changes
- Verify with `npm run gen:check`
- Commit generated files together with source changes
- Check typecheck passes after gen

## Output Format

```markdown
## Codegen Result

### Command Run

```bash
<command>
```

### Status

<success/failure>

### Generated Files Changed

<list of files, or "none">

### Verification

```bash
npm run gen:check
# <result>

npm run typecheck
# <result>
```

### Next Steps

<if any issues, steps to resolve>
```
