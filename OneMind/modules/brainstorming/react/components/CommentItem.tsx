import { useState } from "react";
import { Edit2, Trash2 } from "lucide-react";
import type { Comment } from "../../shared/types";
import { CommentInput } from "./CommentInput";

interface CommentItemProps {
    comment: Comment;
    onEdit: (commentId: string, newBody: string) => Promise<void>;
    onDelete: (commentId: string) => Promise<void>;
    isEditing?: boolean;
    onStartEdit?: () => void;
    onCancelEdit?: () => void;
}

function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(timestamp).toLocaleDateString();
}

export function CommentItem({
    comment,
    onEdit,
    onDelete,
    isEditing = false,
    onStartEdit,
    onCancelEdit,
}: CommentItemProps) {
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm("Delete this comment?")) return;

        setIsDeleting(true);
        try {
            await onDelete(comment.id);
        } catch (err) {
            console.error("Failed to delete comment:", err);
            setIsDeleting(false);
        }
    };

    const handleEdit = async (newBody: string) => {
        await onEdit(comment.id, newBody);
    };

    if (isEditing) {
        return (
            <div className="rounded-lg border border-border bg-card p-3">
                <CommentInput
                    value={comment.body}
                    onSubmit={handleEdit}
                    onCancel={onCancelEdit}
                    autoFocus
                />
            </div>
        );
    }

    return (
        <div className="group rounded-lg border border-border bg-card p-3 hover:border-muted-foreground/30 transition-colors">
            <div className="flex flex-col gap-2">
                {/* Comment body */}
                <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                    {comment.body}
                </p>

                {/* Footer with timestamp and actions */}
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span title={new Date(comment.createdAt).toLocaleString()}>
                        {timeAgo(comment.createdAt)}
                        {comment.updatedAt !== comment.createdAt && " (edited)"}
                    </span>

                    {/* Action buttons - visible on hover */}
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={onStartEdit}
                            disabled={isDeleting}
                            className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
                            aria-label="Edit comment"
                        >
                            <Edit2 className="h-3 w-3" />
                            <span>Edit</span>
                        </button>
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="flex items-center gap-1 hover:text-destructive transition-colors disabled:opacity-50"
                            aria-label="Delete comment"
                        >
                            <Trash2 className="h-3 w-3" />
                            <span>{isDeleting ? "Deleting..." : "Delete"}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
