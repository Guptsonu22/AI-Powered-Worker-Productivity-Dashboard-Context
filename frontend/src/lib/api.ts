const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type EventType = "working" | "idle" | "absent" | "product_count";

export interface WorkerMetric {
    worker_id: string;
    worker_name: string;
    active_time_sec: number;
    idle_time_sec: number;
    absent_time_sec: number;
    active_time_min: number;
    idle_time_min: number;
    utilization_pct: number;
    total_units_produced: number;
    units_per_hour: number;
}

export interface WorkstationMetric {
    station_id: string;
    station_name: string;
    station_type: string;
    location: string;
    occupancy_sec: number;
    occupancy_min: number;
    utilization_pct: number;
    total_units_produced: number;
    throughput_rate_per_hour: number;
}

export interface FactoryMetric {
    total_active_time_sec: number;
    total_active_time_hours: number;
    total_idle_time_sec: number;
    total_idle_time_hours: number;
    total_production_count: number;
    avg_worker_utilization_pct: number;
    avg_station_utilization_pct: number;
    avg_production_rate_per_hour: number;
    total_events_processed: number;
    active_workers: number;
    active_stations: number;
}

export interface Worker {
    id: string;
    name: string;
    role: string;
    shift_start: string;
    shift_end: string;
}

export interface Workstation {
    id: string;
    name: string;
    type: string;
    location: string;
}

export interface HealthStatus {
    status: string;
    timestamp: string;
    db: { workers: number; workstations: number; events: number };
    event_rate_per_min: number;
    avg_confidence: number;
    latest_event_at: string | null;
    model_versions: string[];
    confidence_threshold: number;
}

export interface TrendEntry {
    current: number;
    previous: number;
    delta_pct: number | null;
}

export interface TrendData {
    available: boolean;
    current_date?: string;
    previous_date?: string;
    trends?: {
        total_production: TrendEntry;
        avg_utilization: TrendEntry;
        active_time_hours: TrendEntry;
        idle_time_hours: TrendEntry;
        production_rate: TrendEntry;
        station_utilization: TrendEntry;
    };
}

export interface ModelPerformance {
    model_version: string;
    event_count: number;
    avg_confidence: number;
    min_confidence: number;
    max_confidence: number;
    high_conf_pct: number;
    med_conf_pct: number;
    low_conf_pct: number;
}

export interface EventDensityBucket {
    hour: string;
    count: number;
}

export interface CctvEvent {
    id: string;
    timestamp: string;
    worker_id: string;
    workstation_id: string;
    event_type: string;
    confidence: number;
    count: number;
    source: string;
    camera_id: string;
    model_version: string;
    created_at: string;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
        cache: "no-store",
        ...options,
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${path}`);
    return res.json();
}

export const api = {
    getWorkers: () => fetchJSON<Worker[]>("/api/workers"),
    getWorkstations: () => fetchJSON<Workstation[]>("/api/workstations"),
    getDates: () => fetchJSON<string[]>("/api/dates"),
    getHealth: () => fetchJSON<HealthStatus>("/api/health"),

    getWorkerMetrics: (date?: string) =>
        fetchJSON<{ metrics: WorkerMetric[]; date: string; count: number }>(
            `/api/metrics/workers${date ? `?date=${date}` : ""}`
        ),
    getWorkstationMetrics: (date?: string) =>
        fetchJSON<{ metrics: WorkstationMetric[]; date: string; count: number }>(
            `/api/metrics/workstations${date ? `?date=${date}` : ""}`
        ),
    getFactoryMetrics: (date?: string) =>
        fetchJSON<{ metrics: FactoryMetric; date: string }>(
            `/api/metrics/factory${date ? `?date=${date}` : ""}`
        ),
    getWorkerMetric: (id: string, date?: string) =>
        fetchJSON<WorkerMetric>(`/api/metrics/worker/${id}${date ? `?date=${date}` : ""}`),
    getWorkstationMetric: (id: string, date?: string) =>
        fetchJSON<WorkstationMetric>(`/api/metrics/workstation/${id}${date ? `?date=${date}` : ""}`),

    getEvents: (params: {
        worker_id?: string;
        workstation_id?: string;
        event_type?: string;
        date?: string;
        limit?: number;
        offset?: number;
        min_confidence?: number;
    }) => {
        const qs = new URLSearchParams();
        if (params.worker_id) qs.set("worker_id", params.worker_id);
        if (params.workstation_id) qs.set("workstation_id", params.workstation_id);
        if (params.event_type) qs.set("event_type", params.event_type);
        if (params.date) qs.set("date", params.date);
        if (params.limit != null) qs.set("limit", String(params.limit));
        if (params.offset != null) qs.set("offset", String(params.offset));
        if (params.min_confidence != null) qs.set("min_confidence", String(params.min_confidence));
        return fetchJSON<{ events: CctvEvent[]; total: number; limit: number; offset: number }>(
            `/api/events?${qs}`
        );
    },

    seedDatabase: () =>
        fetch(`${API_URL}/api/seed`, { method: "POST" }).then((r) => r.json()),

    ingestEvent: (event: {
        timestamp: string;
        worker_id: string;
        workstation_id: string;
        event_type: EventType;
        confidence?: number;
        count?: number;
        camera_id?: string;
        model_version?: string;
    }) =>
        fetch(`${API_URL}/api/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(event),
        }).then((r) => r.json()),

    getTrends: () =>
        fetchJSON<TrendData>("/api/metrics/trends"),

    getEventDensity: (date?: string) =>
        fetchJSON<{ density: EventDensityBucket[]; date: string }>(
            `/api/metrics/event-density${date ? `?date=${date}` : ""}`
        ),

    getModelPerformance: () =>
        fetchJSON<{ models: ModelPerformance[] }>("/api/metrics/model-performance"),

    exportWorkers: (date?: string, format: "csv" | "json" = "csv") =>
        `${API_URL}/api/export/workers?format=${format}${date ? `&date=${date}` : ""}`,

    exportWorkstations: (date?: string, format: "csv" | "json" = "csv") =>
        `${API_URL}/api/export/workstations?format=${format}${date ? `&date=${date}` : ""}`,

    exportEvents: (date?: string, format: "csv" | "json" = "csv") =>
        `${API_URL}/api/export/events?format=${format}${date ? `&date=${date}` : ""}`,
};

