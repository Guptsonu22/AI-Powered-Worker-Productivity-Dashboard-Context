# AI-Powered Worker Productivity Dashboard

A **production-grade**, full-stack web application that ingests AI-generated CCTV events and displays real-time productivity metrics for a factory floor with 6 workers and 6 workstations.

> **Frontend:** [https://ai-powered-worker-prod-git-87de9f-sonu-kumars-projects-e29af719.vercel.app](https://ai-powered-worker-prod-git-87de9f-sonu-kumars-projects-e29af719.vercel.app)
> **Backend API:** [https://ai-dashboard-backend-hhnt.onrender.com](https://ai-dashboard-backend-hhnt.onrender.com)
> **Health Check:** [https://ai-dashboard-backend-hhnt.onrender.com/api/health](https://ai-dashboard-backend-hhnt.onrender.com/api/health)
> **GitHub Repository:** [https://github.com/Guptsonu22/AI-Powered-Worker-Productivity-Dashboard-Context](https://github.com/Guptsonu22/AI-Powered-Worker-Productivity-Dashboard-Context)

---

## 📐 System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDGE LAYER                               │
│   [CAM-01] [CAM-02] [CAM-03] [CAM-04] [CAM-05] [CAM-06]       │
│       Computer Vision → Structured JSON Events                  │
└───────────────────────┬─────────────────────────────────────────┘
                        │  POST /api/events (JSON)
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND LAYER (Node.js / Express)          │
│                                                                 │
│  ┌─────────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Validation     │  │ Deduplication│  │  Confidence Gate │  │
│  │  (Zod-style)    │→ │  (Unique idx)│→ │  (conf ≥ 0.4)   │  │
│  └─────────────────┘  └──────────────┘  └──────────────────┘  │
│           │                                      │              │
│           ▼                                      ▼              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  Metrics Engine                          │   │
│  │  utilization = active_time / shift_duration × 100       │   │
│  │  throughput  = units_produced / active_hours             │   │
│  │  trend delta = (today - yesterday) / yesterday × 100    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER (SQLite)                      │
│                                                                 │
│  workers ──┐                                                    │
│  workstations ─┤── events (worker_id, station_id, timestamp)   │
│  model_versions ──┘                                             │
└────────────────────────────┬────────────────────────────────────┘
                             │  REST API (GET /api/metrics/*)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER (Next.js 15)                  │
│                                                                 │
│  Overview → Workers → Workstations → Events → Alerts → Simulate│
│  Recharts · Real-time polling (30s) · AI Insights · Export      │
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Edge | CCTV Cameras + CV Model | Generates structured JSON events |
| API | Node.js / Express | Event ingestion, validation, routing |
| Validation | Custom middleware | Schema check + confidence gate |
| Deduplication | SQLite unique index | Prevents duplicate event storage |
| Metrics Engine | SQL aggregation | Computes utilization, throughput, trends |
| Database | SQLite (sql.js) | Persistent event + metric storage |
| Frontend | Next.js 15 + Recharts | Real-time dashboard + analytics |

---

## 🚀 Quick Start

### Option A — Docker (Recommended)

```bash
git clone <repo-url>
cd ai-productivity-dashboard
docker-compose up --build
```

- Frontend: `http://localhost:3000`
- Backend:  `http://localhost:4000`

### Option B — Manual

```bash
# Backend
cd backend && npm install && node src/server.js

# Frontend (new terminal)
cd frontend && npm install && npm run dev
```

---

## 🐳 Docker Configuration

### Backend Dockerfile
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/server.js"]
```

### docker-compose.yml
```yaml
version: "3.9"
services:
  backend:
    build: ./backend
    ports: ["4000:4000"]
    environment:
      - PORT=4000
      - NODE_ENV=production
      - FRONTEND_URL=http://localhost:3000
    volumes:
      - db-data:/app/productivity.db
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:4000/api/health"]
      interval: 30s
      retries: 3
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:4000
    depends_on:
      backend:
        condition: service_healthy
    restart: unless-stopped

volumes:
  db-data:
```

---

## 🏭 Sample Setup

### Workers (6)
| ID | Name | Role | Shift |
|----|------|------|-------|
| W1 | Arjun Sharma | Machine Operator | 08:00–17:00 |
| W2 | Priya Mehta | Quality Inspector | 08:00–17:00 |
| W3 | Ravi Kumar | Welder | 08:00–17:00 |
| W4 | Sneha Patel | Line Supervisor | 08:00–17:00 |
| W5 | Vikram Singh | Packaging Specialist | 08:00–17:00 |
| W6 | Ananya Rao | Assembly Technician | 08:00–17:00 |

### Workstations (6)
| ID | Name | Type | Location |
|----|------|------|----------|
| S1 | CNC Machine Epsilon | CNC | Zone A |
| S2 | Welding Bay Beta | Welding | Zone B |
| S3 | Assembly Line Alpha | Assembly | Zone A |
| S4 | Quality Check Gamma | QC | Zone C |
| S5 | Packaging Unit Delta | Packaging | Zone D |
| S6 | Paint Booth Zeta | Painting | Zone B |

---

## 📊 Database Schema

```sql
-- Workers
CREATE TABLE workers (
  id          TEXT PRIMARY KEY,        -- e.g. "W1"
  name        TEXT NOT NULL,
  role        TEXT,
  shift_start TEXT,                    -- "08:00"
  shift_end   TEXT                     -- "17:00"
);

-- Workstations
CREATE TABLE workstations (
  id       TEXT PRIMARY KEY,           -- e.g. "S1"
  name     TEXT NOT NULL,
  type     TEXT,                       -- CNC, Welding, Assembly...
  location TEXT                        -- Zone A/B/C/D
);

-- Events (core table)
CREATE TABLE events (
  id              TEXT PRIMARY KEY,    -- UUID v4
  worker_id       TEXT NOT NULL,
  workstation_id  TEXT NOT NULL,
  timestamp       TEXT NOT NULL,       -- ISO 8601
  event_type      TEXT NOT NULL,       -- working|idle|absent|product_count
  confidence      REAL NOT NULL,       -- 0.0 – 1.0 (threshold: 0.4)
  count           INTEGER DEFAULT 0,   -- units produced (product_count only)
  camera_id       TEXT,                -- CAM-01 … CAM-06
  model_version   TEXT,                -- v1.0 | v1.1 | v1.2
  created_at      TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (worker_id) REFERENCES workers(id),
  FOREIGN KEY (workstation_id) REFERENCES workstations(id),

  -- Deduplication constraint
  UNIQUE (worker_id, workstation_id, timestamp, event_type)
);

-- Performance indexes
CREATE INDEX idx_events_worker     ON events(worker_id);
CREATE INDEX idx_events_station    ON events(workstation_id);
CREATE INDEX idx_events_timestamp  ON events(timestamp);
CREATE INDEX idx_events_type       ON events(event_type);
CREATE INDEX idx_events_confidence ON events(confidence);
```

---

## 📐 Metric Definitions

| Metric | Formula | Unit |
|--------|---------|------|
| Utilization % | `(active_time_sec / shift_duration_sec) × 100` | % |
| Units / Hour | `total_units_produced / active_time_hours` | u/hr |
| Throughput Rate | `total_units / occupancy_hours` | u/hr |
| Avg Confidence | `AVG(confidence) × 100` on filtered events | % |
| Trend Δ% | `(today - yesterday) / yesterday × 100` | % |
| Risk Score | `Σ(weighted_alerts)`, max 100 | 0–100 |

---

## 🔌 API Reference (18 Endpoints)

### Event Ingestion
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/events` | Ingest single CCTV event |
| `POST` | `/api/events/batch` | Ingest multiple events |
| `GET` | `/api/events` | Paginated event feed with filters |

### Metrics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metrics/factory` | Factory-wide aggregated metrics |
| `GET` | `/api/metrics/workers` | All worker metrics (optionally by date) |
| `GET` | `/api/metrics/workstations` | All workstation metrics |
| `GET` | `/api/metrics/worker/:id` | Single worker detail |
| `GET` | `/api/metrics/workstation/:id` | Single workstation detail |
| `GET` | `/api/metrics/trends` | Day-over-day trend deltas |
| `GET` | `/api/metrics/event-density` | Events per hour (heatmap data) |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | System health + DB stats |
| `GET` | `/api/workers` | Worker metadata |
| `GET` | `/api/workstations` | Workstation metadata |
| `GET` | `/api/dates` | Available event dates |
| `POST` | `/api/seed` | Seed 3 days of sample data |

### Export
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/export/workers` | Worker metrics CSV or JSON |
| `GET` | `/api/export/workstations` | Workstation metrics CSV or JSON |
| `GET` | `/api/export/events` | Raw events CSV |

### Model Analytics
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/metrics/model-performance` | Per-version confidence breakdown |

---

## 🎯 Event Schema

```json
{
  "timestamp":      "2026-03-01T10:15:00Z",
  "worker_id":      "W1",
  "workstation_id": "S3",
  "event_type":     "working",
  "confidence":     0.93,
  "count":          1,
  "camera_id":      "CAM-03",
  "model_version":  "v1.2"
}
```

**Event types:** `working` · `idle` · `absent` · `product_count`  
**Confidence gate:** Events with `confidence < 0.4` are rejected  
**Response includes:** `event_id`, `success`, `duplicate` flag

---

## 🤖 ML-Ops Features

### 1. Confidence Gate
```javascript
// backend/src/routes/api.js
if (confidence < CONFIDENCE_THRESHOLD) {
  return res.status(422).json({
    error: "Confidence below threshold",
    confidence,
    threshold: CONFIDENCE_THRESHOLD,
  });
}
```
Events below the threshold (0.4) are **rejected** before storage.

### 2. Deduplication via Unique Index
```sql
UNIQUE (worker_id, workstation_id, timestamp, event_type)
```
Re-submitted events return `{ duplicate: true }` without error — idempotent ingestion.

### 3. Model Version Tracking
Every event stores `model_version` (v1.0, v1.1, v1.2). The `/api/metrics/model-performance` endpoint computes per-version confidence breakdown:
```json
{
  "model_version": "v1.2",
  "avg_confidence": 86.5,
  "high_conf_pct": 72.4,
  "med_conf_pct":  20.1,
  "low_conf_pct":   7.5,
  "event_count": 420
}
```

### 4. Camera ID Tracking
`camera_id` is stored on every event, enabling per-camera performance analysis — critical for identifying faulty cameras before they cause model drift.

---

## 💡 Technical Q&A (Interview Preparation)

### Q: How do you handle duplicate events?
**A:** We use a **composite unique index** on `(worker_id, workstation_id, timestamp, event_type)` in SQLite. When a duplicate is attempted, the DB raises a constraint error which we catch and return `{ duplicate: true, success: false }` — the caller gets a clean idempotent response. This is important because CCTV-based systems often send the same frame detection twice due to network retries.

### Q: How do you handle out-of-order events?
**A:** Events are stored with their **original CV timestamp** (not insertion time). All metric computations use `ORDER BY timestamp` on the stored timestamp. This means even if events arrive 10 minutes late, the metrics engine produces correct results on the next computation cycle. In a production system with Kafka, we'd use event-time windowing (Flink/Spark Streaming) for streaming aggregations.

### Q: How would you detect model drift?
**A:** We track confidence distribution per `model_version` over time. Signs of drift:
1. **Average confidence drops** below baseline (we alert at < 75%)
2. **Low-confidence event % increases** (tracked in model performance endpoint)
3. **Rejection rate increases** (confidence < 0.4 gate)

In production, we'd use a statistical test (e.g., KS-test) on confidence score distributions between periods and trigger automatic retraining via MLflow/Kubeflow.

### Q: How would you scale to 100+ cameras?
| Scale | Architecture Change |
|-------|-------------------|
| Current (6 cams) | Direct REST → SQLite |
| 50 cameras | REST → PostgreSQL + connection pool |
| 100 cameras | REST → **Apache Kafka** topic → consumer group |
| 200+ cameras | Kafka → Apache Flink (streaming aggregations) |
| Multi-site | Kafka → distributed PostgreSQL (Citus/CockroachDB) |

Key changes:
- **Message Queue (Kafka):** Decouple producers (cameras) from consumers (metrics engine)
- **Redis:** Cache frequently-queried metrics (worker/station summaries)
- **PostgreSQL:** Replace SQLite with partitioned tables on `timestamp` column
- **Load Balancer:** Horizontal scaling of API servers (stateless with external DB)
- **Prometheus + Grafana:** Replace custom metrics with industry-standard observability

### Q: What validation does the event API perform?
1. **Required field check:** `worker_id`, `workstation_id`, `timestamp`, `event_type`, `confidence`
2. **Type validation:** `confidence` must be a float 0–1; `count` must be non-negative integer
3. **Confidence gate:** Reject if confidence < configured threshold (0.4 default)
4. **Referential integrity:** `worker_id` and `workstation_id` must exist in their respective tables
5. **Timestamp parsing:** ISO 8601 format validated before storage

### Q: What is the indexing strategy?
```sql
-- Read-optimized indexes for common query patterns:
CREATE INDEX idx_events_worker     ON events(worker_id);     -- worker metrics
CREATE INDEX idx_events_station    ON events(workstation_id);-- station metrics
CREATE INDEX idx_events_timestamp  ON events(timestamp);     -- time-range queries
CREATE INDEX idx_events_type       ON events(event_type);    -- type filtering
CREATE INDEX idx_events_confidence ON events(confidence);    -- confidence filtering
```
For time-series queries at scale, we'd use **partial indexes** and **table partitioning** by month in PostgreSQL.

### Q: How would you add real-time WebSocket support?
```javascript
// Current: 30s polling
setInterval(() => fetchMetrics(), 30000);

// Production upgrade:
import { Server } from 'socket.io';
io.on('connection', socket => {
  // Emit after each successful event ingestion:
  socket.emit('metrics_update', computeFactoryMetrics());
});

// Frontend: replace polling with socket subscription
socket.on('metrics_update', (data) => setFactory(data));
```

---

## 📦 Features Summary

| Feature | Status |
|---------|--------|
| Real-time metrics dashboard | ✅ |
| Worker productivity analytics | ✅ |
| Workstation performance tracking | ✅ |
| Event ingestion API | ✅ |
| Batch event ingestion | ✅ |
| Event deduplication | ✅ |
| Confidence gate (ML-Ops) | ✅ |
| Model version tracking | ✅ |
| Camera ID tracking | ✅ |
| Day-over-day trend analysis | ✅ |
| AI-powered insights panel | ✅ |
| Risk Score + Predictive Outlook | ✅ |
| Production Alerts System | ✅ |
| Event Pipeline Status card | ✅ |
| Worker compare mode (radar chart) | ✅ |
| Performance category badges | ✅ |
| Auto Simulation engine | ✅ |
| Simulation speed control | ✅ |
| Pause / Resume simulation | ✅ |
| Event Feed with pagination | ✅ |
| Critical event row highlighting | ✅ |
| Search & filter (all pages) | ✅ |
| CSV / JSON export | ✅ |
| Skeleton loading states | ✅ |
| Empty states | ✅ |
| Docker + docker-compose | ✅ |
| Architecture diagram (README) | ✅ |

---

## 🏗️ Backend Folder Structure

```
backend/
├── src/
│   ├── server.js          # Express app + boot sequence
│   ├── db.js              # SQLite (sql.js) init + query helpers
│   ├── seed.js            # Sample data generator (3 days × 6 workers)
│   └── routes/
│       └── api.js         # All 18 API endpoints
├── Dockerfile
├── .env
└── package.json
```

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx           # Overview / Factory dashboard
│   │   ├── workers/page.tsx   # Worker analytics + compare
│   │   ├── workstations/page.tsx
│   │   ├── events/page.tsx    # Event feed + critical rows
│   │   ├── alerts/page.tsx    # Production Alerts System
│   │   └── simulate/page.tsx  # Event simulator + speed control
│   ├── components/
│   │   ├── DashboardLayout.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Toast.tsx
│   │   └── UI.tsx             # MetricCard, InsightsPanel, SkeletonMetrics...
│   └── lib/
│       └── api.ts             # Typed API client
├── Dockerfile
└── next.config.ts
```

---

## 🔮 Future Roadmap

| Enhancement | Description | Priority |
|-------------|-------------|---------|
| WebSocket live push | Replace polling with Socket.IO | High |
| Kafka integration | Message queue for 100+ cameras | High |
| Redis caching | Cache hot metrics, TTL 30s | Medium |
| PostgreSQL migration | Replace SQLite for production scale | High |
| Role-based auth | Admin / Manager / Viewer roles | Medium |
| Dark/Light mode | CSS custom property toggle | Low |
| Mobile responsive | Tablet-optimized layout | Medium |
| Worker timeline | Per-worker event Gantt chart | Medium |
| Anomaly ML model | Predict idle time spikes | High |

---

## 📄 License

MIT — Built for the AI-Powered Worker Productivity Dashboard Technical Assessment.


---

## ?? Deployment Guide (Production)

Live Demo:   \https://mlops-dashboard.vercel.app\ (Or your URL)
Backend API: \https://mlops-backend.onrender.com\ (Or your URL)

### Tech Stack
- **Frontend:** Next.js (Deployed on Vercel)
- **Backend:** Node.js + Express (Deployed on Render / Railway)
- **Database:** PostgreSQL (Render) / SQLite (Local)

### Step 1: Backend Deployment (Render or Railway)
1. Commit and push the project to GitHub.
2. Go to [Render](https://render.com) (or [Railway](https://railway.app)).
3. Create a **New Web Service**, connect your GitHub repo, and set the **Root Directory** to \ackend\.
4. Build Command: \
pm install\
5. Start Command: \
pm start\
6. Add Environment Variables:
   - \DATABASE_URL\: Your PostgreSQL connection string.
   - \PORT\: Your desired port.
   - \NODE_ENV\: \production\
   - \FRONTEND_URL\: \*\ (or your specific Vercel URL later for CORS)
7. Deploy the service and take note of the backend URL.

### Step 2: Frontend Deployment (Vercel)
1. Go to [Vercel](https://vercel.com).
2. Create a **New Project** and import your GitHub repo.
3. Set the **Root Directory** to \rontend\.
4. Add the Environment Variable:
   - \NEXT_PUBLIC_API_URL\: (The Backend URL from Step 1)
5. Hit **Deploy**.

### Step 3: Seed Production Database
Once both are live, seed the cloud database so the dashboard populates:
\\\ash
curl -X POST https://your-backend-url/api/seed
\\\

