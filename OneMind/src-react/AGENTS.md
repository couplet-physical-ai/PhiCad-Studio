# src-react/ — React 19 Frontend

Vite 7 + React 19 + Tailwind v4 + shadcn/ui. SSE streaming chat interface with module system integration.

## Structure

```
src-react/
├── src/
│   ├── main.tsx             # Entry: providers, Layout
│   ├── components/
│   │   ├── ui/              # shadcn/ui primitives (37 files)
│   │   └── ai-elements/     # Chat components (30 files)
│   ├── hooks/               # useStreamChat, useChat, useMessages
│   ├── contexts/            # BackendURLContext, ThemeProvider
│   ├── layout/              # Layout, TopBar, Sidebars
│   ├── settings/            # Settings panels
│   ├── modules/             # ModuleSpace loader
│   └── generated/           # DO NOT EDIT: codegen outputs
├── index.html               # Pre-FOUC theme script
├── vite.config.ts           # Fixed port 1420, Tailwind v4
└── tailwind.config.ts       # Minimal: dark mode class
```

## Where to Look

| Task | File | Notes |
|------|------|-------|
| Chat streaming | `hooks/useStreamChat.ts` | SSE consumer, reconnection |
| Message UI | `components/ai-elements/message.tsx` | Markdown, code, reasoning |
| Prompt input | `components/ai-elements/prompt-input.tsx` | Attachments, validation |
| Backend URL | `contexts/BackendURLContext.tsx` | Dynamic port discovery |
| Module loading | `modules/ModuleSpace.tsx` | Lazy glob import, cache |
| Settings | `settings/panels/` | API keys, providers |

## SSE Streaming Pattern

```typescript
// useStreamChat.ts
1. POST /api/stream/chat → get taskId, chatId
2. Connect SSE: /api/stream/subscribe/{taskId}
3. consumeSseStream() handles events:
   - token → appendAssistantText
   - reasoning → appendReasoning
   - done → finalize message
   - error → display error
4. recoverFromInterruptedStream() for reconnection
```

**Event types:** token, reasoning, tool_call, tool_result, done, error, model_loading

## Styling

**Tailwind v4** with `@theme` directive in globals.css:
- Dark mode: `class` (not media query)
- Semantic tokens: `--color-background`, `--color-surface`, `--color-primary`
- See `TAILWIND_V4_STYLING_GUIDE.md` for full details

**Component patterns:**
- Use shadcn/ui primitives from `components/ui/`
- Avoid inline Tailwind—use design tokens
- Test dark mode explicitly

## Conventions

- **Path alias**: `@/` → `./src/*`
- **Imports**: `@shared/types`, `@shared/sdk`, `@modules/*`
- **No ESLint**: Only `tsc --noEmit` for validation
- **Prettier + tailwindcss plugin**: Auto-sorts classes

## Anti-Patterns

| Forbidden | Why |
|-----------|-----|
| Edit `generated/*` | Overwritten by codegen |
| Call `@tauri-apps/api` directly | Use bridge or HTTP to Bun |
| Hardcode backend URL | Use BackendURLContext |
| Skip error boundaries | Module crashes shouldn't break app |
