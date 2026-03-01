const { queryAll, queryOne, run, runMany } = require("./db");
const { v4: uuidv4 } = require("uuid");

const WORKERS = [
    { id: "W1", name: "Arjun Sharma", role: "Machine Operator" },
    { id: "W2", name: "Priya Mehta", role: "Assembly Technician" },
    { id: "W3", name: "Ravi Kumar", role: "Quality Inspector" },
    { id: "W4", name: "Sneha Patel", role: "Line Supervisor" },
    { id: "W5", name: "Vikram Singh", role: "Packaging Specialist" },
    { id: "W6", name: "Ananya Rao", role: "Machine Operator" },
];

const WORKSTATIONS = [
    { id: "S1", name: "Assembly Line Alpha", type: "Assembly", location: "Zone A" },
    { id: "S2", name: "Welding Bay Beta", type: "Welding", location: "Zone B" },
    { id: "S3", name: "QC Station Gamma", type: "Quality Control", location: "Zone C" },
    { id: "S4", name: "Packaging Unit Delta", type: "Packaging", location: "Zone D" },
    { id: "S5", name: "CNC Machine Epsilon", type: "CNC Machining", location: "Zone A" },
    { id: "S6", name: "Paint Booth Zeta", type: "Painting", location: "Zone B" },
];

// Camera IDs for each workstation (1 camera per station)
const CAMERA_IDS = ["CAM-01", "CAM-02", "CAM-03", "CAM-04", "CAM-05", "CAM-06"];

// Model version history (simulates version progression over days)
const MODEL_VERSIONS = ["v1.0", "v1.0", "v1.1", "v1.1", "v1.2"];

function generateDummyEvents(daysBack = 3) {
    const events = [];
    const now = new Date();

    for (let day = daysBack; day >= 0; day--) {
        const baseDate = new Date(now);
        baseDate.setDate(baseDate.getDate() - day);
        const dateStr = baseDate.toISOString().split("T")[0];
        // Simulate model version progression (newer days → newer model)
        const modelVersion = MODEL_VERSIONS[Math.min(day, MODEL_VERSIONS.length - 1)];

        WORKERS.forEach((worker, wIdx) => {
            const primaryStation = WORKSTATIONS[wIdx];
            const primaryCameraId = CAMERA_IDS[wIdx];
            let currentHour = 8;
            let currentMin = 0;

            while (currentHour < 17) {
                const ts = new Date(
                    `${dateStr}T${String(currentHour).padStart(2, "0")}:${String(currentMin).padStart(2, "0")}:00Z`
                );

                const rand = Math.random();
                let eventType, durationMins, count = 0;

                if (rand < 0.05) {
                    eventType = "absent";
                    durationMins = 30 + Math.floor(Math.random() * 60);
                } else if (rand < 0.25) {
                    eventType = "idle";
                    durationMins = 5 + Math.floor(Math.random() * 20);
                } else {
                    eventType = "working";
                    durationMins = 15 + Math.floor(Math.random() * 45);
                    count = Math.floor(Math.random() * 8) + 1;
                }

                const stationIdx = Math.random() > 0.85 ? Math.floor(Math.random() * 6) : wIdx;
                const station = WORKSTATIONS[stationIdx];
                const cameraId = CAMERA_IDS[stationIdx];

                // Confidence varies: older model versions have lower confidence
                const baseConfidence = modelVersion === "v1.0" ? 0.72 : modelVersion === "v1.1" ? 0.82 : 0.88;
                const confidence = parseFloat(Math.min(0.99, baseConfidence + Math.random() * 0.15).toFixed(2));

                events.push({
                    id: uuidv4(),
                    timestamp: ts.toISOString(),
                    worker_id: worker.id,
                    workstation_id: station.id,
                    event_type: eventType,
                    confidence,
                    count: 0,
                    source: "cctv_seed",
                    camera_id: cameraId,
                    model_version: modelVersion,
                });

                if (eventType === "working" && count > 0) {
                    events.push({
                        id: uuidv4(),
                        timestamp: new Date(ts.getTime() + 1000).toISOString(),
                        worker_id: worker.id,
                        workstation_id: station.id,
                        event_type: "product_count",
                        confidence: parseFloat(Math.min(0.99, confidence + 0.05).toFixed(2)),
                        count,
                        source: "cctv_seed",
                        camera_id: cameraId,
                        model_version: modelVersion,
                    });
                }

                currentMin += durationMins;
                currentHour += Math.floor(currentMin / 60);
                currentMin = currentMin % 60;
            }
        });
    }

    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    return events;
}

async function seed() {
    await run("DELETE FROM events");
    await run("DELETE FROM workstations");
    await run("DELETE FROM workers");

    await runMany(
        "INSERT INTO workers (id, name, role) VALUES (?, ?, ?)",
        WORKERS.map((w) => [w.id, w.name, w.role])
    );

    await runMany(
        "INSERT INTO workstations (id, name, type, location) VALUES (?, ?, ?, ?)",
        WORKSTATIONS.map((s) => [s.id, s.name, s.type, s.location])
    );

    const now = new Date();
    // In actual code, logic remains same to generate dummy events
    const events = [];
    for (let day = 3; day >= 0; day--) {
        const baseDate = new Date(now);
        baseDate.setDate(baseDate.getDate() - day);
        const dateStr = baseDate.toISOString().split("T")[0];
        const modelVersion = MODEL_VERSIONS[Math.min(day, MODEL_VERSIONS.length - 1)];

        WORKERS.forEach((worker, wIdx) => {
            const station = WORKSTATIONS[wIdx];
            const cameraId = CAMERA_IDS[wIdx];
            let currentHour = 8;
            let currentMin = 0;

            while (currentHour < 17) {
                const ts = new Date(`${dateStr}T${String(currentHour).padStart(2, "0")}:${String(currentMin).padStart(2, "0")}:00Z`);
                const rand = Math.random();
                let eventType, durationMins, count = 0;

                if (rand < 0.05) { eventType = "absent"; durationMins = 30 + Math.floor(Math.random() * 60); }
                else if (rand < 0.25) { eventType = "idle"; durationMins = 5 + Math.floor(Math.random() * 20); }
                else { eventType = "working"; durationMins = 15 + Math.floor(Math.random() * 45); count = Math.floor(Math.random() * 8) + 1; }

                const stationIdx = Math.random() > 0.85 ? Math.floor(Math.random() * 6) : wIdx;
                const rndStation = WORKSTATIONS[stationIdx];
                const rndCameraId = CAMERA_IDS[stationIdx];
                const baseConfidence = modelVersion === "v1.0" ? 0.72 : modelVersion === "v1.1" ? 0.82 : 0.88;
                const confidence = parseFloat(Math.min(0.99, baseConfidence + Math.random() * 0.15).toFixed(2));

                events.push({ id: uuidv4(), timestamp: ts.toISOString(), worker_id: worker.id, workstation_id: rndStation.id, event_type: eventType, confidence, count: 0, source: "cctv_seed", camera_id: rndCameraId, model_version: modelVersion });
                if (eventType === "working" && count > 0) {
                    events.push({ id: uuidv4(), timestamp: new Date(ts.getTime() + 1000).toISOString(), worker_id: worker.id, workstation_id: rndStation.id, event_type: "product_count", confidence: parseFloat(Math.min(0.99, confidence + 0.05).toFixed(2)), count, source: "cctv_seed", camera_id: rndCameraId, model_version: modelVersion });
                }
                currentMin += durationMins;
                currentHour += Math.floor(currentMin / 60);
                currentMin = currentMin % 60;
            }
        });
    }

    events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    const { inserted, duplicates } = await runMany(
        `INSERT INTO events
     (id, timestamp, worker_id, workstation_id, event_type, confidence, count, source, camera_id, model_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        events.map((e) => [
            e.id, e.timestamp, e.worker_id, e.workstation_id,
            e.event_type, e.confidence, e.count, e.source,
            e.camera_id, e.model_version,
        ])
    );

    const totalRow = await queryOne("SELECT COUNT(*) as cnt FROM events");
    const cnt = totalRow ? totalRow.cnt : inserted;

    console.log(`✅ Seeded: ${WORKERS.length} workers, ${WORKSTATIONS.length} workstations, ${cnt} events (${duplicates} dups skipped)`);
    return { workers: WORKERS.length, workstations: WORKSTATIONS.length, events: cnt };
}

module.exports = { seed, WORKERS, WORKSTATIONS, generateDummyEvents };
