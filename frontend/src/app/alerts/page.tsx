"use client";
import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { api, WorkerMetric, WorkstationMetric, HealthStatus, TrendData } from "@/lib/api";

interface Alert {
    id: string;
    severity: "critical" | "warning" | "info";
    title: string;
    description: string;
    source: string;
    timestamp: Date;
    acknowledged: boolean;
}

const SEV_COLORS = {
    critical: { bg: "rgba(239,68,68,0.08)", border: "#ef444444", icon: "🔴", badge: "red", label: "Critical" },
    warning: { bg: "rgba(245,158,11,0.08)", border: "#f59e0b44", icon: "🟡", badge: "amber", label: "Warning" },
    info: { bg: "rgba(59,130,246,0.08)", border: "#3b82f644", icon: "🔵", badge: "blue", label: "Info" },
};

export default function AlertsPage() {
    const [workers, setWorkers] = useState<WorkerMetric[]>([]);
    const [stations, setStations] = useState<WorkstationMetric[]>([]);
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [trends, setTrends] = useState<TrendData | null>(null);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [loading, setLoading] = useState(true);
    const [ackSet, setAckSet] = useState<Set<string>>(new Set());
    const [filter, setFilter] = useState<"all" | "critical" | "warning" | "info">("all");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [w, s, h, t] = await Promise.all([
                api.getWorkerMetrics(),
                api.getWorkstationMetrics(),
                api.getHealth(),
                api.getTrends(),
            ]);
            setWorkers(w.metrics);
            setStations(s.metrics);
            setHealth(h);
            setTrends(t);
        } catch {
            // no-op
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Auto-refresh every 30s
    useEffect(() => {
        const id = setInterval(() => load(), 30000);
        return () => clearInterval(id);
    }, [load]);

    // Derive alerts from live data
    useEffect(() => {
        const generated: Alert[] = [];
        const ts = new Date();

        // Worker utilization alerts
        workers.forEach((w) => {
            if (w.utilization_pct < 60) {
                generated.push({
                    id: `util-low-${w.worker_id}`,
                    severity: "critical",
                    title: `Worker utilization critically low — ${w.worker_name}`,
                    description: `${w.worker_name} has ${w.utilization_pct}% utilization. Target ≥ 70%. Consider reassigning tasks or investigating idle cause.`,
                    source: `Worker: ${w.worker_id}`,
                    timestamp: ts,
                    acknowledged: false,
                });
            } else if (w.utilization_pct < 70) {
                generated.push({
                    id: `util-warn-${w.worker_id}`,
                    severity: "warning",
                    title: `Worker utilization below target — ${w.worker_name}`,
                    description: `${w.worker_name} is at ${w.utilization_pct}% utilization (target: 70%). Monitor closely.`,
                    source: `Worker: ${w.worker_id}`,
                    timestamp: ts,
                    acknowledged: false,
                });
            }
        });

        // Station idle alerts
        stations.forEach((s) => {
            if (s.occupancy_min > 0 && s.utilization_pct < 50) {
                generated.push({
                    id: `station-idle-${s.station_id}`,
                    severity: "warning",
                    title: `Workstation high idle — ${s.station_name}`,
                    description: `${s.station_name} has ${s.utilization_pct}% utilization with ${Math.floor(s.occupancy_min)}min occupancy. Station is underutilized.`,
                    source: `Station: ${s.station_id}`,
                    timestamp: ts,
                    acknowledged: false,
                });
            }
        });

        // Model confidence alerts
        if (health && health.avg_confidence < 0.75) {
            generated.push({
                id: "conf-low",
                severity: health.avg_confidence < 0.65 ? "critical" : "warning",
                title: "Average model confidence below threshold",
                description: `Average confidence is ${(health.avg_confidence * 100).toFixed(1)}%. This may indicate model drift or camera quality issues. Minimum acceptable: 65%.`,
                source: "Event Pipeline",
                timestamp: ts,
                acknowledged: false,
            });
        }

        // Production trend alerts
        const prodDelta = trends?.trends?.total_production?.delta_pct;
        if (prodDelta != null && prodDelta < -10) {
            generated.push({
                id: "prod-drop",
                severity: "critical",
                title: "Production dropped significantly vs yesterday",
                description: `Production is down ${Math.abs(prodDelta).toFixed(1)}% compared to the previous period. Investigate root cause immediately.`,
                source: "Metrics Engine",
                timestamp: ts,
                acknowledged: false,
            });
        } else if (prodDelta != null && prodDelta < -5) {
            generated.push({
                id: "prod-warn",
                severity: "warning",
                title: "Production declining vs yesterday",
                description: `Production is down ${Math.abs(prodDelta).toFixed(1)}% vs previous period. Monitor for continued decline.`,
                source: "Metrics Engine",
                timestamp: ts,
                acknowledged: false,
            });
        } else if (prodDelta != null && prodDelta > 15) {
            generated.push({
                id: "prod-info",
                severity: "info",
                title: "Production significantly up vs yesterday",
                description: `Production is up ${prodDelta.toFixed(1)}% vs previous period. Excellent performance! Ensure quality checks are in place.`,
                source: "Metrics Engine",
                timestamp: ts,
                acknowledged: false,
            });
        }

        // Idle time spike alert
        const idleDelta = trends?.trends?.idle_time_hours?.delta_pct;
        if (idleDelta != null && idleDelta > 30) {
            generated.push({
                id: "idle-spike",
                severity: "warning",
                title: "Factory idle time spike detected",
                description: `Factory idle time increased by ${idleDelta.toFixed(1)}% vs yesterday. Review shift assignments and workload distribution.`,
                source: "Metrics Engine",
                timestamp: ts,
                acknowledged: false,
            });
        }

        // System-level info
        if (health) {
            generated.push({
                id: "system-ok",
                severity: "info",
                title: "All systems operational",
                description: `API, database, and event pipeline are fully operational. ${health.db.events.toLocaleString()} events processed. Confidence avg: ${(health.avg_confidence * 100).toFixed(1)}%.`,
                source: "System Health",
                timestamp: ts,
                acknowledged: false,
            });
            if (health.model_versions.length > 1) {
                generated.push({
                    id: "multi-model",
                    severity: "info",
                    title: `Multiple model versions active (${health.model_versions.join(", ")})`,
                    description: `Events are being processed by ${health.model_versions.length} model versions. Ensure consistent performance across versions. Latest: ${health.model_versions[0]}.`,
                    source: "ML-Ops Monitor",
                    timestamp: ts,
                    acknowledged: false,
                });
            }
        }

        setAlerts(generated.sort((a, b) => {
            const order = { critical: 0, warning: 1, info: 2 };
            return order[a.severity] - order[b.severity];
        }));
    }, [workers, stations, health, trends]);

    const acknowledge = (id: string) => setAckSet((prev) => new Set([...prev, id]));
    const acknowledgeAll = () => setAckSet(new Set(alerts.map((a) => a.id)));

    const visible = alerts.filter((a) => filter === "all" || a.severity === filter);
    const critCount = alerts.filter((a) => a.severity === "critical" && !ackSet.has(a.id)).length;
    const warnCount = alerts.filter((a) => a.severity === "warning" && !ackSet.has(a.id)).length;
    const infoCount = alerts.filter((a) => a.severity === "info" && !ackSet.has(a.id)).length;

    const actions = (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {(["all", "critical", "warning", "info"] as const).map((f) => (
                <button key={f} className={`btn btn-sm ${filter === f ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setFilter(f)} style={{ textTransform: "capitalize" }}>
                    {f === "all" ? `All (${alerts.length})` : f === "critical" ? `🔴 Critical (${critCount})` : f === "warning" ? `🟡 Warning (${warnCount})` : `🔵 Info (${infoCount})`}
                </button>
            ))}
            {ackSet.size < alerts.length && (
                <button className="btn btn-ghost btn-sm" onClick={acknowledgeAll}>✓ Ack All</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={load}>🔄 Refresh</button>
        </div>
    );

    return (
        <DashboardLayout title="Production Alerts" subtitle="Real-time factory intelligence & anomaly detection" actions={actions}>
            {/* Summary bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "12px", marginBottom: "24px" }}>
                {[
                    { label: "Critical Alerts", count: critCount, color: "#f87171", bg: "rgba(239,68,68,0.08)", icon: "🔴" },
                    { label: "Warnings", count: warnCount, color: "#fbbf24", bg: "rgba(245,158,11,0.08)", icon: "🟡" },
                    { label: "Info", count: infoCount, color: "#60a5fa", bg: "rgba(59,130,246,0.08)", icon: "🔵" },
                    { label: "Total Alerts", count: alerts.length, color: "var(--text-primary)", bg: "rgba(255,255,255,0.03)", icon: "📋" },
                ].map((s) => (
                    <div key={s.label} className="card" style={{ background: s.bg, borderColor: s.color + "33" }}>
                        <div className="card-body" style={{ padding: "14px 16px", textAlign: "center" }}>
                            <div style={{ fontSize: "22px", marginBottom: "4px" }}>{s.icon}</div>
                            <div style={{ fontSize: "28px", fontWeight: 900, color: s.color }}>{s.count}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.label}</div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Alert list */}
            {loading ? (
                <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "40px", color: "var(--text-muted)" }}>
                    ⏳ Loading alerts...
                </div></div>
            ) : visible.length === 0 ? (
                <div className="card"><div className="card-body" style={{ textAlign: "center", padding: "48px 20px" }}>
                    <div style={{ fontSize: "48px", marginBottom: "12px" }}>✅</div>
                    <div style={{ fontWeight: 700, fontSize: "16px", marginBottom: "6px" }}>All Clear</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>No active alerts in this category.</div>
                </div></div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {visible.map((alert) => {
                        const s = SEV_COLORS[alert.severity];
                        const isAcked = ackSet.has(alert.id);
                        return (
                            <div key={alert.id} className="card" style={{
                                background: isAcked ? "rgba(255,255,255,0.01)" : s.bg,
                                border: `1px solid ${isAcked ? "var(--border)" : s.border}`,
                                opacity: isAcked ? 0.55 : 1,
                                transition: "all 0.3s",
                            }}>
                                <div className="card-body" style={{ padding: "14px 18px" }}>
                                    <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                                        <span style={{ fontSize: "20px", flexShrink: 0, marginTop: "1px" }}>{s.icon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                                                <span style={{ fontWeight: 700, fontSize: "14px" }}>{alert.title}</span>
                                                <span className={`badge ${s.badge}`} style={{ fontSize: "10px" }}>{s.label}</span>
                                                {isAcked && <span className="badge" style={{ fontSize: "10px", background: "rgba(255,255,255,0.06)", color: "var(--text-muted)" }}>✓ Acknowledged</span>}
                                            </div>
                                            <div style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginBottom: "8px", lineHeight: 1.55 }}>
                                                {alert.description}
                                            </div>
                                            <div style={{ display: "flex", gap: "14px", alignItems: "center", fontSize: "11px", color: "var(--text-muted)" }}>
                                                <span>📍 {alert.source}</span>
                                                <span>🕐 {alert.timestamp.toLocaleTimeString()}</span>
                                            </div>
                                        </div>
                                        {!isAcked && (
                                            <button className="btn btn-ghost btn-sm" onClick={() => acknowledge(alert.id)}
                                                style={{ flexShrink: 0, fontSize: "11px" }}>
                                                ✓ Ack
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Alert rules explainer */}
            <div className="card" style={{ marginTop: "24px" }}>
                <div className="card-header"><span className="card-title">📋 Alert Rules</span></div>
                <div className="card-body">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px" }}>
                        {[
                            { sev: "🔴", rule: "Worker utilization < 60%", action: "Immediate intervention" },
                            { sev: "🟡", rule: "Worker utilization 60–70%", action: "Monitor & coach" },
                            { sev: "🟡", rule: "Station utilization < 50% (occupied)", action: "Check for blockages" },
                            { sev: "🔴", rule: "Model confidence < 65%", action: "Check cameras / retrain" },
                            { sev: "🟡", rule: "Model confidence 65–75%", action: "Review recent predictions" },
                            { sev: "🔴", rule: "Production drop > 10% vs yesterday", action: "Root cause analysis" },
                            { sev: "🟡", rule: "Production drop 5–10% vs yesterday", action: "Investigate & monitor" },
                            { sev: "🟡", rule: "Idle time spike > 30% vs yesterday", action: "Review shift assignments" },
                        ].map((r) => (
                            <div key={r.rule} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "4px" }}>{r.sev} {r.rule}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>→ {r.action}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
