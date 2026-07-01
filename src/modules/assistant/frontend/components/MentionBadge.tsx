import type { ReactNode } from "react";
import { cn } from "../../../../core/frontend/src/lib/utils";
import { parseMentions } from "../lib/mention-utils";
import type { MentionReference } from "../types/mention";

interface MentionBadgeProps {
  mention: MentionReference;
  isDeleted?: boolean;
  onClick?: () => void;
  className?: string;
}

export function MentionBadge({
  mention,
  isDeleted = false,
  onClick,
  className,
}: MentionBadgeProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDeleted}
      title={
        isDeleted
          ? `This ${mention.entityType} has been deleted`
          : `Open ${mention.displayText}`
      }
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded",
        "text-sm font-medium transition-colors",
        isDeleted
          ? "bg-slate-200 text-slate-500 cursor-not-allowed opacity-60 dark:bg-slate-800 dark:text-slate-500"
          : "bg-violet-500/10 text-violet-700 hover:bg-violet-500/20 cursor-pointer dark:bg-violet-500/15 dark:text-violet-300",
        className,
      )}
    >
      <span>@</span>
      <span className="max-w-[150px] truncate">{mention.displayText}</span>
    </button>
  );
}

interface RenderMentionsProps {
  text: string;
  onMentionClick?: (mention: MentionReference) => void;
  deletedEntityIds?: Set<string>;
}

export function renderTextWithMentions({
  text,
  onMentionClick,
  deletedEntityIds = new Set(),
}: RenderMentionsProps): ReactNode[] {
  const mentions = parseMentions(text);
  if (mentions.length === 0) {
    return [text];
  }

  const parts: ReactNode[] = [];
  let lastIndex = 0;

  mentions.forEach((mention, i) => {
    if (mention.position > lastIndex) {
      parts.push(text.slice(lastIndex, mention.position));
    }

    const isDeleted = deletedEntityIds.has(mention.entityId);
    parts.push(
      <MentionBadge
        key={`mention-${i}`}
        mention={mention}
        isDeleted={isDeleted}
        onClick={
          onMentionClick && !isDeleted
            ? () => onMentionClick(mention)
            : undefined
        }
      />,
    );

    lastIndex = mention.position + mention.raw.length;
  });

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}
