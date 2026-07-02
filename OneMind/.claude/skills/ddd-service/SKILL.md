---
name: ddd-service
description: Create complete DDD service stack in OneMind Bun sidecar - schema, repository, service, controller. Use when adding new business entities or CRUD functionality.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(npm run *)
metadata:
  audience: backend-developer
  workflow: implementation
  complexity: medium
---

# DDD Service Creator

## Role

You are a **Domain-Driven Design Specialist** for OneMind's Bun sidecar. You create complete service stacks following established patterns:
- Drizzle schema with helpers
- BaseRepository extension
- Domain service with business logic
- Hono controller with HTTP routes

## Objective

Create a complete, working DDD service stack that:
1. Follows existing patterns exactly
2. Integrates with DI container
3. Includes proper typing throughout
4. Is immediately usable after creation

## Success Criteria

Service stack is complete when:
- [ ] Schema created with `uuidPrimaryKey`, `timestamps`, `softDelete`
- [ ] Schema exported from `schema/index.ts`
- [ ] Repository extends BaseRepository
- [ ] Repository registered in DatabaseAccess
- [ ] Service created with repository dependency
- [ ] Service registered in DI container
- [ ] Controller with routes created
- [ ] Controller registered in router

## Layer Structure

```
src-ts/src/
├── db/schema/<entity>.ts           # 1. Table definition
├── db/schema/index.ts              # 2. Export schema
├── db/repositories/<entity>-repository.ts  # 3. Data access
├── db/index.ts                     # 4. Register repository
├── domain/services/<entity>-service.ts     # 5. Business logic
├── core/di/setup.ts                # 6. Register service
├── transport/controllers/<entity>-controller.ts  # 7. HTTP routes
└── transport/router/core-router.ts # 8. Register routes
```

## Workflow (Chain-of-Thought)

### Step 1: Create Schema

```typescript
// src-ts/src/db/schema/favorites.ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { uuidPrimaryKey, timestamps, softDelete } from "./helpers";
import { chats } from "./chats";

export const favorites = sqliteTable("favorites", {
  ...uuidPrimaryKey,
  chatId: text("chat_id").notNull().references(() => chats.id),
  label: text("label"),
  ...timestamps,
  ...softDelete,
});

export type Favorite = typeof favorites.$inferSelect;
export type NewFavorite = typeof favorites.$inferInsert;
```

### Step 2: Export from Index

```typescript
// src-ts/src/db/schema/index.ts
export * from "./favorites";  // ADD THIS
```

### Step 3: Create Repository

```typescript
// src-ts/src/db/repositories/favorite-repository.ts
import { eq, isNull, and, desc } from "drizzle-orm";
import { BaseRepository } from "./base-repository";
import { favorites, type Favorite, type NewFavorite } from "../schema";
import type { Database } from "../types";

export class FavoriteRepository extends BaseRepository<
  typeof favorites,
  Favorite,
  NewFavorite
> {
  constructor(db: Database) {
    super(db, favorites);
  }

  async findByChat(chatId: string): Promise<Favorite[]> {
    return this.db
      .select()
      .from(this.table)
      .where(and(
        eq(favorites.chatId, chatId),
        isNull(favorites.deletedAt)
      ))
      .orderBy(desc(favorites.createdAt));
  }
}
```

### Step 4: Register in DatabaseAccess

```typescript
// src-ts/src/db/index.ts
import { FavoriteRepository } from "./repositories/favorite-repository";

export class DatabaseAccess {
  // ... existing ...

  private _favorites?: FavoriteRepository;
  get favorites(): FavoriteRepository {
    return (this._favorites ??= new FavoriteRepository(this.db));
  }
}
```

### Step 5: Create Service

```typescript
// src-ts/src/domain/services/favorite-service.ts
import type { DatabaseAccess } from "../../db";
import type { Favorite, NewFavorite } from "../../db/schema";

export class FavoriteService {
  constructor(private db: DatabaseAccess) {}

  async create(data: NewFavorite): Promise<Favorite> {
    return this.db.favorites.create(data);
  }

  async findByChat(chatId: string): Promise<Favorite[]> {
    return this.db.favorites.findByChat(chatId);
  }

  async delete(id: string): Promise<void> {
    await this.db.favorites.softDelete(id);
  }

  async toggleFavorite(chatId: string): Promise<Favorite | null> {
    const existing = await this.db.favorites.findByChat(chatId);
    if (existing.length > 0) {
      await this.delete(existing[0]!.id);
      return null;
    }
    return this.create({ chatId });
  }
}
```

### Step 6: Register in DI

```typescript
// src-ts/src/core/di/setup.ts
import { FavoriteService } from "../../domain/services/favorite-service";

export function setupDI(db: DatabaseAccess) {
  // ... existing ...

  const favoriteService = new FavoriteService(db);

  return {
    // ... existing ...
    favoriteService,
  };
}
```

### Step 7: Create Controller

```typescript
// src-ts/src/transport/controllers/favorite-controller.ts
import { Hono } from "hono";
import type { FavoriteService } from "../../domain/services/favorite-service";

export function createFavoriteController(favoriteService: FavoriteService) {
  const app = new Hono();

  app.get("/api/favorites", async (c) => {
    const chatId = c.req.query("chatId");
    if (!chatId) {
      return c.json({ ok: false, error: "chatId required" }, 400);
    }
    const favorites = await favoriteService.findByChat(chatId);
    return c.json({ ok: true, data: favorites });
  });

  app.post("/api/favorites", async (c) => {
    const body = await c.req.json<{ chatId: string; label?: string }>();
    const favorite = await favoriteService.create(body);
    return c.json({ ok: true, data: favorite }, 201);
  });

  app.delete("/api/favorites/:id", async (c) => {
    const id = c.req.param("id");
    await favoriteService.delete(id);
    return c.json({ ok: true });
  });

  app.post("/api/favorites/toggle", async (c) => {
    const { chatId } = await c.req.json<{ chatId: string }>();
    const result = await favoriteService.toggleFavorite(chatId);
    return c.json({ ok: true, data: result });
  });

  return app;
}
```

### Step 8: Register Routes

```typescript
// src-ts/src/transport/router/core-router.ts
import { createFavoriteController } from "../controllers/favorite-controller";

export function createCoreRouter(di: DI) {
  const app = new Hono();

  // ... existing routes ...

  app.route("/", createFavoriteController(di.favoriteService));

  return app;
}
```

## Example: Complete Service for Tags

**Request:** "Create TagService for tagging messages"

**Files Created:**
1. `src-ts/src/db/schema/tags.ts`
2. `src-ts/src/db/repositories/tag-repository.ts`
3. `src-ts/src/domain/services/tag-service.ts`
4. `src-ts/src/transport/controllers/tag-controller.ts`

**Plus modifications to:**
- `src-ts/src/db/schema/index.ts`
- `src-ts/src/db/index.ts`
- `src-ts/src/core/di/setup.ts`
- `src-ts/src/transport/router/core-router.ts`

## Reference Implementations

| Layer | Reference File |
|-------|----------------|
| Schema | `src-ts/src/db/schema/chats.ts` |
| Repository | `src-ts/src/db/repositories/chat-repository.ts` |
| Service | `src-ts/src/domain/services/chat-manager.ts` |
| Controller | `src-ts/src/transport/controllers/chat-controller.ts` |

## Constraints

**NEVER:**
- Put DB queries in controller (use repository)
- Put HTTP logic in service (use controller)
- Skip the DI registration
- Use `as any` for type issues
- Forget to export types from schema

**ALWAYS:**
- Use spread helpers: `...uuidPrimaryKey`, `...timestamps`, `...softDelete`
- Filter `isNull(deletedAt)` in queries
- Return proper HTTP status codes
- Follow existing naming conventions

## Output Format

```markdown
## DDD Service: <EntityName>

### Files Created

1. **Schema:** `src-ts/src/db/schema/<entity>.ts`
2. **Repository:** `src-ts/src/db/repositories/<entity>-repository.ts`
3. **Service:** `src-ts/src/domain/services/<entity>-service.ts`
4. **Controller:** `src-ts/src/transport/controllers/<entity>-controller.ts`

### Files Modified

- `src-ts/src/db/schema/index.ts`
- `src-ts/src/db/index.ts`
- `src-ts/src/core/di/setup.ts`
- `src-ts/src/transport/router/core-router.ts`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/<entities>` | List all |
| POST | `/api/<entities>` | Create |
| DELETE | `/api/<entities>/:id` | Delete |

### Next Steps

```bash
npm run db:generate
npm run db:migrate
```
```
