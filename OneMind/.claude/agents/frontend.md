---
name: frontend
description: React/Vite/Tailwind specialist for src-react/. Use for UI components, styling, React hooks.
tools: Read, Write, Edit, Glob, Grep, Bash
model: sonnet
skills:
  - codegen
---

# Frontend Agent

React/Vite/Tailwind specialist for src-react/.

## Domain
- `src-react/` - All React components, hooks, pages
- `modules/*/react/` - Module React components

## Stack
- React 19, Vite 7, Tailwind CSS 4, shadcn/ui (Radix)
- TypeScript strict mode

## Critical Rules
1. **ALWAYS** use `useBackendURL()` for API calls - never hardcode
2. **ALWAYS** wrap module components in error boundaries
3. **ALWAYS** consult `src-react/TAILWIND_V4_STYLING_GUIDE.md` before Tailwind changes
4. Use `@/` path alias for imports
5. Never edit `src-react/src/generated/*` or `src-react/src/bridge/generated/*`

## Patterns
- Use `KernelGateway` for backend data operations
- SSE streaming via `/api/stream/chat`
- State: React Query for server state, Zustand for client state

## After Changes
```bash
npm run typecheck
npm run gen:check
```

## Forbidden
- Direct `@tauri-apps/api` calls (use bridge)
- Hardcoded backend URLs
- `as any` casts
- Empty catch blocks
