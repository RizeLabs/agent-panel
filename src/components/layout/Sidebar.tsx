import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Bot,
  Network,
  Wrench,
  CheckSquare,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

const navItems: NavItem[] = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/agents", icon: Bot, label: "Agents" },
  { to: "/swarm", icon: Network, label: "Swarm" },
  { to: "/skills", icon: Wrench, label: "Skills" },
  { to: "/tasks", icon: CheckSquare, label: "Tasks" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  return (
    <aside className="flex flex-col items-center w-16 min-h-screen bg-panel-surface border-r border-panel-border py-4 gap-2">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            [
              "relative group flex items-center justify-center w-10 h-10 rounded-lg transition-colors duration-150",
              isActive
                ? "bg-panel-accent text-white"
                : "text-panel-text-dim hover:text-panel-text hover:bg-panel-border",
            ].join(" ")
          }
        >
          <Icon size={20} />
          {/* Tooltip */}
          <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-panel-bg text-panel-text text-xs whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-150 z-50 border border-panel-border shadow-lg">
            {label}
          </span>
        </NavLink>
      ))}
    </aside>
  );
}
