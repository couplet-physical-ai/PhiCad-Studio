# /security-audit

Security audit. Invokes the security agent.

## Usage
```
/security-audit                    # Audit recent changes
/security-audit src-ts/infrastructure/  # Audit specific path
```

## What It Does
1. Scans for security vulnerabilities
2. Checks API key handling
3. Validates input sanitization
4. Returns verdict: APPROVE or BLOCK

## When to Use
- Changes to `infrastructure/ai-providers/`
- Auth/authentication changes
- Any code handling secrets/tokens
- Before merging security-sensitive PRs

## Focus Areas
- API key exposure
- Credential handling
- Network binding (0.0.0.0 vs 127.0.0.1)
- Input validation
- Injection vulnerabilities

## Output
```
## Security Audit

### Critical Findings
- file.ts:89 - Issue

### Recommendations
1. ...

## Verdict: BLOCK / APPROVE
```

disable-model-invocation: true
