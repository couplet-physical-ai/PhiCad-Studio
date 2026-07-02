---
name: module-create
description: Create OneMind modules with manifest, React component, and TypeScript entry. Use when building new features that need their own UI space or backend services.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm run *)
metadata:
  audience: fullstack-developer
  workflow: implementation
  complexity: medium
---

# Module Creator

## Role

You are a **Module System Specialist** for OneMind. You create complete modules following the plugin architecture:
- Manifest with proper namespace and API version
- React Space component for UI
- TypeScript module entry with routes/services
- Optional database schema

## Objective

Create a complete, working module that:
1. Follows manifest schema (apiVersion: 2)
2. Uses correct namespace pattern
3. Integrates with module discovery system
4. Passes validation

## Success Criteria

Module is complete when:
- [ ] `manifest.json` created with valid schema
- [ ] `react/Space.tsx` created (for UI modules)
- [ ] `ts/module.ts` exports `ModuleDefinitionV2`
- [ ] `npm run gen` succeeds
- [ ] `npm run module:validate` passes

## Module Structure

```
modules/<module-id>/
├── manifest.json          # Required: metadata and config
├── react/
│   └── Space.tsx          # UI component (for kind: space)
└── ts/
    ├── module.ts          # Required: module definition
    └── db/
        └── schema.ts      # Optional: module-specific tables
```

## Workflow (Chain-of-Thought)

### Step 1: Gather Requirements

Before creating, determine:
- **Module ID:** lowercase with hyphens (e.g., `my-feature`)
- **Namespace:** `onemind.modules.<name>` pattern
- **Kind:** `space` | `service` | `integration` | `widget`
- **Has UI?** If yes, create Space.tsx
- **Has DB?** If yes, create schema.ts

### Step 2: Create Manifest

```json
// modules/my-feature/manifest.json
{
  "id": "my-feature",
  "namespace": "onemind.modules.myfeature",
  "label": "My Feature",
  "description": "Brief description of what this module does",
  "version": "0.1.0",
  "apiVersion": 2,
  "kind": "space",
  "ui": {
    "moduleEntry": "ts/module.ts",
    "icon": "Star"
  }
}
```

**Manifest Rules:**
- `namespace`: Must match `^[a-z][a-z0-9]*(?:\.[a-z0-9]+)+$`
- `apiVersion`: Must be `2`
- `id`: lowercase with hyphens only
- `icon`: Lucide icon name

### Step 3: Create Module Entry

```typescript
// modules/my-feature/ts/module.ts
import { createModuleV2 } from "@modules/_kit/";

export default createModuleV2({
  id: "my-feature",

  // Optional: HTTP routes
  routes: [
    {
      method: "GET",
      path: "/api/modules/my-feature/items",
      handler: async (c) => {
        return c.json({ ok: true, data: [] });
      },
    },
  ],

  // Optional: Background services
  services: [],

  // Optional: Lifecycle hooks
  onLoad: async (ctx) => {
    console.log("Module loaded:", ctx.moduleId);
  },

  onUnload: async () => {
    console.log("Module unloading");
  },
});
```

### Step 4: Create React Component (for kind: space)

```tsx
// modules/my-feature/react/Space.tsx
import { useBackendURL } from "@/context/BackendURLContext";

export function Space() {
  const backendURL = useBackendURL();

  return (
    <div className="flex flex-col h-full p-4">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">My Feature</h1>
        <p className="text-sm text-muted-foreground">
          Description of this space
        </p>
      </header>

      <main className="flex-1">
        {/* Module content */}
      </main>
    </div>
  );
}
```

### Step 5: Create Schema (if needed)

```typescript
// modules/my-feature/ts/db/schema.ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { uuidPrimaryKey, timestamps, softDelete } from "@/db/schema/helpers";

export const myFeatureItems = sqliteTable("my_feature_items", {
  ...uuidPrimaryKey,
  name: text("name").notNull(),
  ...timestamps,
  ...softDelete,
});

export type MyFeatureItem = typeof myFeatureItems.$inferSelect;
export type NewMyFeatureItem = typeof myFeatureItems.$inferInsert;
```

### Step 6: Generate and Validate

```bash
# Regenerate module registry
npm run gen

# Validate manifest
npm run module:validate
```

## Examples

### Example 1: Simple Widget Module

**Request:** "Create a bookmarks module"

**manifest.json:**
```json
{
  "id": "bookmarks",
  "namespace": "onemind.modules.bookmarks",
  "label": "Bookmarks",
  "description": "Save and organize favorite chats",
  "version": "0.1.0",
  "apiVersion": 2,
  "kind": "widget",
  "ui": {
    "moduleEntry": "ts/module.ts",
    "icon": "Bookmark"
  }
}
```

### Example 2: Service-Only Module

**Request:** "Create analytics tracking module (no UI)"

**manifest.json:**
```json
{
  "id": "analytics",
  "namespace": "onemind.modules.analytics",
  "label": "Analytics",
  "description": "Track usage patterns",
  "version": "0.1.0",
  "apiVersion": 2,
  "kind": "service",
  "ui": {
    "moduleEntry": "ts/module.ts"
  }
}
```

**ts/module.ts:**
```typescript
import { createModuleV2 } from "@modules/_kit/";

export default createModuleV2({
  id: "analytics",
  services: [
    {
      name: "analytics-tracker",
      start: async () => {
        // Start tracking
        return { stop: () => { /* cleanup */ } };
      },
    },
  ],
});
```

## Reference Modules

| Module | Kind | Has UI | Has DB |
|--------|------|--------|--------|
| `brainstorming` | space | Yes | Yes |
| `_kit` | - | - | - | (Module utilities)

**Location:** `modules/`

## Module Kit Utilities

```typescript
// Available from @modules/_kit/
import {
  createModuleV2,       // Module factory
  useModuleContext,     // React hook for module context
  ModuleDefinitionV2,   // Type definition
} from "@modules/_kit/";
```

## Constraints

**NEVER:**
- Use `apiVersion: 1` (deprecated)
- Create invalid namespace (must be dotted lowercase)
- Skip manifest validation
- Put module code outside `modules/` directory
- Forget to run `npm run gen` after creation

**ALWAYS:**
- Use `apiVersion: 2`
- Follow namespace pattern: `onemind.modules.<name>`
- Export default from `ts/module.ts`
- Use Lucide icon names
- Run `npm run gen` and `npm run module:validate`

## Output Format

```markdown
## Module: <module-id>

### Manifest

**File:** `modules/<id>/manifest.json`

```json
<manifest content>
```

### Module Entry

**File:** `modules/<id>/ts/module.ts`

```typescript
<module code>
```

### React Component (if applicable)

**File:** `modules/<id>/react/Space.tsx`

```tsx
<component code>
```

### Commands

```bash
npm run gen
npm run module:validate
```

### Next Steps

1. Implement module functionality
2. Add routes if needed
3. Create database schema if needed
```
