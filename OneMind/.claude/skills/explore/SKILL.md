# /explore

Fast codebase exploration. Invokes the scout agent (Haiku).

## Usage
```
/explore "message handlers"      # Find implementations
/explore "task system structure" # Show architecture
/explore "where is auth"         # Locate code
```

## What It Does
1. Searches codebase quickly
2. Returns concise, actionable results
3. Uses Haiku model for speed/cost

## When to Use
- Finding files or implementations
- Understanding code structure
- Quick lookups before deeper work
- Locating patterns or conventions

## Output Style
Extremely concise:
```
src-ts/src/domain/services/chat-manager.ts:45 - handleMessage()
src-ts/src/transport/controllers/chat-controller.ts:23 - POST /api/messages
```

## Cost
Uses Haiku - much cheaper than Sonnet for exploration.
