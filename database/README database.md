# MLOPS — Database Module

**Military Logistics Optimization & Prediction System**  
Group G4 | PICT | Dept. of Computer Engineering | 2025–26

---

## Overview

This module contains the complete MySQL database schema for MLOPS, designed from the ER diagram (ERDPlus) and aligned with the IEEE SRS v1.0.

---

## Tables

| Table | Description |
|---|---|
| `Admin` | System users — Super Admin & Base Admin |
| `Vehicle` | Core military vehicle registry |
| `health_score_record` | ML-generated failure probability & risk scores (ER entity) |
| `maintainance_record` | All service/repair events per vehicle |
| `spare_parts` | Spare parts inventory linked to vehicles/maintenance |
| `tamper_proof_record` | Blockchain anchor table — hash of every critical record |
| `audit_log` | Immutable trail of every user action |
| `vehicle_telemetry` | Periodic OBD/sensor readings per vehicle |
| `operational_log` | Mission and trip records per vehicle |
| `diagnostic_code` | Fault/DTC codes detected per vehicle |
| `fuel_record` | Refuelling events and efficiency tracking |
| `health_scores` | ML pipeline output — written by `run_inference.py` |

---

## Views

| View | Purpose |
|---|---|
| `v_fleet_health_summary` | Latest health score per vehicle — used by dashboard |
| `v_high_risk_vehicles` | Filters High / Critical risk vehicles for alert panel |
| `v_maintenance_full` | Maintenance history with technician names & ranks |
| `v_active_faults` | All currently active diagnostic fault codes |
| `v_ml_telemetry_input` | Maps `vehicle_telemetry` columns to ML pipeline expected names |

---

## Setup Instructions

### Prerequisites
- MySQL 8.0+ (local or cloud)
- Python 3.10+ with `pymysql`

### Step 1 — Import the schema

```bash
mysql -u root -p < database/schema.sql
```

Or inside MySQL shell:

```sql
SOURCE /path/to/database/schema.sql;
```

### Step 2 — Verify tables

```sql
USE mlops_db;
SHOW TABLES;
```

### Step 3 — Environment Setup

The ML Pipeline and Backend rely on `.env` files for secure access. Ensure you have copied `.env.example` to `.env` in the root folder and configured your `DB_PASSWORD`.

### Step 4 — Run ML Pipeline

The pipeline reads from `vehicle_telemetry` (via `v_ml_telemetry_input` view) and writes results to `health_scores`.

```powershell
# Full pipeline:
.\run_pipeline.ps1

# Or step-by-step:
python Army_ML_Pipeline_and_Files\assign_vehicle_status.py
python Army_ML_Pipeline_and_Files\feature_engineering.py
python Army_ML_Pipeline_and_Files\temporal_model.py
python Army_ML_Pipeline_and_Files\train_health_model.py
python Army_ML_Pipeline_and_Files\optimize_ensemble.py
python Army_ML_Pipeline_and_Files\evaluate_ensemble.py
python Army_ML_Pipeline_and_Files\run_inference.py
```

---

## ER Diagram Mapping

The database follows a normalized 12-table structure. For a complete, attribute-level view including primary keys, foreign keys, and data types, see the **[Detailed ER Diagram →](../docs/attribute-level-er-diagram.md)**.

```mermaid
erDiagram
    Vehicle  ──generates──▶  health_score_record
    Vehicle  ──has──────────▶ maintainance_record
    Vehicle  ──have─────────▶ spare_parts
    health_score_record  ──stored_in──▶ health_scores
    maintainance_record  ──stored_in──▶ tamper_proof_record
    spare_parts          ──stored_in──▶ tamper_proof_record
    Admin    ──verifies──────▶ tamper_proof_record
    Admin    ──logs──────────▶ audit_log
```

---

## Database Config

| Field | Value |
|---|---|
| Database | `mlops_db` |
| Engine | MySQL 8.0+ · utf8mb4 · InnoDB |
| Schema Version | v2.0 |

> 🔙 [Back to README](../README.md)
