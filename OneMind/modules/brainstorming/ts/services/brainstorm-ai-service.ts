import type { BrainstormRepository } from "../db/repositories/brainstorm-repository";
import { getTaskOrchestrator } from "../../../../src-ts/src/domain/services/queue/task-orchestrator";
import type { AIJob, AIJobKind, ValidationReport } from "../../shared/types";
import { getSystemPrompt, getValidatePrompt, getSubIdeasPrompt, getFeedbackPrompt, getQuestionsPrompt } from "../ai/prompts";
import { generateUUIDv7 } from "../../../../src-ts/src/db/schema/base";

export class BrainstormAIService {
  constructor(private repo: BrainstormRepository) {}

  async createJob(
    boardId: string,
    kind: AIJobKind,
    nodeId?: string,
    inputSnapshot?: unknown
  ): Promise<AIJob> {
    const job = await this.repo.createAIJob({
      board_id: boardId,
      node_id: nodeId,
      kind,
      status: "queued",
      input_snapshot_json: inputSnapshot,
      created_at: new Date(),
      updated_at: new Date(),
    });

    if (nodeId) {
      await this.repo.addJobIdToNode(nodeId, job.id);
    }

    // Trigger processing asynchronously
    this.processJob(job.id, boardId).catch(err => console.error(`[BrainstormAI] Job ${job.id} failed:`, err));

    return job;
  }

  async getJob(id: string): Promise<AIJob | null> {
    return this.repo.findAIJobById(id);
  }

  private async processJob(jobId: string, boardId: string): Promise<void> {
    try {
      await this.repo.updateAIJob(jobId, { status: "running", updated_at: new Date() });
      const job = await this.repo.findAIJobById(jobId);
      if (!job) return;

      let prompt = "";
      const baseSystemPrompt = getSystemPrompt();
      let systemPrompt = baseSystemPrompt;
      let node = null;

      if (job.nodeId) {
        node = await this.repo.findNodeById(job.nodeId);
      }

      if (!node && job.kind !== "validate_cluster" && job.kind !== "export") {
         throw new Error("Node context required");
      }

      // Prepare Prompt
      switch (job.kind) {
        case "validate":
          if (node) prompt = getValidatePrompt(node);
          break;
        case "subideas":
          if (node) prompt = getSubIdeasPrompt(node);
          break;
        case "feedback":
          if (node) prompt = getFeedbackPrompt(node);
          break;
        case "questions":
          if (node) prompt = getQuestionsPrompt(node);
          break;
        default:
          throw new Error(`Unsupported job kind: ${job.kind}`);
      }

      const orchestrator = getTaskOrchestrator();
      const chatManager = orchestrator.getChatManager();

      // Get workspaceId from board
      const board = await this.repo.findBoardById(boardId);
      if (!board) throw new Error("Board not found");

      if (job.kind === "validate") {
        const boardPrompt = board.systemPromptValidation?.trim();
        const nodePrompt = node?.systemPromptValidation?.trim();
        systemPrompt = [baseSystemPrompt, boardPrompt, nodePrompt]
          .filter(Boolean)
          .join("\n\n");
      }

      // Create a temporary chat for this job
      const chat = await chatManager.createChat(
        board.workspaceId,
        {
            title: `Brainstorm Job ${jobId}`,
            provider: "openai", // TODO: Config
            model: "gpt-4o",
            systemPrompt: systemPrompt
        }
      );

      const { task } = await orchestrator.createMessageTask({
        chatId: chat.id,
        provider: "openai",
        model: "gpt-4o",
        userMessage: prompt,
        assistantMessageId: generateUUIDv7(),
        providerOptions: {
            response_format: { type: "json_object" }
        }
      });

      // Subscribe to task completion
      const unsubscribe = orchestrator.onTaskEvent(task.id, async (event) => {
        if (event.type === "task.completed") {
            const result = event.data as any;
            const content = result.data?.content;
            await this.handleJobSuccess(jobId, job.kind, node, content);
            unsubscribe();
        } else if (event.type === "task.failed") {
            const error = event.data as any;
            await this.repo.updateAIJob(jobId, {
                status: "error",
                error: error.message || "Task failed",
                updated_at: new Date()
            });
            unsubscribe();
        }
      });

    } catch (error) {
      await this.repo.updateAIJob(jobId, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        updated_at: new Date(),
      });
    }
  }

  private async handleJobSuccess(jobId: string, kind: AIJobKind, node: any, content: string) {
      if (!content) return;
      let output: unknown = content;
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const jsonString = jsonMatch ? jsonMatch[1] : content;
        if (jsonString) {
          output = JSON.parse(jsonString);
        }
      } catch (e) {
        console.warn("[BrainstormAI] Failed to parse JSON output:", content);
      }

      if (kind === "validate") {
        const report = output as any;
        if (!report || typeof report !== "object" || !report.status || !Array.isArray(report.strengths) || !Array.isArray(report.risks)) {
           await this.repo.updateAIJob(jobId, {
             status: "error",
             error: "Invalid validation report structure: missing status, strengths, or risks",
             updated_at: new Date(),
           });
           return;
        }
      }

      await this.repo.updateAIJob(jobId, {
        status: "done",
        output_json: output,
        updated_at: new Date(),
      });

      if (kind === "validate" && node && typeof output === "object") {
        await this.repo.updateNode(node.id, {
          validation_json: output as ValidationReport
        });
      }
  }
}
