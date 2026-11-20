import { NavLink } from "react-router-dom";
import { LayoutDashboard, Camera, Truck, PlayCircle, BarChart3, Users as UsersIcon, Flame } from "lucide-react";
import Logo from "./Logo";
import { useAuth } from "../context/AuthContext";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/resources", label: "Resources", icon: Truck },
  { to: "/heatmap", label: "Risk Heatmap", icon: Flame },
  { to: "/simulation", label: "Simulation", icon: PlayCircle },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/live-camera", label: "Live Camera", icon: Camera },
];

export default function Sidebar() {
  const { user } = useAuth();
  const visibleLinks = user?.role === "admin"
    ? [...links, { to: "/users", label: "Users", icon: UsersIcon }]
    : links;

  return (
    <div style={{
      width: 200, minHeight: "100vh", padding: "1.5rem 1rem",
      borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 24,
    }}>
      <div style={{ padding: "0 0.5rem" }}>
        <Logo size="small" />
        <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "8px 0 0", lineHeight: 1.5 }}>
          An Intelligent Emergency Detection, Risk Prediction and Response Optimization Platform
        </p>
      </div>

      <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {visibleLinks.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            style={({ isActive }) => ({
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 12px", borderRadius: 8, fontSize: 14, textDecoration: "none",
              color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
              background: isActive ? "rgba(139,92,246,0.12)" : "transparent",
              borderLeft: isActive ? "2px solid var(--signal)" : "2px solid transparent",
              transition: "all 0.15s ease",
            })}
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
