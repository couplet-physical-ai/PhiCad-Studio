import { mkdir, writeFile, readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import type { SystemContext, FeedbackMetadata } from "../types.ts";

function getFileExtension(filename: string): string {
  const match = filename.match(/\.([^.]+)$/);
  return match ? `.${match[1]}` : "";
}

export class FileStorageService {
  constructor(private dataDir: string) {}

  get attachmentsDir(): string {
    return join(this.dataDir, "attachments");
  }

  async ensureDir(path: string): Promise<void> {
    await mkdir(path, { recursive: true });
  }

  async saveFeedbackFiles(
    feedbackId: string,
    formData: globalThis.FormData
  ): Promise<{ images: string[]; frontendLogs?: string; backendLogs?: string }> {
    const feedbackDir = join(this.attachmentsDir, feedbackId);
    await this.ensureDir(feedbackDir);

    const images: string[] = [];
    let frontendLogs: string | undefined;
    let backendLogs: string | undefined;

    for (const [key, value] of formData.entries()) {
      const file = value as unknown as File;
      if (!(file instanceof File)) continue;

      if (key.startsWith("image_")) {
        const ext = getFileExtension(file.name) || ".bin";
        const filename = `${key}${ext}`;
        const filepath = join(feedbackDir, filename);
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filepath, Buffer.from(arrayBuffer));
        images.push(filename);
      } else if (key === "frontend_logs") {
        const filepath = join(feedbackDir, "frontend-logs.txt");
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filepath, Buffer.from(arrayBuffer));
        frontendLogs = "frontend-logs.txt";
      } else if (key === "backend_logs") {
        const filepath = join(feedbackDir, "backend-logs.txt");
        const arrayBuffer = await file.arrayBuffer();
        await writeFile(filepath, Buffer.from(arrayBuffer));
        backendLogs = "backend-logs.txt";
      }
    }

    return { images, frontendLogs, backendLogs };
  }

  async getFilePath(feedbackId: string, filename: string): Promise<string | null> {
    const filePath = join(this.attachmentsDir, feedbackId, filename);
    try {
      const fileStat = await stat(filePath);
      if (fileStat.isFile()) return filePath;
      return null;
    } catch {
      return null;
    }
  }

  /** List legacy feedback dirs (for migration) */
  async listLegacyFeedbacks(): Promise<FeedbackMetadata[]> {
    const feedbackDir = join(this.dataDir, "feedback");
    const feedbacks: FeedbackMetadata[] = [];
    try {
      const entries = await readdir(feedbackDir);
      for (const entry of entries) {
        if (!entry.startsWith("feedback-")) continue;
        try {
          const metadataPath = join(feedbackDir, entry, "metadata.json");
          const content = await readFile(metadataPath, "utf-8");
          feedbacks.push(JSON.parse(content));
        } catch {
          // skip corrupted
        }
      }
    } catch {
      // no legacy dir
    }
    return feedbacks;
  }

  /** Copy legacy feedback files to new attachments dir */
  async migrateLegacyFiles(feedbackId: string): Promise<void> {
    const oldDir = join(this.dataDir, "feedback", feedbackId);
    const newDir = join(this.attachmentsDir, feedbackId);

    try {
      const entries = await readdir(oldDir);
      await this.ensureDir(newDir);
      for (const entry of entries) {
        if (entry === "metadata.json") continue;
        const content = await readFile(join(oldDir, entry));
        await writeFile(join(newDir, entry), content);
      }
    } catch {
      // skip if old dir doesn't exist
    }
  }
}

export function parseSystemContext(jsonString: string): SystemContext | undefined {
  try {
    const parsed = JSON.parse(jsonString);
    if (parsed.windowSize && parsed.screenResolution && parsed.language && parsed.platform) {
      return parsed as SystemContext;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
