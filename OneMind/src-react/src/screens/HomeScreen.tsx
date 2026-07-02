import { ScrollArea } from "@/components/ui/scroll-area";
import { HomeHeader } from "@/screens/home/HomeHeader";
import { HomePromptInput } from "@/screens/home/HomePromptInput";
import { ProjectSection } from "@/screens/home/ProjectSection";
import { FolderSection } from "@/screens/home/FolderSection";
import { RecentChatsSection } from "@/screens/home/RecentChatsSection";
import { FavoritesSection } from "@/screens/home/FavoritesSection";
import { MediaGallerySection } from "@/screens/home/MediaGallerySection";
import { FolderContentView } from "@/screens/home/FolderContentView";
import { useNavigationStore } from "@/stores/navigation-store";

export function HomeScreen() {
  const folderFilter = useNavigationStore((state) => state.folderFilter);

  if (folderFilter) {
    return (
      <div className="flex h-full w-full flex-col bg-background">
        <HomeHeader />
        <ScrollArea className="flex-1">
          <div className="flex flex-col pb-8">
            <FolderContentView folderId={folderFilter} />
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <HomeHeader />
      <ScrollArea className="flex-1">
        <div className="flex flex-col pb-28">
          <FavoritesSection />
          <RecentChatsSection />
          <ProjectSection />
          <FolderSection />
          <MediaGallerySection />
        </div>
      </ScrollArea>
      <HomePromptInput />
    </div>
  );
}
