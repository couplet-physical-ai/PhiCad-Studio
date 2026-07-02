---
name: db-migration
description: Create Drizzle ORM schemas, migrations, and repositories for OneMind. Use when adding new database tables, modifying schema, or creating data access patterns.
allowed-tools: Read, Write, Edit, Glob, Bash(npm run db:*), Bash(bun *)
metadata:
  audience: backend-developer
  workflow: implementation
  complexity: medium
---

# Database Schema Expert

## Role

You are a **Drizzle ORM Specialist** for OneMind's SQLite database. You understand:
- Table schema patterns with UUID v7, timestamps, soft delete
- Repository pattern extending BaseRepository
- Migration generation and application workflow
- Type-safe query building

## Objective

Create database changes that:
1. Follow established schema patterns (helpers, naming)
2. Generate clean migrations
3. Include properly typed repository
4. Register in DatabaseAccess for DI

## Success Criteria

Database change is complete when:
- [ ] Schema file created with proper helpers
- [ ] Exported from `schema/index.ts`
- [ ] Migration generated and reviewed
- [ ] Repository created extending BaseRepository
- [ ] Registered in `DatabaseAccess` class
- [ ] Migration applied successfully

## Directory Structure

```
src-ts/
├── drizzle/
│   └── migrations/        # Generated SQL (NEVER edit manually)
└── src/db/
    ├── schema/
    │   ├── index.ts       # Export all schemas
    │   ├── helpers.ts     # uuidPrimaryKey, timestamps, softDelete
    │   └── <entity>.ts    # Table definitions
    └── repositories/
        ├── base-repository.ts
        └── <entity>-repository.ts
```

## Workflow (Chain-of-Thought)

### Step 1: Create Schema File

```typescript
// src-ts/src/db/schema/<entity>.ts
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { uuidPrimaryKey, timestamps, softDelete } from "./helpers";

export const myEntities = sqliteTable("my_entities", {
  ...uuidPrimaryKey,  // id: UUID v7 primary key

  // Required fields
  name: text("name").notNull(),

  // Optional fields
  description: text("description"),

  // Foreign keys (always notNull unless truly optional)
  chatId: text("chat_id").notNull().references(() => chats.id),

  // Enums as text with type safety
  status: text("status", { enum: ["pending", "active", "done"] })
    .notNull()
    .default("pending"),

  // JSON columns with type
  metadata: text("metadata", { mode: "json" }).$type<MyMetadata>(),

  ...timestamps,  // createdAt, updatedAt
  ...softDelete,  // deletedAt
});

// ALWAYS export these types
export type MyEntity = typeof myEntities.$inferSelect;
export type NewMyEntity = typeof myEntities.$inferInsert;
```

### Step 2: Export from Index

```typescript
// src-ts/src/db/schema/index.ts
export * from "./my-entity";  // ADD THIS LINE
```

### Step 3: Generate Migration

```bash
npm run db:generate
# Creates: src-ts/drizzle/migrations/XXXX_descriptive_name.sql
```

### Step 4: Review Generated SQL

```sql
-- VERIFY: Table name matches, columns correct, foreign keys present
CREATE TABLE `my_entities` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  ...
);
```

### Step 5: Create Repository

```typescript
// src-ts/src/db/repositories/my-entity-repository.ts
import { eq, desc, isNull, and } from "drizzle-orm";
import { BaseRepository } from "./base-repository";
import { myEntities, type MyEntity, type NewMyEntity } from "../schema";
import type { Database } from "../types";

export class MyEntityRepository extends BaseRepository<
  typeof myEntities,
  MyEntity,
  NewMyEntity
> {
  constructor(db: Database) {
    super(db, myEntities);
  }

  // Custom queries - follow this pattern
  async findByChat(chatId: string): Promise<MyEntity[]> {
    return this.db
      .select()
      .from(this.table)
      .where(and(
        eq(myEntities.chatId, chatId),
        isNull(myEntities.deletedAt)  // Always filter soft deleted
      ))
      .orderBy(desc(myEntities.createdAt));
  }

  async findActive(): Promise<MyEntity[]> {
    return this.db
      .select()
      .from(this.table)
      .where(and(
        eq(myEntities.status, "active"),
        isNull(myEntities.deletedAt)
      ));
  }
}
```

### Step 6: Register in DatabaseAccess

```typescript
// src-ts/src/db/index.ts
import { MyEntityRepository } from "./repositories/my-entity-repository";

export class DatabaseAccess {
  // ... existing code ...

  // ADD: Lazy-initialized repository
  private _myEntities?: MyEntityRepository;
  get myEntities(): MyEntityRepository {
    return (this._myEntities ??= new MyEntityRepository(this.db));
  }
}
```

### Step 7: Apply Migration

```bash
npm run db:migrate
npm run db:studio  # Verify in GUI
```

## Examples

### Example 1: Tags Table with Many-to-Many

**Request:** "Add tags for chat messages"

**Schema:**
```typescript
// schema/tags.ts
export const tags = sqliteTable("tags", {
  ...uuidPrimaryKey,
  name: text("name").notNull().unique(),
  color: text("color").default("#808080"),
  ...timestamps,
});

// Junction table
export const messageTags = sqliteTable("message_tags", {
  messageId: text("message_id").notNull().references(() => messages.id),
  tagId: text("tag_id").notNull().references(() => tags.id),
}, (table) => ({
  pk: primaryKey({ columns: [table.messageId, table.tagId] }),
}));
```

### Example 2: Upsert Pattern

```typescript
async upsert(data: NewMyEntity): Promise<MyEntity> {
  const [result] = await this.db
    .insert(myEntities)
    .values(data)
    .onConflictDoUpdate({
      target: myEntities.id,
      set: {
        ...data,
        updatedAt: new Date().toISOString(),
      },
    })
    .returning();
  return result!;
}
```

### Example 3: Soft Delete with Restore

```typescript
async softDelete(id: string): Promise<void> {
  await this.db
    .update(myEntities)
    .set({ deletedAt: new Date().toISOString() })
    .where(eq(myEntities.id, id));
}

async restore(id: string): Promise<void> {
  await this.db
    .update(myEntities)
    .set({ deletedAt: null })
    .where(eq(myEntities.id, id));
}
```

## Helpers Reference

```typescript
// helpers.ts - USE THESE, don't reinvent
export const uuidPrimaryKey = {
  id: text("id").primaryKey().$defaultFn(() => uuidv7()),
};

export const timestamps = {
  createdAt: text("created_at").notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at").notNull().$defaultFn(() => new Date().toISOString()),
};

export const softDelete = {
  deletedAt: text("deleted_at"),
};
```

## Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run db:generate` | Generate migration from schema diff |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Open Drizzle Studio GUI |
| `npm run db:push` | Push schema directly (dev only, no migration) |

## Constraints

**NEVER:**
- Edit generated migration files manually
- Use UUID v4 (always v7 for time-ordering)
- Create nullable foreign keys without strong justification
- Use `as any` in queries - fix the types
- Skip `softDelete` helper on user-facing entities
- Forget to export types from schema file

**ALWAYS:**
- Use spread helpers: `...uuidPrimaryKey`, `...timestamps`, `...softDelete`
- Export both `Entity` and `NewEntity` types
- Filter `isNull(deletedAt)` in queries
- Use `and()` for multiple where conditions
- Register repository in DatabaseAccess with lazy initialization

## Output Format

When creating a new entity:

```markdown
## Schema

**Table:** `<table_name>`
**File:** `src-ts/src/db/schema/<name>.ts`

```typescript
<schema code>
```

## Repository

**File:** `src-ts/src/db/repositories/<name>-repository.ts`

```typescript
<repository code>
```

## Registration

**File:** `src-ts/src/db/index.ts`

```typescript
<DatabaseAccess addition>
```

## Commands

```bash
npm run db:generate
npm run db:migrate
```
```
