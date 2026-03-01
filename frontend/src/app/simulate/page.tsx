"use client";
import { useState, useEffect, useRef } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/components/Toast";
import { api, EventType } from "@/lib/api";

interface Worker { id: string; name: string; }
interface Station { id: string; name: string; }

const EVENT_TYPES: { value: EventType; label: string; color: string; desc: string }[] = [
    { value: "working", label: "✅ Working", color: "var(--success)", desc: "Active productive work at station" },
    { value: "idle", label: "⏸️ Idle", color: "var(--warning)", desc: "Worker present but not productive" },
    { value: "absent", label: "❌ Absent", color: "var(--danger)", desc: "Worker not detected at station" },
    { value: "product_count", label: "📦 Product Count", color: "var(--cyan)", desc: "Units produced (requires count > 0)" },
];

const CAMERA_OPTIONS = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05", "CAM-06"];
const MODEL_OPTIONS = ["v1.0", "v1.1", "v1.2"];

// Speed options: label → interval ms
const SPEED_OPTIONS: { label: string; ms: number }[] = [
    { label: "0.5s", ms: 500 },
    { label: "1s", ms: 1000 },
    { label: "3s", ms: 3000 },
    { label: "5s", ms: 5000 },
];

export default function SimulatePage() {
    const { addToast } = useToast();
    const [workers, setWorkers] = useState<Worker[]>([]);
    const [stations, setStations] = useState<Station[]>([]);
    const [form, setForm] = useState({
        timestamp: new Date().toISOString().slice(0, 16),
        worker_id: "W1",
        workstation_id: "S1",
        event_type: "working" as EventType,
        confidence: "0.93",
        count: "1",
        camera_id: "CAM-01",
        model_version: "v1.2",
    });
    const [loading, setLoading] = useState(false);
    const [seeding, setSeeding] = useState(false);
    const [log, setLog] = useState<Array<{ ts: string; msg: string; type: string }>>([]);
    const [simulating, setSimulating] = useState(false);
    const [paused, setPaused] = useState(false);
    const [simCount, setSimCount] = useState(0);
    const [simSpeed, setSimSpeed] = useState(3000); // default 3s
    const simRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const pauseRef = useRef(false);

    useEffect(() => {
        Promise.all([api.getWorkers(), api.getWorkstations()]).then(([w, s]) => {
            setWorkers(w);
            setStations(s);
        });
    }, []);

    const addLog = (msg: string, type: string) =>
        setLog((prev) => [{ ts: new Date().toISOString(), msg, type }, ...prev.slice(0, 49)]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                timestamp: new Date(form.timestamp).toISOString(),
                worker_id: form.worker_id,
                workstation_id: form.workstation_id,
                event_type: form.event_type,
                confidence: parseFloat(form.confidence),
                count: form.event_type === "product_count" ? parseInt(form.count) || 0 : 0,
                camera_id: form.camera_id,
                model_version: form.model_version,
            };
            const res = await api.ingestEvent(payload);
            if (res.duplicate) {
                addToast("⚠️ Duplicate event — already exists (ignored)", "warning");
                addLog("DUPLICATE event skipped", "dup");
            } else if (res.success) {
                addToast(`✅ Event ingested! ID: ${res.event_id?.slice(0, 8)}…`, "success");
                addLog(`Ingested ${form.event_type} for ${form.worker_id} @ ${form.workstation_id} via ${form.camera_id}`, "success");
                const nextTs = new Date(new Date(form.timestamp).getTime() + 15 * 60 * 1000);
                setForm((f) => ({ ...f, timestamp: nextTs.toISOString().slice(0, 16) }));
            } else if (res.error && res.confidence !== undefined) {
                addToast(`❌ Rejected: confidence too low (${(res.confidence * 100).toFixed(0)}% < 40%)`, "error");
                addLog(`REJECTED: low confidence (${res.confidence})`, "error");
            } else {
                addToast(`❌ ${res.error || "Unknown error"}`, "error");
                addLog(res.error || "Unknown error", "error");
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Network error — is backend running?";
            addToast(`❌ ${msg}`, "error");
        } finally {
            setLoading(false);
        }
    };

    const TYPES: EventType[] = ["working", "working", "working", "idle", "absent", "product_count"];
    let countRef = useRef(0);

    const runOnce = async () => {
        if (pauseRef.current) return;
        const workerIdx = Math.floor(Math.random() * workers.length);
        const stationIdx = Math.floor(Math.random() * stations.length);
        const etype = TYPES[Math.floor(Math.random() * TYPES.length)];
        const conf = parseFloat((0.75 + Math.random() * 0.25).toFixed(2));
        const unitCount = etype === "product_count" ? Math.floor(Math.random() * 8) + 1 : 0;
        const camera = CAMERA_OPTIONS[stationIdx % CAMERA_OPTIONS.length];
        try {
            const res = await api.ingestEvent({
                timestamp: new Date().toISOString(),
                worker_id: workers[workerIdx]?.id || "W1",
                workstation_id: stations[stationIdx]?.id || "S1",
                event_type: etype,
                confidence: conf,
                count: unitCount,
                camera_id: camera,
                model_version: "v1.2",
            });
            countRef.current++;
            setSimCount(countRef.current);
            if (res.success) {
                addLog(`[SIM] ${etype} · W${workerIdx + 1} @ S${stationIdx + 1} · conf:${conf} · ${camera}`, "success");
            } else if (res.duplicate) {
                addLog(`[SIM] Duplicate skipped`, "dup");
            }
        } catch {
            addLog(`[SIM] Network error`, "error");
        }
    };

    const startSimulation = () => {
        countRef.current = 0;
        setSimCount(0);
        setPaused(false);
        pauseRef.current = false;
        setSimulating(true);
        addToast(`▶️ Simulation started — sending events every ${simSpeed / 1000}s`, "info");
        runOnce();
        simRef.current = setInterval(runOnce, simSpeed);
    };

    const stopSimulation = () => {
        if (simRef.current) clearInterval(simRef.current);
        simRef.current = null;
        setSimulating(false);
        setPaused(false);
        pauseRef.current = false;
        addToast("⏹ Simulation stopped", "info");
    };

    const pauseSimulation = () => {
        pauseRef.current = true;
        setPaused(true);
        addToast("⏸ Simulation paused", "info");
    };

    const resumeSimulation = () => {
        pauseRef.current = false;
        setPaused(false);
        addToast("▶️ Simulation resumed", "info");
    };

    // Clean up on unmount
    useEffect(() => () => { if (simRef.current) clearInterval(simRef.current); }, []);

    // Restart interval when speed changes mid-sim
    useEffect(() => {
        if (simulating && !paused) {
            if (simRef.current) clearInterval(simRef.current);
            simRef.current = setInterval(runOnce, simSpeed);
        }
    }, [simSpeed]); // eslint-disable-line

    const handleSeed = async () => {
        setSeeding(true);
        try {
            const res = await api.seedDatabase();
            addToast(`✅ Seeded: ${res.workers} workers, ${res.workstations} workstations, ${res.events} events`, "success");
            addLog(`Database re-seeded with ${res.events} events`, "success");
        } catch {
            addToast("❌ Seed failed — check backend connection", "error");
        } finally {
            setSeeding(false);
        }
    };

    const exampleEvent = {
        timestamp: "2026-03-01T10:15:00Z",
        worker_id: "W1",
        workstation_id: "S3",
        event_type: "working",
        confidence: 0.93,
        count: 1,
        camera_id: "CAM-03",
        model_version: "v1.2",
    };

    return (
        <DashboardLayout title="Simulate Events" subtitle="Manually ingest CCTV events or trigger auto-simulation">
            <div className="grid-2">
                {/* ── Left column ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>

                    {/* Ingest Form */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">📡 Ingest Event</span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>POST /api/events</span>
                        </div>
                        <div className="card-body">
                            <form onSubmit={handleSubmit} id="event-form">
                                <div className="grid-2" style={{ gap: "12px", marginBottom: "14px" }}>
                                    <div>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Worker *</label>
                                        <div className="select-wrap">
                                            <select id="worker-select" className="select-input" value={form.worker_id}
                                                onChange={(e) => setForm((f) => ({ ...f, worker_id: e.target.value }))}>
                                                {workers.map((w) => <option key={w.id} value={w.id}>{w.id} – {w.name}</option>)}
                                            </select>
                                            <span className="select-arrow">▼</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Workstation *</label>
                                        <div className="select-wrap">
                                            <select id="station-select" className="select-input" value={form.workstation_id}
                                                onChange={(e) => setForm((f) => ({ ...f, workstation_id: e.target.value }))}>
                                                {stations.map((s) => <option key={s.id} value={s.id}>{s.id} – {s.name}</option>)}
                                            </select>
                                            <span className="select-arrow">▼</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid-2" style={{ gap: "12px", marginBottom: "14px" }}>
                                    <div>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Camera ID</label>
                                        <div className="select-wrap">
                                            <select className="select-input" value={form.camera_id}
                                                onChange={(e) => setForm((f) => ({ ...f, camera_id: e.target.value }))}>
                                                {CAMERA_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                            <span className="select-arrow">▼</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Model Version</label>
                                        <div className="select-wrap">
                                            <select className="select-input" value={form.model_version}
                                                onChange={(e) => setForm((f) => ({ ...f, model_version: e.target.value }))}>
                                                {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                            <span className="select-arrow">▼</span>
                                        </div>
                                    </div>
                                </div>

                                <div style={{ marginBottom: "14px" }}>
                                    <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Event Type *</label>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                                        {EVENT_TYPES.map((t) => (
                                            <button key={t.value} type="button" className="btn btn-ghost"
                                                style={{
                                                    justifyContent: "flex-start",
                                                    border: form.event_type === t.value ? `1px solid ${t.color}` : "1px solid var(--border)",
                                                    background: form.event_type === t.value ? `${t.color}18` : undefined,
                                                    color: form.event_type === t.value ? t.color : "var(--text-secondary)",
                                                    fontSize: "12.5px",
                                                }}
                                                onClick={() => setForm((f) => ({ ...f, event_type: t.value }))}
                                                id={`event-type-${t.value}`} title={t.desc}>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ marginBottom: "14px" }}>
                                    <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>Timestamp *</label>
                                    <input id="timestamp-input" type="datetime-local" className="select-input"
                                        style={{ width: "100%" }} value={form.timestamp}
                                        onChange={(e) => setForm((f) => ({ ...f, timestamp: e.target.value }))} />
                                </div>

                                <div className="grid-2" style={{ gap: "12px", marginBottom: "16px" }}>
                                    <div>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                                            Confidence (0–1)
                                            <span style={{ marginLeft: "6px", color: "#a78bfa", fontSize: "10px" }}>min 0.4</span>
                                        </label>
                                        <input id="confidence-input" type="number" min="0" max="1" step="0.01"
                                            className="select-input" style={{ width: "100%" }} value={form.confidence}
                                            onChange={(e) => setForm((f) => ({ ...f, confidence: e.target.value }))} />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: "12px", color: "var(--text-muted)", display: "block", marginBottom: "6px" }}>
                                            Count {form.event_type !== "product_count" && <span style={{ marginLeft: "6px", color: "var(--text-muted)", fontSize: "10px" }}>(product_count only)</span>}
                                        </label>
                                        <input id="count-input" type="number" min="0" className="select-input"
                                            style={{ width: "100%", opacity: form.event_type !== "product_count" ? 0.4 : 1, cursor: form.event_type !== "product_count" ? "not-allowed" : "text" }}
                                            value={form.event_type === "product_count" ? form.count : "0"}
                                            disabled={form.event_type !== "product_count"}
                                            onChange={(e) => setForm((f) => ({ ...f, count: e.target.value }))} />
                                    </div>
                                </div>

                                <button className="btn btn-primary" type="submit" id="submit-event-btn"
                                    disabled={loading} style={{ width: "100%" }}>
                                    {loading ? "⏳ Ingesting..." : "📡 Ingest Event"}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Auto Simulator */}
                    <div className="card">
                        <div className="card-header">
                            <span className="card-title">🎛️ Auto Simulator</span>
                            {simulating && (
                                <span className="badge green" style={{ animation: "pulse-ring 2s infinite" }}>
                                    {paused ? "⏸ Paused" : "⚡ Live"} · {simCount} events
                                </span>
                            )}
                        </div>
                        <div className="card-body">
                            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
                                Sends random CCTV events at the selected speed to simulate a live production floor.
                            </p>

                            {/* Speed selector */}
                            <div style={{ marginBottom: "14px" }}>
                                <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px" }}>
                                    Simulation Speed:
                                </div>
                                <div style={{ display: "flex", gap: "6px" }}>
                                    {SPEED_OPTIONS.map((opt) => (
                                        <button key={opt.ms} type="button"
                                            className={`btn btn-sm ${simSpeed === opt.ms ? "btn-primary" : "btn-ghost"}`}
                                            onClick={() => setSimSpeed(opt.ms)}
                                            disabled={simulating && !paused}
                                            id={`speed-${opt.label}`}>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Simulation event counter bar */}
                            {simulating && (
                                <div style={{ marginBottom: "14px", padding: "10px 14px", background: "rgba(16,185,129,0.05)", borderRadius: "8px", border: "1px solid rgba(16,185,129,0.15)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                                        <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Events sent</span>
                                        <span style={{ fontWeight: 800, fontSize: "22px", color: "#34d399", fontVariantNumeric: "tabular-nums" }}>
                                            {simCount}
                                        </span>
                                    </div>
                                    <div style={{ height: "4px", background: "rgba(255,255,255,0.07)", borderRadius: "2px", overflow: "hidden" }}>
                                        <div style={{ height: "100%", width: `${Math.min((simCount % 20) * 5, 100)}%`, background: paused ? "#f59e0b" : "#34d399", borderRadius: "2px", transition: "width 0.3s" }} />
                                    </div>
                                </div>
                            )}

                            <div style={{ display: "flex", gap: "8px" }}>
                                {!simulating ? (
                                    <button className="btn btn-primary" onClick={startSimulation}
                                        id="auto-simulate-btn" disabled={workers.length === 0} style={{ flex: 1 }}>
                                        ▶️ Start Simulation
                                    </button>
                                ) : (
                                    <>
                                        {paused ? (
                                            <button className="btn btn-success" onClick={resumeSimulation}
                                                id="resume-sim-btn" style={{ flex: 1 }}>
                                                ▶️ Resume
                                            </button>
                                        ) : (
                                            <button className="btn btn-ghost" onClick={pauseSimulation}
                                                id="pause-sim-btn" style={{ flex: 1 }}>
                                                ⏸ Pause
                                            </button>
                                        )}
                                        <button className="btn btn-danger" onClick={stopSimulation}
                                            id="stop-sim-btn" style={{ flex: 1 }}>
                                            ⏹ Stop
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Seed Panel */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">🌱 Database Seeding</span></div>
                        <div className="card-body">
                            <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
                                Clears all data and seeds 3 days of realistic events with <code style={{ color: "#a78bfa" }}>camera_id</code> and <code style={{ color: "#a78bfa" }}>model_version</code>.
                            </p>
                            <button className="btn btn-success" onClick={handleSeed} disabled={seeding} id="seed-db-btn" style={{ width: "100%" }}>
                                {seeding ? "⏳ Seeding..." : "🌱 Seed / Refresh Database"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── Right column ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    {/* API Reference */}
                    <div className="card">
                        <div className="card-header"><span className="card-title">📚 API Reference</span></div>
                        <div className="card-body">
                            <div style={{ marginBottom: "12px" }}>
                                <span className="badge green" style={{ marginRight: "8px" }}>POST</span>
                                <span className="mono">/api/events</span>
                            </div>
                            <pre style={{
                                background: "rgba(0,0,0,0.3)", border: "1px solid var(--border)",
                                borderRadius: "8px", padding: "14px", fontSize: "12px",
                                color: "#a5f3fc", overflow: "auto",
                                fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.6,
                            }}>
                                {JSON.stringify(exampleEvent, null, 2)}
                            </pre>
                            <div style={{ marginTop: "16px" }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "10px" }}>
                                    ML-Ops Features:
                                </div>
                                {[
                                    ["🛡️", "Confidence gate: rejects events with confidence < 0.4"],
                                    ["🔁", "Deduplication: unique index on (worker, station, timestamp, type)"],
                                    ["🔢", "Event IDs: UUID v4 for every ingested event"],
                                    ["📷", "Camera tracking: camera_id per workstation"],
                                    ["🤖", "Model versioning: model_version field on all events"],
                                    ["📋", "Batch ingest: POST /api/events/batch"],
                                    ["🗂️", "Pagination: limit + offset on GET /api/events"],
                                    ["📊", "Trends: GET /api/metrics/trends (day-over-day delta)"],
                                    ["📤", "Export: GET /api/export/workers|workstations|events"],
                                ].map(([icon, desc]) => (
                                    <div key={desc} style={{ display: "flex", gap: "8px", marginBottom: "7px", fontSize: "12px" }}>
                                        <span>{icon}</span>
                                        <span style={{ color: "var(--text-secondary)" }}>{desc}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Ingest log */}
                    <div className="card" style={{ flex: 1 }}>
                        <div className="card-header">
                            <span className="card-title">📝 Ingest Log</span>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{log.length} entries</span>
                                {log.length > 0 && (
                                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setLog([])}
                                        style={{ fontSize: "10px", padding: "4px 8px" }}>Clear</button>
                                )}
                            </div>
                        </div>
                        <div className="card-body" style={{ padding: "12px 16px" }}>
                            {log.length === 0 ? (
                                <p style={{ fontSize: "13px", color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                                    No events ingested yet.
                                </p>
                            ) : (
                                <div className="event-feed">
                                    {log.map((entry, i) => (
                                        <div key={i} className="event-item" style={{
                                            animation: i === 0 ? "fadeInDown 0.3s ease" : undefined,
                                        }}>
                                            <span className="event-dot" style={{
                                                background: entry.type === "success" ? "var(--success)"
                                                    : entry.type === "dup" ? "var(--warning)"
                                                        : "var(--danger)",
                                            }} />
                                            <div>
                                                <div style={{ fontSize: "12px", color: "var(--text-primary)" }}>{entry.msg}</div>
                                                <div style={{ fontSize: "10.5px", color: "var(--text-muted)", marginTop: "2px" }}>
                                                    {new Date(entry.ts).toLocaleTimeString()}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </DashboardLayout>
    );
}
