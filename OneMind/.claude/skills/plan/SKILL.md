# /plan

Feature design and planning. Quick architect-only or full multi-agent pipeline.

## Usage
```
/plan "add user preferences"      # Quick: architect only
/plan "refactor task system"      # Quick: architect only
/plan --full "integrate provider" # Full: scout→architect→security→reviewer
```

## Modes

### Quick Mode (default)
Invokes architect agent only. Fast design sketch.

### Full Mode (--full flag)
Runs full spec-planner pipeline:
1. Scout - Explore codebase
2. Architect - Design spec
3. Security - Audit design
4. Reviewer - Critique quality

Equivalent to `/spec` command.

## What It Does
1. Analyzes requirements
2. Explores existing patterns
3. Designs implementation approach
4. Identifies risks and dependencies
5. Lists unresolved questions
6. (Full mode) Security audit + quality review

## When to Use
- **Quick mode**: Simple features, fast iteration, early exploration
- **Full mode**: Security-sensitive, complex multi-layer, want validated spec

## Output
```
## Feature: [Name]

### Affected Files
- file1.ts - Purpose
- file2.ts - Purpose

### Implementation Steps
1. Step one
2. Step two

### Dependencies
- Step 2 depends on Step 1

### Risks
- Risk description

### Unresolved Questions
1. Question?
```

## Note
Architect agent is read-only. No code written, only plans.

disable-model-invocation: true
