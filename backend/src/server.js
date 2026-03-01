require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { initDb, queryOne } = require("./db");
const apiRoutes = require("./routes/api");

const app = express();
const PORT = process.env.PORT || 4000;

// ─── Middleware ───────────────────────────────────────────────────
app.use(
    cors({
        origin: process.env.FRONTEND_URL || "*",
        methods: ["GET", "POST", "PUT", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Logger ───────────────────────────────────────────────
app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
        const dur = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} → ${res.statusCode} (${dur}ms)`);
    });
    next();
});

// ─── Routes ───────────────────────────────────────────────────────
app.use("/api", apiRoutes);

app.get("/", (req, res) => {
    res.json({
        name: "AI Productivity Dashboard API",
        version: "1.0.0",
        endpoints: [
            "GET  /api/health",
            "GET  /api/workers",
            "GET  /api/workstations",
            "GET  /api/dates",
            "POST /api/events",
            "POST /api/events/batch",
            "GET  /api/events",
            "GET  /api/metrics/workers",
            "GET  /api/metrics/workstations",
            "GET  /api/metrics/factory",
            "GET  /api/metrics/worker/:id",
            "GET  /api/metrics/workstation/:id",
            "POST /api/seed",
        ],
    });
});

// ─── 404 Handler ─────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Route not found" }));

// ─── Error Handler ────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error", details: err.message });
});

// ─── Boot ─────────────────────────────────────────────────────────
async function start() {
    try {
        // Initialize DB (async for both SQLite and PG)
        await initDb();

        // Auto-seed if empty — await works for both sync and async queryOne
        const workerRow = await Promise.resolve(queryOne("SELECT COUNT(*) AS cnt FROM workers"));
        const workerCount = workerRow ? Number(workerRow.cnt) : 0;

        if (workerCount === 0) {
            console.log("📦 Empty database detected — auto-seeding...");
            const { seed } = require("./seed");
            await Promise.resolve(seed());
        } else {
            console.log(`✅ Database ready — ${workerCount} workers found`);
        }

        app.listen(PORT, () => {
            console.log(`\n🚀 AI Productivity Dashboard API`);
            console.log(`   URL:  http://localhost:${PORT}`);
            console.log(`   Mode: ${process.env.DATABASE_URL ? "PostgreSQL 🐘" : "SQLite 📦"}`);
            console.log(`   Env:  ${process.env.NODE_ENV || "development"}`);
            console.log(`   Seed: POST http://localhost:${PORT}/api/seed\n`);
        });
    } catch (err) {
        console.error("❌ Failed to start server:", err);
        process.exit(1);
    }
}

start();

module.exports = app;

