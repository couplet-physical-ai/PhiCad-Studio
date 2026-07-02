import { SidebarButtons } from "@/layout/Layout.tsx";
import { ModelSelector } from "@/components/ai/ModelSelector";

export default function RightSidebar({ top, bottom }: SidebarButtons) {
  return (
    <aside className="col-start-3 row-start-2 flex flex-col justify-between bg-surface px-2 pb-3 pt-0 text-text-primary">
      {/* Top section - dynamically registered buttons */}
      <div className="flex flex-col items-center gap-2 pt-3">
        {top?.map((Button) => Button)}
      </div>
      {/* Bottom section - module-specific buttons + dynamically registered */}
      <div className="flex flex-col items-center gap-2">
        {bottom?.map((Button) => Button)}
        <ModelSelector />
      </div>
    </aside>
  );
}
