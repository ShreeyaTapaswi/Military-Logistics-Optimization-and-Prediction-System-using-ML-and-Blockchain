# MLOPS Backend (Modular Django Scaffold)

This folder now contains a modular Django backend structure that separates:

- API layer (request/response)
- Service layer (orchestration and external gateways)
- Repository layer (database querying)

The backend is designed to sit between frontend, MySQL, ML pipeline, and blockchain services.

## Folder Structure

```text
manage.py
mlops_backend/
	settings.py
	urls.py
	asgi.py
	wsgi.py
backend/
	models.py
	api/
		serializers.py
		views.py
		urls.py
	services/
		container.py
		fleet_service.py
		operations_orchestrator.py
		workflow_service.py
		blockchain_gateway.py
		ml_gateway.py
	repositories/
		vehicle_repository.py
		health_repository.py
```

## Setup

1. Create virtual environment and install requirements:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

2. Configure `.env` in repository root using your local values:

```env
DB_NAME=mlops_db
DB_USER=user
DB_PASSWORD=user
DB_HOST=localhost
DB_PORT=3306
SECRET_KEY=change-this-in-production
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
BLOCKCHAIN_ENABLED=True
BLOCKCHAIN_STRICT_LAYER1=True
ML_PYTHON_EXECUTABLE=python
```

3. Run server:

```powershell
python manage.py runserver
```

## Current API Endpoints

- `GET /api/health/` -> service health (DB + blockchain + ML gateway)
- `GET /api/vehicles/` -> list vehicles with optional filters
- `GET /api/vehicles/<vehicle_id>/health/` -> latest health score for a vehicle
- `GET /api/fleet/summary/` -> fleet risk and status distribution
- `POST /api/operations/vehicle-movement/` -> orchestrated movement flow
- `POST /api/workflows/vehicle-movement-inference/` -> operation + ML inference + Layer 2 prediction logging
- `POST /api/ml/run-inference/` -> trigger `run_inference.py`

## Orchestration Behavior

- Layer 1 blockchain check runs first.
- If `BLOCKCHAIN_STRICT_LAYER1=True`, Layer 1 failure blocks DB write.
- On success (or non-strict mode), local audit and tamper hash rows are written.
- Layer 2 audit write is attempted after DB persistence.
- If Layer 2 fails, response marks status as `pending_retry`.

## Note

This phase adds modular backend scaffolding and operational entry points.
Further hardening (retry workers, auth/RBAC, frontend wiring) is handled in next phases.
