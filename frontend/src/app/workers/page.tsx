"use client";
import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { UtilBar, SkeletonMetrics, EmptyState, ErrorState, TimeBreakdown, WorkerAvatar, StatRow, SearchInput } from "@/components/UI";
import { api, WorkerMetric, Worker } from "@/lib/api";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend,
} from "recharts";

function fmtTime(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

const WORKER_COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];

// Performance category based on utilization
function getPerfCategory(pct: number): { label: string; cls: string; icon: string } {
    if (pct >= 90) return { label: "Excellent", cls: "green", icon: "⭐" };
    if (pct >= 80) return { label: "Good", cls: "blue", icon: "✅" };
    if (pct >= 70) return { label: "Moderate", cls: "amber", icon: "🔶" };
    return { label: "Needs Attention", cls: "red", icon: "⚠️" };
}

export default function WorkersPage() {
    const [metrics, setMetrics] = useState<WorkerMetric[]>([]);
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [dates, setDates] = useState<string[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>("");
    const [selectedWorker, setSelectedWorker] = useState<WorkerMetric | null>(null);
    const [compareSet, setCompareSet] = useState<Set<string>>(new Set());
    const [compareMode, setCompareMode] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<"utilization_pct" | "total_units_produced" | "units_per_hour">("utilization_pct");
    const [filterRole, setFilterRole] = useState<string>("");
    const [search, setSearch] = useState("");

    const load = useCallback(async (date?: string) => {
        setLoading(true);
        setError(null);
        try {
            const [w, meta, d] = await Promise.all([
                api.getWorkerMetrics(date),
                api.getWorkers(),
                api.getDates(),
            ]);
            setMetrics(w.metrics);
            setWorkers(meta);
            setDates(d);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to load worker data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const roles = [...new Set(workers.map((w) => w.role))].filter(Boolean);

    // Sort → role filter → search filter
    const sorted = [...metrics]
        .sort((a, b) => b[sortBy] - a[sortBy])
        .filter((m) => {
            if (filterRole) {
                const worker = workers.find((w) => w.id === m.worker_id);
                if (worker?.role !== filterRole) return false;
            }
            if (search) {
                return m.worker_name.toLowerCase().includes(search.toLowerCase());
            }
            return true;
        });

    const getRoleForWorker = (id: string) => workers.find((w) => w.id === id)?.role ?? "—";
    const globalRanked = [...metrics].sort((a, b) => b.utilization_pct - a.utilization_pct);
    const getRank = (id: string) => {
        const idx = globalRanked.findIndex((m) => m.worker_id === id);
        if (idx === 0) return "🥇";
        if (idx === 1) return "🥈";
        if (idx === 2) return "🥉";
        return `#${idx + 1}`;
    };

    const toggleCompare = (id: string) => {
        setCompareSet((prev) => {
            const next = new Set(prev);
            if (next.has(id)) { next.delete(id); }
            else if (next.size < 3) { next.add(id); }
            return next;
        });
    };

    // Compare radar data
    const compareWorkers = metrics.filter((m) => compareSet.has(m.worker_id));
    const radarData = [
        { metric: "Utilization", ...Object.fromEntries(compareWorkers.map((w) => [w.worker_name.split(" ")[0], w.utilization_pct])) },
        { metric: "Units/100", ...Object.fromEntries(compareWorkers.map((w) => [w.worker_name.split(" ")[0], Math.min(w.total_units_produced / 6, 100)])) },
        { metric: "Active hr", ...Object.fromEntries(compareWorkers.map((w) => [w.worker_name.split(" ")[0], Math.min(w.active_time_min / 6, 100)])) },
        { metric: "u/hr×5", ...Object.fromEntries(compareWorkers.map((w) => [w.worker_name.split(" ")[0], Math.min(w.units_per_hour * 5, 100)])) },
    ];

    const chartData = sorted.map((w) => ({
        name: w.worker_name.split(" ")[0],
        units: w.total_units_produced,
        utilization: w.utilization_pct,
        uph: w.units_per_hour,
    }));

    const actions = (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search worker..." width={175} />
            <div className="select-wrap" style={{ width: "155px" }}>
                <select className="select-input" value={selectedDate}
                    onChange={(e) => { setSelectedDate(e.target.value); load(e.target.value || undefined); }}>
                    <option value="">All Time</option>
                    {dates.filter(Boolean).map((d) => {
                        const parsed = new Date(d.substring(0, 10) + "T12:00:00Z");
                        if (isNaN(parsed.getTime())) return null;
                        return (
                            <option key={d} value={d}>
                                {parsed.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </option>
                        );
                    })}
                </select>
                <span className="select-arrow">▼</span>
            </div>
            <div className="select-wrap" style={{ width: "145px" }}>
                <select className="select-input" value={filterRole} onChange={(e) => setFilterRole(e.target.value)}>
                    <option value="">All Roles</option>
                    {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <span className="select-arrow">▼</span>
            </div>
            <div className="select-wrap" style={{ width: "165px" }}>
                <select className="select-input" value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}>
                    <option value="utilization_pct">Sort: Utilization</option>
                    <option value="total_units_produced">Sort: Units Produced</option>
                    <option value="units_per_hour">Sort: Units/Hour</option>
                </select>
                <span className="select-arrow">▼</span>
            </div>
            <button
                className={`btn btn-sm ${compareMode ? "btn-primary" : "btn-ghost"}`}
                onClick={() => { setCompareMode((v) => !v); setCompareSet(new Set()); }}
                title="Select up to 3 workers to compare on radar chart"
                id="compare-mode-btn"
            >
                {compareMode ? `⚖ Compare (${compareSet.size}/3)` : "⚖ Compare"}
            </button>
            <a href={api.exportWorkers(selectedDate || undefined, "csv")} download
                className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }} id="export-workers-btn">⬇ CSV</a>
            <a href={api.exportWorkers(selectedDate || undefined, "json")} download
                className="btn btn-ghost btn-sm" style={{ textDecoration: "none" }} id="export-workers-json-btn">⬇ JSON</a>
        </div>
    );

    if (loading) return (
        <DashboardLayout title="Workers" subtitle="Individual worker productivity metrics">
            <SkeletonMetrics count={6} />
        </DashboardLayout>
    );

    return (
        <DashboardLayout title="Workers" subtitle="Individual worker productivity metrics" actions={actions}>
            {error && <div style={{ marginBottom: "20px" }}><ErrorState message={error} /></div>}

            {/* Compare radar */}
            {compareMode && compareSet.size >= 2 && (
                <div className="card" style={{ marginBottom: "20px" }}>
                    <div className="card-header">
                        <span className="card-title">⚖️ Worker Comparison Radar</span>
                        <div style={{ display: "flex", gap: "8px" }}>
                            {compareWorkers.map((w, i) => (
                                <span key={w.worker_id} className="badge" style={{ background: `${WORKER_COLORS[i]}22`, color: WORKER_COLORS[i] }}>
                                    {w.worker_name.split(" ")[0]}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="card-body chart-container">
                        <ResponsiveContainer width="100%" height={240}>
                            <RadarChart data={radarData}>
                                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                <PolarAngleAxis dataKey="metric" tick={{ fill: "#94a3b8", fontSize: 12 }} />
                                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} axisLine={false} />
                                {compareWorkers.map((w, i) => (
                                    <Radar key={w.worker_id} name={w.worker_name.split(" ")[0]}
                                        dataKey={w.worker_name.split(" ")[0]}
                                        stroke={WORKER_COLORS[i]} fill={WORKER_COLORS[i]} fillOpacity={0.18} />
                                ))}
                                <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{v}</span>} />
                                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
            {compareMode && compareSet.size < 2 && (
                <div style={{ padding: "10px 16px", borderRadius: "8px", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.2)", marginBottom: "16px", fontSize: "13px", color: "#60a5fa" }}>
                    ⚖ Select 2–3 worker cards below to compare them on a radar chart
                </div>
            )}

            {/* Top 3 Podium */}
            {!compareMode && globalRanked.length >= 3 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginBottom: "24px" }}>
                    {["🥇", "🥈", "🥉"].map((medal, i) => {
                        const w = globalRanked[i];
                        if (!w) return null;
                        const workerIdx = metrics.indexOf(w);
                        const colors = ["#fbbf24", "#94a3b8", "#f97316"];
                        const perf = getPerfCategory(w.utilization_pct);
                        return (
                            <div key={w.worker_id} className="card" style={{
                                border: `1px solid ${colors[i]}44`,
                                background: `linear-gradient(135deg, rgba(0,0,0,0) 0%, ${colors[i]}08 100%)`,
                            }}>
                                <div className="card-body" style={{ textAlign: "center", padding: "16px" }}>
                                    <div style={{ fontSize: "28px", marginBottom: "6px" }}>{medal}</div>
                                    <WorkerAvatar name={w.worker_name} index={workerIdx} />
                                    <div style={{ fontWeight: 700, marginTop: "8px", fontSize: "14px" }}>{w.worker_name}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "6px" }}>{getRoleForWorker(w.worker_id)}</div>
                                    <div style={{ fontSize: "22px", fontWeight: 900, color: colors[i] }}>{w.utilization_pct}%</div>
                                    <span className={`badge ${perf.cls}`} style={{ marginTop: "4px" }}>{perf.icon} {perf.label}</span>
                                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "8px", fontSize: "11px" }}>
                                        <span style={{ color: "#34d399" }}>📦 {w.total_units_produced} units</span>
                                        <span style={{ color: "#22d3ee" }}>⚡ {w.units_per_hour} u/hr</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="split-layout">
                {/* Left: cards + chart */}
                <div>
                    {sorted.length === 0 ? (
                        <EmptyState icon="🔍" title="No workers found"
                            description={search ? `No match for "${search}"` : "Try changing the role filter."} />
                    ) : (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "16px", marginBottom: "24px" }}>
                            {sorted.map((w, i) => {
                                const isSelected = selectedWorker?.worker_id === w.worker_id;
                                const isCompared = compareSet.has(w.worker_id);
                                const rank = getRank(w.worker_id);
                                const workerIdx = metrics.indexOf(w);
                                const perf = getPerfCategory(w.utilization_pct);
                                return (
                                    <div
                                        key={w.worker_id}
                                        className={`card ${isSelected && !compareMode ? "glow-blue" : ""}`}
                                        style={{
                                            cursor: "pointer",
                                            border: isCompared
                                                ? `2px solid ${WORKER_COLORS[workerIdx % 6]}`
                                                : isSelected ? "1px solid rgba(59,130,246,0.4)" : undefined,
                                            transition: "all 0.2s",
                                        }}
                                        onClick={() => compareMode ? toggleCompare(w.worker_id) : setSelectedWorker(isSelected ? null : w)}
                                        id={`worker-card-${w.worker_id}`}
                                    >
                                        <div className="card-header">
                                            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                                <WorkerAvatar name={w.worker_name} index={workerIdx} />
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: "14px" }}>{w.worker_name}</div>
                                                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                                        {w.worker_id} · {getRoleForWorker(w.worker_id)}
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: "flex", gap: "4px", alignItems: "center", flexDirection: "column" }}>
                                                <span style={{ fontSize: i < 3 ? "18px" : "12px", fontWeight: i < 3 ? 700 : 400 }}>{rank}</span>
                                                <span className={`badge ${perf.cls}`} style={{ fontSize: "10px" }}>{perf.icon} {perf.label}</span>
                                            </div>
                                        </div>
                                        <div className="card-body">
                                            <div style={{ marginBottom: "12px" }}><UtilBar value={w.utilization_pct} /></div>
                                            <TimeBreakdown activeSec={w.active_time_sec} idleSec={w.idle_time_sec} absentSec={w.absent_time_sec} />
                                            <div className="sep" />
                                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                                                <div style={{ textAlign: "center", padding: "10px", background: "rgba(16,185,129,0.08)", borderRadius: "8px" }}>
                                                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#34d399" }}>{w.total_units_produced}</div>
                                                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Units Produced</div>
                                                </div>
                                                <div style={{ textAlign: "center", padding: "10px", background: "rgba(6,182,212,0.08)", borderRadius: "8px" }}>
                                                    <div style={{ fontSize: "20px", fontWeight: 800, color: "#22d3ee" }}>{w.units_per_hour}</div>
                                                    <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Units / Hour</div>
                                                </div>
                                            </div>
                                            {compareMode && (
                                                <div style={{
                                                    marginTop: "10px", textAlign: "center", fontSize: "12px",
                                                    color: isCompared ? WORKER_COLORS[workerIdx % 6] : "var(--text-muted)"
                                                }}>
                                                    {isCompared ? "✓ Selected for comparison" : "Click to add to comparison"}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Bar chart */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">📊 Worker Comparison Chart</span></div>
                        <div className="card-body chart-container">
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="left" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="right" orientation="right" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                    <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                                    <Bar yAxisId="left" dataKey="units" name="Units Produced" radius={[4, 4, 0, 0]}>
                                        {chartData.map((_, i) => <Cell key={i} fill={WORKER_COLORS[i % 6]} fillOpacity={0.85} />)}
                                    </Bar>
                                    <Bar yAxisId="right" dataKey="utilization" name="Utilization %" fill="rgba(99,102,241,0.4)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                            <div style={{ display: "flex", gap: "18px", justifyContent: "center", marginTop: "8px", fontSize: "11px", color: "var(--text-muted)" }}>
                                <span>▓ Units Produced (left axis)</span>
                                <span style={{ color: "#818cf8" }}>▓ Utilization % (right axis)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Detail panel */}
                <div>
                    {selectedWorker && !compareMode ? (
                        <div className="card" style={{ position: "sticky", top: "80px" }}>
                            <div className="card-header">
                                <span className="card-title">
                                    <WorkerAvatar name={selectedWorker.worker_name} index={metrics.indexOf(selectedWorker)} />
                                    {selectedWorker.worker_name}
                                </span>
                                <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSelectedWorker(null)}>✕</button>
                            </div>
                            <div className="card-body">
                                {(() => {
                                    const perf = getPerfCategory(selectedWorker.utilization_pct);
                                    return (
                                        <div style={{ marginBottom: "16px", display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                                            <span style={{ fontSize: "22px" }}>{getRank(selectedWorker.worker_id)}</span>
                                            <span className={`badge ${perf.cls}`}>{perf.icon} {perf.label}</span>
                                            <span className="badge blue">{getRoleForWorker(selectedWorker.worker_id)}</span>
                                        </div>
                                    );
                                })()}
                                <StatRow label="Worker ID" value={selectedWorker.worker_id} />
                                <StatRow label="Utilization" value={`${selectedWorker.utilization_pct}%`} />
                                <StatRow label="Active Time" value={fmtTime(selectedWorker.active_time_sec)} />
                                <StatRow label="Idle Time" value={fmtTime(selectedWorker.idle_time_sec)} />
                                {selectedWorker.absent_time_sec > 0 && (
                                    <StatRow label="Absent Time" value={fmtTime(selectedWorker.absent_time_sec)} />
                                )}
                                <StatRow label="Units Produced" value={selectedWorker.total_units_produced} />
                                <StatRow label="Units / Hour" value={selectedWorker.units_per_hour} />
                                <div className="sep" />
                                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>Time Distribution</div>
                                <TimeBreakdown activeSec={selectedWorker.active_time_sec} idleSec={selectedWorker.idle_time_sec} absentSec={selectedWorker.absent_time_sec} />
                                <div className="sep" />
                                <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                                    <a href={api.exportWorkers(selectedDate || undefined, "csv")} download
                                        className="btn btn-ghost btn-sm" style={{ textDecoration: "none", flex: 1, justifyContent: "center" }}>⬇ CSV</a>
                                    <a href={api.exportWorkers(selectedDate || undefined, "json")} download
                                        className="btn btn-ghost btn-sm" style={{ textDecoration: "none", flex: 1, justifyContent: "center" }}>⬇ JSON</a>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="card" style={{ position: "sticky", top: "80px" }}>
                            <div className="card-body" style={{ textAlign: "center", padding: "40px 20px" }}>
                                <div style={{ fontSize: "40px", marginBottom: "12px" }}>{compareMode ? "⚖️" : "👆"}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                                    {compareMode
                                        ? "Select 2–3 workers to compare on radar chart"
                                        : "Click a worker card to view detailed metrics"}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
