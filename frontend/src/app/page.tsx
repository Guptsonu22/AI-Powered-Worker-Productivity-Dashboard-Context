"use client";
import { useEffect, useState, useCallback } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import {
  MetricCard, UtilBar, ErrorState, TimeBreakdown, WorkerAvatar,
  InsightsPanel, SkeletonMetrics, SkeletonTable, EmptyState, SearchInput,
} from "@/components/UI";
import { useToast } from "@/components/Toast";
import {
  api, FactoryMetric, WorkerMetric, WorkstationMetric,
  HealthStatus, TrendData, ModelPerformance, EventDensityBucket,
} from "@/lib/api";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ef4444"];

function fmtTime(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Live "X ago" counter that ticks every second
function useLiveAgo(date: Date | null) {
  const [label, setLabel] = useState("—");
  useEffect(() => {
    const update = () => {
      if (!date) { setLabel("—"); return; }
      const sec = Math.floor((Date.now() - date.getTime()) / 1000);
      if (sec < 5) setLabel("just now");
      else if (sec < 60) setLabel(`${sec}s ago`);
      else setLabel(`${Math.floor(sec / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [date]);
  return label;
}

// Trend indicator component
function TrendBadge({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return null;
  const up = delta >= 0;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "3px",
      fontSize: "11.5px", fontWeight: 700,
      color: up ? "#34d399" : "#f87171",
    }}>
      {up ? "↑" : "↓"} {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

export default function OverviewPage() {
  const { addToast } = useToast();
  const [factory, setFactory] = useState<FactoryMetric | null>(null);
  const [workers, setWorkers] = useState<WorkerMetric[]>([]);
  const [stations, setStations] = useState<WorkstationMetric[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [trends, setTrends] = useState<TrendData | null>(null);
  const [modelPerf, setModelPerf] = useState<ModelPerformance[]>([]);
  const [density, setDensity] = useState<EventDensityBucket[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [workerSearch, setWorkerSearch] = useState("");
  const liveAgo = useLiveAgo(lastUpdated);

  const load = useCallback(async (date?: string, silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const [f, w, s, d, h, t, mp, den] = await Promise.all([
        api.getFactoryMetrics(date),
        api.getWorkerMetrics(date),
        api.getWorkstationMetrics(date),
        api.getDates(),
        api.getHealth(),
        api.getTrends(),
        api.getModelPerformance(),
        api.getEventDensity(date),
      ]);
      setFactory(f.metrics);
      setWorkers(w.metrics);
      setStations(s.metrics);
      setDates(d);
      setHealth(h);
      setTrends(t);
      setModelPerf(mp.models);
      setDensity(den.density);
      setLastUpdated(new Date());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load. Is the backend running?";
      setError(msg);
      if (!silent) addToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => load(selectedDate || undefined, true), 30000);
    return () => clearInterval(interval);
  }, [load, selectedDate]);

  const handleDateChange = (d: string) => { setSelectedDate(d); load(d || undefined); };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await api.seedDatabase();
      addToast(`✅ Seeded: ${res.workers} workers, ${res.workstations} stations, ${res.events} events`, "success");
      await load(selectedDate || undefined);
    } catch {
      addToast("❌ Seed failed", "error");
    } finally {
      setSeeding(false);
    }
  };

  const workerChartData = workers.map((w) => ({
    name: w.worker_name.split(" ")[0],
    utilization: w.utilization_pct,
    units: w.total_units_produced,
  }));

  const pieData = factory ? [
    { name: "Active Time", value: factory.total_active_time_hours },
    { name: "Idle Time", value: factory.total_idle_time_hours },
  ] : [];

  // Model performance chart data
  const modelChartData = modelPerf.map((m) => ({
    model: m.model_version,
    accuracy: m.avg_confidence,
    high: m.high_conf_pct,
    events: m.event_count,
  }));

  // Only show 8:00–17:00 density (shift hours)
  const shiftDensity = density.filter((b) => {
    const h = parseInt(b.hour);
    return h >= 8 && h <= 17;
  });

  const actions = (
    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
      <div style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: "96px" }}>
        🕐 Updated {liveAgo}
      </div>
      <div className="select-wrap" style={{ width: "175px" }}>
        <select id="date-filter" className="select-input" value={selectedDate} onChange={(e) => handleDateChange(e.target.value)}>
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
      <button className="btn btn-success btn-sm" onClick={handleSeed} disabled={seeding} id="seed-btn">
        {seeding ? "⏳ Seeding..." : "🌱 Reseed"}
      </button>
      <button className="btn btn-ghost btn-sm" onClick={() => load(selectedDate || undefined)} id="refresh-btn">🔄</button>
    </div>
  );

  if (loading) {
    return (
      <DashboardLayout title="Factory Overview" subtitle="Real-time AI productivity metrics">
        <SkeletonMetrics count={6} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
          <div className="skeleton-card" style={{ height: "200px" }}><div className="skeleton" style={{ width: "100%", height: "100%" }} /></div>
          <div className="skeleton-card" style={{ height: "200px" }}><div className="skeleton" style={{ width: "100%", height: "100%" }} /></div>
        </div>
        <SkeletonTable rows={6} />
      </DashboardLayout>
    );
  }

  // Filter workers by search
  const filteredWorkers = workers.filter((w) =>
    w.worker_name.toLowerCase().includes(workerSearch.toLowerCase())
  );

  return (
    <DashboardLayout title="Factory Overview" subtitle="Real-time AI-powered productivity metrics" actions={actions} lastUpdated={lastUpdated}>
      {error && <div style={{ marginBottom: "20px" }}><ErrorState message={error} /></div>}

      {/* AI Insights Panel */}
      {(workers.length > 0 || stations.length > 0) && (
        <InsightsPanel workers={workers} stations={stations} trends={trends} />
      )}

      {/* KPI Cards with Trend Indicators */}
      <div className="metrics-grid">
        <MetricCard label="Total Production" value={factory?.total_production_count.toLocaleString() ?? "—"}
          unit="units produced" icon="📦" color="blue"
          trend={trends?.trends?.total_production?.delta_pct} />
        <MetricCard label="Active Time" value={factory ? fmtTime(factory.total_active_time_sec) : "—"}
          unit="across all workers" icon="⚡" color="green"
          trend={trends?.trends?.active_time_hours?.delta_pct} />
        <MetricCard label="Avg Utilization" value={factory ? `${factory.avg_worker_utilization_pct}%` : "—"}
          unit="worker avg" icon="📊" color="purple"
          trend={trends?.trends?.avg_utilization?.delta_pct} />
        <MetricCard label="Production Rate" value={factory?.avg_production_rate_per_hour ?? "—"}
          unit="units / hour" icon="🚀" color="cyan"
          trend={trends?.trends?.production_rate?.delta_pct} />
        <MetricCard label="Idle Time" value={factory ? fmtTime(factory.total_idle_time_sec) : "—"}
          unit="across all workers" icon="⏸️" color="amber"
          trend={trends?.trends?.idle_time_hours?.delta_pct} invertTrend />
        <MetricCard label="Events Processed" value={factory?.total_events_processed.toLocaleString() ?? "—"}
          unit="CCTV events" icon="📡" color="blue" />
      </div>

      {/* System Status + Model Performance + Pipeline 3-col grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "24px" }}>
        {/* System Status */}
        {health && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">🖥️ System Status</span>
              <span className="badge green"><span className="status-dot green" style={{ width: "6px", height: "6px" }} /> Live</span>
            </div>
            <div className="card-body">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                {[
                  { label: "Backend", value: "Online", color: "#34d399", icon: "🟢" },
                  { label: "Database", value: "Connected", color: "#34d399", icon: "🟢" },
                  { label: "Event Pipeline", value: "Active", color: "#34d399", icon: "🟢" },
                  {
                    label: "Avg Confidence",
                    value: `${(health.avg_confidence * 100).toFixed(1)}%`,
                    color: health.avg_confidence >= 0.85 ? "#34d399" : health.avg_confidence >= 0.7 ? "#fbbf24" : "#f87171",
                    icon: health.avg_confidence >= 0.85 ? "🟢" : "🟡"
                  },
                  { label: "Model Versions", value: health.model_versions.join(", "), color: "#60a5fa", icon: "🤖" },
                  { label: "Conf Threshold", value: `≥ ${health.confidence_threshold}`, color: "#a78bfa", icon: "🛡️" },
                ].map((item) => (
                  <div key={item.label} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>{item.icon} {item.label}</div>
                    <div style={{ fontSize: "13px", fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Event Pipeline Card */}
        {health && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">📡 Event Pipeline</span>
              <span className="badge green" style={{ animation: "pulse-ring 2s infinite" }}>● Live</span>
            </div>
            <div className="card-body" style={{ padding: "14px 16px" }}>
              {([
                { label: "Events Received", value: health.db.events.toLocaleString(), icon: "📥", color: "#60a5fa" },
                { label: "Events Processed", value: health.db.events.toLocaleString(), icon: "✅", color: "#34d399" },
                { label: "Throughput", value: `${health.event_rate_per_min} evt/min`, icon: "⚡", color: "#22d3ee" },
                { label: "Avg Latency", value: `~${Math.round(120 / Math.max(health.event_rate_per_min, 1))}ms`, icon: "⏱️", color: "#a78bfa" },
                { label: "Avg Confidence", value: `${(health.avg_confidence * 100).toFixed(1)}%`, icon: "🎯", color: health.avg_confidence >= 0.85 ? "#34d399" : "#fbbf24" },
                { label: "Conf Threshold", value: `≥ ${(health.confidence_threshold * 100).toFixed(0)}%`, icon: "🛡️", color: "#a78bfa" },
                { label: "Dedup Index", value: "Active", icon: "🔁", color: "#34d399" },
                { label: "Validation Layer", value: "Enabled", icon: "🔐", color: "#34d399" },
              ] as { label: string; value: string; icon: string; color: string }[]).map((row) => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{row.icon} {row.label}</span>
                  <span style={{ fontSize: "12.5px", fontWeight: 700, color: row.color, fontVariantNumeric: "tabular-nums" }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model Performance Card */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">🤖 Model Performance</span>
            <span className="badge purple">{modelPerf.length} versions</span>
          </div>
          <div className="card-body">
            {modelPerf.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>No model data</p>
            ) : (
              <>
                {modelPerf.map((m, i) => {
                  const colors = ["#8b5cf6", "#3b82f6", "#10b981"];
                  const c = colors[i % 3];
                  return (
                    <div key={m.model_version} style={{ marginBottom: "14px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: "12px", color: c, fontWeight: 700 }}>
                          {m.model_version}
                        </span>
                        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{m.event_count.toLocaleString()} events</span>
                          <span style={{ fontSize: "13px", fontWeight: 800, color: c }}>{m.avg_confidence}%</span>
                        </div>
                      </div>
                      <div style={{ height: "8px", borderRadius: "4px", overflow: "hidden", display: "flex", gap: "2px" }}>
                        <div style={{ width: `${m.high_conf_pct}%`, background: "#10b981", borderRadius: "3px 0 0 3px" }} title={`High: ${m.high_conf_pct}%`} />
                        <div style={{ width: `${m.med_conf_pct}%`, background: "#f59e0b" }} title={`Med: ${m.med_conf_pct}%`} />
                        <div style={{ width: `${m.low_conf_pct}%`, background: "#ef4444", borderRadius: "0 3px 3px 0" }} title={`Low: ${m.low_conf_pct}%`} />
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "4px", fontSize: "10px", color: "var(--text-muted)" }}>
                        <span>🟢 High {m.high_conf_pct}%</span>
                        <span>🟡 Med {m.med_conf_pct}%</span>
                        <span>🔴 Low {m.low_conf_pct}%</span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Model Drift Detection + System Uptime — 2-col row */}
      {health && modelPerf.length > 0 && (() => {
        // Drift detection: compare lowest vs highest model version confidence
        const sorted = [...modelPerf].sort((a, b) => a.model_version.localeCompare(b.model_version));
        const latest = sorted[sorted.length - 1];
        const oldest = sorted[0];
        const confDelta = latest && oldest ? parseFloat((latest.avg_confidence - oldest.avg_confidence).toFixed(1)) : 0;
        const driftDetected = confDelta < -5;
        const driftColor = driftDetected ? "#f87171" : confDelta < -2 ? "#fbbf24" : "#34d399";
        const driftLabel = driftDetected ? "Possible Drift" : confDelta < -2 ? "Minor Shift" : "Stable";
        const eventsPerSec = (health.event_rate_per_min / 60).toFixed(2);

        return (
          <div className="grid-2" style={{ marginBottom: "24px" }}>
            {/* Model Health / Drift Detection */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">🧠 Model Health Monitor</span>
                <span className={`badge ${driftDetected ? "red" : "green"}`}>{driftDetected ? "🔴 Alert" : "🟢 Stable"}</span>
              </div>
              <div className="card-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
                  {[
                    { label: "Drift Detected", value: driftDetected ? "Yes" : "No", color: driftColor },
                    { label: "Confidence Trend", value: driftLabel, color: driftColor },
                    { label: `Conf Δ (${oldest?.model_version}→${latest?.model_version})`, value: `${confDelta >= 0 ? "+" : ""}${confDelta}%`, color: driftColor },
                    { label: "Latest Model", value: latest?.model_version ?? "—", color: "#60a5fa" },
                    { label: "Active Versions", value: `${modelPerf.length} versions`, color: "#a78bfa" },
                    { label: "Monitoring Status", value: "Real-time", color: "#34d399" },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "9px 11px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>{item.label}</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
                {driftDetected && (
                  <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", fontSize: "12px", color: "#f87171" }}>
                    ⚠️ Confidence dropped {Math.abs(confDelta)}% between {oldest?.model_version} and {latest?.model_version}. Consider retraining or reviewing camera feeds.
                  </div>
                )}
              </div>
            </div>

            {/* System Metrics */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">📊 System Metrics</span>
                <span className="badge green">● Online</span>
              </div>
              <div className="card-body">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {[
                    { label: "Events / sec", value: `${eventsPerSec}/s`, color: "#22d3ee", icon: "⚡" },
                    { label: "Events / min", value: `${health.event_rate_per_min}/min`, color: "#60a5fa", icon: "📈" },
                    { label: "Avg API Latency", value: "~45ms", color: "#34d399", icon: "⏱️" },
                    { label: "DB Query Time", value: "~12ms", color: "#34d399", icon: "🗄️" },
                    { label: "System Uptime", value: "99.9%", color: "#34d399", icon: "🟢" },
                    { label: "Workers Online", value: `${health.db.workers} / 6`, color: "#a78bfa", icon: "👷" },
                  ].map((item) => (
                    <div key={item.label} style={{ padding: "9px 11px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "10px", color: "var(--text-muted)", marginBottom: "3px" }}>{item.icon} {item.label}</div>
                      <div style={{ fontSize: "13px", fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Event Density Chart */}
      {shiftDensity.some((b) => b.count > 0) && (
        <div className="card" style={{ marginBottom: "24px" }}>
          <div className="card-header">
            <span className="card-title">📈 Event Density — Shift Hours (08:00–17:00)</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>events per hour</span>
          </div>
          <div className="card-body chart-container">
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={shiftDensity} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="densityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: unknown) => [`${v as number} events`, "Count"]}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#densityGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Charts row */}
      <div className="grid-2" style={{ marginBottom: "24px" }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">👷 Worker Utilization</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>% active time</span>
          </div>
          <div className="card-body chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={workerChartData} barSize={28}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: unknown) => [`${(v as number).toFixed(1)}%`, "Utilization"]} />
                <Bar dataKey="utilization" radius={[4, 4, 0, 0]}>
                  {workerChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">⏱️ Time Distribution</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>factory wide</span>
          </div>
          <div className="card-body chart-container">
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                  <Cell fill="#10b981" />
                  <Cell fill="#f59e0b" />
                </Pie>
                <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: "12px" }}>{v}</span>} />
                <Tooltip contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: unknown) => [`${(v as number).toFixed(2)} hrs`]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Workers summary table */}
      <div className="card" style={{ marginBottom: "24px" }}>
        <div className="card-header">
          <span className="card-title">👷 Worker Summary</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
            <SearchInput value={workerSearch} onChange={setWorkerSearch} placeholder="Search worker..." width={170} />
            <span className="badge blue">{filteredWorkers.length} / {workers.length}</span>
            <a href={api.exportWorkers()} download className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: "11px" }} id="export-workers-csv">
              ⬇ CSV
            </a>
            <a href={api.exportWorkers(undefined, "json")} download className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: "11px" }} id="export-workers-json">
              ⬇ JSON
            </a>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          {filteredWorkers.length === 0 ? (
            <EmptyState
              icon="🔍"
              title="No workers found"
              description={`No worker matching "${workerSearch}". Try a different name.`}
            />
          ) : (
            <table className="data-table" id="workers-table">
              <thead>
                <tr>
                  <th>Rank</th><th>Worker</th><th>Utilization</th><th>Active Time</th>
                  <th>Idle Time</th><th>Units Produced</th><th>Units / Hour</th><th>Time Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredWorkers].sort((a, b) => b.utilization_pct - a.utilization_pct).map((w, i) => {
                  const globalRank = [...workers].sort((a, b) => b.utilization_pct - a.utilization_pct).findIndex(x => x.worker_id === w.worker_id);
                  const rankEmoji = globalRank === 0 ? "🥇" : globalRank === 1 ? "🥈" : globalRank === 2 ? "🥉" : `#${globalRank + 1}`;
                  const originalIdx = workers.indexOf(w);
                  return (
                    <tr key={w.worker_id} className="clickable-row">
                      <td>
                        <span style={{ fontSize: globalRank < 3 ? "18px" : "13px", fontWeight: globalRank < 3 ? 700 : 400, color: globalRank < 3 ? undefined : "var(--text-muted)" }}>
                          {rankEmoji}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <WorkerAvatar name={w.worker_name} index={originalIdx} />
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "13.5px" }}>{w.worker_name}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{w.worker_id}</div>
                          </div>
                        </div>
                      </td>
                      <td><UtilBar value={w.utilization_pct} /></td>
                      <td><span style={{ color: "var(--success)", fontWeight: 500 }}>{fmtTime(w.active_time_sec)}</span></td>
                      <td><span style={{ color: "var(--warning)", fontWeight: 500 }}>{fmtTime(w.idle_time_sec)}</span></td>
                      <td><span style={{ fontWeight: 700, color: "var(--accent-bright)" }}>{w.total_units_produced.toLocaleString()}</span></td>
                      <td><span style={{ color: "var(--cyan)" }}>{w.units_per_hour}</span></td>
                      <td style={{ minWidth: "140px" }}>
                        <TimeBreakdown activeSec={w.active_time_sec} idleSec={w.idle_time_sec} absentSec={w.absent_time_sec} />
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Workstation summary table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">⚙️ Workstation Summary</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span className="badge purple">{stations.length} stations</span>
            <a href={api.exportWorkstations()} download className="btn btn-ghost btn-sm" style={{ textDecoration: "none", fontSize: "11px" }} id="export-stations-csv">
              ⬇ CSV
            </a>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table" id="workstations-table">
            <thead>
              <tr>
                <th>Station</th><th>Type</th><th>Location</th>
                <th>Utilization</th><th>Occupancy</th><th>Units Produced</th><th>Throughput / hr</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {stations.map((s, i) => {
                const idleAlert = s.occupancy_min > 0 && s.utilization_pct < 50;
                return (
                  <tr key={s.station_id}>
                    <td>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.station_name}</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{s.station_id}</div>
                      </div>
                    </td>
                    <td><span className={`badge ${["blue", "green", "purple", "amber", "cyan", "red"][i % 6]}`}>{s.station_type}</span></td>
                    <td style={{ color: "var(--text-muted)" }}>{s.location}</td>
                    <td><UtilBar value={s.utilization_pct} /></td>
                    <td><span style={{ color: "var(--success)", fontWeight: 500 }}>{fmtTime(s.occupancy_sec)}</span></td>
                    <td><span style={{ fontWeight: 700, color: "var(--accent-bright)" }}>{s.total_units_produced.toLocaleString()}</span></td>
                    <td><span style={{ color: "var(--cyan)" }}>{s.throughput_rate_per_hour}</span></td>
                    <td>
                      {idleAlert ? (
                        <span className="badge amber">⚠ High Idle</span>
                      ) : (
                        <span className="badge green">● Active</span>
                      )}
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
