# /review

Code review quality gate. Invokes the reviewer agent.

## Usage
```
/review              # Review staged changes
/review src-ts/      # Review specific directory
/review --strict     # Block on any finding
```

## What It Does
1. Analyzes code for quality issues
2. Checks for anti-patterns and violations
3. Runs typecheck and gen:check
4. Returns verdict: APPROVE or BLOCK

## When to Use
- Before committing large changes (>200 lines)
- Before PRs
- When unsure about code quality

## Output
```
## Review Summary

### Critical
- file.ts:42 - Issue description

### High
- ...

## Verdict: BLOCK / APPROVE
```

disable-model-invocation: true
