import { memo } from "react";
import { Handle, Position, type Node } from "@xyflow/react";
import type { BrainstormNode } from "../../shared/types";
import { useBrainstormStore } from "../stores/brainstorm-store";
import {
  MessageSquare,
  GitBranch,
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  MinusIcon,
  ArrowUpRight,
  ShieldCheck,
  CircleDot,
  FileText, PlusIcon,
} from "lucide-react";

export interface BrainstormNodeData {
  node: BrainstormNode;
  isStale: boolean;
  isWorking?: boolean;
  isExpanded?: boolean;
  [key: string]: unknown;
}

export type BrainstormFlowNode = Node<BrainstormNodeData, "brainstorm">;

interface Props {
  data: BrainstormNodeData;
  selected: boolean;
}

const nodeBorderMap: Record<string, string> = {
  red: "border-red-300",
  orange: "border-orange-300",
  yellow: "border-yellow-300",
  green: "border-green-300",
  blue: "border-blue-300",
  purple: "border-purple-300",
  pink: "border-pink-300",
};

const validationMetaMap = {
  ok: {
    label: "Validated",
    className: "text-muted-foreground",
    Icon: ShieldCheck,
  },
  warning: {
    label: "Pending",
    className: "text-amber-600 dark:text-amber-400",
    Icon: CircleDot,
  },
  risk: {
    label: "At risk",
    className: "text-rose-600 dark:text-rose-400",
    Icon: AlertTriangle,
  },
  none: {
    label: "Draft",
    className: "text-muted-foreground",
    Icon: FileText,
  },
};

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function extractText(value?: unknown): string {
  if (!value || typeof value !== "object") return "";
  const content = (value as { data?: { content?: unknown[] }; content?: unknown[] }).data
    ?.content ?? (value as { content?: unknown[] }).content;
  if (!Array.isArray(content)) return "";
  const texts: string[] = [];
  const walk = (nodes: unknown[]) => {
    nodes.forEach((node) => {
      if (!node || typeof node !== "object") return;
      const typed = node as { type?: string; text?: string; content?: unknown[] };
      if (typed.type === "text" && typeof typed.text === "string") {
        texts.push(typed.text);
      }
      if (Array.isArray(typed.content)) {
        walk(typed.content);
      }
    });
  };
  walk(content);
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function BrainstormNodeComponent({ data, selected }: Props) {
  const { node, isStale, isWorking, isExpanded = false } = data;
  const setExpandedNodeId = useBrainstormStore((state) => state.setExpandedNodeId);
  const toggleNodeExpanded = useBrainstormStore((state) => state.toggleNodeExpanded);


  const summaryText = extractText(node.summaryRich || node.contentRich);
  const hasSummary = summaryText.length > 0;
  const showSummary = isExpanded && hasSummary;
  const validationKey = node.validation?.status ?? "none";
  const validationMeta =
    validationMetaMap[validationKey as keyof typeof validationMetaMap] ??
    validationMetaMap.none;
  const ValidationIcon = validationMeta.Icon;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleNodeExpanded(node.id);
  };

  const handleOpenDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodeId(node.id);
  };

  return (
    <div
      className={cn(
        "group relative min-w-300 bg-card rounded-xl text-card-foreground",
          "border-2 border-border p-4 transition-all",
      )}
      style={{
        minWidth: 200,
        borderStyle: isExpanded ? "dashed" : "solid",
      }}
      onDoubleClick={handleDoubleClick}
    >
      <div
          style={{
            top: -10,
            left: -10,
          }}
          onClick={()=> toggleNodeExpanded(node.id)}
          className="absolute bg-card rounded-full p-1 border-border border cursor-pointer hover:bg-accent hover:text-accent-foreground transition-colors">
        {isExpanded ? <MinusIcon className="h-4 w-4 text-muted-foreground" />:
        <PlusIcon className="h-4 w-4 text-muted-foreground" />
        }
      </div>

      {
        // TODO: Add buttons on each side (centered) for adding new connected nodes - visible only on hover over the node
      }

      <div className="pb-2">
        <h3 className="text-[24px] font-semibold leading-[1.2] tracking-[-0.01em] text-foreground break-words line-clamp-2">
          {node.title || "Untitled Idea"
            // TODO: when expanded make title text directly editable
          }
        </h3>
      </div>

      {showSummary && (
        <div className="pb-4">
          <div className="text-sm text-muted-foreground">
            <p className="line-clamp-3 leading-relaxed text-muted-foreground max-w-[300px]">
              {summaryText || "No summary provided."
                // TODO: when expanded make summary text directly editable
                   }
            </p>
          </div>
        </div>
      )}

      <div className="mt-auto flex items-center bg-card text-[13px] text-muted-foreground">
        <div className={cn("flex items-center gap-1.5 font-medium", validationMeta.className)}>
          <ValidationIcon className="h-4 w-4" />
          <span>{validationMeta.label}</span>
        </div>

        {(node.childCount > 0 || node.commentCount > 0) && (
          <div className="flex items-center gap-3 font-medium text-muted-foreground">
            {node.childCount > 0 && (
              <div className="flex items-center gap-1" title="Sub-ideas">
                <GitBranch className="h-4 w-4" />
                <span>{node.childCount}</span>
              </div>
            )}

            {node.commentCount > 0 && (
              <div className="flex items-center gap-1" title="Comments">
                <MessageSquare className="h-4 w-4" />
                <span>{node.commentCount}</span>
              </div>
            )}
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">

            <button
              onClick={handleOpenDetails}
              className="nodrag inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[13px] font-medium text-foreground shadow-sm transition-colors hover:bg-accent"
            >
              <ArrowUpRight className="h-5 w-5" />
            </button>


        </div>
      </div>

      {/* Working/Stale Indicators (Overlays or additions) */}
      {(isWorking || isStale) && (
        <div className="absolute -top-2 -right-2 flex gap-1">
          {isWorking && (
            <div className="bg-blue-500 text-white p-1 rounded-full shadow-sm">
              <Loader2 className="w-3 h-3 animate-spin" />
            </div>
          )}
          {isStale && (
            <div className="bg-amber-500 text-white p-1 rounded-full shadow-sm" title="Stale (Parent updated)">
              <AlertTriangle className="w-3 h-3" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const BrainstormNodeType = memo(BrainstormNodeComponent);
