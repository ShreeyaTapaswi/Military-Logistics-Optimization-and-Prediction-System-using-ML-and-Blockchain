# MLOPS — Django Backend

**Military Logistics Optimization & Prediction System**  
Group G4 | PICT | Dept. of Computer Engineering | 2025–26

---

## Overview

The Django Backend serves as the primary bridge between the React frontend, the `mlops_db` MySQL database, and the offline Machine Learning predictive pipeline. 

Instead of Django creating and managing the migrations for the military hardware tables, this backend uses **Decoupled Architecture**: the tables are declared with `managed = False` in `models.py`.

---

## Architecture

1. **Frontend to Backend**: React sends HTTP REST API requests to Django.
2. **Backend to Database**: Django reads/writes to `mlops_db` using the `mysqlclient` (PyMySQL) engine.
3. **Machine Learning**: The ML pipeline runs asynchronously as a cron job or scheduled task (`run_pipeline.ps1`). It pulls telemetry from `mlops_db`, crunches the ensemble models, and writes the `health_scores` directly back to the database.
4. **Backend to Frontend**: Django simply queries the `health_scores` table and serves the ML predictions to the React dashboard.

---

## Setup Instructions

### 1. Configure the Environment
You must use environment variables to connect to the database. Inside the root of the project, copy the `.env.example` file to `.env`:
```env
DB_NAME=mlops_db
DB_USER=root
DB_PASSWORD=shreeya@2026
DB_HOST=localhost
DB_PORT=3306
```
*(Note: Never push the `.env` file to GitHub!)*

### 2. Install Requirements
```bash
pip install django djangorestframework django-environ pymysql
```

### 3. Run the Server
Because the database is `managed=False`, you do **not** need to run `python manage.py migrate` for the core ML tables.
Just run:
```bash
python manage.py runserver
```

---

## Models (`backend/models.py`)

All models correspond 1:1 with the `schema.sql` definition.
Key models include:
* `Vehicle`: The core military asset.
* `MaintainanceRecord`: Log of repairs. 
* `VehicleTelemetry`: Sensor readings (speed, coolant, etc.)
* `HealthScores`: The output table where the XGBoost & TabNet models deposit their predictions.
* `TamperProofRecord`: Blockchain hash linking.

## API Endpoints (Planned)
* `/api/vehicles/` - List all vehicles
* `/api/vehicles/<id>/health/` - Get the latest ML health score for a vehicle.
