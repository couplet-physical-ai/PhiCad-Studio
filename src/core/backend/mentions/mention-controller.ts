import { z } from "zod";
import type { RequestContext } from "../http/request-context";
import { success } from "../http/response";
import { MentionRegistry } from "./mention-registry";
import type {
  MentionSearchResponse,
  MentionStalenessResponse,
  MentionStalenessInfo,
} from "./types";

const MentionSearchSchema = z.object({
  query: z.string().min(0).max(200),
  workspaceId: z.string().min(1).max(64),
  chatId: z.string().min(1).max(64).optional(),
  limit: z.number().int().positive().max(50).optional(),
  entityTypes: z.array(z.string().min(1).max(50)).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

const MentionStalenessSchema = z.object({
  mentions: z
    .array(
      z.object({
        entityType: z.string().min(1).max(50),
        entityId: z.string().min(1).max(64),
        snapshotCreatedAt: z.string().min(1),
      }),
    )
    .max(100),
});

const ResolveParamsSchema = z.object({
  entityType: z.string().min(1).max(50),
  entityId: z.string().min(1).max(64),
});

export class MentionController {
  async search(ctx: RequestContext): Promise<Response> {
    const body = (ctx.validated.body ?? {}) as z.infer<
      typeof MentionSearchSchema
    >;

    const registry = MentionRegistry.get();
    const results = await registry.search(
      {
        query: body.query,
        workspaceId: body.workspaceId,
        chatId: body.chatId,
        limit: body.limit ?? 10,
        filters: body.filters,
      },
      body.entityTypes,
    );

    const response: MentionSearchResponse = {
      results,
      hasMore: results.length >= (body.limit ?? 10),
    };

    return success(response);
  }

  async resolve(ctx: RequestContext): Promise<Response> {
    const params = ctx.validated.params as z.infer<typeof ResolveParamsSchema>;
    const workspaceId = ctx.query.get("workspaceId") ?? "";

    if (!workspaceId) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "workspaceId query param required",
        }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const registry = MentionRegistry.get();
    const entity = await registry.resolve(
      params.entityType,
      params.entityId,
      workspaceId,
    );

    if (!entity) {
      return new Response(
        JSON.stringify({ ok: false, error: "Entity not found" }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    return success({ entity });
  }

  async checkStaleness(ctx: RequestContext): Promise<Response> {
    const body = (ctx.validated.body ?? {}) as z.infer<
      typeof MentionStalenessSchema
    >;

    const registry = MentionRegistry.get();
    const results: Record<string, MentionStalenessInfo> = {};

    await Promise.all(
      body.mentions.map(async (mention) => {
        const key = `${mention.entityType}:${mention.entityId}`;
        results[key] = await registry.checkStaleness(
          mention.entityType,
          mention.entityId,
          mention.snapshotCreatedAt,
        );
      }),
    );

    const response: MentionStalenessResponse = { results };
    return success(response);
  }

  async getTypes(_ctx: RequestContext): Promise<Response> {
    const registry = MentionRegistry.get();
    const types = registry.getEntityTypes();
    return success({ types });
  }

  async getNavigationPath(ctx: RequestContext): Promise<Response> {
    const params = ctx.validated.params as z.infer<typeof ResolveParamsSchema>;

    const registry = MentionRegistry.get();
    const path = await registry.getNavigationPath(
      params.entityType,
      params.entityId,
    );

    if (!path) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: "Entity not found or no navigation available",
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      );
    }

    return success({ path });
  }

  static schemas = {
    search: {
      body: MentionSearchSchema,
    },
    resolve: {
      params: ResolveParamsSchema,
    },
    checkStaleness: {
      body: MentionStalenessSchema,
    },
    getNavigationPath: {
      params: ResolveParamsSchema,
    },
  };
}
