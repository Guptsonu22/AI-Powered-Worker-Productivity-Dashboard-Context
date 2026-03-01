"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WorkerMetric, WorkstationMetric, TrendData } from "@/lib/api";

interface MetricCardProps {
    label: string;
    value: string | number;
    unit?: string;
    icon: string;
    color?: "blue" | "green" | "amber" | "red" | "purple" | "cyan";
    trend?: number | null;
    invertTrend?: boolean; // if true, negative delta is good (e.g. idle time ↓ = green)
}

export function MetricCard({ label, value, unit, icon, color = "blue", trend, invertTrend }: MetricCardProps) {
    const showTrend = trend != null;
    const isPositive = invertTrend ? trend! < 0 : trend! > 0;
    const trendColor = showTrend ? (isPositive ? "#34d399" : "#f87171") : undefined;
    const trendArrow = showTrend ? (trend! >= 0 ? "↑" : "↓") : null;

    return (
        <div className={`metric-card ${color}`}>
            <div className="icon-wrap">{icon}</div>
            <div className="metric-label">{label}</div>
            <div className={`metric-value ${color}`}>{value}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "4px" }}>
                {unit && <div className="metric-unit">{unit}</div>}
                {showTrend && (
                    <span style={{ fontSize: "11px", fontWeight: 700, color: trendColor, marginLeft: "auto" }}>
                        {trendArrow} {Math.abs(trend!).toFixed(1)}%
                    </span>
                )}
            </div>
        </div>
    );
}


interface UtilBarProps {
    value: number;
    showLabel?: boolean;
}

export function UtilBar({ value, showLabel = true }: UtilBarProps) {
    const color =
        value >= 75 ? "#10b981" :
            value >= 50 ? "#f59e0b" :
                "#ef4444";

    return (
        <div className="util-bar-wrap">
            <div className="util-bar-track">
                <div
                    className="util-bar-fill"
                    style={{ width: `${Math.min(100, value)}%`, background: color }}
                />
            </div>
            {showLabel && (
                <span className="util-bar-label" style={{ color }}>
                    {value.toFixed(1)}%
                </span>
            )}
        </div>
    );
}

interface BadgeProps {
    children: React.ReactNode;
    color?: "green" | "amber" | "red" | "blue" | "purple";
}

export function Badge({ children, color = "blue" }: BadgeProps) {
    return <span className={`badge ${color}`}>{children}</span>;
}

export function Loader({ text = "Loading..." }: { text?: string }) {
    return (
        <div className="loader-wrap">
            <div className="spinner" />
            <span style={{ fontSize: "13px" }}>{text}</span>
        </div>
    );
}

export function ErrorState({ message }: { message: string }) {
    return (
        <div className="error-state">
            ⚠️ {message}
        </div>
    );
}

interface TimeBreakdownProps {
    activeSec: number;
    idleSec: number;
    absentSec: number;
}

export function TimeBreakdown({ activeSec, idleSec, absentSec }: TimeBreakdownProps) {
    const total = activeSec + idleSec + absentSec || 1;
    const activeW = (activeSec / total) * 100;
    const idleW = (idleSec / total) * 100;
    const absentW = (absentSec / total) * 100;

    const fmt = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    };

    return (
        <div>
            <div className="time-breakdown-bar">
                {activeW > 0 && (
                    <div className="seg" style={{ width: `${activeW}%`, background: "var(--success)" }} />
                )}
                {idleW > 0 && (
                    <div className="seg" style={{ width: `${idleW}%`, background: "var(--warning)" }} />
                )}
                {absentW > 0 && (
                    <div className="seg" style={{ width: `${absentW}%`, background: "var(--danger)" }} />
                )}
            </div>
            <div style={{ display: "flex", gap: "16px", fontSize: "11.5px", color: "var(--text-muted)" }}>
                <span style={{ color: "var(--success)" }}>● Active: {fmt(activeSec)}</span>
                <span style={{ color: "var(--warning)" }}>● Idle: {fmt(idleSec)}</span>
                {absentSec > 0 && <span style={{ color: "var(--danger)" }}>● Absent: {fmt(absentSec)}</span>}
            </div>
        </div>
    );
}

export function WorkerAvatar({ name, index }: { name: string; index: number }) {
    const colors = [
        { bg: "rgba(59,130,246,0.2)", fg: "#60a5fa" },
        { bg: "rgba(16,185,129,0.2)", fg: "#34d399" },
        { bg: "rgba(139,92,246,0.2)", fg: "#a78bfa" },
        { bg: "rgba(245,158,11,0.2)", fg: "#fbbf24" },
        { bg: "rgba(6,182,212,0.2)", fg: "#22d3ee" },
        { bg: "rgba(239,68,68,0.2)", fg: "#f87171" },
    ];
    const c = colors[index % colors.length];
    const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2);

    return (
        <div className="worker-avatar" style={{ background: c.bg, color: c.fg }}>
            {initials}
        </div>
    );
}

export function StatRow({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
    return (
        <div className="summary-row">
            <span className="label">{label}</span>
            <span className="value">{value}{unit ? ` ${unit}` : ""}</span>
        </div>
    );
}

// ─── Skeleton Loading ─────────────────────────────────────────────

export function SkeletonMetrics({ count = 6 }: { count?: number }) {
    return (
        <div className="metrics-grid" style={{ marginBottom: "24px" }}>
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="skeleton-card">
                    <div className="skeleton" style={{ width: "32px", height: "32px", borderRadius: "8px" }} />
                    <div className="skeleton skeleton-text" style={{ width: "60%" }} />
                    <div className="skeleton skeleton-title" />
                    <div className="skeleton skeleton-text" style={{ width: "45%" }} />
                </div>
            ))}
        </div>
    );
}

export function SkeletonTable({ rows = 6 }: { rows?: number }) {
    return (
        <div className="card">
            <div className="card-header">
                <div className="skeleton" style={{ width: "180px", height: "18px" }} />
                <div className="skeleton" style={{ width: "60px", height: "22px", borderRadius: "20px" }} />
            </div>
            <div style={{ padding: "0 22px" }}>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="skeleton-row">
                        <div className="skeleton" style={{ width: "36px", height: "36px", borderRadius: "50%", flexShrink: 0 }} />
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "6px" }}>
                            <div className="skeleton skeleton-text" style={{ width: `${55 + (i % 3) * 15}%` }} />
                            <div className="skeleton skeleton-text" style={{ width: "35%" }} />
                        </div>
                        <div className="skeleton" style={{ width: "80px", height: "8px", borderRadius: "4px" }} />
                        <div className="skeleton" style={{ width: "50px", height: "22px", borderRadius: "20px" }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Empty State ──────────────────────────────────────────────────

interface EmptyStateProps {
    icon?: string;
    title?: string;
    description?: string;
    action?: React.ReactNode;
}

export function EmptyState({
    icon = "📭",
    title = "No data found",
    description = "Try adjusting your filters or date range.",
    action,
}: EmptyStateProps) {
    return (
        <div className="empty-state">
            <div className="empty-state-icon">{icon}</div>
            <div className="empty-state-title">{title}</div>
            <div className="empty-state-desc">{description}</div>
            {action}
        </div>
    );
}

// ─── AI Insights Panel ────────────────────────────────────────────

interface InsightsPanelProps {
    workers: WorkerMetric[];
    stations: WorkstationMetric[];
    trends?: TrendData | null;
}

interface Insight {
    icon: string;
    text: React.ReactNode;
    type: "info" | "success" | "warning" | "alert";
}

export function InsightsPanel({ workers, stations, trends }: InsightsPanelProps) {
    if (!workers.length && !stations.length) return null;

    const sorted = [...workers].sort((a, b) => b.utilization_pct - a.utilization_pct);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const topStation = [...stations].sort((a, b) => b.total_units_produced - a.total_units_produced)[0];
    const idleAlert = workers.filter((w) => w.utilization_pct < 70);
    const stationAlert = stations.filter((s) => s.utilization_pct < 70 && s.occupancy_min > 0);
    const totalIdlePct = trends?.trends?.idle_time_hours?.delta_pct;
    const totalProdPct = trends?.trends?.total_production?.delta_pct;
    const avgUtil = workers.length
        ? (workers.reduce((s, w) => s + w.utilization_pct, 0) / workers.length).toFixed(1)
        : null;

    const insights: Insight[] = [];

    // ─── Risk Score ───────────────────────────────────────────────
    let riskScore = 0;
    if (idleAlert.length > 0) riskScore += idleAlert.length * 15;
    if (stationAlert.length > 0) riskScore += stationAlert.length * 10;
    if (totalIdlePct != null && totalIdlePct > 20) riskScore += Math.min(30, Math.round(totalIdlePct / 5));
    if (totalProdPct != null && totalProdPct < -5) riskScore += 25;
    if (avgUtil && parseFloat(avgUtil) < 70) riskScore += 20;
    riskScore = Math.min(riskScore, 100);
    const riskLabel = riskScore >= 70 ? "Critical" : riskScore >= 45 ? "High" : riskScore >= 20 ? "Medium" : "Low";
    const riskColor = riskScore >= 70 ? "#f87171" : riskScore >= 45 ? "#fb923c" : riskScore >= 20 ? "#fbbf24" : "#34d399";

    // ─── Predictive Insight ───────────────────────────────────────
    const prodDelta = totalProdPct ?? 0;
    const utilAvg = avgUtil ? parseFloat(avgUtil) : 80;
    const predictDelta = parseFloat(((prodDelta * 0.4) + ((utilAvg - 80) * 0.6)).toFixed(1));
    const predictDir = predictDelta >= 0 ? "increase" : "decrease";
    const predictPct = Math.abs(predictDelta).toFixed(1);

    if (best) insights.push({
        icon: "🏆",
        type: "success",
        text: <><strong>{best.worker_name}</strong> is the top performer at <span className="highlight">{best.utilization_pct}%</span> utilization with {best.total_units_produced} units produced.</>,
    });

    if (worst && worst.worker_id !== best?.worker_id) insights.push({
        icon: worst.utilization_pct < 70 ? "⚠️" : "📊",
        type: worst.utilization_pct < 70 ? "warning" : "info",
        text: <><strong>{worst.worker_name}</strong> has the lowest utilization at <span className="highlight">{worst.utilization_pct}%</span>. {worst.utilization_pct < 70 ? "Consider intervention." : "Performance is acceptable."}</>,
    });

    if (topStation) insights.push({
        icon: "⚙️",
        type: "info",
        text: <>Most productive station: <strong>{topStation.station_name}</strong> with <span className="highlight">{topStation.total_units_produced}</span> units at {topStation.throughput_rate_per_hour} u/hr throughput.</>,
    });

    if (avgUtil) insights.push({
        icon: "📈",
        type: "info",
        text: <>Factory-wide average utilization is <span className="highlight">{avgUtil}%</span>. {parseFloat(avgUtil) >= 75 ? "Workforce is well utilized." : "Consider reviewing shift allocations."}</>,
    });

    if (totalProdPct != null) insights.push({
        icon: totalProdPct >= 0 ? "✅" : "📉",
        type: totalProdPct >= 0 ? "success" : "warning",
        text: <>Production vs previous day: <strong style={{ color: totalProdPct >= 0 ? "#34d399" : "#f87171" }}>{totalProdPct >= 0 ? "+" : ""}{totalProdPct}%</strong>. {totalProdPct >= 0 ? "Trending positively." : "Review today's activities."}</>,
    });

    if (idleAlert.length > 0) insights.push({
        icon: "⚠️",
        type: "alert",
        text: <>{idleAlert.length} worker{idleAlert.length > 1 ? "s" : ""} below 70% utilization: <strong>{idleAlert.map(w => w.worker_name.split(" ")[0]).join(", ")}</strong>. Immediate attention recommended.</>,
    });

    if (stationAlert.length > 0) insights.push({
        icon: "🔴",
        type: "alert",
        text: <><strong>{stationAlert.map(s => s.station_name.split(" ").slice(0, 2).join(" ")).join(", ")}</strong> {stationAlert.length > 1 ? "are" : "is"} running below 70% utilization — check for downtime.</>,
    });

    if (totalIdlePct != null && totalIdlePct > 20) insights.push({
        icon: "📊",
        type: "warning",
        text: <>Idle time increased by <strong style={{ color: "#fbbf24" }}>{totalIdlePct}%</strong> vs yesterday. Monitor for productivity regression.</>,
    });

    const typeColors: Record<string, string> = {
        success: "#34d399",
        info: "#60a5fa",
        warning: "#fbbf24",
        alert: "#f87171",
    };

    return (
        <div className="insights-panel">
            {/* Header: title + Risk Score + Predictive Insight */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: "14px" }}>
                <div className="insights-title" style={{ marginBottom: 0, flex: 1, minWidth: "200px" }}>
                    <span>🧠</span> AI-Powered Insights
                    <span className="badge purple" style={{ marginLeft: "4px", fontSize: "10px" }}>{insights.length} findings</span>
                </div>

                {/* Risk Level Badge */}
                <div style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "6px 14px", borderRadius: "8px",
                    background: `${riskColor}14`, border: `1px solid ${riskColor}44`,
                }}>
                    <span style={{ fontSize: "16px" }}>{riskScore >= 70 ? "🔴" : riskScore >= 45 ? "🟠" : riskScore >= 20 ? "🟡" : "🟢"}</span>
                    <div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1 }}>Risk Level</div>
                        <div style={{ fontWeight: 700, fontSize: "13px", color: riskColor, lineHeight: 1.4 }}>
                            {riskLabel} · {riskScore}/100
                        </div>
                    </div>
                </div>

                {/* Predictive Insight */}
                <div style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "6px 14px", borderRadius: "8px",
                    background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
                }}>
                    <span style={{ fontSize: "16px" }}>🔮</span>
                    <div>
                        <div style={{ fontSize: "10px", color: "var(--text-muted)", lineHeight: 1 }}>Tomorrow&apos;s Outlook</div>
                        <div style={{ fontWeight: 700, fontSize: "13px", color: predictDelta >= 0 ? "#34d399" : "#f87171", lineHeight: 1.4 }}>
                            Output may {predictDir} ~{predictPct}%
                        </div>
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "0 24px" }}>
                {insights.map((item, i) => (
                    <div key={i} className="insight-item">
                        <span className="insight-icon" style={{ color: typeColors[item.type] }}>{item.icon}</span>
                        <div className="insight-text">{item.text}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Search Input ─────────────────────────────────────────────────

interface SearchInputProps {
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    width?: string | number;
}

export function SearchInput({ value, onChange, placeholder = "Search...", width = 200 }: SearchInputProps) {
    return (
        <div className="search-wrap">
            <span className="search-icon">🔍</span>
            <input
                type="text"
                className="search-input"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                style={{ width }}
            />
        </div>
    );
}
