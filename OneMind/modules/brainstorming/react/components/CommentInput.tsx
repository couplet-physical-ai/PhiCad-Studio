import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";

interface CommentInputProps {
    value?: string;
    placeholder?: string;
    onSubmit: (text: string) => Promise<void>;
    onCancel?: () => void;
    autoFocus?: boolean;
    disabled?: boolean;
}

export function CommentInput({
    value: initialValue = "",
    placeholder = "Add your thoughts...",
    onSubmit,
    onCancel,
    autoFocus = false,
    disabled = false,
}: CommentInputProps) {
    const [value, setValue] = useState(initialValue);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = textareaRef.current.scrollHeight + "px";
        }
    }, [value]);

    // Update value when initialValue changes (for edit mode)
    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const handleSubmit = async () => {
        const trimmedValue = value.trim();
        if (!trimmedValue || isSubmitting) return;

        setIsSubmitting(true);
        try {
            await onSubmit(trimmedValue);
            setValue(""); // Clear after successful submit
        } catch (err) {
            console.error("Failed to submit comment:", err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        // Submit on Enter (without Shift)
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
        // Cancel on Escape
        if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
        }
    };

    const handleCancel = () => {
        setValue(initialValue);
        onCancel?.();
    };

    const isValid = value.trim().length > 0;

    return (
        <div className="flex flex-col gap-2">
            <textarea
                ref={textareaRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled || isSubmitting}
                autoFocus={autoFocus}
                className="flex w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
                rows={1}
            />
            <div className="flex items-center justify-end gap-2">
                {onCancel && (
                    <button
                        onClick={handleCancel}
                        disabled={isSubmitting}
                        className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                )}
                <button
                    onClick={handleSubmit}
                    disabled={!isValid || isSubmitting || disabled}
                    className="flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? (
                        <>
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Sending...
                        </>
                    ) : (
                        <>
                            <Send className="h-3 w-3" />
                            {onCancel ? "Save" : "Send"}
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
