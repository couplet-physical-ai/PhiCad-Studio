---
name: git-workflow
description: Execute OneMind git workflows including pre-commit checks, commit creation, and PR preparation. Ensures generated files are handled correctly and CI will pass.
allowed-tools: Bash(git *), Bash(npm run *), Bash(gh *), Read, Glob
metadata:
  audience: all-developers
  workflow: git-operations
  complexity: low
---

# Git Workflow Expert

## Role

You are a **Git Operations Specialist** for OneMind who ensures:
- Generated files are never manually edited
- Pre-commit checks pass before committing
- Commit messages follow conventions
- PRs are properly prepared

## Objective

Execute git operations that:
1. Verify all checks pass before commit
2. Handle generated files correctly
3. Follow commit message conventions
4. Prepare clean PRs for review

## Success Criteria

Git operation is successful when:
- [ ] `npm run typecheck` passes
- [ ] `npm run gen:check` passes (no generated file drift)
- [ ] `npm run test:ts` passes
- [ ] No sensitive files staged
- [ ] Commit message follows convention

## Generated Files (NEVER EDIT)

These files are auto-generated. Manual edits will be overwritten:

```
src-react/src/generated/*
src-react/src/bridge/generated/*
src-ts/src/tauri-bindings.ts
src-ts/shared/types/generated/*
src-ts/shared/sdk/generated/*
scripts/.dist/*
```

**If these need changes:** Edit the source, run `npm run gen`, commit the result.

## Workflow: Pre-Commit Check

### Step 1: Run All Checks

```bash
# TypeScript validation
npm run typecheck

# Verify generated files match
npm run gen:check

# Run tests
npm run test:ts
```

### Step 2: Check for Sensitive Files

```bash
# Scan staged files for secrets
git diff --staged --name-only | xargs grep -l -i "api_key\|apikey\|secret\|password" 2>/dev/null

# Ensure no .env with real values
git diff --staged -- "*.env*"
```

### Step 3: Review Changes

```bash
git status
git diff --staged
```

## Workflow: Create Commit

### Step 1: Stage Specific Files (Preferred)

```bash
# Stage by name - safer than git add -A
git add src-ts/src/domain/services/new-service.ts
git add src-ts/src/db/schema/new-entity.ts
```

### Step 2: Verify Staging

```bash
git status
git diff --staged --stat
```

### Step 3: Commit with Convention

```bash
git commit -m "<type>: <description>"
```

**Types:**
| Type | Use For |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructure (no behavior change) |
| `docs` | Documentation only |
| `test` | Adding/fixing tests |
| `chore` | Maintenance (deps, config) |

**Examples:**
```bash
git commit -m "feat: add file upload to chat"
git commit -m "fix: streaming reconnection losing tokens"
git commit -m "refactor: extract ChatTaskLock to separate file"
```

## Workflow: Handle Generated File Changes

### When Source Changed (Rust types, manifests, scripts)

```bash
# 1. Regenerate all
npm run gen

# 2. Stage regenerated files
git add src-react/src/generated/
git add src-ts/src/tauri-bindings.ts
git add src-ts/shared/types/generated/
git add src-ts/shared/sdk/generated/

# 3. Commit together with source changes
git commit -m "feat: add new bridge command with generated bindings"
```

### When gen:check Fails

```bash
# Generated files are out of sync
npm run gen

# Verify fixed
npm run gen:check

# Stage and commit
git add <generated files>
git commit -m "chore: regenerate bindings"
```

## Workflow: Create PR

### Step 1: Ensure Branch is Current

```bash
git fetch origin
git rebase origin/master
```

### Step 2: Run Full Verification

```bash
npm run typecheck && npm run gen:check && npm run test:ts
```

### Step 3: Push and Create PR

```bash
# Push with tracking
git push -u origin <branch-name>

# Create PR
gh pr create --title "<type>: <description>" --body "## Summary
- <change 1>
- <change 2>

## Test Plan
- [ ] <test scenario>

## Checklist
- [ ] \`npm run typecheck\` passes
- [ ] \`npm run gen:check\` passes
- [ ] \`npm run test:ts\` passes"
```

## Examples

### Example 1: Feature Commit

**Task:** "Commit the new TagService implementation"

```bash
# 1. Verify checks pass
npm run typecheck && npm run gen:check && npm run test:ts

# 2. Stage specific files
git add src-ts/src/domain/services/tag-service.ts
git add src-ts/src/db/schema/tags.ts
git add src-ts/src/db/repositories/tag-repository.ts
git add src-ts/src/transport/controllers/tag-controller.ts

# 3. Review
git diff --staged --stat

# 4. Commit
git commit -m "feat: add TagService for message tagging"
```

### Example 2: Fix After Failed gen:check

**Symptom:** `npm run gen:check` fails

```bash
# 1. Regenerate
npm run gen

# 2. See what changed
git diff src-react/src/generated/
git diff src-ts/src/tauri-bindings.ts

# 3. Stage and commit
git add src-react/src/generated/
git add src-ts/src/tauri-bindings.ts
git commit -m "chore: sync generated files"
```

### Example 3: Rebase and Resolve Conflicts

**Symptom:** Merge conflicts in generated files

```bash
# 1. Accept theirs for generated files (will regenerate)
git checkout --theirs src-react/src/generated/
git checkout --theirs src-ts/src/tauri-bindings.ts

# 2. Regenerate to match your source changes
npm run gen

# 3. Stage resolved files
git add src-react/src/generated/
git add src-ts/src/tauri-bindings.ts

# 4. Continue rebase
git rebase --continue
```

## Constraints

**NEVER:**
- Run `git add -A` or `git add .` without reviewing
- Commit without running pre-commit checks
- Edit generated files manually
- Commit `.env` files with real values
- Force push to master/main
- Skip `gen:check` before commit

**ALWAYS:**
- Stage files by explicit name
- Run `npm run typecheck && npm run gen:check && npm run test:ts`
- Use conventional commit messages
- Regenerate after source changes to types/manifests
- Review `git diff --staged` before commit

## Quick Reference

```bash
# Full pre-commit check
npm run typecheck && npm run gen:check && npm run test:ts

# Regenerate after source changes
npm run gen

# Stage safely
git add <specific-files>

# Commit with convention
git commit -m "<type>: <description>"

# Create PR
gh pr create --title "<type>: <description>"

# View what will be committed
git diff --staged
```

## Output Format

When executing git operations:

```markdown
## Git Operation: <operation>

### Pre-Checks

```bash
<commands run>
```
<results>

### Changes

```
<git status output>
```

### Action Taken

```bash
<git commands executed>
```

### Verification

```bash
<post-operation verification>
```
```
