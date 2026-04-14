-- ============================================================
--  MLOPS — Military Logistics Optimization & Prediction System
--  MySQL Database Schema v2.0
--  Group G4 | PICT | Dept. of Computer Engineering | 2025-26
--  Guide: Prof. Shweta Shah
-- ============================================================
--  STRUCTURE:
--  PART A — Core Tables      (from approved ER diagram)
--  PART B — Supporting Tables (vehicle operational data)
--  PART C — ML Output Table   (health_scores)
--  PART D — Indexes & Views
--  PART E — Seed Data
-- ============================================================

CREATE DATABASE IF NOT EXISTS mlops_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE mlops_db;

-- ============================================================
--  PART A: CORE TABLES  (Approved ER Diagram)
-- ============================================================

-- A1. Admin
--     ER: Admin — f_name, l_name, user_id, phone_no, rank
CREATE TABLE Admin (
    user_id       VARCHAR(20)  NOT NULL,
    f_name        VARCHAR(50)  NOT NULL,
    l_name        VARCHAR(50)  NOT NULL,
    phone_no      VARCHAR(15)  NOT NULL UNIQUE,
    rank          VARCHAR(50)  NOT NULL,
    role          ENUM('super_admin','base_admin') NOT NULL DEFAULT 'base_admin',
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id)
) ENGINE=InnoDB COMMENT='System users — Super Admin and Base Admin';


-- A2. Vehicle
--     ER: Vehicle — vehicle_id(PK), vehicle_no, type, model,
--         manufacture_date, vehicle_age(derived),
--         location composite: city, state, Pincode
CREATE TABLE Vehicle (
    vehicle_id         VARCHAR(20)  NOT NULL,
    vehicle_no         VARCHAR(30)  NOT NULL UNIQUE,
    type               VARCHAR(50)  NOT NULL,
    model              VARCHAR(100) NOT NULL,
    manufacture_date   DATE         NOT NULL,
    vehicle_age        INT GENERATED ALWAYS AS (YEAR(CURDATE()) - YEAR(manufacture_date)) STORED,
    city               VARCHAR(100) NOT NULL,
    state              VARCHAR(100) NOT NULL,
    pincode            VARCHAR(10)  NOT NULL,
    operational_status ENUM('available','in_maintenance','unavailable','mission_deployed','decommissioned')
                       NOT NULL DEFAULT 'available',
    created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (vehicle_id)
) ENGINE=InnoDB COMMENT='Core military vehicle registry';


-- A3. health_score_record
--     ER: health_score_record — health_score_id(PK),
--         failure_probability, risk_score, date
--         Vehicle "Generates" → stored in tamper_proof_record
CREATE TABLE health_score_record (
    health_score_id     VARCHAR(30)  NOT NULL,
    vehicle_id          VARCHAR(20)  NOT NULL,
    failure_probability DECIMAL(5,4) NOT NULL CHECK (failure_probability BETWEEN 0 AND 1),
    risk_score          DECIMAL(5,2) NOT NULL,
    date                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    model_version       VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
    PRIMARY KEY (health_score_id),
    FOREIGN KEY (vehicle_id) REFERENCES Vehicle(vehicle_id) ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='ML-generated health scores per vehicle (ER entity)';


-- A4. maintainance_record  (spelling kept as per ER diagram)
--     ER: maintainance_record — record_id(PK), service_date,
--         cost, outcome
--         Vehicle "has" → stored in tamper_proof_record
CREATE TABLE maintainance_record (
    record_id      VARCHAR(30)    NOT NULL,
    vehicle_id     VARCHAR(20)    NOT NULL,
    service_date   DATE           NOT NULL,
    cost           DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
    outcome        VARCHAR(255)   NOT NULL,
    service_type   VARCHAR(100)   NOT NULL,
    duration_hours INT            NOT NULL DEFAULT 0,
    technician_id  VARCHAR(20)    NOT NULL,
    vehicle_status VARCHAR(50)    NULL COMMENT 'Status written by ML pipeline post-inference',
    created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (record_id),
    FOREIGN KEY (vehicle_id)    REFERENCES Vehicle(vehicle_id) ON UPDATE CASCADE,
    FOREIGN KEY (technician_id) REFERENCES Admin(user_id)      ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='All service and repair events per vehicle';


-- A5. spare_parts
--     ER: spare_parts — part_id(PK), part_name, quantity
--         Vehicle "have" → stored in tamper_proof_record
CREATE TABLE spare_parts (
    part_id      VARCHAR(30)   NOT NULL,
    part_name    VARCHAR(100)  NOT NULL,
    quantity     INT           NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    vehicle_id   VARCHAR(20)   NOT NULL,
    record_id    VARCHAR(30)   NULL,
    unit_cost    DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    supplier     VARCHAR(100)  NULL,
    last_updated DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (part_id),
    FOREIGN KEY (vehicle_id) REFERENCES Vehicle(vehicle_id)              ON UPDATE CASCADE,
    FOREIGN KEY (record_id)  REFERENCES maintainance_record(record_id)   ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Spare parts inventory linked to vehicles and maintenance';


-- A6. tamper_proof_record
--     ER: tamper_proof_record — block_id(PK), tamper_tag,
--         hash, Attribute
--         Central blockchain anchor; Admin "verifies" it
CREATE TABLE tamper_proof_record (
    block_id      VARCHAR(64)  NOT NULL,
    tamper_tag    VARCHAR(100) NOT NULL,
    hash          VARCHAR(128) NOT NULL UNIQUE,
    attribute     TEXT         NOT NULL COMMENT 'JSON snapshot of hashed record',
    record_type   ENUM('health_score','maintenance','spare_part','audit','route') NOT NULL,
    record_ref_id VARCHAR(64)  NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    verified_by   VARCHAR(20)  NULL,
    PRIMARY KEY (block_id),
    FOREIGN KEY (verified_by) REFERENCES Admin(user_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Blockchain anchor — immutable hash store';


-- A7. audit_log
--     ER: audit_log — log_id(PK), action
--         Admin "logs" audit_log
CREATE TABLE audit_log (
    log_id      VARCHAR(30)  NOT NULL,
    user_id     VARCHAR(20)  NOT NULL,
    action      VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50)  NOT NULL,
    entity_id   VARCHAR(64)  NOT NULL,
    ip_address  VARCHAR(45)  NULL,
    timestamp   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    block_id    VARCHAR(64)  NULL,
    PRIMARY KEY (log_id),
    FOREIGN KEY (user_id)  REFERENCES Admin(user_id)                ON UPDATE CASCADE,
    FOREIGN KEY (block_id) REFERENCES tamper_proof_record(block_id) ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='Immutable audit trail of every user action';


-- ============================================================
--  PART B: SUPPORTING TABLES
--  Extend the core ER for real operational data collection.
--  These are NOT ML-specific — they represent records any
--  military logistics system would naturally maintain.
-- ============================================================

-- B1. vehicle_telemetry
--     Periodic operational readings logged per vehicle.
--     Source: OBD port / onboard diagnostics in production,
--             manually entered or seeded for demo.
CREATE TABLE vehicle_telemetry (
    telemetry_id          VARCHAR(40) NOT NULL,
    vehicle_id            VARCHAR(20) NOT NULL,
    recorded_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Engine
    engine_coolant_temp   FLOAT NULL COMMENT 'Celsius',
    engine_oil_temp       FLOAT NULL COMMENT 'Celsius',
    engine_rpm            FLOAT NULL,
    engine_load_percent   FLOAT NULL,
    engine_hours          FLOAT NULL COMMENT 'Total cumulative engine hours',
    -- Fuel & Electrical
    battery_voltage       FLOAT NULL COMMENT 'Volts',
    fuel_consumption_rate FLOAT NULL COMMENT 'Litres per hour',
    fuel_level_percent    FLOAT NULL,
    -- Movement
    current_speed         FLOAT NULL COMMENT 'kmph',
    odometer_km           FLOAT NULL COMMENT 'Total km reading',
    idle_time_minutes     FLOAT NULL,
    -- Other systems
    oil_pressure          FLOAT NULL COMMENT 'PSI',
    tyre_pressure_avg     FLOAT NULL COMMENT 'Average PSI across tyres',
    PRIMARY KEY (telemetry_id),
    FOREIGN KEY (vehicle_id) REFERENCES Vehicle(vehicle_id) ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Periodic vehicle operational readings';


-- B2. operational_log
--     Records each mission/trip per vehicle.
--     Captures stress metrics useful for wear-and-tear analysis.
CREATE TABLE operational_log (
    log_id                   VARCHAR(30) NOT NULL,
    vehicle_id               VARCHAR(20) NOT NULL,
    mission_date             DATE        NOT NULL,
    mission_type             ENUM('combat','patrol','training','transport') NOT NULL DEFAULT 'patrol',
    terrain_difficulty       INT         NOT NULL DEFAULT 1 CHECK (terrain_difficulty BETWEEN 1 AND 10),
    cargo_weight_kg          FLOAT       NULL,
    harsh_braking_count      INT         NOT NULL DEFAULT 0,
    harsh_acceleration_count INT         NOT NULL DEFAULT 0,
    trip_distance_km         FLOAT       NULL,
    fuel_consumed_litres     FLOAT       NULL,
    logged_by                VARCHAR(20) NOT NULL,
    created_at               DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (log_id),
    FOREIGN KEY (vehicle_id) REFERENCES Vehicle(vehicle_id) ON UPDATE CASCADE,
    FOREIGN KEY (logged_by)  REFERENCES Admin(user_id)      ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Mission and trip records per vehicle';


-- B3. diagnostic_code
--     Fault codes detected during inspections or operation.
CREATE TABLE diagnostic_code (
    code_id      VARCHAR(30)  NOT NULL,
    vehicle_id   VARCHAR(20)  NOT NULL,
    fault_code   VARCHAR(20)  NOT NULL COMMENT 'e.g. P0301, E214',
    description  VARCHAR(255) NULL,
    severity     ENUM('critical','major','minor') NOT NULL DEFAULT 'minor',
    is_active    TINYINT(1)   NOT NULL DEFAULT 1 COMMENT '1=active 0=resolved',
    detected_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at  DATETIME     NULL,
    detected_by  VARCHAR(20)  NOT NULL,
    PRIMARY KEY (code_id),
    FOREIGN KEY (vehicle_id)  REFERENCES Vehicle(vehicle_id) ON UPDATE CASCADE,
    FOREIGN KEY (detected_by) REFERENCES Admin(user_id)      ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Fault and diagnostic codes per vehicle';


-- B4. fuel_record
--     Each refuelling event. Tracks efficiency trends over time.
CREATE TABLE fuel_record (
    fuel_id            VARCHAR(30)   NOT NULL,
    vehicle_id         VARCHAR(20)   NOT NULL,
    refuel_date        DATE          NOT NULL,
    litres_added       FLOAT         NOT NULL,
    fuel_efficiency    FLOAT         NULL COMMENT 'km per litre at this refuel',
    odometer_at_refuel FLOAT         NULL,
    cost               DECIMAL(10,2) NULL,
    recorded_by        VARCHAR(20)   NOT NULL,
    created_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (fuel_id),
    FOREIGN KEY (vehicle_id)  REFERENCES Vehicle(vehicle_id) ON UPDATE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES Admin(user_id)      ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='Refuelling events and fuel efficiency tracking';


-- ============================================================
--  PART C: ML OUTPUT TABLE
--  Written by run_inference.py after scoring.
--  Links back to core ER via vehicle_id and health_score_record.
-- ============================================================

CREATE TABLE health_scores (
    score_id                  INT          NOT NULL AUTO_INCREMENT,
    vehicle_id                VARCHAR(20)  NOT NULL,
    assessment_date           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Overall prediction
    overall_health_score      FLOAT        NOT NULL,
    health_status             VARCHAR(20)  NOT NULL COMMENT 'critical/poor/fair/good/excellent',
    -- Subsystem scores (nullable — populated progressively by pipeline)
    engine_health_score       FLOAT        NULL,
    transmission_health_score FLOAT        NULL,
    brake_system_score        FLOAT        NULL,
    electrical_system_score   FLOAT        NULL,
    -- Service predictions
    predicted_days_to_service INT          NULL,
    predicted_service_date    DATE         NULL,
    confidence_level          FLOAT        NULL,
    risk_category             VARCHAR(20)  NOT NULL COMMENT 'critical/high/medium/low',
    recommended_action        TEXT         NULL,
    risk_evidence             TEXT         NULL,
    model_version             VARCHAR(20)  NOT NULL DEFAULT 'v1.0',
    -- Bridge back to approved ER entity
    health_score_record_id    VARCHAR(30)  NULL COMMENT 'FK to health_score_record for blockchain trail',
    created_at                DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (score_id),
    FOREIGN KEY (vehicle_id)             REFERENCES Vehicle(vehicle_id)                      ON UPDATE CASCADE,
    FOREIGN KEY (health_score_record_id) REFERENCES health_score_record(health_score_id)     ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB COMMENT='ML pipeline output — health predictions written by run_inference.py';


-- ============================================================
--  PART D: INDEXES
-- ============================================================
CREATE INDEX idx_vehicle_status       ON Vehicle(operational_status);
CREATE INDEX idx_vehicle_location     ON Vehicle(state, city);
CREATE INDEX idx_hsr_vehicle          ON health_score_record(vehicle_id);
CREATE INDEX idx_hsr_date             ON health_score_record(date);
CREATE INDEX idx_maint_vehicle        ON maintainance_record(vehicle_id);
CREATE INDEX idx_maint_date           ON maintainance_record(service_date);
CREATE INDEX idx_spare_vehicle        ON spare_parts(vehicle_id);
CREATE INDEX idx_audit_user           ON audit_log(user_id);
CREATE INDEX idx_audit_time           ON audit_log(timestamp);
CREATE INDEX idx_telemetry_vehicle    ON vehicle_telemetry(vehicle_id);
CREATE INDEX idx_telemetry_time       ON vehicle_telemetry(recorded_at);
CREATE INDEX idx_oplog_vehicle        ON operational_log(vehicle_id);
CREATE INDEX idx_diag_vehicle         ON diagnostic_code(vehicle_id);
CREATE INDEX idx_diag_active          ON diagnostic_code(is_active);
CREATE INDEX idx_fuel_vehicle         ON fuel_record(vehicle_id);
CREATE INDEX idx_hs_vehicle           ON health_scores(vehicle_id);
CREATE INDEX idx_hs_date              ON health_scores(assessment_date);
CREATE INDEX idx_hs_risk              ON health_scores(risk_category);


-- ============================================================
--  PART D: VIEWS
-- ============================================================

-- Fleet health summary (main dashboard)
CREATE OR REPLACE VIEW v_fleet_health_summary AS
SELECT
    v.vehicle_id,
    v.vehicle_no,
    v.type,
    v.model,
    v.vehicle_age,
    v.operational_status,
    v.city,
    v.state,
    hs.overall_health_score,
    hs.health_status,
    hs.risk_category,
    hs.predicted_days_to_service,
    hs.recommended_action,
    hs.assessment_date
FROM Vehicle v
LEFT JOIN health_scores hs ON hs.score_id = (
    SELECT score_id FROM health_scores
    WHERE vehicle_id = v.vehicle_id
    ORDER BY assessment_date DESC LIMIT 1
);

-- High risk / critical vehicles (alert panel)
CREATE OR REPLACE VIEW v_high_risk_vehicles AS
SELECT * FROM v_fleet_health_summary
WHERE risk_category IN ('high','critical')
ORDER BY overall_health_score ASC;

-- Maintenance history with technician info
CREATE OR REPLACE VIEW v_maintenance_full AS
SELECT
    m.record_id,
    m.vehicle_id,
    v.vehicle_no,
    v.type,
    m.service_date,
    m.service_type,
    m.cost,
    m.outcome,
    m.duration_hours,
    m.vehicle_status,
    CONCAT(a.f_name,' ',a.l_name) AS technician_name,
    a.rank AS technician_rank
FROM maintainance_record m
JOIN Vehicle v ON v.vehicle_id = m.vehicle_id
JOIN Admin   a ON a.user_id    = m.technician_id;

-- Active diagnostic faults
CREATE OR REPLACE VIEW v_active_faults AS
SELECT
    d.code_id,
    d.vehicle_id,
    v.vehicle_no,
    d.fault_code,
    d.description,
    d.severity,
    d.detected_at,
    CONCAT(a.f_name,' ',a.l_name) AS detected_by_name
FROM diagnostic_code d
JOIN Vehicle v ON v.vehicle_id = d.vehicle_id
JOIN Admin   a ON a.user_id    = d.detected_by
WHERE d.is_active = 1
ORDER BY FIELD(d.severity,'critical','major','minor');

-- ML pipeline telemetry input view
-- Maps your table column names to ML pipeline expected column names
CREATE OR REPLACE VIEW v_ml_telemetry_input AS
SELECT
    t.vehicle_id,
    t.recorded_at               AS `timestamp`,
    t.engine_coolant_temp       AS engine_coolant_temp_celsius,
    t.engine_oil_temp           AS engine_oil_temp_celsius,
    t.battery_voltage,
    t.engine_rpm,
    t.engine_load_percent,
    t.fuel_consumption_rate     AS fuel_consumption_lph,
    t.idle_time_minutes,
    t.current_speed             AS current_speed_kmph,
    t.odometer_km,
    t.engine_hours,
    t.fuel_level_percent,
    t.oil_pressure              AS oil_pressure_psi,
    t.tyre_pressure_avg         AS tire_pressure_psi_avg
FROM vehicle_telemetry t;


-- ============================================================
--  PART E: SEED DATA
-- ============================================================

INSERT INTO Admin (user_id, f_name, l_name, phone_no, rank, role, username, password_hash) VALUES
('ADM001','Arjun',  'Sharma','9876543210','Colonel',   'super_admin','arjun.sharma',SHA2('Admin@1234',256)),
('ADM002','Priya',  'Patil', '9876543211','Captain',   'base_admin', 'priya.patil', SHA2('Base@5678', 256)),
('ADM003','Rohan',  'Verma', '9876543212','Lieutenant','base_admin', 'rohan.verma', SHA2('Base@9012', 256));

INSERT INTO Vehicle (vehicle_id, vehicle_no, type, model, manufacture_date, city, state, pincode, operational_status) VALUES
('VH001','MIL-TK-0001', 'Heavy Truck',    'Tata LPTA 1621',        '2018-03-15','Pune',  'Maharashtra','411001','available'),
('VH002','MIL-APC-0002','Armored Carrier','BMP-II',                 '2015-07-22','Mumbai','Maharashtra','400001','in_maintenance'),
('VH003','MIL-JEP-0003','Jeep',           'Maruti Gypsy MG410',    '2020-01-10','Nashik','Maharashtra','422001','available'),
('VH004','MIL-TK-0004', 'Medium Truck',   'Ashok Leyland Stallion','2016-11-05','Delhi', 'Delhi',      '110001','unavailable'),
('VH005','MIL-APC-0005','Armored Carrier','T-72 Ajeya',            '2012-05-18','Jaipur','Rajasthan',  '302001','mission_deployed');

INSERT INTO maintainance_record (record_id, vehicle_id, service_date, cost, outcome, service_type, duration_hours, technician_id) VALUES
('MR001','VH001','2025-12-10', 15000.00,'Engine oil replaced, filters cleaned','Preventive', 4, 'ADM002'),
('MR002','VH002','2026-01-20', 75000.00,'Transmission overhauled',             'Corrective',18, 'ADM003'),
('MR003','VH003','2026-02-05',  8500.00,'Brake pads replaced, tyres rotated',  'Preventive', 3, 'ADM002'),
('MR004','VH004','2025-10-30',120000.00,'Engine replacement',                  'Corrective',36, 'ADM003'),
('MR005','VH001','2026-03-15',  5000.00,'Coolant flush and battery check',     'Preventive', 2, 'ADM002');

INSERT INTO spare_parts (part_id, part_name, quantity, vehicle_id, record_id, unit_cost, supplier) VALUES
('SP001','Engine Oil Filter',    10,'VH001','MR001',  250.00,'Bosch India'),
('SP002','Transmission Gear Set', 2,'VH002','MR002',35000.00,'OFB Pune'),
('SP003','Brake Pads (set of 4)',15,'VH003','MR003', 1200.00,'Brembo India'),
('SP004','Engine Assembly 6-cyl', 1,'VH004','MR004',95000.00,'BEML Bangalore'),
('SP005','Coolant 5L',           20,'VH001','MR005',  450.00,'Castrol India');

INSERT INTO health_score_record (health_score_id, vehicle_id, failure_probability, risk_score, date) VALUES
('HSR001','VH001',0.22,22.00,'2026-04-01 09:00:00'),
('HSR002','VH002',0.81,81.00,'2026-04-01 09:05:00'),
('HSR003','VH003',0.35,35.00,'2026-04-01 09:10:00'),
('HSR004','VH004',0.95,95.00,'2026-04-01 09:15:00'),
('HSR005','VH005',0.57,57.00,'2026-04-01 09:20:00');

INSERT INTO vehicle_telemetry (telemetry_id, vehicle_id, recorded_at, engine_coolant_temp, engine_oil_temp, engine_rpm, engine_load_percent, battery_voltage, fuel_consumption_rate, fuel_level_percent, current_speed, odometer_km, engine_hours, oil_pressure, tyre_pressure_avg) VALUES
('TLM001','VH001','2026-04-01 08:00:00', 88.5,102.0,2400,65.0,12.6,18.5,72.0,55.0,24500,1200,45.0,32.0),
('TLM002','VH002','2026-04-01 08:05:00',102.0,108.0,1800,80.0,11.9,22.0,45.0,30.0,38200,2100,35.0,28.0),
('TLM003','VH003','2026-04-01 08:10:00', 85.0, 89.0,2200,55.0,12.8,15.0,88.0,60.0,12000, 600,48.0,33.0),
('TLM004','VH004','2026-04-01 08:15:00',115.0,118.0, 900,90.0,11.2,25.0,30.0, 0.0,52000,3200,28.0,24.0),
('TLM005','VH005','2026-04-01 08:20:00', 91.0, 95.0,2600,70.0,12.4,20.0,58.0,72.0,31000,1800,42.0,31.0);

INSERT INTO operational_log (log_id, vehicle_id, mission_date, mission_type, terrain_difficulty, cargo_weight_kg, harsh_braking_count, harsh_acceleration_count, trip_distance_km, fuel_consumed_litres, logged_by) VALUES
('OL001','VH001','2026-03-28','transport',3,2500.0, 2, 1,120.0,45.0,'ADM002'),
('OL002','VH002','2026-03-25','patrol',   7, 800.0, 8, 6, 85.0,38.0,'ADM003'),
('OL003','VH003','2026-03-30','training', 2, 400.0, 1, 2, 60.0,18.0,'ADM002'),
('OL004','VH004','2026-03-10','combat',   9,3000.0,15,12,200.0,95.0,'ADM003'),
('OL005','VH005','2026-04-02','patrol',   5,1200.0, 4, 3,150.0,62.0,'ADM002');

INSERT INTO diagnostic_code (code_id, vehicle_id, fault_code, description, severity, is_active, detected_at, detected_by) VALUES
('DC001','VH002','P0218','Transmission over temperature',    'critical',1,'2026-01-18 10:00:00','ADM003'),
('DC002','VH004','P0300','Random/Multiple cylinder misfire', 'critical',1,'2025-10-28 14:00:00','ADM003'),
('DC003','VH001','P0420','Catalyst system efficiency low',   'minor',   0,'2025-12-08 09:00:00','ADM002'),
('DC004','VH005','B1001','Battery voltage low warning',      'major',   1,'2026-04-01 08:20:00','ADM002');

INSERT INTO fuel_record (fuel_id, vehicle_id, refuel_date, litres_added, fuel_efficiency, odometer_at_refuel, cost, recorded_by) VALUES
('FR001','VH001','2026-03-28',120.0, 8.5,24500, 9600.00,'ADM002'),
('FR002','VH002','2026-03-25',180.0, 5.2,38200,14400.00,'ADM003'),
('FR003','VH003','2026-03-30', 80.0,11.2,12000, 6400.00,'ADM002'),
('FR004','VH004','2026-03-10',220.0, 3.8,52000,17600.00,'ADM003'),
('FR005','VH005','2026-04-02',150.0, 7.1,31000,12000.00,'ADM002');

INSERT INTO tamper_proof_record (block_id, tamper_tag, hash, attribute, record_type, record_ref_id, verified_by) VALUES
('BLK001','maintenance_log',SHA2('MR001-VH001-2025-12-10',256),'{"record_id":"MR001","vehicle_id":"VH001","cost":15000}','maintenance', 'MR001', 'ADM001'),
('BLK002','maintenance_log',SHA2('MR002-VH002-2026-01-20',256),'{"record_id":"MR002","vehicle_id":"VH002","cost":75000}','maintenance', 'MR002', 'ADM001'),
('BLK003','health_score',   SHA2('HSR004-VH004-0.95',     256),'{"health_score_id":"HSR004","failure_probability":0.95}','health_score','HSR004','ADM001');

INSERT INTO audit_log (log_id, user_id, action, entity_type, entity_id, ip_address, block_id) VALUES
('LOG001','ADM002','Created maintenance record MR001 for VH001','maintainance_record','MR001','192.168.1.10','BLK001'),
('LOG002','ADM003','Created maintenance record MR002 for VH002','maintainance_record','MR002','192.168.1.11','BLK002'),
('LOG003','ADM001','Verified blockchain block BLK003 for HSR004','tamper_proof_record','BLK003','192.168.1.1', 'BLK003'),
('LOG004','ADM002','Updated vehicle VH003 status to available',  'Vehicle',           'VH003','192.168.1.10', NULL);

INSERT INTO health_scores (vehicle_id, overall_health_score, health_status, engine_health_score, transmission_health_score, brake_system_score, electrical_system_score, predicted_days_to_service, confidence_level, risk_category, recommended_action, risk_evidence, model_version, health_score_record_id) VALUES
('VH001',82.0,'good',    85.0,80.0,88.0,78.0,45,0.91,'low',     'Schedule routine check in 45 days',          'Low failure probability, good maintenance history',        'v1.0','HSR001'),
('VH002',31.0,'critical',28.0,22.0,40.0,35.0, 2,0.95,'critical','Immediate maintenance — transmission failure','P0218 active, high engine temp, 80% load',                 'v1.0','HSR002'),
('VH003',74.0,'good',    76.0,72.0,80.0,70.0,60,0.88,'low',     'Schedule preventive check in 60 days',       'Stable readings, recent brake service done',               'v1.0','HSR003'),
('VH004',12.0,'critical',10.0,15.0,18.0,12.0, 0,0.97,'critical','Vehicle grounded — engine failure imminent', 'P0300 active, 90% load, coolant 115C, odometer 52000km',   'v1.0','HSR004'),
('VH005',55.0,'fair',    58.0,52.0,60.0,50.0,15,0.82,'medium',  'Monitor closely — service within 15 days',  'Battery warning active, ageing vehicle (14 yrs)',          'v1.0','HSR005');
