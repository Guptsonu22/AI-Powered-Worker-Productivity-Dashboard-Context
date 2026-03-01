/**
 * db.js — Dual-mode database adapter
 *
 * LOCAL DEV:   Uses sql.js (SQLite) — zero setup, persists to productivity.db
 * PRODUCTION:  Uses pg (PostgreSQL) when DATABASE_URL is set
 *
 * The public API is identical in both modes:
 *   queryAll(sql, params)  → rows[]
 *   queryOne(sql, params)  → row | null
 *   run(sql, params)       → { changes }
 *   runMany(sql, rows)     → { inserted, duplicates }
 */

require("dotenv").config();

const IS_POSTGRES = Boolean(process.env.DATABASE_URL);

// ─── PostgreSQL Mode ────────────────────────────────────────────────
if (IS_POSTGRES) {
  const { Pool } = require("pg");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  async function initDb() {
    console.log("🐘 Using PostgreSQL database (production mode)");
    await initSchemaPg();
    return pool;
  }

  async function initSchemaPg() {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS workers (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                role        TEXT NOT NULL,
                shift_start TEXT NOT NULL DEFAULT '08:00',
                shift_end   TEXT NOT NULL DEFAULT '17:00',
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS workstations (
                id         TEXT PRIMARY KEY,
                name       TEXT NOT NULL,
                type       TEXT NOT NULL,
                location   TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

    await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id              TEXT PRIMARY KEY,
                timestamp       TIMESTAMPTZ NOT NULL,
                worker_id       TEXT NOT NULL REFERENCES workers(id),
                workstation_id  TEXT NOT NULL REFERENCES workstations(id),
                event_type      TEXT NOT NULL,
                confidence      REAL NOT NULL DEFAULT 1.0,
                count           INTEGER DEFAULT 0,
                source          TEXT NOT NULL DEFAULT 'cctv',
                camera_id       TEXT DEFAULT 'CAM-01',
                model_version   TEXT DEFAULT 'v1.0',
                processed       INTEGER NOT NULL DEFAULT 0,
                created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (worker_id, workstation_id, timestamp, event_type)
            );
        `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_worker    ON events(worker_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_workstation ON events(workstation_id);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_confidence ON events(confidence);`);

    console.log("✅ PostgreSQL schema ready");
  }

  // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, ... style
  function pgify(sql) {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  }

  // Convert SQLite datetime() / date() functions to PostgreSQL equivalents
  function normalizeSql(sql) {
    return sql
      .replace(/datetime\('now',\s*'-60 seconds'\)/gi, "NOW() - INTERVAL '60 seconds'")
      .replace(/datetime\('now'\)/gi, "NOW()")
      .replace(/date\('now'\)/gi, "CURRENT_DATE")
      .replace(/date\(timestamp\)/gi, "timestamp::date")
      .replace(/strftime\('%Y-%m-%d',\s*([^)]+)\)/gi, "TO_CHAR($1, 'YYYY-MM-DD')")
      .replace(/strftime\('%H',\s*([^)]+)\)/gi, "TO_CHAR($1, 'HH24')")
      .replace(/SUBSTR\(([^,]+),\s*1,\s*10\)/gi, "TO_CHAR($1, 'YYYY-MM-DD')")
      .replace(/INTEGER NOT NULL DEFAULT 0/gi, "INTEGER NOT NULL DEFAULT 0");
  }

  async function queryAll(sql, params = []) {
    const pgSql = pgify(normalizeSql(sql));
    const { rows } = await pool.query(pgSql, params);
    // Normalise: convert numeric/boolean pg types to JS primitives
    return rows.map(row => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    });
  }

  async function queryOne(sql, params = []) {
    const rows = await queryAll(sql, params);
    return rows[0] || null;
  }

  async function run(sql, params = []) {
    const pgSql = pgify(normalizeSql(sql));
    const result = await pool.query(pgSql, params);
    return { changes: result.rowCount };
  }

  async function runMany(sql, rowsArray) {
    let inserted = 0;
    let duplicates = 0;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const pgSql = pgify(normalizeSql(sql));
      for (const params of rowsArray) {
        try {
          await client.query(pgSql, params);
          inserted++;
        } catch (err) {
          if (err.code === "23505") { // unique_violation
            duplicates++;
          } else {
            await client.query("ROLLBACK");
            throw err;
          }
        }
      }
      await client.query("COMMIT");
    } finally {
      client.release();
    }
    return { inserted, duplicates };
  }

  module.exports = { initDb, queryAll, queryOne, run, runMany, persistDb: () => { } };

  // ─── SQLite Mode (local dev) ────────────────────────────────────────
} else {
  const initSqlJs = require("sql.js");
  const fs = require("fs");
  const path = require("path");

  const DB_PATH = path.join(__dirname, "..", "productivity.db");
  let db = null;

  function persistDb() {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }

  async function initDb() {
    console.log("📦 Using SQLite database (local dev mode)");
    const SQL = await initSqlJs();

    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new SQL.Database(fileBuffer);
      console.log("📂 Loaded existing database from disk");
    } else {
      db = new SQL.Database();
      console.log("🆕 Created fresh in-memory database");
    }

    db.run("PRAGMA foreign_keys = ON;");
    initSchema();
    persistDb();
    return db;
  }

  function initSchema() {
    db.run(`
            CREATE TABLE IF NOT EXISTS workers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                shift_start TEXT NOT NULL DEFAULT '08:00',
                shift_end TEXT NOT NULL DEFAULT '17:00',
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        `);

    db.run(`
            CREATE TABLE IF NOT EXISTS workstations (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                location TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        `);

    db.run(`
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                worker_id TEXT NOT NULL,
                workstation_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 1.0,
                count INTEGER DEFAULT 0,
                source TEXT NOT NULL DEFAULT 'cctv',
                camera_id TEXT DEFAULT 'CAM-01',
                model_version TEXT DEFAULT 'v1.0',
                processed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_events_worker     ON events(worker_id);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_workstation ON events(workstation_id);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_timestamp  ON events(timestamp);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_type       ON events(event_type);`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_events_confidence ON events(confidence);`);
    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedup ON events(worker_id, workstation_id, timestamp, event_type);`);

    // Migrations for existing DBs
    try { db.run("ALTER TABLE events ADD COLUMN camera_id TEXT DEFAULT 'CAM-01';"); } catch { }
    try { db.run("ALTER TABLE events ADD COLUMN model_version TEXT DEFAULT 'v1.0';"); } catch { }
  }

  function queryAll(sql, params = []) {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  }

  function queryOne(sql, params = []) {
    return queryAll(sql, params)[0] || null;
  }

  function run(sql, params = []) {
    try {
      db.run(sql, params);
      persistDb();
      return { changes: 1 };
    } catch (err) {
      throw err;
    }
  }

  function runMany(sql, rowsArray) {
    const stmt = db.prepare(sql);
    let inserted = 0;
    let duplicates = 0;
    db.run("BEGIN;");
    for (const params of rowsArray) {
      try {
        stmt.run(params);
        inserted++;
      } catch (err) {
        if (err.message && err.message.includes("UNIQUE")) {
          duplicates++;
        } else {
          db.run("ROLLBACK;");
          stmt.free();
          throw err;
        }
      }
    }
    db.run("COMMIT;");
    stmt.free();
    persistDb();
    return { inserted, duplicates };
  }

  module.exports = { initDb, queryAll, queryOne, run, runMany, persistDb };
}
