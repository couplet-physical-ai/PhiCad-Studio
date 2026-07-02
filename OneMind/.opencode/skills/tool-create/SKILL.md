---
name: tool-create
description: Create AI tools for OneMind's tool system. Use when adding new tools for LLM function calling — both core kernel tools and module-scoped tools.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(bun test *)
metadata:
  audience: backend-developer
  workflow: implementation
  complexity: medium
---

# AI Tool System Developer

## Role

You are an **AI Tool System Developer** for OneMind. You understand:
- ToolSpec metadata, input/output schemas, and versioning
- Handler factory patterns with service injection
- Namespace enforcement and scope-based registration
- Runtime validation via AJV and declarative guards
- Provider-agnostic tool execution and error handling

## Objective

Create tools that integrate into OneMind's tool system with:
1. Proper validation via JSON Schema
2. Strict namespace enforcement (core vs module)
3. Service-injected handlers for clean execution
4. Declarative guards for context requirements
5. Provider compatibility via standard ToolSpec format

## Success Criteria

AI tool implementation is complete when:
- [ ] ToolSpec defined with correct namespace (regex: `/^[a-z][a-z0-9-]*\..+$/`)
- [ ] Handler factory implemented with service injection
- [ ] Tool registered (core via DI setup.ts / module via onActivate)
- [ ] Namespace validates against scope and moduleId
- [ ] Guards configured (e.g., requireWorkspaceContext)
- [ ] Tests pass (spec shape, registry integration, handler behavior)

## Directory Structure

```
# Core tools
src-ts/shared/types/tool-spec.types.ts     # ToolSpec interface
src-ts/shared/types/tool-error.types.ts    # ToolError, createToolError
src-ts/shared/types/tool.types.ts          # ToolHandler, RegisteredTool
src-ts/src/domain/services/tools/          # Registry, Catalog, Dispatcher, Guards
src-ts/src/core/di/setup.ts                # Core tool registration

# Module tools
modules/<id>/ts/tools/<tool-name>.ts       # ToolSpec + handler factory
modules/<id>/ts/module.ts                  # Registration in onActivate
```

## Workflow (Chain-of-Thought)

### Step 1: Define ToolSpec

Define the tool's metadata and input schema. Use `additionalProperties: true` to allow the dispatcher to inject context fields like `workspace_id`.

```typescript
import type { ToolSpec } from "@shared/types/tool-spec.types";
import { requireWorkspaceContext } from "@/domain/services/tools/tool-guards";

export const myToolSpec: ToolSpec = {
  name: "my-module.do_something",  // Format: <namespace>.<name>
  scope: "module",                 // "core" | "module"
  version: "1.0",
  description: "Clear description for the LLM to understand when to use this tool",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "What this param does" },
    },
    required: ["param1"],
    additionalProperties: true,    // CRITICAL: Allow context injection
  },
  guards: [requireWorkspaceContext()], // Declarative validation
};
```

### Step 2: Implement Handler Factory

Use a factory function to inject required services into the handler.

```typescript
import type { ToolHandler } from "@shared/types/tool.types";

export function createMyToolHandler(service: MyService): ToolHandler {
  return {
    execute: async (args, context?) => {
      // 1. Extract and validate args (don't trust raw args)
      const param1 = args.param1;
      if (typeof param1 !== "string") {
        throw new Error("param1 required");
      }

      // 2. Call service
      const result = await service.doSomething(param1);

      // 3. Return structured result
      return { success: true, data: result };
    },
  };
}
```

### Step 3: Register Tool

**Module registration** (in `module.ts` onActivate):
```typescript
async onActivate(ctx) {
  if (ctx.core.toolRegistry) {
    ctx.core.toolRegistry.registerTool(
      myToolSpec,
      createMyToolHandler(myService),
    );
  }
}
```
*Note: ModuleLoader auto-tracks disposers for cleanup on module unload.*

**Core registration** (in `src-ts/src/core/di/setup.ts`):
```typescript
container.registerSingleton(TOKENS.ToolRegistry, (c) => {
  const registry = new ToolRegistry();
  registry.register(MY_TOOL_SPEC, {
    execute: async (args, context) => {
      // handler implementation
    },
  });
  return registry;
});
```

### Step 4: Write Tests

Follow the 3-describe-block pattern:

```typescript
describe("my-tool", () => {
  describe("ToolSpec structure", () => {
    it("has correct shape and namespace", () => { /* ... */ });
  });

  describe("ToolRegistry integration", () => {
    it("registers and validates namespace", () => { /* ... */ });
  });

  describe("handler behavior", () => {
    it("executes successfully with valid args", () => { /* ... */ });
    it("throws on invalid args", () => { /* ... */ });
  });
});
```

## Examples

### Example 1: Module Tool (knowledge.create_page)

**File:** `modules/knowledge/ts/tools/create-page-tool.ts`

```typescript
export const createPageToolSpec: ToolSpec = {
  name: "knowledge.create_page",
  scope: "module",
  version: "1.0",
  description: "Create a knowledge page and optionally apply markdown content.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Page title." },
      content_markdown: { type: "string", description: "Optional markdown content." },
    },
    required: ["title"],
    additionalProperties: true,
  },
  guards: [requireWorkspaceContext()],
};

export function createCreatePageToolHandler(pageService: PageService): ToolHandler {
  return {
    execute: async (args) => {
      const workspaceId = args.workspace_id;
      if (typeof workspaceId !== "string") throw new Error("workspace_id required");
      
      const page = await pageService.createPage({
        workspace_id: workspaceId,
        title: args.title as string,
      });
      return { page };
    },
  };
}
```

### Example 2: Core Tool (core.edit_content)

**File:** `src-ts/src/domain/services/tools/edit-content-tool.ts`

```typescript
export const EDIT_CONTENT_SPEC: ToolSpec = {
  name: "core.edit_content",
  version: "1.0",
  scope: "core",
  description: "Edit, modify, update, or change content in a page or document.",
  inputSchema: {
    type: "object",
    properties: {
      mode: { type: "string", enum: ["replace", "append", "generate", "selection"] },
      content: { type: "string" },
    },
    required: ["mode", "content"],
    additionalProperties: true,
  },
  guards: [requireWorkspaceContext()],
};
```

## Key Type References

- **ToolSpec**: `{ name, scope, version, description, inputSchema, guards, providerHints?, outputSchema? }`
- **ToolHandler**: `{ execute(args: Record<string, unknown>, context?: ToolExecutionContext): Promise<unknown> }`
- **ToolGuard**: `{ type: string, validate(context: ToolGuardContext): Promise<GuardResult> }`
- **ToolError**: `{ code, message, phase, retryable, details? }`
- **ToolExecutionContext**: `{ moduleId?, taskId?, activeContext?, provider?, model? }`

## Namespace Rules

- **Core**: `core.*` prefix, scope `"core"`
- **Module**: `<moduleId>.*` prefix, scope `"module"`
- **Validation Regex**: `/^[a-z][a-z0-9-]*\..+$/`
- **Reserved**: `core` namespace is for kernel tools only.
- **Examples**: `core.edit_content`, `knowledge.create_page`

## Guard Reference

- `requireWorkspaceContext()`: Requires `workspaceId` in context.
- `requireProjectContext()`: Requires `projectId` in context.
- `requireAuth()`: Auth check (currently passes always).
- **Important Note**: Guards are declared in ToolSpec but runtime enforcement by the dispatcher is planned but not yet fully implemented. The dispatcher currently validates via AJV schema only. Declare guards anyway for future compatibility.

## Error Handling

Use the `createToolError` factory for structured error responses:

```typescript
import { createToolError } from "@shared/types/tool-error.types";

// Inside handler
if (!args.workspace_id) {
  return createToolError("CONTEXT_MISSING", "workspace_id is required", {
    phase: "validation",
    retryable: true
  });
}
```

**Error Codes:**
- `VALIDATION_FAILED`: Schema mismatch (retryable)
- `CONTEXT_MISSING`: Missing workspace/project ID (retryable)
- `EXECUTION_ERROR`: Logic failure in handler
- `AUTH_REQUIRED`: Permission denied

## Legacy Compatibility

- `ToolDefinition` is the legacy OpenAI-style format.
- `ToolSpec` is the NEW recommended format.
- Registry accepts both via `register()`.
- **Migration**: When migrating, keep legacy registration for backward compatibility if the name changes (e.g., `edit_content` -> `core.edit_content`).

## Constraints

**NEVER:**
- Use `ToolDefinition` for new tools (use `ToolSpec`)
- Use `core.*` namespace for module tools
- Use `as any` casts in handler args — validate types explicitly
- Skip `additionalProperties: true` in inputSchema (blocks context injection)
- Register tools outside of `onActivate` (modules) or DI setup (core)

**ALWAYS:**
- Use factory pattern: `createXxxToolHandler(service): ToolHandler`
- Include `additionalProperties: true` in inputSchema
- Validate args manually in handler (don't trust raw args)
- Use `requireWorkspaceContext()` guard when tool needs workspace
- Write tests with 3 describe blocks (spec, registry, handler)
- Return structured objects from handlers (not raw strings)
- Use `createToolError()` for error responses

## Output Format

Template for documenting a created tool:

```markdown
## Tool: <namespace>.<name>

**File:** `<path>`
**Scope:** core | module

### ToolSpec
```typescript
<spec code>
```

### Handler
```typescript
<handler code>
```

### Registration
```typescript
<registration code>
```

### Tests
```bash
bun test <test-file-path>
```
```
