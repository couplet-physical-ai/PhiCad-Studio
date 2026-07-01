import { Fragment, useMemo, type ReactNode } from "react";
import { MarkdownContent } from "../../../../shared/frontend/markdown";
import { MentionBadge } from "./MentionBadge";
import { parseMentions } from "../lib/mention-utils";
import type { MentionReference } from "../types/mention";

interface MessageTextWithMentionsProps {
  text: string;
  isStreaming?: boolean;
  onMentionClick?: (mention: MentionReference) => void;
  deletedEntityIds?: Set<string>;
  proseClassName?: string;
  /** Render text segments as markdown (assistant) or plain text (user). */
  markdown?: boolean;
  mermaidTheme?: "light" | "dark";
}

export function MessageTextWithMentions({
  text,
  isStreaming = false,
  onMentionClick,
  deletedEntityIds = new Set(),
  proseClassName,
  markdown = false,
  mermaidTheme,
}: MessageTextWithMentionsProps) {
  const { segments } = useMemo(() => {
    const mentions = parseMentions(text);
    if (mentions.length === 0) {
      return { segments: [{ type: "text" as const, content: text }] };
    }

    const segs: Array<
      | { type: "text"; content: string }
      | { type: "mention"; mention: MentionReference }
    > = [];
    let lastIndex = 0;

    for (const mention of mentions) {
      if (mention.position > lastIndex) {
        segs.push({
          type: "text",
          content: text.slice(lastIndex, mention.position),
        });
      }
      segs.push({ type: "mention", mention });
      lastIndex = mention.position + mention.raw.length;
    }

    if (lastIndex < text.length) {
      segs.push({ type: "text", content: text.slice(lastIndex) });
    }

    return { segments: segs };
  }, [text]);

  if (segments.length === 1 && segments[0]?.type === "text") {
    if (markdown) {
      return (
        <MarkdownContent
          streaming={isStreaming}
          className={proseClassName}
          mermaidTheme={mermaidTheme}
        >
          {segments[0].content}
        </MarkdownContent>
      );
    }
    return <>{segments[0].content}</>;
  }

  return (
    <>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          if (!segment.content) {
            return <Fragment key={`text-${index}`}>{segment.content}</Fragment>;
          }
          if (markdown) {
            return (
              <MarkdownContent
                key={`text-${index}`}
                streaming={isStreaming}
                className={proseClassName}
                mermaidTheme={mermaidTheme}
              >
                {segment.content}
              </MarkdownContent>
            );
          }
          return <Fragment key={`text-${index}`}>{segment.content}</Fragment>;
        }

        const isDeleted = deletedEntityIds.has(segment.mention.entityId);
        return (
          <MentionBadge
            key={`mention-${index}`}
            mention={segment.mention}
            isDeleted={isDeleted}
            onClick={
              onMentionClick && !isDeleted
                ? () => onMentionClick(segment.mention)
                : undefined
            }
          />
        );
      })}
    </>
  );
}
