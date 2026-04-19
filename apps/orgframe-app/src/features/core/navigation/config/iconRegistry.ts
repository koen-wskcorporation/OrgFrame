import {
  BarChart2,
  Building2,
  CalendarDays,
  CreditCard,
  FileText,
  Globe,
  Inbox,
  LayoutDashboard,
  MapPinned,
  Palette,
  Settings,
  Spline,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";
import type { OrgAdminNavIcon } from "@/src/features/core/navigation/config/adminNav";

export const ORG_ADMIN_ICON_MAP: Record<OrgAdminNavIcon, LucideIcon> = {
  wrench: Wrench,
  settings: Settings,
  building: Building2,
  globe: Globe,
  palette: Palette,
  users: Users,
  "credit-card": CreditCard,
  layout: LayoutDashboard,
  calendar: CalendarDays,
  "file-text": FileText,
  map: MapPinned,
  inbox: Inbox,
  "bar-chart": BarChart2
};

export type OrgHierarchyEntityType = "program" | "division" | "team";

export const ORG_HIERARCHY_ENTITY_CONFIG: Record<OrgHierarchyEntityType, { label: string; icon: LucideIcon }> = {
  program: { label: "Program", icon: LayoutDashboard },
  division: { label: "Division", icon: Spline },
  team: { label: "Team", icon: Users }
};
