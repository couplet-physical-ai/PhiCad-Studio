import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ToolbarButtonProps {
  icon: LucideIcon;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  className?: string;
}

export function ToolbarButton({
  icon: Icon,
  onClick,
  active = false,
  disabled = false,
  tooltip,
  className,
}: ToolbarButtonProps) {
  const btn = (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={disabled}
      data-active={active}
      className={`h-7 w-7 p-0 data-[active=true]:bg-accent ${className ?? ""}`}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  if (!tooltip) return btn;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
