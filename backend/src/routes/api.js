const express = require("express");
const router = express.Router();
const { queryAll, queryOne, run, runMany } = require("../db");
const { v4: uuidv4 } = require("uuid");
const { seed } = require("../seed");
const {
    computeWorkerMetrics,
    computeWorkstationMetrics,
    computeFactoryMetrics,
} = require("../services/metrics");

// ─── POST /api/events ─────────────────────────────────────────────
router.post("/events", async (req, res) => {
    try {
        const {
            timestamp, worker_id, workstation_id, event_type,
            confidence = 1.0, count = 0,
            camera_id = "CAM-01", model_version = "v1.0",
        } = req.body;

        if (!timestamp || !worker_id || !workstation_id || !event_type) {
            return res.status(400).json({
                error: "Missing required fields: timestamp, worker_id, workstation_id, event_type",
            });
        }

        const validTypes = ["working", "idle", "absent", "product_count"];
        if (!validTypes.includes(event_type)) {
            return res.status(400).json({
                error: `Invalid event_type. Must be one of: ${validTypes.join(", ")}`,
            });
        }

        const conf = parseFloat(confidence);
        if (conf < 0.4) {
            return res.status(422).json({
                error: "Event rejected: confidence below minimum threshold (0.4)",
                confidence: conf,
                threshold: 0.4,
            });
        }

        const worker = await queryOne("SELECT id FROM workers WHERE id = ?", [worker_id]);
        if (!worker) return res.status(404).json({ error: `Worker '${worker_id}' not found` });

        const station = await queryOne("SELECT id FROM workstations WHERE id = ?", [workstation_id]);
        if (!station) return res.status(404).json({ error: `Workstation '${workstation_id}' not found` });

        const normalizedTs = new Date(timestamp).toISOString();
        const id = uuidv4();

        try {
            await run(
                `INSERT INTO events
         (id, timestamp, worker_id, workstation_id, event_type, confidence, count, camera_id, model_version)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [id, normalizedTs, worker_id, workstation_id, event_type, conf, count || 0, camera_id, model_version]
            );
            return res.status(201).json({
                success: true,
                event_id: id,
                message: "Event ingested successfully",
            });
        } catch (err) {
            if (err.message && err.message.includes("dup") || err.code === "23505" || err.message.includes("UNIQUE")) {
                return res.status(409).json({
                    success: false,
                    message: "Duplicate event ignored",
                    duplicate: true,
                });
            }
            throw err;
        }
    } catch (err) {
        console.error("POST /events error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// ─── POST /api/events/batch ───────────────────────────────────────
router.post("/events/batch", async (req, res) => {
    try {
        const { events } = req.body;
        if (!Array.isArray(events) || events.length === 0) {
            return res.status(400).json({ error: "Body must have an 'events' array" });
        }

        const rows = events
            .filter((e) => (parseFloat(e.confidence) || 1.0) >= 0.4)
            .map((e) => [
                uuidv4(),
                new Date(e.timestamp).toISOString(),
                e.worker_id,
                e.workstation_id,
                e.event_type,
                parseFloat(e.confidence) || 1.0,
                e.count || 0,
                e.camera_id || "CAM-01",
                e.model_version || "v1.0",
            ]);

        const rejected = events.length - rows.length;
        const result = await runMany(
            `INSERT INTO events
       (id, timestamp, worker_id, workstation_id, event_type, confidence, count, camera_id, model_version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            rows
        );
        res.json({ success: true, ...result, rejected_low_confidence: rejected });
    } catch (err) {
        console.error("POST /events/batch error:", err);
        res.status(500).json({ error: "Internal server error", details: err.message });
    }
});

// ─── GET /api/events ──────────────────────────────────────────────
router.get("/events", async (req, res) => {
    try {
        const {
            worker_id, workstation_id, event_type, date,
            limit = 50, offset = 0,
            min_confidence,
        } = req.query;

        let query = "SELECT * FROM events WHERE 1=1";
        const params = [];

        if (worker_id) { query += " AND worker_id = ?"; params.push(worker_id); }
        if (workstation_id) { query += " AND workstation_id = ?"; params.push(workstation_id); }
        if (event_type) { query += " AND event_type = ?"; params.push(event_type); }
        if (date) { query += " AND date(timestamp) = ?"; params.push(date); }
        if (min_confidence) { query += " AND confidence >= ?"; params.push(parseFloat(min_confidence)); }

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
        params.push(parseInt(limit), parseInt(offset));

        const events = await queryAll(query, params);

        let countQuery = "SELECT COUNT(*) AS cnt FROM events WHERE 1=1";
        const countParams = [];
        if (worker_id) { countQuery += " AND worker_id = ?"; countParams.push(worker_id); }
        if (workstation_id) { countQuery += " AND workstation_id = ?"; countParams.push(workstation_id); }
        if (event_type) { countQuery += " AND event_type = ?"; countParams.push(event_type); }
        if (date) { countQuery += " AND date(timestamp) = ?"; countParams.push(date); }
        if (min_confidence) { countQuery += " AND confidence >= ?"; countParams.push(parseFloat(min_confidence)); }

        const totalRow = await queryOne(countQuery, countParams);
        res.json({
            events,
            total: totalRow ? Number(totalRow.cnt) : 0,
            limit: parseInt(limit),
            offset: parseInt(offset),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/workers ─────────────────────────────────────────────
router.get("/workers", async (req, res) => {
    try { res.json(await queryAll("SELECT * FROM workers ORDER BY id")); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/workstations ────────────────────────────────────────
router.get("/workstations", async (req, res) => {
    try { res.json(await queryAll("SELECT * FROM workstations ORDER BY id")); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/dashboard/workers ─────────────────────────────────────
router.get("/dashboard/workers", async (req, res) => {
    try {
        const { date } = req.query;
        const metrics = await computeWorkerMetrics(date || null);
        res.json({ metrics, date: date || "all-time", count: metrics.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/workstations ────────────────────────────────
router.get("/dashboard/workstations", async (req, res) => {
    try {
        const { date } = req.query;
        const metrics = await computeWorkstationMetrics(date || null);
        res.json({ metrics, date: date || "all-time", count: metrics.length });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/factory ─────────────────────────────────────
router.get("/dashboard/factory", async (req, res) => {
    try {
        const { date } = req.query;
        const metrics = await computeFactoryMetrics(date || null);
        res.json({ metrics, date: date || "all-time" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/worker/:id ─────────────────────────────────
router.get("/dashboard/worker/:id", async (req, res) => {
    try {
        const { date } = req.query;
        const all = await computeWorkerMetrics(date || null);
        const worker = all.find((w) => w.worker_id === req.params.id);
        if (!worker) return res.status(404).json({ error: "Worker not found or no events" });
        res.json(worker);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/workstation/:id ────────────────────────────
router.get("/dashboard/workstation/:id", async (req, res) => {
    try {
        const { date } = req.query;
        const all = await computeWorkstationMetrics(date || null);
        const station = all.find((s) => s.station_id === req.params.id);
        if (!station) return res.status(404).json({ error: "Workstation not found or no events" });
        res.json(station);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dates ──────────────────────────────────────────────
router.get("/dates", async (req, res) => {
    try {
        const rows = await queryAll("SELECT DISTINCT date(timestamp) AS d FROM events ORDER BY d DESC");
        res.json(rows.map((r) => r.d));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── POST /api/seed ──────────────────────────────────────────────
router.post("/seed", async (req, res) => {
    try {
        const result = await seed();
        res.json({ success: true, message: "Database seeded successfully", ...result });
    } catch (err) {
        console.error("Seed error:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/health ─────────────────────────────────────────────
router.get("/health", async (req, res) => {
    try {
        const workers = await queryOne("SELECT COUNT(*) AS cnt FROM workers");
        const workstations = await queryOne("SELECT COUNT(*) AS cnt FROM workstations");
        const events = await queryOne("SELECT COUNT(*) AS cnt FROM events");

        const recent = await queryOne(
            "SELECT COUNT(*) AS cnt FROM events WHERE created_at >= datetime('now', '-60 seconds')"
        );

        const avgConf = await queryOne("SELECT AVG(confidence) AS avg FROM events");
        const latestEvt = await queryOne("SELECT MAX(timestamp) AS ts FROM events");
        const models = await queryAll("SELECT DISTINCT model_version FROM events WHERE model_version IS NOT NULL ORDER BY model_version DESC");

        res.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            db: {
                workers: workers ? Number(workers.cnt) : 0,
                workstations: workstations ? Number(workstations.cnt) : 0,
                events: events ? Number(events.cnt) : 0,
            },
            event_rate_per_min: recent ? Number(recent.cnt) : 0,
            avg_confidence: avgConf ? parseFloat((Number(avgConf.avg) || 0).toFixed(3)) : 0,
            latest_event_at: latestEvt ? latestEvt.ts : null,
            model_versions: models.map((m) => m.model_version),
            confidence_threshold: 0.4,
        });
    } catch (err) {
        res.status(500).json({ status: "error", error: err.message });
    }
});

// ─── GET /api/dashboard/trends ─────────────────────────────────────
router.get("/dashboard/trends", async (req, res) => {
    try {
        const dates = (await queryAll(
            "SELECT DISTINCT date(timestamp) AS d FROM events ORDER BY d DESC LIMIT 2"
        )).map((r) => r.d);

        if (dates.length < 2) {
            return res.json({ available: false, message: "Need at least 2 days of data for trends" });
        }

        const [today, yesterday] = dates;
        const curr = await computeFactoryMetrics(today);
        const prev = await computeFactoryMetrics(yesterday);

        function delta(curr, prev) {
            if (!prev || prev === 0) return null;
            return parseFloat(((curr - prev) / Math.abs(prev) * 100).toFixed(1));
        }

        res.json({
            available: true,
            current_date: today,
            previous_date: yesterday,
            trends: {
                total_production: { current: curr.total_production_count, previous: prev.total_production_count, delta_pct: delta(curr.total_production_count, prev.total_production_count) },
                avg_utilization: { current: curr.avg_worker_utilization_pct, previous: prev.avg_worker_utilization_pct, delta_pct: delta(curr.avg_worker_utilization_pct, prev.avg_worker_utilization_pct) },
                active_time_hours: { current: curr.total_active_time_hours, previous: prev.total_active_time_hours, delta_pct: delta(curr.total_active_time_hours, prev.total_active_time_hours) },
                idle_time_hours: { current: curr.total_idle_time_hours, previous: prev.total_idle_time_hours, delta_pct: delta(curr.total_idle_time_hours, prev.total_idle_time_hours) },
                production_rate: { current: curr.avg_production_rate_per_hour, previous: prev.avg_production_rate_per_hour, delta_pct: delta(curr.avg_production_rate_per_hour, prev.avg_production_rate_per_hour) },
                station_utilization: { current: curr.avg_station_utilization_pct, previous: prev.avg_station_utilization_pct, delta_pct: delta(curr.avg_station_utilization_pct, prev.avg_station_utilization_pct) },
            },
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/event-density ──────────────────────────────
router.get("/dashboard/event-density", async (req, res) => {
    try {
        const { date } = req.query;
        const rows = await queryAll(`
            SELECT
                strftime('%H', timestamp) AS hour,
                COUNT(*) AS count
            FROM events
            WHERE ${date ? `date(timestamp) = '${date}'` : "date(timestamp) = date('now')"}
            GROUP BY hour
            ORDER BY hour ASC
        `);

        // Fill missing hours with 0
        const byHour = Object.fromEntries(rows.map((r) => [r.hour, Number(r.count)]));
        const density = Array.from({ length: 24 }, (_, i) => {
            const h = String(i).padStart(2, "0");
            return { hour: `${h}:00`, count: byHour[h] || 0 };
        });

        res.json({ density, date: date || "today" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/dashboard/model-performance ──────────────────────────
router.get("/dashboard/model-performance", async (req, res) => {
    try {
        const rows = await queryAll(`
            SELECT
                model_version,
                COUNT(*) AS event_count,
                AVG(confidence) AS avg_confidence,
                MIN(confidence) AS min_confidence,
                MAX(confidence) AS max_confidence,
                SUM(CASE WHEN confidence >= 0.85 THEN 1 ELSE 0 END) AS high_conf_count,
                SUM(CASE WHEN confidence >= 0.6 AND confidence < 0.85 THEN 1 ELSE 0 END) AS med_conf_count,
                SUM(CASE WHEN confidence < 0.6 THEN 1 ELSE 0 END) AS low_conf_count
            FROM events
            WHERE model_version IS NOT NULL
            GROUP BY model_version
            ORDER BY model_version ASC
        `);

        const models = rows.map((r) => ({
            model_version: r.model_version,
            event_count: Number(r.event_count),
            avg_confidence: parseFloat((Number(r.avg_confidence) * 100).toFixed(1)),
            min_confidence: parseFloat((Number(r.min_confidence) * 100).toFixed(1)),
            max_confidence: parseFloat((Number(r.max_confidence) * 100).toFixed(1)),
            high_conf_pct: parseFloat((Number(r.high_conf_count) / Number(r.event_count) * 100).toFixed(1)),
            med_conf_pct: parseFloat((Number(r.med_conf_count) / Number(r.event_count) * 100).toFixed(1)),
            low_conf_pct: parseFloat((Number(r.low_conf_count) / Number(r.event_count) * 100).toFixed(1)),
        }));

        res.json({ models });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/export/workers ─────────────────────────────────────
router.get("/export/workers", async (req, res) => {
    try {
        const { format = "json", date } = req.query;
        const metrics = await computeWorkerMetrics(date || null);

        if (format === "csv") {
            const header = "worker_id,worker_name,utilization_pct,active_time_min,idle_time_min,absent_time_sec,total_units_produced,units_per_hour";
            const rows = metrics.map((w) =>
                [w.worker_id, `"${w.worker_name}"`, w.utilization_pct, w.active_time_min, w.idle_time_min, w.absent_time_sec, w.total_units_produced, w.units_per_hour].join(",")
            );
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="workers_${date || "all"}.csv"`);
            return res.send([header, ...rows].join("\n"));
        }

        res.setHeader("Content-Disposition", `attachment; filename="workers_${date || "all"}.json"`);
        res.json({ exported_at: new Date().toISOString(), date: date || "all-time", count: metrics.length, data: metrics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/export/workstations ────────────────────────────────
router.get("/export/workstations", async (req, res) => {
    try {
        const { format = "json", date } = req.query;
        const metrics = await computeWorkstationMetrics(date || null);

        if (format === "csv") {
            const header = "station_id,station_name,station_type,location,utilization_pct,occupancy_min,total_units_produced,throughput_rate_per_hour";
            const rows = metrics.map((s) =>
                [s.station_id, `"${s.station_name}"`, s.station_type, s.location, s.utilization_pct, s.occupancy_min, s.total_units_produced, s.throughput_rate_per_hour].join(",")
            );
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="workstations_${date || "all"}.csv"`);
            return res.send([header, ...rows].join("\n"));
        }

        res.setHeader("Content-Disposition", `attachment; filename="workstations_${date || "all"}.json"`);
        res.json({ exported_at: new Date().toISOString(), date: date || "all-time", count: metrics.length, data: metrics });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── GET /api/export/events ──────────────────────────────────────
router.get("/export/events", async (req, res) => {
    try {
        const { format = "json", date } = req.query;
        let query = "SELECT * FROM events";
        const params = [];
        if (date) { query += " WHERE date(timestamp) = ?"; params.push(date); }
        query += " ORDER BY timestamp ASC";
        const events = await queryAll(query, params);

        if (format === "csv") {
            const header = "id,timestamp,worker_id,workstation_id,event_type,confidence,count,camera_id,model_version,source";
            const rows = events.map((e) =>
                [e.id, e.timestamp, e.worker_id, e.workstation_id, e.event_type, e.confidence, e.count, e.camera_id || "", e.model_version || "", e.source].join(",")
            );
            res.setHeader("Content-Type", "text/csv");
            res.setHeader("Content-Disposition", `attachment; filename="events_${date || "all"}.csv"`);
            return res.send([header, ...rows].join("\n"));
        }

        res.setHeader("Content-Disposition", `attachment; filename="events_${date || "all"}.json"`);
        res.json({ exported_at: new Date().toISOString(), date: date || "all-time", count: events.length, data: events });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
