import { tiptapToHTML } from "@modules/_kit/tiptap-to-html";

const MAX_CONTENT_CHARS = 12000;
const MAX_CHUNK_CHARS = 1200;
const MAX_SELECTED_CHUNKS = 6;
const SUMMARY_CHARS = 600;

interface ContentChunk {
  index: number;
  text: string;
}

export interface WriterPromptDocument {
  id: string;
  title: string;
  content_json?: {
    engine?: string;
    version?: number;
    data?: unknown;
  } | null;
  updated_at?: string | null;
}

function splitIntoBlocks(html: string): string[] {
  // Split on block-level tag boundaries
  return html
    .split(/(?=<(?:h[1-6]|p|ul|ol|blockquote|pre|div|hr|table|details)\b)/i)
    .map((block) => block.trim())
    .filter(Boolean);
}

function buildChunks(blocks: string[]): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  let current = "";
  let chunkIndex = 0;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) {
      chunks.push({ index: chunkIndex++, text: trimmed });
    }
    current = "";
  };

  for (const block of blocks) {
    const candidate = current ? `${current}${block}` : block;
    const isHeading = /^<h[1-6]\b/i.test(block);

    if (candidate.length > MAX_CHUNK_CHARS || (isHeading && current)) {
      flush();
      current = block;
      continue;
    }

    current = candidate;
  }

  flush();
  return chunks;
}

function normalizeQueryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3)
    .slice(0, 12);
}

function scoreChunk(chunk: ContentChunk, terms: string[]): number {
  if (terms.length === 0) {
    return 0;
  }

  const lower = chunk.text.toLowerCase();
  let score = 0;

  for (const term of terms) {
    if (lower.includes(term)) {
      score += 3;
    }
  }

  const headingBonus = /^<h[1-6]\b/i.test(chunk.text) ? 2 : 0;
  const earlyChunkBias = Math.max(0, 1 - chunk.index * 0.08);
  return score + headingBonus + earlyChunkBias;
}

function selectRelevantChunks(
  chunks: ContentChunk[],
  userQuery: string,
  maxContentChars: number,
): ContentChunk[] {
  const terms = normalizeQueryTerms(userQuery);

  const ranked = [...chunks]
    .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
    .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index)
    .map((entry) => entry.chunk);

  const pool = terms.length > 0 ? ranked : chunks;
  const selected: ContentChunk[] = [];
  let used = 0;

  for (const chunk of pool) {
    if (selected.length >= MAX_SELECTED_CHUNKS) break;
    if (used + chunk.text.length > maxContentChars) continue;
    selected.push(chunk);
    used += chunk.text.length;
  }

  if (selected.length === 0 && chunks.length > 0) {
    const first = chunks[0];
    if (first) {
      selected.push(first);
    }
  }

  return selected.sort((a, b) => a.index - b.index);
}

function buildContentSection(htmlContent: string, userQuery: string): string {
  if (!htmlContent) {
    return "(Empty document)";
  }

  if (htmlContent.length <= MAX_CONTENT_CHARS) {
    return htmlContent;
  }

  const blocks = splitIntoBlocks(htmlContent);
  const chunks = buildChunks(blocks);
  const selected = selectRelevantChunks(chunks, userQuery, MAX_CONTENT_CHARS);

  const summary = htmlContent.slice(0, SUMMARY_CHARS).trim();
  const summarySuffix = htmlContent.length > SUMMARY_CHARS ? "..." : "";

  const selectedText = selected
    .map((chunk, i) => `[Chunk ${i + 1}]\n${chunk.text}`)
    .join("\n\n");

  const includedChars = selected.reduce((sum, chunk) => sum + chunk.text.length, 0);
  const omittedChars = Math.max(0, htmlContent.length - includedChars);

  return [
    `SUMMARY (truncated preview):\n${summary}${summarySuffix}`,
    `SELECTED CONTEXT CHUNKS (query-aware):\n${selectedText}`,
    `(Additional content omitted: ${omittedChars.toLocaleString()} characters)`,
  ].join("\n\n");
}

function renderDocumentHTML(document: WriterPromptDocument): string {
  const tiptapData = document.content_json?.data;
  if (!tiptapData) {
    return "";
  }

  return tiptapToHTML(tiptapData, {
    excludeImages: true,
    includeStyles: true,
  });
}

export function buildWriterSystemPrompt(
  document: WriterPromptDocument,
  options?: { userQuery?: string },
): string {
  const html = renderDocumentHTML(document);
  const contentSection = buildContentSection(html, options?.userQuery ?? "");
  const updatedAtSection = document.updated_at ? `\nLAST_UPDATED: ${document.updated_at}` : "";
  const charCount = html.length;
  const isEmpty = charCount === 0;
  const docState = isEmpty ? "EMPTY" : `HAS_CONTENT (${charCount} chars)`;

  const modeGuidance = isEmpty
    ? "Document is EMPTY — use mode='generate' or mode='replace' to create initial content."
    : "Document is NOT empty — use mode='append' to add content, mode='replace' ONLY if user explicitly asks to rewrite everything.";

  return `You are helping the user work with an open Writer document.

DOCUMENT:
- ID: ${document.id}
- Title: ${document.title}
- State: ${docState}${updatedAtSection}

CONTENT (HTML format with inline styles):
${contentSection}

FORMATTING CAPABILITIES:
The editor supports rich formatting. When generating or editing content, use HTML with inline styles:

Text styling:
- Color: <span style="color: #dc2626">red text</span>
- Font: <span style="font-family: Georgia">serif text</span>
- Size: <span style="font-size: 24px">large text</span>
- Background: <mark style="background-color: #fef2f2">highlighted</mark>
- Bold: <strong>, Italic: <em>, Underline: <u>, Strike: <s>
- Subscript: <sub>, Superscript: <sup>

Block formatting:
- Alignment: <p style="text-align: center">centered</p>
- Line height: <p style="line-height: 1.5">spaced</p>
- Callout: <div data-callout-type="info">note</div> (types: info, warning, error, success)
- Toggle: <details><summary>Title</summary>Hidden content</details>

Available colors: #dc2626 (red), #ea580c (orange), #ca8a04 (yellow), #16a34a (green), #2563eb (blue), #9333ea (purple)
Available fonts: Default, Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS, Comic Sans MS, Impact
Available sizes: 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72 px

CRITICAL RULE — MUST FOLLOW:
Make exactly ONE edit_content tool call per user request. NEVER call edit_content twice.
BAD: Two edit_content calls (causes duplicate content)
GOOD: One edit_content call with ALL content combined

TOOL RULES (follow strictly):
1. ${modeGuidance}
2. Use edit_content with content_format="html" for content with rich formatting.
3. Use format_content for STYLE-ONLY changes (when text must stay identical).
4. When user asks to "format", "style", "make it look", "change color/font/size" → use format_content.
5. When user asks to "write", "add", "rewrite", "edit" → use edit_content.
6. For rewrites of existing content, prefer edit_content with { live_stream: true, instruction: "..." } for live updates.
7. Use writer.read_document to fetch full/additional document content when needed before editing.
8. For long content, provide it all in a single edit_content call — never break it into multiple calls.
9. Do not only describe edits when the user asks to modify the document; perform them with edit_content.`;
}
