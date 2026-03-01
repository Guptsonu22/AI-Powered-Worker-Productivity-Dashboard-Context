"use client";
import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { UtilBar, Loader, ErrorState, StatRow } from "@/components/UI";
import { api, WorkstationMetric } from "@/lib/api";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

function fmtTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const STATION_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];
const STATION_ICONS: Record<string, string> = {
    "Assembly": "🔧",
    "Welding": "🔥",
    "Quality Control": "🔍",
    "Packaging": "📦",
    "CNC Machining": "⚙️",
    "Painting": "🎨",
};

function getUtilColor(pct: number) {
    if (pct >= 90) return "#10b981";  // green
    if (pct >= 70) return "#f59e0b";  // yellow
    return "#ef4444";                  // red
}
function getUtilBadge(pct: number) {
    if (pct >= 90) return { label: "High", cls: "green" };
    if (pct >= 70) return { label: "Normal", cls: "amber" };
    return { label: "Low", cls: "red" };
}

export default function WorkstationsPage() {
    const [metrics, setMetrics] = useState<WorkstationMetric[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedStation, setSelectedStation] = useState<WorkstationMetric | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (date?: string) => {
        setLoading(true);
        setError(null);
        try {
            const [s, d] = await Promise.all([
                api.getWorkstationMetrics(date),
                api.getDates(),
            ]);
            setMetrics(s.metrics);
            setDates(d);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to load workstation data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Stations with idle alert: occupancy_min > 0 but utilization_pct < 70
    const alertStations = metrics.filter((s) => s.occupancy_min > 0 && s.utilization_pct < 70);

    const radarData = metrics.map((s) => ({
        station: s.station_name.split(" ").slice(0, 2).join(" "),
        utilization: s.utilization_pct,
        throughput: Math.min(s.throughput_rate_per_hour * 5, 100),
        units: Math.min(s.total_units_produced / 5, 100),
    }));

    const barData = metrics.map((s) => ({
        name: s.station_name.split(" ").slice(0, 2).join(" "),
        units: s.total_units_produced,
        utilization: s.utilization_pct,
        throughput: s.throughput_rate_per_hour,
    }));

    const actions = (
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div className="select-wrap" style={{ width: "165px" }}>
                <select className="select-input" value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); load(e.target.value || undefined); }}>
                    <option value="">All Time</option>
                    {dates.map((d) => (
                        <option key={d} value={d}>
                            {new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                        </option>
                    ))}
                </select>
                <span className="select-arrow">▼</span>
            </div>
            <a href={api.exportWorkstations(selectedDate || undefined, "csv")} download
                className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }} id="export-stations-btn">
                ⬇ CSV
            </a>
            <a href={api.exportWorkstations(selectedDate || undefined, "json")} download
                className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }} id="export-stations-json-btn">
                ⬇ JSON
            </a>
        </div>
    );

    if (loading) return (
        <DashboardLayout title="Workstations" subtitle="Individual station performance metrics">
            <Loader text="Loading workstation metrics..." />
        </DashboardLayout>
    );

    return (
        <DashboardLayout title="Workstations" subtitle="Individual station performance metrics" actions={actions}>
            {error && <div style={{ marginBottom: "20px" }}><ErrorState message={error} /></div>}

            {/* ⚠ Downtime Alerts Banner */}
            {alertStations.length > 0 && (
                <div style={{
                    padding: "12px 18px", borderRadius: "10px", marginBottom: "20px",
                    background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)",
                    display: "flex", alignItems: "center", gap: "12px",
                }}>
                    <span style={{ fontSize: "20px" }}>⚠️</span>
                    <div>
                        <div style={{ fontWeight: 700, color: "#fbbf24", fontSize: "13px" }}>
                            High Idle Alert — {alertStations.length} station{alertStations.length > 1 ? "s" : ""} below 70% utilization
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                            {alertStations.map((s) => s.station_name).join(", ")} — check for operational issues
                        </div>
                    </div>
                </div>
            )}

            {/* Station Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                {metrics.map((s, i) => {
                    const isSelected = selectedStation?.station_id === s.station_id;
                    const icon = STATION_ICONS[s.station_type] ?? "🏭";
                    const badge = getUtilBadge(s.utilization_pct);
                    const utilColor = getUtilColor(s.utilization_pct);
                    const hasAlert = s.occupancy_min > 0 && s.utilization_pct < 70;
                    return (
                        <div
                            key={s.station_id}
                            className={`card ${isSelected ? "glow-blue" : ""}`}
                            style={{
                                cursor: "pointer",
                                border: isSelected ? "1px solid rgba(59,130,246,0.4)"
                                    : hasAlert ? "1px solid rgba(245,158,11,0.3)"
                                        : undefined,
                                transition: "all 0.2s",
                            }}
                            onClick={() => setSelectedStation(isSelected ? null : s)}
                            id={`station-card-${s.station_id}`}
                        >
                            <div className="card-header">
                                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div style={{
                                        width: "36px", height: "36px",
                                        background: `${STATION_COLORS[i]}22`,
                                        borderRadius: "10px", display: "flex",
                                        alignItems: "center", justifyContent: "center", fontSize: "18px",
                                    }}>
                                        {icon}
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: "13.5px" }}>{s.station_name}</div>
                                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                            {s.station_id} · {s.location}
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", gap: "4px", flexDirection: "column", alignItems: "flex-end" }}>
                                    <span className={`badge ${badge.cls}`}>{badge.label}</span>
                                    {hasAlert && <span className="badge amber" style={{ fontSize: "10px" }}>⚠ Idle</span>}
                                </div>
                            </div>
                            <div className="card-body">
                                <div style={{ marginBottom: "10px" }}>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>
                                        Utilization
                                    </div>
                                    {/* Color-coded bar */}
                                    <div style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                                        <div style={{
                                            height: "100%",
                                            width: `${Math.min(100, s.utilization_pct)}%`,
                                            background: utilColor,
                                            borderRadius: "4px",
                                            transition: "width 0.5s ease",
                                        }} />
                                    </div>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: utilColor, marginTop: "4px" }}>
                                        {s.utilization_pct}%
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px", marginTop: "12px" }}>
                                    <div style={{ textAlign: "center", padding: "8px 4px", background: "rgba(16,185,129,0.08)", borderRadius: "8px" }}>
                                        <div style={{ fontSize: "16px", fontWeight: 800, color: "#34d399" }}>{s.total_units_produced}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Units</div>
                                    </div>
                                    <div style={{ textAlign: "center", padding: "8px 4px", background: "rgba(6,182,212,0.08)", borderRadius: "8px" }}>
                                        <div style={{ fontSize: "16px", fontWeight: 800, color: "#22d3ee" }}>{s.throughput_rate_per_hour}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>u/hr</div>
                                    </div>
                                    <div style={{ textAlign: "center", padding: "8px 4px", background: "rgba(59,130,246,0.08)", borderRadius: "8px" }}>
                                        <div style={{ fontSize: "16px", fontWeight: 800, color: "#60a5fa" }}>{fmtTime(s.occupancy_sec)}</div>
                                        <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>Occupied</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Selected Station Detail */}
            {selectedStation && (
                <div className="detail-panel" style={{ marginBottom: "24px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                        <h3 style={{ fontWeight: 700, fontSize: "16px" }}>
                            {STATION_ICONS[selectedStation.station_type] ?? "🏭"} {selectedStation.station_name} — Detailed Metrics
                        </h3>
                        <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStation(null)}>✕ Close</button>
                    </div>
                    <div className="grid-3">
                        <div>
                            <StatRow label="Station ID" value={selectedStation.station_id} />
                            <StatRow label="Type" value={selectedStation.station_type} />
                            <StatRow label="Location" value={selectedStation.location} />
                        </div>
                        <div>
                            <StatRow label="Utilization" value={`${selectedStation.utilization_pct}%`} />
                            <StatRow label="Occupancy" value={fmtTime(selectedStation.occupancy_sec)} />
                            <StatRow label="Occupancy (min)" value={selectedStation.occupancy_min} unit="min" />
                        </div>
                        <div>
                            <StatRow label="Units Produced" value={selectedStation.total_units_produced} />
                            <StatRow label="Throughput / hr" value={selectedStation.throughput_rate_per_hour} unit="u/hr" />
                            {selectedStation.utilization_pct < 70 && (
                                <div style={{ marginTop: "8px", padding: "8px 10px", background: "rgba(245,158,11,0.1)", borderRadius: "6px", fontSize: "12px", color: "#fbbf24" }}>
                                    ⚠ Below threshold — possible downtime
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Charts */}
            <div className="grid-2">
                <div className="card">
                    <div className="card-header"><span className="card-title">📦 Units Produced by Station</span></div>
                    <div className="card-body chart-container">
                        <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={barData} barSize={30}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                                    formatter={(v: unknown) => [v as number, "Units"]} />
                                <Bar dataKey="units" radius={[4, 4, 0, 0]}>
                                    {barData.map((entry, i) => (
                                        <Cell key={i} fill={getUtilColor(metrics[i]?.utilization_pct ?? 100)} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                        <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                            <span style={{ color: "#10b981" }}>● ≥ 90% Util</span>
                            <span style={{ color: "#f59e0b" }}>● 70–90%</span>
                            <span style={{ color: "#ef4444" }}>● &lt; 70%</span>
                        </div>
                    </div>
                </div>

                <div className="card">
                    <div className="card-header"><span className="card-title">🕸️ Station Performance Radar</span></div>
                    <div className="card-body chart-container">
                        <ResponsiveContainer width="100%" height={220}>
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                <PolarAngleAxis dataKey="station" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name="Utilization" dataKey="utilization" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                                <Radar name="Throughput" dataKey="throughput" stroke="#10b981" fill="#10b981" fillOpacity={0.15} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Table */}
            <div className="card" style={{ marginTop: "20px" }}>
                <div className="card-header">
                    <span className="card-title">⚙️ Workstation Data Table</span>
                    <span className="badge purple">{metrics.length} stations</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Station</th><th>Type</th><th>Location</th>
                                <th>Utilization</th><th>Occupancy</th>
                                <th>Units Produced</th><th>Throughput / hr</th><th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {metrics.map((s, i) => {
                                const badge = getUtilBadge(s.utilization_pct);
                                const hasAlert = s.occupancy_min > 0 && s.utilization_pct < 70;
                                return (
                                    <tr
                                        key={s.station_id}
                                        className={selectedStation?.station_id === s.station_id ? "selected" : ""}
                                        onClick={() => setSelectedStation(selectedStation?.station_id === s.station_id ? null : s)}
                                    >
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <span>{STATION_ICONS[s.station_type] ?? "🏭"}</span>
                                                <div>
                                                    <div style={{ fontWeight: 600 }}>{s.station_name}</div>
                                                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.station_id}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td><span className={`badge ${["blue", "green", "purple", "amber", "cyan", "red"][i % 6]}`}>{s.station_type}</span></td>
                                        <td style={{ color: "var(--text-muted)" }}>{s.location}</td>
                                        <td>
                                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                <div style={{ width: "60px", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
                                                    <div style={{ height: "100%", width: `${s.utilization_pct}%`, background: getUtilColor(s.utilization_pct), borderRadius: "3px" }} />
                                                </div>
                                                <span style={{ fontSize: "12px", fontWeight: 600, color: getUtilColor(s.utilization_pct) }}>{s.utilization_pct}%</span>
                                            </div>
                                        </td>
                                        <td style={{ color: "var(--success)", fontWeight: 500 }}>{fmtTime(s.occupancy_sec)}</td>
                                        <td><span style={{ fontWeight: 700, color: "var(--accent-bright)" }}>{s.total_units_produced}</span></td>
                                        <td><span style={{ color: "var(--cyan)" }}>{s.throughput_rate_per_hour}</span></td>
                                        <td>
                                            {hasAlert
                                                ? <span className="badge amber">⚠ High Idle</span>
                                                : <span className={`badge ${badge.cls}`}>{badge.label}</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </DashboardLayout>
    );
}
