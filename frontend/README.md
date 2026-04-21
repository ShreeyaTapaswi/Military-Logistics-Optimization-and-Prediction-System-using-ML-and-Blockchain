# Frontend Module

## Entry Points

- index.html: login page
- dashboard.html: main dashboard

## Folder Structure

- assets/: images and static media
- css/: styles
- js/: frontend logic and backend API client

## Current State

This frontend is now backend-first and role-aware.

- Login uses database-backed API auth: POST /api/auth/login/
- Vehicles module:
	- View: GET /api/vehicles/
	- Create exact vehicle row (plate/base/status): POST /api/vehicles/create/
	- Add/Reduce count with blockchain event: POST /api/vehicles/operate/
	- Edit metadata: PUT /api/vehicles/{vehicle_id}/
- Maintenance module:
	- List (role-scoped + optional base filter): GET /api/maintenance/?actor_user_id=...&base_id=...
	- Create/Update/Delete: POST/PUT/DELETE /api/maintenance/
- Inventory module:
	- List (+ optional base filter): GET /api/inventory/?actor_user_id=...&base_id=...
	- Create/Update/Delete: POST/PUT/DELETE /api/inventory/
- ML status + staleness:
	- GET /api/ml/latest/?actor_user_id=...
	- POST /api/ml/run-inference/ (super admin only)
	- Dashboard now renders latest prediction rows and ML run stderr/stdout output

### Role Behavior Implemented

- Super Admin:
	- View all vehicles, maintenance, and inventory
	- Add/remove/edit vehicles across bases
	- Edit maintenance and inventory across bases
	- Trigger ML inference
- Base Admin:
	- View all vehicles and inventory
	- View maintenance scoped to own base
	- Edit only own-base records
	- Cannot trigger ML inference
