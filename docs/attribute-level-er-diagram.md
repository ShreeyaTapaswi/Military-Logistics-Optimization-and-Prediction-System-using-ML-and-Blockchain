# 📊 Attribute-Level ER Diagram — MLOPS

This document provides a highly detailed Entity Relationship (ER) Diagram for the Military Logistics Optimization & Prediction System (`mlops_db`). It includes every attribute, primary key (PK), foreign key (FK), and data type as defined in `schema.sql`.

---

## Detailed ER Diagram

```mermaid
erDiagram
    Admin {
        varchar user_id PK
        varchar f_name
        varchar l_name
        varchar phone_no "UNIQUE"
        varchar rank
        enum role "super_admin, base_admin"
        varchar username "UNIQUE"
        varchar password_hash
        boolean is_active
        datetime created_at
    }

    Vehicle {
        varchar vehicle_id PK
        varchar vehicle_no "UNIQUE"
        varchar type
        varchar model
        date manufacture_date
        int vehicle_age "Computed"
        varchar city
        varchar state
        varchar pincode
        enum operational_status
        datetime created_at
        datetime updated_at
    }

    health_score_record {
        varchar health_score_id PK
        varchar vehicle_id FK
        decimal failure_probability
        decimal risk_score
        datetime date
        varchar model_version
    }

    maintainance_record {
        varchar record_id PK
        varchar vehicle_id FK
        date service_date
        decimal cost
        varchar outcome
        varchar service_type
        int duration_hours
        varchar technician_id FK
        varchar vehicle_status
        datetime created_at
    }

    spare_parts {
        varchar part_id PK
        varchar part_name
        int quantity
        varchar vehicle_id FK
        varchar record_id FK
        decimal unit_cost
        varchar supplier
        datetime last_updated
    }

    tamper_proof_record {
        varchar block_id PK
        varchar tamper_tag
        varchar hash "UNIQUE"
        text attribute "JSON"
        enum record_type
        varchar record_ref_id
        datetime created_at
        varchar verified_by FK
    }

    audit_log {
        varchar log_id PK
        varchar user_id FK
        varchar action
        varchar entity_type
        varchar entity_id
        varchar ip_address
        datetime timestamp
        varchar block_id FK
    }

    vehicle_telemetry {
        varchar telemetry_id PK
        varchar vehicle_id FK
        datetime recorded_at
        float engine_coolant_temp
        float engine_oil_temp
        float engine_rpm
        float engine_load_percent
        float engine_hours
        float battery_voltage
        float fuel_consumption_rate
        float fuel_level_percent
        float current_speed
        float odometer_km
        float idle_time_minutes
        float oil_pressure
        float tyre_pressure_avg
    }

    operational_log {
        varchar log_id PK
        varchar vehicle_id FK
        date mission_date
        enum mission_type
        int terrain_difficulty
        float cargo_weight_kg
        int harsh_braking_count
        int harsh_acceleration_count
        float trip_distance_km
        float fuel_consumed_litres
        varchar logged_by FK
        datetime created_at
    }

    diagnostic_code {
        varchar code_id PK
        varchar vehicle_id FK
        varchar fault_code
        varchar description
        enum severity
        tinyint is_active
        datetime detected_at
        datetime resolved_at
        varchar detected_by FK
    }

    fuel_record {
        varchar fuel_id PK
        varchar vehicle_id FK
        date refuel_date
        float litres_added
        float fuel_efficiency
        float odometer_at_refuel
        decimal cost
        varchar recorded_by FK
        datetime created_at
    }

    health_scores {
        int score_id PK
        varchar vehicle_id FK
        datetime assessment_date
        float overall_health_score
        varchar health_status
        float engine_health_score
        float transmission_health_score
        float brake_system_score
        float electrical_system_score
        int predicted_days_to_service
        date predicted_service_date
        float confidence_level
        varchar risk_category
        text recommended_action
        text risk_evidence
        varchar model_version
        varchar health_score_record_id FK
        datetime created_at
    }

    Vehicle ||--o{ health_score_record : "generates"
    Vehicle ||--o{ maintainance_record : "has history"
    Vehicle ||--o{ spare_parts : "uses"
    Vehicle ||--o{ vehicle_telemetry : "logs sensors"
    Vehicle ||--o{ operational_log : "performs mission"
    Vehicle ||--o{ diagnostic_code : "detects faults"
    Vehicle ||--o{ fuel_record : "refuels"
    Vehicle ||--o{ health_scores : "has predictions"

    Admin ||--o{ maintainance_record : "performs"
    Admin ||--o{ tamper_proof_record : "verifies"
    Admin ||--o{ audit_log : "logs actions"
    Admin ||--o{ operational_log : "logs mission"
    Admin ||--o{ diagnostic_code : "detects"
    Admin ||--o{ fuel_record : "records"

    maintainance_record ||--o{ spare_parts : "associates"
    tamper_proof_record ||--o{ audit_log : "anchors"
    health_score_record ||--|| health_scores : "blockchain reference"
```

---

## Data Dictionary Reference

| Entity | Primary Key | Description |
|---|---|---|
| **Admin** | `user_id` | System users (Super Admin/Base Admin) with assigned roles and credentials. |
| **Vehicle** | `vehicle_id` | Core registry of military assets with manufacturing and location data. |
| **health_score_record** | `health_score_id` | Database entity tracking ML-generated risk probability for blockchain integration. |
| **maintainance_record**| `record_id` | Historical log of service events, costs, and technician assignments. |
| **spare_parts** | `part_id` | Inventory control linked to specific vehicle maintenance events. |
| **tamper_proof_record**| `block_id` | Blockchain anchor table storing SHA-256 hashes of critical operational data. |
| **audit_log** | `log_id` | Immutable trail of administrative actions performed in the system. |
| **vehicle_telemetry** | `telemetry_id` | Real-time sensor readings (DTCs, cooling, fuel, movement) per vehicle. |
| **operational_log** | `log_id` | Mission-specific metrics like terrain difficulty and harsh braking counts. |
| **diagnostic_code** | `code_id` | Catalog of P-codes and severity levels detected during operation. |
| **fuel_record** | `fuel_id` | Efficiency monitoring through refuel dates and odometer readings. |
| **health_scores** | `score_id` | Unified ML output table containing subsystem scores and maintenance actions. |

---
🔙 [Back to README](../README.md)
