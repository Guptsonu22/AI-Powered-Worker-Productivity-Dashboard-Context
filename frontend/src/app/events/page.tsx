"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Loader, ErrorState } from "@/components/UI";
import { api, CctvEvent } from "@/lib/api";

const EVENT_COLORS: Record<string, { color: string; label: string; bg: string }> = {
    working: { color: "#34d399", label: "✅ Working", bg: "rgba(16,185,129,0.12)" },
    idle: { color: "#fbbf24", label: "⏸️ Idle", bg: "rgba(245,158,11,0.12)" },
    absent: { color: "#f87171", label: "❌ Absent", bg: "rgba(239,68,68,0.12)" },
    product_count: { color: "#22d3ee", label: "📦 Product Count", bg: "rgba(6,182,212,0.12)" },
};

function ConfidenceBadge({ value }: { value: number }) {
    const pct = (value * 100).toFixed(1);
    const color = value >= 0.85 ? "#34d399" : value >= 0.7 ? "#fbbf24" : "#f87171";
    const bg = value >= 0.85 ? "rgba(16,185,129,0.12)" : value >= 0.7 ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)";
    return (
        <span style={{ background: bg, color, fontWeight: 600, fontFamily: "monospace", fontSize: "12px", padding: "3px 8px", borderRadius: "5px" }}>
            {pct}%
        </span>
    );
}

// ─── Event Detail Modal ──────────────────────────────────────────
function EventModal({ event, workerName, stationName, onClose }: {
    event: CctvEvent;
    workerName: string;
    stationName: string;
    onClose: () => void;
}) {
    const et = EVENT_COLORS[event.event_type] || { color: "#94a3b8", label: event.event_type, bg: "" };
    const isCrit = event.event_type === "absent" || event.confidence < 0.70;
    const ingested = new Date(event.created_at);
    const occurred = new Date(event.timestamp);
    const latencyMs = Math.max(0, ingested.getTime() - occurred.getTime());
    const latencyLabel = latencyMs > 3600000
        ? `${Math.round(latencyMs / 3600000)}h`
        : latencyMs > 60000
            ? `${Math.round(latencyMs / 60000)}m`
            : `${(latencyMs / 1000).toFixed(1)}s`;

    // Close on Escape key
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const rows: { label: string; value: React.ReactNode; mono?: boolean }[] = [
        { label: "Event ID", value: event.id, mono: true },
        { label: "Event Type", value: <span style={{ background: et.bg, color: et.color, padding: "2px 10px", borderRadius: "5px", fontWeight: 600 }}>{et.label}</span> },
        { label: "Worker", value: `${event.worker_id} — ${workerName}` },
        { label: "Workstation", value: `${event.workstation_id} — ${stationName}` },
        { label: "Camera", value: event.camera_id || "—", mono: true },
        { label: "Model Version", value: event.model_version || "v1.0", mono: true },
        { label: "Confidence", value: <ConfidenceBadge value={event.confidence} /> },
        { label: "Units (count)", value: event.count > 0 ? <span style={{ color: "#22d3ee", fontWeight: 700 }}>{event.count}</span> : "—" },
        { label: "Occurred At", value: new Date(event.timestamp).toLocaleString(), mono: true },
        { label: "Ingested At", value: ingested.toLocaleString(), mono: true },
        { label: "Processing Lag", value: <span style={{ color: latencyMs < 5000 ? "#34d399" : "#fbbf24" }}>{latencyLabel}</span> },
        { label: "Risk", value: isCrit ? <span className="badge red">⚠ Critical</span> : <span className="badge green">✓ Normal</span> },
    ];

    return (
        <div
            style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
            onClick={onClose}
        >
            <div
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: "14px", width: "min(580px, 94vw)", maxHeight: "88vh", overflow: "auto", boxShadow: "0 24px 80px rgba(0,0,0,0.6)", animation: "fadeInDown 0.2s ease" }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ padding: "18px 22px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                        <div style={{ fontWeight: 800, fontSize: "16px", marginBottom: "3px" }}>📋 Event Detail</div>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>{event.id}</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: "18px", lineHeight: 1 }}>×</button>
                </div>

                {/* Alert strip if critical */}
                {isCrit && (
                    <div style={{ margin: "12px 22px 0", padding: "8px 14px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", fontSize: "12px", color: "#f87171" }}>
                        ⚠️ This event is flagged as critical — {event.event_type === "absent" ? "worker absent" : `low confidence (${(event.confidence * 100).toFixed(1)}%)`}
                    </div>
                )}

                {/* Detail rows */}
                <div style={{ padding: "16px 22px 22px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "145px 1fr", gap: "2px" }}>
                        {rows.map((row) => (
                            <div key={row.label} style={{ display: "contents" }}>
                                <div style={{ padding: "8px 10px", fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", background: "rgba(255,255,255,0.02)", borderRadius: "4px 0 0 4px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                    {row.label}
                                </div>
                                <div style={{ padding: "8px 10px", fontSize: "12.5px", color: "var(--text-primary)", display: "flex", alignItems: "center", background: "rgba(255,255,255,0.02)", borderRadius: "0 4px 4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)", fontFamily: row.mono ? "monospace" : undefined }}>
                                    {row.value}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{ marginTop: "16px", textAlign: "right" }}>
                        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

const PAGE_SIZE = 20;

export default function EventsPage() {
    const [events, setEvents] = useState<CctvEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterWorker, setFilterWorker] = useState("");
    const [filterStation, setFilterStation] = useState("");
    const [filterType, setFilterType] = useState("");
    const [filterDate, setFilterDate] = useState("");
    const [minConf, setMinConf] = useState("");
    const [dates, setDates] = useState<string[]>([]);
    const [workers, setWorkers] = useState<{ id: string; name: string }[]>([]);
    const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
    const [page, setPage] = useState(0);
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [selectedEvent, setSelectedEvent] = useState<CctvEvent | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const load = useCallback(async (pg = page) => {
        setLoading(true);
        setError(null);
        try {
            const [evtRes, d, w, s] = await Promise.all([
                api.getEvents({
                    worker_id: filterWorker || undefined,
                    workstation_id: filterStation || undefined,
                    event_type: filterType || undefined,
                    date: filterDate || undefined,
                    min_confidence: minConf ? parseFloat(minConf) : undefined,
                    limit: PAGE_SIZE,
                    offset: pg * PAGE_SIZE,
                }),
                api.getDates(),
                api.getWorkers(),
                api.getWorkstations(),
            ]);
            setEvents(evtRes.events || []);
            setTotal(evtRes.total || 0);
            setDates(d);
            setWorkers(w);
            setStations(s);
            setLastUpdated(new Date());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to load events");
        } finally {
            setLoading(false);
        }
    }, [filterWorker, filterStation, filterType, filterDate, minConf, page]);

    useEffect(() => { load(0); setPage(0); }, [filterWorker, filterStation, filterType, filterDate, minConf]);
    useEffect(() => { load(page); }, [page]);

    // Auto-refresh toggle
    useEffect(() => {
        if (autoRefresh) {
            intervalRef.current = setInterval(() => load(page), 5000);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }, [autoRefresh, load, page]);

    const totalPages = Math.ceil(total / PAGE_SIZE);
    const workerMap = Object.fromEntries(workers.map((w) => [w.id, w.name]));
    const stationMap = Object.fromEntries(stations.map((s) => [s.id, s.name]));

    // Last event "X ago" live counter
    const latestEventTime = events[0] ? new Date(events[0].timestamp) : null;
    const [lastEventAgo, setLastEventAgo] = useState("—");
    useEffect(() => {
        const update = () => {
            if (!latestEventTime) { setLastEventAgo("—"); return; }
            const sec = Math.floor((Date.now() - latestEventTime.getTime()) / 1000);
            if (sec < 5) setLastEventAgo("just now");
            else if (sec < 60) setLastEventAgo(`${sec}s ago`);
            else setLastEventAgo(`${Math.floor(sec / 60)}m ago`);
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [latestEventTime]);

    const actions = (
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {latestEventTime && (
                <div style={{ fontSize: "11px", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span className="status-dot green" style={{ width: "6px", height: "6px" }} />
                    Last event: <strong style={{ color: "var(--text-secondary)" }}>{lastEventAgo}</strong>
                </div>
            )}
            <button
                id="auto-refresh-toggle"
                className={`btn btn-sm ${autoRefresh ? "btn-success" : "btn-ghost"}`}
                onClick={() => setAutoRefresh((v) => !v)}
                style={{ minWidth: "160px" }}
            >
                {autoRefresh ? "🔴 Auto Refresh: ON" : "⚪ Auto Refresh: OFF"}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => load(page)} id="refresh-events-btn">🔄 Refresh</button>
        </div>
    );

    return (
        <DashboardLayout title="Event Feed" subtitle="Live CCTV AI event stream" actions={actions} lastUpdated={lastUpdated}>
            {/* Event Detail Modal */}
            {selectedEvent && (
                <EventModal
                    event={selectedEvent}
                    workerName={workerMap[selectedEvent.worker_id] || selectedEvent.worker_id}
                    stationName={stationMap[selectedEvent.workstation_id] || selectedEvent.workstation_id}
                    onClose={() => setSelectedEvent(null)}
                />
            )}

            {/* Filters */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "20px", alignItems: "center" }}>
                <div className="select-wrap" style={{ width: "160px" }}>
                    <select className="select-input" value={filterWorker} onChange={(e) => setFilterWorker(e.target.value)}>
                        <option value="">All Workers</option>
                        {workers.map((w) => <option key={w.id} value={w.id}>{w.id} – {w.name}</option>)}
                    </select>
                    <span className="select-arrow">▼</span>
                </div>
                <div className="select-wrap" style={{ width: "205px" }}>
                    <select className="select-input" value={filterStation} onChange={(e) => setFilterStation(e.target.value)}>
                        <option value="">All Stations</option>
                        {stations.map((s) => <option key={s.id} value={s.id}>{s.id} – {s.name}</option>)}
                    </select>
                    <span className="select-arrow">▼</span>
                </div>
                <div className="select-wrap" style={{ width: "155px" }}>
                    <select className="select-input" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                        <option value="">All Types</option>
                        <option value="working">Working</option>
                        <option value="idle">Idle</option>
                        <option value="absent">Absent</option>
                        <option value="product_count">Product Count</option>
                    </select>
                    <span className="select-arrow">▼</span>
                </div>
                <div className="select-wrap" style={{ width: "155px" }}>
                    <select className="select-input" value={filterDate} onChange={(e) => setFilterDate(e.target.value)}>
                        <option value="">All Dates</option>
                        {dates.map((d) => (
                            <option key={d} value={d}>
                                {new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                            </option>
                        ))}
                    </select>
                    <span className="select-arrow">▼</span>
                </div>
                <div className="select-wrap" style={{ width: "160px" }}>
                    <select className="select-input" value={minConf} onChange={(e) => setMinConf(e.target.value)}>
                        <option value="">Min Confidence: Any</option>
                        <option value="0.4">≥ 40% (threshold)</option>
                        <option value="0.6">≥ 60%</option>
                        <option value="0.75">≥ 75%</option>
                        <option value="0.85">≥ 85% (high)</option>
                        <option value="0.9">≥ 90% (very high)</option>
                    </select>
                    <span className="select-arrow">▼</span>
                </div>

                {autoRefresh && (
                    <div className="badge green" style={{ animation: "pulse 1.5s infinite" }}>
                        ⚡ Live — refreshing every 5s
                    </div>
                )}
            </div>

            {error && <div style={{ marginBottom: "16px" }}><ErrorState message={error} /></div>}

            <div className="card">
                <div className="card-header">
                    <span className="card-title">📡 CCTV Event Log</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>
                            💡 Click any row for full detail
                        </span>
                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                            {events.length} of {total.toLocaleString()} events
                        </span>
                        {lastUpdated && (
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                                · updated {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </div>
                </div>

                {loading ? (
                    <Loader text="Loading events..." />
                ) : (
                    <>
                        <div style={{ overflowX: "auto" }}>
                            <table className="data-table" id="events-table">
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>Event ID</th>
                                        <th>Event Type</th>
                                        <th>Worker</th>
                                        <th>Workstation</th>
                                        <th>Camera</th>
                                        <th>Model</th>
                                        <th>Confidence</th>
                                        <th>Count</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map((e, rowIdx) => {
                                        const et = EVENT_COLORS[e.event_type] || { color: "#94a3b8", label: e.event_type, bg: "" };
                                        const isCrit = e.event_type === "absent" || e.confidence < 0.70;
                                        const isNewest = rowIdx === 0 && autoRefresh;
                                        return (
                                            <tr
                                                key={e.id}
                                                className="clickable-row"
                                                title="Click to view full event details"
                                                onClick={() => setSelectedEvent(e)}
                                                style={{
                                                    background: isCrit ? "rgba(239,68,68,0.06)" : undefined,
                                                    boxShadow: isCrit ? "inset 3px 0 0 #ef4444" : undefined,
                                                    animation: isNewest ? "fadeInDown 0.4s ease" : undefined,
                                                    cursor: "pointer",
                                                }}
                                            >
                                                <td>
                                                    <span className="mono" style={{ color: "var(--text-secondary)", fontSize: "11.5px" }}>
                                                        {new Date(e.timestamp).toLocaleString()}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className="mono" style={{ color: "var(--text-muted)", fontSize: "10.5px" }}>
                                                        {e.id.slice(0, 8)}…
                                                    </span>
                                                </td>
                                                <td>
                                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", background: et.bg, color: et.color, padding: "3px 10px", borderRadius: "5px", fontWeight: 500, fontSize: "12.5px" }}>
                                                        {et.label}
                                                    </span>
                                                </td>
                                                <td>
                                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                                        <span className="badge blue" style={{ fontSize: "10.5px", alignSelf: "flex-start" }}>{e.worker_id}</span>
                                                        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{workerMap[e.worker_id] || ""}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: "flex", flexDirection: "column" }}>
                                                        <span className="badge purple" style={{ fontSize: "10.5px", alignSelf: "flex-start" }}>{e.workstation_id}</span>
                                                        <span style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{stationMap[e.workstation_id] || ""}</span>
                                                    </div>
                                                </td>
                                                <td>
                                                    <span style={{ color: "var(--text-secondary)", fontSize: "12px", fontFamily: "monospace" }}>{e.camera_id || "—"}</span>
                                                </td>
                                                <td>
                                                    <span style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", padding: "2px 7px", borderRadius: "4px", fontSize: "11px", fontFamily: "monospace" }}>
                                                        {e.model_version || "v1.0"}
                                                    </span>
                                                </td>
                                                <td><ConfidenceBadge value={e.confidence} /></td>
                                                <td>
                                                    {e.count > 0
                                                        ? <span style={{ color: "var(--cyan)", fontWeight: 700, fontSize: "13px" }}>{e.count}</span>
                                                        : <span style={{ color: "var(--text-muted)" }}>—</span>
                                                    }
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div style={{ padding: "14px 22px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                                    Page {page + 1} of {totalPages} · {total.toLocaleString()} total events
                                </span>
                                <div style={{ display: "flex", gap: "6px" }}>
                                    <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage(0)}>⟪ First</button>
                                    <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Prev</button>
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        const start = Math.max(0, Math.min(page - 2, totalPages - 5));
                                        const pg = start + i;
                                        return (
                                            <button key={pg} className={`btn btn-sm ${pg === page ? "btn-primary" : "btn-ghost"}`} onClick={() => setPage(pg)}>
                                                {pg + 1}
                                            </button>
                                        );
                                    })}
                                    <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>Next →</button>
                                    <button className="btn btn-ghost btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last ⟫</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </DashboardLayout>
    );
}
