const { queryAll, queryOne } = require("../db");

/**
 * ═══════════════════════════════════════════════════════════════════
 * METRICS COMPUTATION ENGINE
 * ═══════════════════════════════════════════════════════════════════
 *
 * ASSUMPTIONS & DESIGN DECISIONS:
 *
 * 1. SHIFT DURATION: 9 hours (08:00–17:00). Used for workstation
 *    utilization denominator.
 *
 * 2. EVENT DURATION: Duration of each event = time until the next
 *    event for that worker (sorted by timestamp). Capped at 60
 *    minutes to avoid unrealistic durations from long gaps.
 *    Default for last event in a session: 15 minutes.
 *
 * 3. PRODUCT_COUNT EVENTS: These only contribute unit counts. They
 *    do NOT count towards active/idle/absent time calculations.
 *
 * 4. ABSENT EVENTS: Counted separately as downtime (not active, not
 *    idle).
 *
 * 5. UTILIZATION FORMULA:
 *    utilization = active_time / (active + idle + absent) * 100
 *    This gives a true picture of productive vs. total tracked time.
 *
 * 6. UNITS PER HOUR: total_units / active_hours (min 0.01hr guard)
 *
 * 7. WORKSTATION OCCUPANCY: Sum of working-event durations at that
 *    station across all workers. Capped at shift length per day.
 *
 * 8. OUT-OF-ORDER TIMESTAMPS: Events are sorted by timestamp before
 *    any calculation. Duration is always computed forward in time.
 *
 * 9. DUPLICATE DETECTION: DB unique index on
 *    (worker_id, workstation_id, timestamp, event_type) prevents
 *    storing duplicate events at ingestion time.
 *
 * 10. PRODUCTION AGGREGATION: product_count.count values are summed
 *     per worker/workstation. They are emitted as companion events
 *     alongside working events and linked by worker_id.
 */

const SHIFT_MINUTES = 540; // 9 hours
const MAX_EVENT_DURATION_MIN = 60;
const DEFAULT_LAST_EVENT_MIN = 15;

// ─── Helper: build date filter ────────────────────────────────────
function buildDateFilter(date) {
    return date ? `AND date(e.timestamp) = '${date}'` : "";
}

function buildDateFilterPlain(date) {
    return date ? `AND date(timestamp) = '${date}'` : "";
}

// ─── Worker Metrics ───────────────────────────────────────────────
async function computeWorkerMetrics(date = null) {
    const df = buildDateFilter(date);
    const dfp = buildDateFilterPlain(date);

    const events = await queryAll(`
    SELECT e.id, e.timestamp, e.worker_id, e.event_type, w.name AS worker_name
    FROM events e
    JOIN workers w ON e.worker_id = w.id
    WHERE e.event_type != 'product_count' ${df}
    ORDER BY e.worker_id, e.timestamp ASC
  `);

    const productRows = await queryAll(`
    SELECT worker_id, SUM(count) AS total_units
    FROM events
    WHERE event_type = 'product_count' ${dfp}
    GROUP BY worker_id
  `);

    const productByWorker = {};
    productRows.forEach((r) => { productByWorker[r.worker_id] = Number(r.total_units) || 0; });

    // Group by worker
    const byWorker = {};
    events.forEach((e) => {
        if (!byWorker[e.worker_id]) byWorker[e.worker_id] = [];
        byWorker[e.worker_id].push(e);
    });

    const workerMetrics = [];

    Object.entries(byWorker).forEach(([workerId, evts]) => {
        let activeSec = 0, idleSec = 0, absentSec = 0;

        for (let i = 0; i < evts.length; i++) {
            const curr = evts[i];
            const next = evts[i + 1];

            let durationSec;
            if (next && next.worker_id === curr.worker_id) {
                durationSec = Math.min(
                    (new Date(next.timestamp) - new Date(curr.timestamp)) / 1000,
                    MAX_EVENT_DURATION_MIN * 60
                );
            } else {
                durationSec = DEFAULT_LAST_EVENT_MIN * 60;
            }
            durationSec = Math.max(0, durationSec);

            if (curr.event_type === "working") activeSec += durationSec;
            else if (curr.event_type === "idle") idleSec += durationSec;
            else if (curr.event_type === "absent") absentSec += durationSec;
        }

        const totalTracked = activeSec + idleSec + absentSec || 1;
        const utilization = parseFloat(((activeSec / totalTracked) * 100).toFixed(1));
        const activeHours = activeSec / 3600;
        const units = productByWorker[workerId] || 0;
        const unitsPerHour = activeHours > 0.01 ? parseFloat((units / activeHours).toFixed(2)) : 0;

        workerMetrics.push({
            worker_id: workerId,
            worker_name: evts[0].worker_name,
            active_time_sec: Math.round(activeSec),
            idle_time_sec: Math.round(idleSec),
            absent_time_sec: Math.round(absentSec),
            active_time_min: Math.round(activeSec / 60),
            idle_time_min: Math.round(idleSec / 60),
            utilization_pct: utilization,
            total_units_produced: units,
            units_per_hour: unitsPerHour,
        });
    });

    return workerMetrics;
}

// ─── Workstation Metrics ──────────────────────────────────────────
async function computeWorkstationMetrics(date = null) {
    const df = buildDateFilter(date);
    const dfp = buildDateFilterPlain(date);

    const events = await queryAll(`
    SELECT e.timestamp, e.workstation_id, e.event_type,
           s.name AS station_name, s.type AS station_type, s.location
    FROM events e
    JOIN workstations s ON e.workstation_id = s.id
    WHERE e.event_type != 'product_count' ${df}
    ORDER BY e.workstation_id, e.timestamp ASC
  `);

    const productRows = await queryAll(`
    SELECT workstation_id, SUM(count) AS total_units
    FROM events
    WHERE event_type = 'product_count' ${dfp}
    GROUP BY workstation_id
  `);

    const productByStation = {};
    productRows.forEach((r) => { productByStation[r.workstation_id] = Number(r.total_units) || 0; });

    const byStation = {};
    events.forEach((e) => {
        if (!byStation[e.workstation_id]) byStation[e.workstation_id] = [];
        byStation[e.workstation_id].push(e);
    });

    const stationMetrics = [];
    const shiftSec = SHIFT_MINUTES * 60;

    Object.entries(byStation).forEach(([stationId, evts]) => {
        let occupancySec = 0;

        for (let i = 0; i < evts.length; i++) {
            const curr = evts[i];
            if (curr.event_type !== "working") continue;

            const next = evts[i + 1];
            let durationSec;
            if (next && next.workstation_id === curr.workstation_id) {
                durationSec = Math.min(
                    (new Date(next.timestamp) - new Date(curr.timestamp)) / 1000,
                    MAX_EVENT_DURATION_MIN * 60
                );
            } else {
                durationSec = DEFAULT_LAST_EVENT_MIN * 60;
            }
            occupancySec += Math.max(0, durationSec);
        }

        const utilization = parseFloat(((Math.min(occupancySec, shiftSec) / shiftSec) * 100).toFixed(1));
        const units = productByStation[stationId] || 0;
        const occupancyHours = occupancySec / 3600;
        const throughputRate = occupancyHours > 0.01 ? parseFloat((units / occupancyHours).toFixed(2)) : 0;

        stationMetrics.push({
            station_id: stationId,
            station_name: evts[0].station_name,
            station_type: evts[0].station_type,
            location: evts[0].location,
            occupancy_sec: Math.round(occupancySec),
            occupancy_min: Math.round(occupancySec / 60),
            utilization_pct: utilization,
            total_units_produced: units,
            throughput_rate_per_hour: throughputRate,
        });
    });

    return stationMetrics;
}

// ─── Factory Metrics ──────────────────────────────────────────────
async function computeFactoryMetrics(date = null) {
    const dfp = buildDateFilterPlain(date);

    const workerMetrics = await computeWorkerMetrics(date);
    const stationMetrics = await computeWorkstationMetrics(date);

    const totalActiveSec = workerMetrics.reduce((s, w) => s + w.active_time_sec, 0);
    const totalIdleSec = workerMetrics.reduce((s, w) => s + w.idle_time_sec, 0);
    const totalUnits = workerMetrics.reduce((s, w) => s + w.total_units_produced, 0);

    const avgUtilization = workerMetrics.length
        ? parseFloat((workerMetrics.reduce((s, w) => s + w.utilization_pct, 0) / workerMetrics.length).toFixed(1))
        : 0;

    const avgStationUtil = stationMetrics.length
        ? parseFloat((stationMetrics.reduce((s, st) => s + st.utilization_pct, 0) / stationMetrics.length).toFixed(1))
        : 0;

    const totalActiveHours = totalActiveSec / 3600;
    const avgProdRate = totalActiveHours > 0.01
        ? parseFloat((totalUnits / totalActiveHours).toFixed(2)) : 0;

    const eventCountRow = await queryOne(`SELECT COUNT(*) AS cnt FROM events ${dfp ? "WHERE " + dfp.replace("AND ", "") : ""}`);

    return {
        total_active_time_sec: totalActiveSec,
        total_active_time_hours: parseFloat((totalActiveSec / 3600).toFixed(2)),
        total_idle_time_sec: totalIdleSec,
        total_idle_time_hours: parseFloat((totalIdleSec / 3600).toFixed(2)),
        total_production_count: totalUnits,
        avg_worker_utilization_pct: avgUtilization,
        avg_station_utilization_pct: avgStationUtil,
        avg_production_rate_per_hour: avgProdRate,
        total_events_processed: eventCountRow ? Number(eventCountRow.cnt) : 0,
        active_workers: workerMetrics.length,
        active_stations: stationMetrics.length,
    };
}

module.exports = { computeWorkerMetrics, computeWorkstationMetrics, computeFactoryMetrics };
