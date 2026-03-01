"use client";
import { usePathname } from "next/navigation";
import Link from "next/link";

const navItems = [
    { href: "/", icon: "🏭", label: "Overview" },
    { href: "/workers", icon: "👷", label: "Workers" },
    { href: "/workstations", icon: "⚙️", label: "Workstations" },
    { href: "/events", icon: "📡", label: "Event Feed" },
    { href: "/alerts", icon: "🔔", label: "Alerts" },
    { href: "/simulate", icon: "🎛️", label: "Simulate Events" },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">🏭</div>
                <h1>AI Productivity<br />Dashboard</h1>
                <p>Factory Intelligence v1.0</p>
            </div>

            <nav className="sidebar-nav">
                <div className="nav-section">
                    <div className="nav-section-label">Navigation</div>
                    {navItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`nav-item ${pathname === item.href ? "active" : ""}`}
                        >
                            <span className="nav-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </div>
            </nav>

            <div className="sidebar-footer">
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <span className="status-dot green" />
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>System Online</span>
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    6 cameras · 6 stations
                </div>
            </div>
        </aside>
    );
}
