"use client";
import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { useHealth, timeAgo } from "@/hooks/useHealth";

interface DashboardLayoutProps {
    children: React.ReactNode;
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
    lastUpdated?: Date | null;
}

export default function DashboardLayout({
    children,
    title,
    subtitle,
    actions,
    lastUpdated,
}: DashboardLayoutProps) {
    const { health, online, lastChecked } = useHealth(10000);
    const [tick, setTick] = useState(0);

    // Re-render timeAgo every 5s
    useEffect(() => {
        const t = setInterval(() => setTick((n) => n + 1), 5000);
        return () => clearInterval(t);
    }, []);

    return (
        <div className="layout">
            <Sidebar />
            <div className="main-content">
                <header className="topbar">
                    <div>
                        <div className="topbar-title">{title}</div>
                        {subtitle && <div className="topbar-subtitle">{subtitle}</div>}
                    </div>

                    <div className="topbar-right">
                        {/* Last Updated */}
                        {lastUpdated && (
                            <div style={{
                                fontSize: "11.5px",
                                color: "var(--text-muted)",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                padding: "5px 10px",
                                background: "rgba(255,255,255,0.04)",
                                borderRadius: "6px",
                                border: "1px solid var(--border)",
                            }}>
                                🕐 Updated {timeAgo(lastUpdated)}
                            </div>
                        )}

                        {/* API Health Indicator */}
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "6px 12px",
                            background: online === true
                                ? "rgba(16,185,129,0.08)"
                                : online === false
                                    ? "rgba(239,68,68,0.08)"
                                    : "rgba(255,255,255,0.04)",
                            border: `1px solid ${online === true ? "rgba(16,185,129,0.25)"
                                    : online === false ? "rgba(239,68,68,0.25)"
                                        : "var(--border)"
                                }`,
                            borderRadius: "8px",
                            fontSize: "12px",
                            fontWeight: 500,
                            minWidth: "160px",
                        }}>
                            <span
                                className={`status-dot ${online === true ? "green" : online === false ? "red" : "amber"
                                    }`}
                            />
                            <span style={{
                                color: online === true ? "#34d399" : online === false ? "#f87171" : "var(--text-muted)",
                            }}>
                                {online === null
                                    ? "Connecting..."
                                    : online
                                        ? "API Connected"
                                        : "Backend Offline"}
                            </span>
                            {online && health && (
                                <span style={{
                                    marginLeft: "auto",
                                    color: "var(--text-muted)",
                                    fontSize: "10.5px",
                                    fontFamily: "monospace",
                                }}>
                                    {health.db.events.toLocaleString()} evt
                                </span>
                            )}
                        </div>

                        {actions}
                    </div>
                </header>

                {/* System mini-status bar (shown when online) */}
                {online && health && (
                    <div style={{
                        background: "rgba(16,185,129,0.04)",
                        borderBottom: "1px solid rgba(16,185,129,0.1)",
                        padding: "5px 28px",
                        display: "flex",
                        alignItems: "center",
                        gap: "24px",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                    }}>
                        <span>
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>DB:</span>{" "}
                            {health.db.workers}W · {health.db.workstations}S · {health.db.events.toLocaleString()} events
                        </span>
                        <span>
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Confidence avg:</span>{" "}
                            <span style={{
                                color: health.avg_confidence >= 0.85 ? "#34d399"
                                    : health.avg_confidence >= 0.7 ? "#fbbf24"
                                        : "#f87171",
                            }}>
                                {(health.avg_confidence * 100).toFixed(1)}%
                            </span>
                        </span>
                        <span>
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Model:</span>{" "}
                            {health.model_versions.join(", ")}
                        </span>
                        <span>
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Event rate:</span>{" "}
                            {health.event_rate_per_min}/min
                        </span>
                        {health.latest_event_at && (
                            <span>
                                <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Latest event:</span>{" "}
                                {new Date(health.latest_event_at).toLocaleTimeString()}
                            </span>
                        )}
                        <span>
                            <span style={{ color: "var(--text-secondary)", fontWeight: 500 }}>Threshold:</span>{" "}
                            conf ≥ {health.confidence_threshold}
                        </span>
                    </div>
                )}

                <main className="page-content">{children}</main>
            </div>
        </div>
    );
}
