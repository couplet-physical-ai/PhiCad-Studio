---
name: test-module
description: Generate and run tests for OneMind services, repositories, and modules. Use when adding test coverage or verifying functionality works correctly.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(bun test *), Bash(npm run test:*)
metadata:
  audience: all-developers
  workflow: testing
  complexity: medium
---

# Test Generator & Runner

## Role

You are a **Testing Specialist** for OneMind who writes and runs tests following established patterns:
- Bun test framework syntax
- Service/repository testing with real DB
- API integration tests
- Proper setup/teardown

## Objective

Create and run tests that:
1. Follow Bun test syntax (`describe`, `it`, `expect`)
2. Use proper setup/teardown for isolation
3. Cover happy paths and error cases
4. Actually verify the code works

## Success Criteria

Testing is complete when:
- [ ] Tests written following patterns
- [ ] All tests pass: `npm run test:ts`
- [ ] Coverage includes happy path and error cases
- [ ] No test pollution (proper cleanup)

## Test Locations

| Test Type | Location | Pattern |
|-----------|----------|---------|
| Unit tests | Next to source | `*.test.ts` |
| Service tests | `src-ts/src/domain/services/` | `<service>.test.ts` |
| Integration | `src-ts/tests/integration/` | `*.test.ts` |
| API tests | `src-ts/test/` | `*-api.test.ts` |

## Workflow

### Running Tests

```bash
# All tests
npm run test:ts

# Watch mode
npm run test:ts:watch

# Specific directory
cd src-ts && bun test src/domain/services/

# Pattern matching
cd src-ts && bun test --match "TaskOrchestrator"
cd src-ts && bun test --match "should create"
```

### Creating Tests

#### Step 1: Test File Structure

```typescript
// src-ts/src/domain/services/my-service.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { MyService } from "./my-service";
import { createTestDatabase, cleanupTestDatabase } from "../../test/helpers";

describe("MyService", () => {
  let service: MyService;
  let db: DatabaseAccess;

  beforeAll(async () => {
    // One-time setup
    db = await createTestDatabase();
    service = new MyService(db);
  });

  afterAll(async () => {
    // One-time cleanup
    await cleanupTestDatabase(db);
  });

  beforeEach(async () => {
    // Per-test reset
    await db.exec("DELETE FROM my_table");
  });

  describe("create", () => {
    it("should create entity with valid data", async () => {
      // Arrange
      const input = { name: "Test Entity" };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.name).toBe("Test Entity");
    });

    it("should throw on invalid data", async () => {
      // Arrange
      const input = { name: "" };

      // Act & Assert
      expect(service.create(input)).rejects.toThrow("Name required");
    });
  });
});
```

#### Step 2: Test Patterns

**Happy Path:**
```typescript
it("should do X when Y", async () => {
  // Arrange - set up preconditions
  const input = { ... };

  // Act - call the method
  const result = await service.method(input);

  // Assert - verify result
  expect(result).toMatchObject({ ... });
});
```

**Error Case:**
```typescript
it("should throw when invalid", async () => {
  expect(service.method(null)).rejects.toThrow("Expected error");
});
```

**Async with Cleanup:**
```typescript
it("should handle async operation", async () => {
  const entity = await service.create({ name: "test" });

  try {
    const result = await service.process(entity.id);
    expect(result.status).toBe("processed");
  } finally {
    await service.delete(entity.id);
  }
});
```

## Examples

### Example 1: Repository Test

```typescript
// src-ts/src/db/repositories/chat-repository.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { ChatRepository } from "./chat-repository";
import { createTestDb } from "../../test/helpers";

describe("ChatRepository", () => {
  let repo: ChatRepository;
  let db: Database;

  beforeAll(async () => {
    db = await createTestDb();
    repo = new ChatRepository(db);
  });

  afterAll(() => db.close());

  it("should create chat", async () => {
    const chat = await repo.create({ title: "Test Chat" });

    expect(chat.id).toBeDefined();
    expect(chat.title).toBe("Test Chat");
    expect(chat.createdAt).toBeDefined();
  });

  it("should find by id", async () => {
    const created = await repo.create({ title: "Find Me" });
    const found = await repo.findById(created.id);

    expect(found).toBeDefined();
    expect(found!.title).toBe("Find Me");
  });

  it("should soft delete", async () => {
    const chat = await repo.create({ title: "Delete Me" });
    await repo.softDelete(chat.id);

    const found = await repo.findById(chat.id);
    expect(found).toBeNull(); // Soft deleted = not found
  });
});
```

### Example 2: Service Test

```typescript
// src-ts/src/domain/services/tag-service.test.ts
import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { TagService } from "./tag-service";

describe("TagService", () => {
  let service: TagService;

  beforeAll(async () => {
    const db = await createTestDatabase();
    service = new TagService(db);
  });

  beforeEach(async () => {
    // Clear tags between tests
    await service.deleteAll();
  });

  describe("create", () => {
    it("should create tag with name", async () => {
      const tag = await service.create({ name: "important" });
      expect(tag.name).toBe("important");
    });

    it("should reject duplicate names", async () => {
      await service.create({ name: "unique" });
      expect(service.create({ name: "unique" })).rejects.toThrow();
    });
  });

  describe("findOrCreate", () => {
    it("should return existing tag", async () => {
      const created = await service.create({ name: "existing" });
      const found = await service.findOrCreate("existing");

      expect(found.id).toBe(created.id);
    });

    it("should create if not exists", async () => {
      const tag = await service.findOrCreate("new-tag");
      expect(tag.id).toBeDefined();
      expect(tag.name).toBe("new-tag");
    });
  });
});
```

### Example 3: API Integration Test

```typescript
// src-ts/test/chat-api.test.ts
import { describe, it, expect, beforeAll, afterAll } from "bun:test";

describe("Chat API", () => {
  let baseUrl: string;

  beforeAll(async () => {
    // Start test server
    const { port } = await startTestServer();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await stopTestServer();
  });

  describe("GET /api/chats", () => {
    it("should return chat list", async () => {
      const res = await fetch(`${baseUrl}/api/chats`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
    });
  });

  describe("POST /api/chats", () => {
    it("should create chat", async () => {
      const res = await fetch(`${baseUrl}/api/chats`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "API Test Chat" }),
      });
      const data = await res.json();

      expect(res.status).toBe(201);
      expect(data.ok).toBe(true);
      expect(data.data.title).toBe("API Test Chat");
    });
  });
});
```

## Reference Test Files

| Purpose | File |
|---------|------|
| API tests | `src-ts/test/chat-api.test.ts` |
| Service tests | `src-ts/src/domain/services/queue/task-orchestrator.test.ts` |
| Repository tests | `src-ts/src/db/repositories/*.test.ts` |

## Constraints

**NEVER:**
- Share state between tests without cleanup
- Use `any` types in test code
- Skip error case testing
- Leave test data in database
- Use `skip` or `only` in committed code

**ALWAYS:**
- Use Arrange/Act/Assert pattern
- Clean up in `afterAll` or `beforeEach`
- Test both success and failure cases
- Use descriptive test names
- Run full suite before committing

## Output Format

```markdown
## Test: <service/feature>

### Test File

**File:** `<path>`

```typescript
<test code>
```

### Run Tests

```bash
cd src-ts && bun test --match "<pattern>"
```

### Results

```
<test output>
```

### Coverage

- [x] Happy path: <scenario>
- [x] Error case: <scenario>
- [ ] Edge case: <scenario> (TODO)
```
