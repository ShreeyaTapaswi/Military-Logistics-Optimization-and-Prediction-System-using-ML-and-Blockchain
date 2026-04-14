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
| `HealthScoreRecord` | ML-generated failure probability & risk scores |
| `MaintenanceRecord` | All service/repair events per vehicle |
| `SpareParts` | Spare parts inventory linked to vehicles/maintenance |
| `TamperProofRecord` | Blockchain anchor table — hash of every critical record |
| `AuditLog` | Immutable trail of every user action |

## Views

| View | Purpose |
|---|---|
| `v_fleet_health_summary` | Latest health score per vehicle — used by dashboard |
| `v_high_risk_vehicles` | Filters High / Critical risk vehicles for alert panel |
| `v_maintenance_with_admin` | Maintenance history with technician names |

## Stored Procedure

`sp_get_vehicle_profile(vehicle_id)` — Returns full profile: vehicle info, latest health score, last 5 maintenance events, spare parts.

---

## Setup Instructions

### Prerequisites
- MySQL 8.0+ (antigravity / local)
- Python 3.9+ with `mysqlclient` or `PyMySQL` for Django ORM

### Step 1 — Import the schema

```bash
mysql -u root -p < mlops_schema.sql
```

Or inside MySQL shell:

```sql
SOURCE /path/to/mlops_schema.sql;
```

### Step 2 — Verify tables

```sql
USE mlops_db;
SHOW TABLES;
```

Expected output:
```
Admin
AuditLog
HealthScoreRecord
MaintenanceRecord
SpareParts
TamperProofRecord
Vehicle
```

### Step 3 — Connect Django (settings.py)

```python
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': 'mlops_db',
        'USER': 'root',
        'PASSWORD': 'your_password',
        'HOST': 'localhost',
        'PORT': '3306',
        'OPTIONS': {
            'charset': 'utf8mb4',
        }
    }
}
```

---

## ER Diagram Mapping

```
Vehicle  ──generates──▶  HealthScoreRecord
Vehicle  ──has──────────▶ MaintenanceRecord
Vehicle  ──have─────────▶ SpareParts
HealthScoreRecord  ──stored_in──▶ TamperProofRecord
MaintenanceRecord  ──stored_in──▶ TamperProofRecord
SpareParts         ──stored_in──▶ TamperProofRecord
Admin    ──verifies──────▶ TamperProofRecord
Admin    ──logs──────────▶ AuditLog
```

---

## Risk Category Logic (auto-computed column)

| Range | Category |
|---|---|
| 0.00 – 0.39 | 🟢 Low |
| 0.40 – 0.69 | 🟡 Medium |
| 0.70 – 0.89 | 🔴 High |
| 0.90 – 1.00 | 🚨 Critical |

---

