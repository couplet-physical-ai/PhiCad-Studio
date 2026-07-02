# /spec

Full multi-agent planning pipeline. Produces validated, refined implementation specs.

## Usage
```
/spec "add user preferences"        # Full pipeline
/spec "integrate new AI provider"   # Complex feature design
/spec "refactor authentication"     # Major changes
```

## Pipeline
```
scout (Haiku)     → Explore codebase
     ↓
architect (Sonnet) → Design spec
     ↓
security (Sonnet)  → Audit for vulnerabilities
     ↓
reviewer (Sonnet)  → Critique for quality
     ↓
Refined spec with all feedback
```

## What It Does
1. **Scout** - Fast exploration of relevant code, patterns, similar features
2. **Architect** - Designs full implementation spec with security/quality sections
3. **Security** - Audits proposed design for vulnerabilities (data flow, auth, secrets)
4. **Reviewer** - Critiques for over-engineering, DDD compliance, pattern consistency
5. **Synthesis** - Combines all outputs into refined final plan

## When to Use
- Complex multi-layer features
- Features touching auth/secrets/providers
- Architectural refactoring
- When you want validated spec before implementing
- Before starting work that could have security implications

## Output
```markdown
## Feature: [Name]

### Exploration (Scout)
- Relevant files found
- Similar patterns identified

### Design (Architect)
- Affected files
- Implementation steps
- Security considerations
- Quality checklist

### Security Audit
- Design vulnerabilities identified
- Required mitigations
- Verdict: CONCERNS / APPROVED

### Quality Review
- Over-engineering concerns
- Pattern mismatches
- Missing considerations
- Verdict: NEEDS_WORK / APPROVED

### Final Implementation Plan
[Refined plan addressing all feedback]

### Unresolved Questions
[Combined from all phases]
```

## vs /plan
- `/plan` - Quick, architect-only (fast, less thorough)
- `/spec` - Full pipeline (slower, validated spec)

Use `/spec` for:
- Features touching security-sensitive areas
- When you want confidence in the design
- Multi-layer changes

Use `/plan` for:
- Quick design sketches
- Simpler features
- When you need speed over thoroughness

disable-model-invocation: true
