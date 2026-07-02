import { memo } from "react";
import type { EdgeType } from "../../shared/types";
import {
  Edit3,
  Palette,
  AlertTriangle,
  MessageSquare,
  HelpCircle,
  Lightbulb,
  GitBranch,
  CheckCircle,
  Star,
  Pin,
  Trash2,
  Unlink,
  Plus,
  ArrowRightLeft,
  Copy,
  Scissors,
  ClipboardPaste,
} from "lucide-react";

interface MenuPosition {
  x: number;
  y: number;
}

interface CanvasContextMenuProps {
  position: MenuPosition;
  onClose: () => void;
  onAddNode: () => void;
  onPaste: () => void;
}

interface NodeContextMenuProps {
  position: MenuPosition;
  nodeId: string;
  isStale: boolean;
  isStarred: boolean;
  isPinned: boolean;
  onClose: () => void;
  onRename: () => void;
  onEditDescription: () => void;
  onChangeColor: (color: string) => void;
  onValidate: () => void;
  onGenerateFeedback: () => void;
  onAskQuestions: () => void;
  onSuggestImprovements: () => void;
  onGenerateSubIdeas: () => void;
  onMarkReviewed: () => void;
  onToggleStar: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onDisconnect: () => void;
}

interface EdgeContextMenuProps {
  position: MenuPosition;
  edgeId: string;
  onClose: () => void;
  onReverse: () => void;
  onChangeType: (type: EdgeType) => void;
  onDelete: () => void;
}

interface SelectionContextMenuProps {
  position: MenuPosition;
  selectedCount: number;
  onClose: () => void;
  onMoveToProject: () => void;
  onDelete: () => void;
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
  disabled = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        w-full flex items-center gap-2 px-3 py-2 text-sm text-left
        hover:bg-muted transition-colors rounded-md
        ${destructive ? "text-destructive hover:text-destructive" : ""}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
      `}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-border" />;
}

function MenuSection({ label }: { label: string }) {
  return (
    <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wide">
      {label}
    </div>
  );
}

function MenuContainer({
  position,
  children,
  onClose,
}: {
  position: MenuPosition;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed z-50 min-w-[200px] max-w-[280px] p-1 bg-popover border border-border rounded-lg shadow-lg"
        style={{
          left: position.x,
          top: position.y,
          transform: "translate(-50%, 0)",
        }}
      >
        {children}
      </div>
    </>
  );
}

export const CanvasContextMenu = memo(function CanvasContextMenu({
  position,
  onClose,
  onAddNode,
  onPaste,
}: CanvasContextMenuProps) {
  return (
    <MenuContainer position={position} onClose={onClose}>
      <MenuItem
        icon={Plus}
        label="Add New Idea Here"
        onClick={() => {
          onAddNode();
          onClose();
        }}
      />
      <MenuItem
        icon={ClipboardPaste}
        label="Paste"
        onClick={() => {
          onPaste();
          onClose();
        }}
      />
    </MenuContainer>
  );
});

export const NodeContextMenu = memo(function NodeContextMenu({
  position,
  isStale,
  isStarred,
  isPinned,
  onClose,
  onRename,
  onEditDescription,
  onChangeColor,
  onValidate,
  onGenerateFeedback,
  onAskQuestions,
  onSuggestImprovements,
  onGenerateSubIdeas,
  onMarkReviewed,
  onToggleStar,
  onTogglePin,
  onDelete,
  onDisconnect,
}: NodeContextMenuProps) {
  const colors = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];

  return (
    <MenuContainer position={position} onClose={onClose}>
      <MenuSection label="Edit" />
      <MenuItem
        icon={Edit3}
        label="Rename"
        onClick={() => {
          onRename();
          onClose();
        }}
      />
      <MenuItem
        icon={Edit3}
        label="Edit Description"
        onClick={() => {
          onEditDescription();
          onClose();
        }}
      />

      <div className="px-3 py-2 flex gap-1">
        {colors.map((color) => (
          <button
            key={color}
            className={`w-5 h-5 rounded-full border-2 border-transparent hover:border-foreground/30`}
            style={{ backgroundColor: color }}
            onClick={() => {
              onChangeColor(color);
              onClose();
            }}
          />
        ))}
      </div>

      <MenuDivider />
      <MenuSection label="AI Actions" />
      <MenuItem
        icon={AlertTriangle}
        label="Validate Idea"
        onClick={() => {
          onValidate();
          onClose();
        }}
      />
      <MenuItem
        icon={MessageSquare}
        label="Generate Feedback"
        onClick={() => {
          onGenerateFeedback();
          onClose();
        }}
      />
      <MenuItem
        icon={HelpCircle}
        label="Ask Questions"
        onClick={() => {
          onAskQuestions();
          onClose();
        }}
      />
      <MenuItem
        icon={Lightbulb}
        label="Suggest Improvements"
        onClick={() => {
          onSuggestImprovements();
          onClose();
        }}
      />
      <MenuItem
        icon={GitBranch}
        label="Generate Sub-ideas"
        onClick={() => {
          onGenerateSubIdeas();
          onClose();
        }}
      />

      <MenuDivider />
      <MenuSection label="State" />
      {isStale && (
        <MenuItem
          icon={CheckCircle}
          label="Mark as Reviewed"
          onClick={() => {
            onMarkReviewed();
            onClose();
          }}
        />
      )}
      <MenuItem
        icon={Star}
        label={isStarred ? "Unstar" : "Star"}
        onClick={() => {
          onToggleStar();
          onClose();
        }}
      />
      <MenuItem
        icon={Pin}
        label={isPinned ? "Unpin" : "Pin"}
        onClick={() => {
          onTogglePin();
          onClose();
        }}
      />

      <MenuDivider />
      <MenuItem
        icon={Unlink}
        label="Disconnect"
        onClick={() => {
          onDisconnect();
          onClose();
        }}
      />
      <MenuItem
        icon={Trash2}
        label="Delete"
        onClick={() => {
          onDelete();
          onClose();
        }}
        destructive
      />
    </MenuContainer>
  );
});

export const EdgeContextMenu = memo(function EdgeContextMenu({
  position,
  onClose,
  onReverse,
  onChangeType,
  onDelete,
}: EdgeContextMenuProps) {
  const edgeTypes: { type: EdgeType; label: string }[] = [
    { type: "follows_from", label: "Follows From" },
    { type: "supports", label: "Supports" },
    { type: "conflicts", label: "Conflicts" },
    { type: "relates", label: "Relates" },
    { type: "source", label: "Source" },
  ];

  return (
    <MenuContainer position={position} onClose={onClose}>
      <MenuItem
        icon={ArrowRightLeft}
        label="Reverse Direction"
        onClick={() => {
          onReverse();
          onClose();
        }}
      />
      <MenuDivider />
      <MenuSection label="Relationship Type" />
      {edgeTypes.map(({ type, label }) => (
        <MenuItem
          key={type}
          icon={GitBranch}
          label={label}
          onClick={() => {
            onChangeType(type);
            onClose();
          }}
        />
      ))}
      <MenuDivider />
      <MenuItem
        icon={Trash2}
        label="Delete Connection"
        onClick={() => {
          onDelete();
          onClose();
        }}
        destructive
      />
    </MenuContainer>
  );
});

export const SelectionContextMenu = memo(function SelectionContextMenu({
  position,
  selectedCount,
  onClose,
  onMoveToProject,
  onDelete,
}: SelectionContextMenuProps) {
  return (
    <MenuContainer position={position} onClose={onClose}>
      <div className="px-3 py-1 text-xs text-muted-foreground">
        {selectedCount} nodes selected
      </div>
      <MenuDivider />
      <MenuItem
        icon={Copy}
        label="Move to New Project..."
        onClick={() => {
          onMoveToProject();
          onClose();
        }}
      />
      <MenuDivider />
      <MenuItem
        icon={Trash2}
        label="Delete Selected"
        onClick={() => {
          onDelete();
          onClose();
        }}
        destructive
      />
    </MenuContainer>
  );
});
