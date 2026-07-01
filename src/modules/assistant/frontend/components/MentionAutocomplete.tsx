import { useEffect, useRef, useState, useLayoutEffect } from "react";
import { cn } from "../../../../core/frontend/src/lib/utils";
import type { MentionEntity } from "../types/mention";

interface MentionAutocompleteProps {
  suggestions: MentionEntity[];
  isLoading: boolean;
  isOpen: boolean;
  selectedIndex: number;
  onSelect: (entity: MentionEntity) => void;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement>;
}

export function MentionAutocomplete({
  suggestions,
  isLoading,
  isOpen,
  selectedIndex,
  onSelect,
  onClose,
  anchorRef,
}: MentionAutocompleteProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const [position, setPosition] = useState<{
    top?: number;
    bottom?: number;
    left: number;
    flipUp: boolean;
  }>({ left: 0, flipUp: false });

  useLayoutEffect(() => {
    if (!isOpen || !listRef.current) return;

    const anchor = anchorRef?.current;
    if (!anchor) {
      setPosition({ bottom: 8, left: 0, flipUp: true });
      return;
    }

    const anchorRect = anchor.getBoundingClientRect();
    const listHeight = listRef.current.offsetHeight || 200;
    const viewportHeight = window.innerHeight;
    const padding = 8;

    const spaceBelow = viewportHeight - anchorRect.bottom - padding;
    const spaceAbove = anchorRect.top - padding;
    const flipUp = spaceBelow < listHeight && spaceAbove > spaceBelow;

    if (flipUp) {
      setPosition({
        bottom: anchor.offsetHeight + padding,
        left: 0,
        flipUp: true,
      });
    } else {
      setPosition({
        top: -listHeight - padding,
        left: 0,
        flipUp: false,
      });
    }
  }, [isOpen, anchorRef, suggestions.length]);

  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const items = listRef.current.querySelectorAll("[data-mention-item]");
      items[selectedIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  if (!isOpen) return null;

  const showEmptyState = !isLoading && suggestions.length === 0;

  return (
    <div
      ref={listRef}
      className={cn(
        "absolute z-50 w-72 max-h-52 overflow-y-auto",
        "rounded-lg border border-slate-200 bg-white shadow-xl",
        "dark:border-slate-700 dark:bg-slate-900",
      )}
      style={{
        ...(position.top !== undefined && { top: position.top }),
        ...(position.bottom !== undefined && { bottom: position.bottom }),
        left: position.left,
      }}
    >
      {isLoading && (
        <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Searching…
        </div>
      )}
      {showEmptyState && (
        <div className="px-3 py-3 text-sm text-slate-500 text-center">
          No results found
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="py-1">
          {suggestions.map((entity, index) => (
            <button
              key={`${entity.entityType}:${entity.id}`}
              data-mention-item
              type="button"
              className={cn(
                "flex w-full items-center gap-3 px-3 py-2 text-left text-sm",
                "transition-colors duration-75",
                "hover:bg-slate-100",
                "focus:bg-slate-100 focus:outline-none",
                "dark:hover:bg-slate-800 dark:focus:bg-slate-800",
                index === selectedIndex && "bg-slate-100 dark:bg-slate-800",
              )}
              onClick={() => onSelect(entity)}
            >
              {entity.icon && (
                <span className="flex-shrink-0 text-base w-5 text-center">
                  {entity.icon}
                </span>
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-slate-800 dark:text-slate-100">
                  {entity.displayText}
                </div>
                {entity.description && (
                  <div className="truncate text-xs text-slate-500 mt-0.5">
                    {entity.description}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
