import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Info,
  Library,
  Lock,
  Settings as SettingsIcon,
  User,
} from "lucide-react";
import type { SettingsTab } from "../../../contracts/app/routes";
import type { FeatureFlagName } from "../../../contracts/feature-flags/registry";

export type { SettingsTab };

export interface SettingsNavItem {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
  // When set, the item is only shown if the named module is loaded.
  requiresModule?: string;
  // When set, the item is only shown if the named feature flag is enabled.
  requiresFlag?: FeatureFlagName;
}

export interface SettingsNavGroup {
  label: string;
  items: SettingsNavItem[];
}

export const SETTINGS_NAV: SettingsNavGroup[] = [
  {
    label: "Workspace",
    items: [
      { id: "general", label: "General", icon: SettingsIcon },
      {
        id: "libraries",
        label: "Libraries",
        icon: Library,
        requiresModule: "library",
      },
    ],
  },
  {
    label: "Cloud & AI",
    items: [
      {
        id: "account",
        label: "Account",
        icon: User,
        requiresFlag: "cloud.auth",
      },
      {
        id: "assistant",
        label: "Assistant",
        icon: Bot,
        requiresModule: "assistant",
      },
    ],
  },
  {
    label: "System",
    items: [
      { id: "privacy", label: "Privacy", icon: Lock },
      { id: "about", label: "About", icon: Info },
    ],
  },
];

// Flat, ordered list of all tab ids — handy for default-tab resolution / guards.
export const ALL_SETTINGS_TABS: SettingsTab[] = SETTINGS_NAV.flatMap((group) =>
  group.items.map((item) => item.id),
);
