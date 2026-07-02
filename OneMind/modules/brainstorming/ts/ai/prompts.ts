import type { BrainstormNode } from "../../shared/types";

export function getSystemPrompt(): string {
  return `You are OneMind, an intelligent brainstorming partner. 
Your goal is to help the user explore ideas, find weaknesses, and generate new concepts.
Be concise, constructive, and creative. Use markdown for formatting.`;
}

function getNodeContent(node: BrainstormNode): string {
  // Simple extraction of text from TipTap JSON if possible, or just stringify
  // For now, stringify the rich text JSON
  const description = node.contentRich
    ? JSON.stringify(node.contentRich)
    : node.summaryRich
      ? JSON.stringify(node.summaryRich)
      : "No description";
  return `Title: ${node.title}\nDescription: ${description}`;
}

export function getValidatePrompt(node: BrainstormNode): string {
  return `Analyze the following idea and provide a validation report.
Identify strengths, risks, unknowns, and next steps.

${getNodeContent(node)}

Output strictly valid JSON (no markdown code blocks) in the following format:
{
  "status": "ok" | "warning" | "risk",
  "score": number,
  "strengths": ["string"],
  "risks": ["string"],
  "unknowns": ["string"],
  "nextChecks": ["string"]
}`;
}

export function getSubIdeasPrompt(node: BrainstormNode): string {
  return `Generate 5 sub-ideas or follow-up concepts for the following idea.
Focus on divergent thinking and actionable next steps.

${getNodeContent(node)}

Output strictly valid JSON (no markdown code blocks) as an array of objects:
[
  { "title": "string", "description": "string" }
]`;
}

export function getFeedbackPrompt(node: BrainstormNode): string {
  return `Provide constructive feedback and critique for this idea.
Highlight what's good, what's missing, and potential contradictions.

${getNodeContent(node)}

Format your response as a structured markdown critique.`;
}

export function getQuestionsPrompt(node: BrainstormNode): string {
  return `Generate 3-5 clarifying questions to help deepen this idea.
Focus on "how", "why", and "what if".

${getNodeContent(node)}

Output strictly valid JSON (no markdown code blocks) as an array of strings.`;
}
