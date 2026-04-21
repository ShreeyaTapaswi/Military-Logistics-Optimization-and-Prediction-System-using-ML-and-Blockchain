import argparse
import hashlib
import sys

import pymysql


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed realistic demo data across all major mlops_db tables")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", default="root")
    parser.add_argument("--password", default="root")
    parser.add_argument("--database", default="mlops_db")
    return parser.parse_args()


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def execute_many(cursor, sql: str, rows) -> int:
    if not rows:
        return 0
    cursor.executemany(sql, rows)
    return cursor.rowcount


def main() -> int:
    args = parse_args()

    try:
        conn = pymysql.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            database=args.database,
            autocommit=False,
        )
    except Exception as exc:
        print(f"Unable to connect to MySQL: {exc}")
        return 1

    inserted = {}

    try:
        with conn.cursor() as cursor:
            admins = [
                ("ADM001", "Arjun", "Sharma", "9876543210", "Colonel", "super_admin", "arjun.sharma", sha256_hex("Admin@1234"), 1),
                ("ADM002", "Priya", "Patil", "9876543211", "Captain", "base_admin", "priya.patil", sha256_hex("Base@5678"), 1),
                ("ADM003", "Rohan", "Verma", "9876543212", "Lieutenant", "base_admin", "rohan.verma", sha256_hex("Base@9012"), 1),
                ("ADM004", "Aman", "Rawat", "9876543213", "Captain", "base_admin", "aman.rawat", sha256_hex("Base@1122"), 1),
                ("ADM005", "Kavya", "Singh", "9876543214", "Major", "base_admin", "kavya.singh", sha256_hex("Base@3456"), 1),
                ("ADM006", "Neha", "Iyer", "9876543215", "Captain", "base_admin", "neha.iyer", sha256_hex("Base@7788"), 1),
            ]
            inserted["Admin"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO Admin
                (user_id, f_name, l_name, phone_no, `rank`, role, username, password_hash, is_active)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                admins,
            )

            vehicles = [
                ("VH101", "MIL-DLH-T90-0101", "T-90 Tank", "T-90S Bhishma", "2019-01-12", "Delhi", "Delhi", "110010", "available"),
                ("VH102", "MIL-DLH-TRK-0102", "Tata LPTA Truck", "Tata LPTA 715", "2018-04-07", "Delhi", "Delhi", "110010", "in_maintenance"),
                ("VH103", "MIL-LEH-BMP-0103", "BMP-2 IFV", "BMP-2 Sarath", "2017-11-18", "Leh", "Ladakh", "194101", "available"),
                ("VH104", "MIL-LEH-FUL-0104", "Fuel Tanker", "BEML Fuel Carrier", "2016-06-22", "Leh", "Ladakh", "194101", "mission_deployed"),
                ("VH105", "MIL-PUN-TRK-0105", "Tata LPTA Truck", "Tata LPTA 1628", "2020-09-05", "Pune", "Maharashtra", "411001", "available"),
                ("VH106", "MIL-PUN-MRK-0106", "Mahindra Marksman", "Marksman Mk-II", "2021-02-14", "Pune", "Maharashtra", "411001", "available"),
                ("VH107", "MIL-JSL-T90-0107", "T-90 Tank", "T-90M", "2015-12-09", "Jaisalmer", "Rajasthan", "345001", "unavailable"),
                ("VH108", "MIL-JSL-AMB-0108", "Ambulance", "Force Traveller Ambulance", "2022-03-19", "Jaisalmer", "Rajasthan", "345001", "available"),
                ("VH109", "MIL-KOL-BMP-0109", "BMP-2 IFV", "BMP-2A", "2019-07-11", "Kolkata", "West Bengal", "700001", "in_maintenance"),
                ("VH110", "MIL-KOL-TRK-0110", "Tata LPTA Truck", "Tata LPTA 1623", "2018-08-30", "Kolkata", "West Bengal", "700001", "available"),
                ("VH111", "MIL-DLH-MRK-0111", "Mahindra Marksman", "Marksman Patrol", "2020-12-16", "Delhi", "Delhi", "110010", "available"),
                ("VH112", "MIL-LEH-AMB-0112", "Ambulance", "Tata Winger Ambulance", "2021-05-28", "Leh", "Ladakh", "194101", "available"),
                ("VH113", "MIL-PUN-T90-0113", "T-90 Tank", "T-90S Mk-III", "2017-03-22", "Pune", "Maharashtra", "411001", "mission_deployed"),
                ("VH114", "MIL-JSL-TRK-0114", "Tata LPTA Truck", "Tata LPTA 825", "2016-10-03", "Jaisalmer", "Rajasthan", "345001", "available"),
                ("VH115", "MIL-KOL-FUL-0115", "Fuel Tanker", "Ashok Leyland Fuel Carrier", "2014-07-15", "Kolkata", "West Bengal", "700001", "decommissioned"),
            ]
            inserted["Vehicle"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO Vehicle
                (vehicle_id, vehicle_no, type, model, manufacture_date, city, state, pincode, operational_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                vehicles,
            )

            maintenance = [
                ("MR101", "VH101", "2026-04-02", 42000.00, "Turret calibration and hydraulic check", "Scheduled Service", 6, "ADM002", "available"),
                ("MR102", "VH102", "2026-04-04", 18500.00, "Brake line replacement", "Repair", 5, "ADM003", "in_maintenance"),
                ("MR103", "VH103", "2026-04-06", 12300.00, "Track tension adjustment", "Inspection", 3, "ADM002", "available"),
                ("MR104", "VH104", "2026-04-08", 9600.00, "Fuel pump preventive service", "Preventive", 4, "ADM003", "mission_deployed"),
                ("MR105", "VH105", "2026-04-09", 22400.00, "Cooling system flush and refill", "Preventive", 4, "ADM002", "available"),
                ("MR106", "VH106", "2026-04-10", 18800.00, "ECU and sensor diagnostics", "Corrective", 5, "ADM002", "available"),
                ("MR107", "VH107", "2026-04-11", 53000.00, "Transmission overhaul", "Corrective", 11, "ADM003", "unavailable"),
                ("MR108", "VH108", "2026-04-12", 7100.00, "Medical equipment electrical test", "Inspection", 2, "ADM003", "available"),
                ("MR109", "VH109", "2026-04-13", 39000.00, "Suspension rebuild", "Repair", 8, "ADM002", "in_maintenance"),
                ("MR110", "VH110", "2026-04-14", 16200.00, "Engine oil and filter replacement", "Scheduled Service", 3, "ADM002", "available"),
                ("MR111", "VH111", "2026-04-14", 11800.00, "Night-ops comms module recalibration", "Inspection", 3, "ADM002", "available"),
                ("MR112", "VH112", "2026-04-15", 9400.00, "HVAC and oxygen line preventive check", "Preventive", 2, "ADM003", "available"),
                ("MR113", "VH113", "2026-04-15", 26700.00, "Track shoe replacement and alignment", "Corrective", 7, "ADM002", "mission_deployed"),
                ("MR114", "VH114", "2026-04-16", 14300.00, "Rear axle and differential servicing", "Scheduled Service", 4, "ADM003", "available"),
                ("MR115", "VH115", "2026-04-16", 61200.00, "End-of-life decommission inspection", "Repair", 12, "ADM002", "decommissioned"),
            ]
            inserted["maintainance_record"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO maintainance_record
                (record_id, vehicle_id, service_date, cost, outcome, service_type, duration_hours, technician_id, vehicle_status)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                maintenance,
            )

            spare_parts = [
                ("SP101", "Engine Oil Filter", 36, "VH101", "MR101", 420.00, "Engine"),
                ("SP102", "Brake Pad Set", 22, "VH102", "MR102", 1350.00, "Brakes"),
                ("SP103", "Track Link Assembly", 10, "VH103", "MR103", 8900.00, "Tracks"),
                ("SP104", "Fuel Injector Kit", 18, "VH104", "MR104", 2700.00, "Engine"),
                ("SP105", "Alternator Unit", 9, "VH105", "MR105", 11200.00, "Electrical"),
                ("SP106", "ECU Sensor Pack", 14, "VH106", "MR106", 6400.00, "Electrical"),
                ("SP107", "Transmission Gear Set", 4, "VH107", "MR107", 32500.00, "Transmission"),
                ("SP108", "Ambulance Tire Set", 20, "VH108", "MR108", 5900.00, "Tires"),
                ("SP109", "Suspension Arm", 11, "VH109", "MR109", 8400.00, "Brakes"),
                ("SP110", "Hydraulic Pump", 8, "VH110", "MR110", 14900.00, "Engine"),
                ("SP111", "Communication Relay Pack", 16, "VH111", "MR111", 7900.00, "Electrical"),
                ("SP112", "Medical Suction Pump", 7, "VH112", "MR112", 5100.00, "Engine"),
                ("SP113", "Track Roller Set", 6, "VH113", "MR113", 21400.00, "Tracks"),
                ("SP114", "Differential Bearing Kit", 13, "VH114", "MR114", 6900.00, "Transmission"),
                ("SP115", "Fuel Line Coupler", 5, "VH115", "MR115", 4600.00, "Engine"),
            ]
            inserted["spare_parts"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO spare_parts
                (part_id, part_name, quantity, vehicle_id, record_id, unit_cost, supplier)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                spare_parts,
            )

            health_score_records = [
                ("HSR101", "VH101", 0.18, 18.00, "2026-04-15 08:00:00", "v1.0"),
                ("HSR102", "VH102", 0.62, 62.00, "2026-04-15 08:05:00", "v1.0"),
                ("HSR103", "VH103", 0.31, 31.00, "2026-04-15 08:10:00", "v1.0"),
                ("HSR104", "VH104", 0.44, 44.00, "2026-04-15 08:15:00", "v1.0"),
                ("HSR105", "VH105", 0.27, 27.00, "2026-04-15 08:20:00", "v1.0"),
                ("HSR106", "VH106", 0.35, 35.00, "2026-04-15 08:25:00", "v1.0"),
                ("HSR107", "VH107", 0.76, 76.00, "2026-04-15 08:30:00", "v1.0"),
                ("HSR108", "VH108", 0.22, 22.00, "2026-04-15 08:35:00", "v1.0"),
                ("HSR109", "VH109", 0.69, 69.00, "2026-04-15 08:40:00", "v1.0"),
                ("HSR110", "VH110", 0.29, 29.00, "2026-04-15 08:45:00", "v1.0"),
                ("HSR111", "VH111", 0.26, 26.00, "2026-04-15 08:50:00", "v1.0"),
                ("HSR112", "VH112", 0.21, 21.00, "2026-04-15 08:55:00", "v1.0"),
                ("HSR113", "VH113", 0.39, 39.00, "2026-04-15 09:00:00", "v1.0"),
                ("HSR114", "VH114", 0.34, 34.00, "2026-04-15 09:05:00", "v1.0"),
                ("HSR115", "VH115", 0.88, 88.00, "2026-04-15 09:10:00", "v1.0"),
            ]
            inserted["health_score_record"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO health_score_record
                (health_score_id, vehicle_id, failure_probability, risk_score, date, model_version)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                health_score_records,
            )

            telemetry = [
                ("TLM101", "VH101", "2026-04-15 06:00:00", 91.0, 98.0, 2100, 62.0, 1380, 12.5, 17.5, 66.0, 48.0, 32750, 22.0, 44.0, 33.0),
                ("TLM102", "VH102", "2026-04-15 06:05:00", 102.0, 109.0, 1800, 74.0, 1630, 11.9, 21.0, 54.0, 22.0, 40820, 38.0, 37.0, 30.0),
                ("TLM103", "VH103", "2026-04-15 06:10:00", 86.0, 94.0, 2250, 58.0, 1210, 12.8, 16.1, 79.0, 52.0, 21640, 17.0, 46.0, 34.0),
                ("TLM104", "VH104", "2026-04-15 06:15:00", 93.0, 99.0, 2050, 65.0, 1890, 12.2, 18.6, 61.0, 41.0, 29700, 27.0, 42.0, 31.0),
                ("TLM105", "VH105", "2026-04-15 06:20:00", 88.0, 96.0, 2300, 57.0, 1140, 12.7, 15.2, 84.0, 57.0, 19520, 14.0, 47.0, 34.0),
                ("TLM106", "VH106", "2026-04-15 06:25:00", 90.0, 97.0, 2150, 60.0, 1030, 12.9, 14.7, 82.0, 54.0, 14110, 13.0, 48.0, 35.0),
                ("TLM107", "VH107", "2026-04-15 06:30:00", 111.0, 118.0, 1700, 84.0, 2450, 11.3, 24.2, 38.0, 12.0, 46220, 44.0, 33.0, 27.0),
                ("TLM108", "VH108", "2026-04-15 06:35:00", 84.0, 91.0, 2000, 52.0, 820, 13.1, 13.9, 88.0, 63.0, 9800, 11.0, 49.0, 36.0),
                ("TLM109", "VH109", "2026-04-15 06:40:00", 104.0, 112.0, 1850, 79.0, 2110, 11.7, 22.4, 46.0, 18.0, 43210, 41.0, 35.0, 29.0),
                ("TLM110", "VH110", "2026-04-15 06:45:00", 89.0, 95.0, 2200, 59.0, 1520, 12.6, 16.8, 73.0, 49.0, 28640, 19.0, 45.0, 32.0),
                ("TLM111", "VH111", "2026-04-15 06:50:00", 87.0, 94.0, 2080, 56.0, 1330, 12.7, 15.1, 78.0, 51.0, 23200, 16.0, 47.0, 34.0),
                ("TLM112", "VH112", "2026-04-15 06:55:00", 83.0, 90.0, 1920, 49.0, 910, 13.2, 13.4, 86.0, 60.0, 12040, 10.0, 50.0, 36.0),
                ("TLM113", "VH113", "2026-04-15 07:00:00", 95.0, 103.0, 2180, 68.0, 1710, 12.1, 18.8, 58.0, 39.0, 35610, 24.0, 41.0, 31.0),
                ("TLM114", "VH114", "2026-04-15 07:05:00", 92.0, 99.0, 2060, 63.0, 1840, 12.4, 17.9, 64.0, 43.0, 37420, 26.0, 42.0, 31.0),
                ("TLM115", "VH115", "2026-04-15 07:10:00", 116.0, 123.0, 1680, 88.0, 2980, 11.0, 25.6, 31.0, 8.0, 51210, 51.0, 31.0, 26.0),
            ]
            inserted["vehicle_telemetry"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO vehicle_telemetry
                (telemetry_id, vehicle_id, recorded_at, engine_coolant_temp, engine_oil_temp, engine_rpm, engine_load_percent,
                 engine_hours, battery_voltage, fuel_consumption_rate, fuel_level_percent, current_speed, odometer_km,
                 idle_time_minutes, oil_pressure, tyre_pressure_avg)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                telemetry,
            )

            operations = [
                ("OL101", "VH101", "2026-04-14", "training", 4, 1900.0, 2, 2, 84.0, 32.0, "ADM002"),
                ("OL102", "VH102", "2026-04-14", "transport", 5, 2600.0, 5, 4, 102.0, 46.0, "ADM003"),
                ("OL103", "VH103", "2026-04-14", "patrol", 6, 1200.0, 3, 3, 96.0, 40.0, "ADM002"),
                ("OL104", "VH104", "2026-04-13", "transport", 7, 3100.0, 4, 2, 118.0, 52.0, "ADM003"),
                ("OL105", "VH105", "2026-04-13", "training", 3, 1400.0, 2, 1, 74.0, 28.0, "ADM002"),
                ("OL106", "VH106", "2026-04-13", "patrol", 4, 1100.0, 3, 2, 69.0, 25.0, "ADM002"),
                ("OL107", "VH107", "2026-04-12", "combat", 8, 2800.0, 10, 9, 142.0, 71.0, "ADM003"),
                ("OL108", "VH108", "2026-04-12", "transport", 2, 950.0, 1, 1, 58.0, 19.0, "ADM003"),
                ("OL109", "VH109", "2026-04-12", "patrol", 7, 1500.0, 7, 6, 109.0, 49.0, "ADM002"),
                ("OL110", "VH110", "2026-04-11", "training", 4, 1700.0, 2, 2, 91.0, 35.0, "ADM002"),
                ("OL111", "VH111", "2026-04-11", "patrol", 5, 1300.0, 2, 2, 88.0, 34.0, "ADM002"),
                ("OL112", "VH112", "2026-04-11", "transport", 3, 880.0, 1, 1, 61.0, 20.0, "ADM003"),
                ("OL113", "VH113", "2026-04-10", "combat", 8, 2700.0, 8, 7, 133.0, 63.0, "ADM002"),
                ("OL114", "VH114", "2026-04-10", "transport", 6, 2450.0, 4, 3, 112.0, 50.0, "ADM003"),
                ("OL115", "VH115", "2026-04-09", "training", 2, 700.0, 0, 0, 41.0, 14.0, "ADM002"),
            ]
            inserted["operational_log"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO operational_log
                (log_id, vehicle_id, mission_date, mission_type, terrain_difficulty, cargo_weight_kg,
                 harsh_braking_count, harsh_acceleration_count, trip_distance_km, fuel_consumed_litres, logged_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                operations,
            )

            diagnostics = [
                ("DC101", "VH102", "P0305", "Engine misfire detected", "major", 1, "2026-04-14 10:15:00", None, "ADM003"),
                ("DC102", "VH104", "P0217", "Engine overheat warning", "major", 1, "2026-04-14 11:00:00", None, "ADM003"),
                ("DC103", "VH107", "P0700", "Transmission control fault", "critical", 1, "2026-04-14 13:25:00", None, "ADM003"),
                ("DC104", "VH109", "B1001", "Battery voltage low", "major", 1, "2026-04-14 15:40:00", None, "ADM002"),
                ("DC105", "VH105", "P0420", "Catalyst efficiency below threshold", "minor", 0, "2026-04-10 08:00:00", "2026-04-12 17:00:00", "ADM002"),
                ("DC106", "VH108", "C0035", "Wheel speed sensor intermittent", "minor", 0, "2026-04-11 09:20:00", "2026-04-13 14:10:00", "ADM003"),
                ("DC107", "VH111", "U0121", "ABS communication timeout", "minor", 0, "2026-04-12 10:30:00", "2026-04-13 16:10:00", "ADM002"),
                ("DC108", "VH112", "B0010", "Cabin climate control relay fault", "minor", 1, "2026-04-15 07:45:00", None, "ADM003"),
                ("DC109", "VH113", "P0335", "Crankshaft position sensor out of range", "major", 1, "2026-04-15 08:12:00", None, "ADM002"),
                ("DC110", "VH115", "P0087", "Fuel rail pressure too low", "critical", 1, "2026-04-15 08:48:00", None, "ADM002"),
            ]
            inserted["diagnostic_code"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO diagnostic_code
                (code_id, vehicle_id, fault_code, description, severity, is_active, detected_at, resolved_at, detected_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                diagnostics,
            )

            fuel_rows = [
                ("FR101", "VH101", "2026-04-14", 130.0, 8.9, 32750, 10400.00, "ADM002"),
                ("FR102", "VH102", "2026-04-14", 160.0, 6.3, 40820, 12800.00, "ADM003"),
                ("FR103", "VH103", "2026-04-14", 120.0, 9.7, 21640, 9600.00, "ADM002"),
                ("FR104", "VH104", "2026-04-13", 190.0, 6.1, 29700, 15200.00, "ADM003"),
                ("FR105", "VH105", "2026-04-13", 110.0, 10.2, 19520, 8800.00, "ADM002"),
                ("FR106", "VH106", "2026-04-13", 95.0, 10.7, 14110, 7600.00, "ADM002"),
                ("FR107", "VH107", "2026-04-12", 210.0, 5.0, 46220, 16800.00, "ADM003"),
                ("FR108", "VH108", "2026-04-12", 70.0, 12.1, 9800, 5600.00, "ADM003"),
                ("FR109", "VH109", "2026-04-12", 175.0, 5.8, 43210, 14000.00, "ADM002"),
                ("FR110", "VH110", "2026-04-11", 145.0, 7.9, 28640, 11600.00, "ADM002"),
                ("FR111", "VH111", "2026-04-11", 118.0, 9.3, 23200, 9440.00, "ADM002"),
                ("FR112", "VH112", "2026-04-11", 82.0, 11.5, 12040, 6560.00, "ADM003"),
                ("FR113", "VH113", "2026-04-10", 184.0, 6.8, 35610, 14720.00, "ADM002"),
                ("FR114", "VH114", "2026-04-10", 172.0, 6.5, 37420, 13760.00, "ADM003"),
                ("FR115", "VH115", "2026-04-09", 95.0, 4.3, 51210, 7600.00, "ADM002"),
            ]
            inserted["fuel_record"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO fuel_record
                (fuel_id, vehicle_id, refuel_date, litres_added, fuel_efficiency, odometer_at_refuel, cost, recorded_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                fuel_rows,
            )

            health_scores = [
                (1101, "VH101", "2026-04-15 09:00:00", 86.0, "good", 88.0, 84.0, 90.0, 82.0, 52, "2026-06-06", 0.93, "low", "Routine service in 7 weeks", "Stable telemetry and no critical DTC", "v1.0", "HSR101"),
                (1102, "VH102", "2026-04-15 09:02:00", 49.0, "fair", 52.0, 41.0, 57.0, 46.0, 11, "2026-04-26", 0.89, "high", "Repair brake and inspect injectors", "Recent misfire fault and elevated oil temp", "v1.0", "HSR102"),
                (1103, "VH103", "2026-04-15 09:04:00", 73.0, "good", 75.0, 70.0, 77.0, 69.0, 29, "2026-05-14", 0.90, "medium", "Inspect track wear in next cycle", "Moderate stress in patrol missions", "v1.0", "HSR103"),
                (1104, "VH104", "2026-04-15 09:06:00", 64.0, "fair", 62.0, 66.0, 68.0, 61.0, 18, "2026-05-03", 0.86, "medium", "Check cooling and fuel line pressure", "Higher thermal range in last telemetry", "v1.0", "HSR104"),
                (1105, "VH105", "2026-04-15 09:08:00", 79.0, "good", 82.0, 76.0, 80.0, 77.0, 37, "2026-05-22", 0.91, "low", "Continue preventive maintenance", "Good fuel efficiency and low fault rate", "v1.0", "HSR105"),
                (1106, "VH106", "2026-04-15 09:10:00", 74.0, "good", 76.0, 72.0, 75.0, 73.0, 34, "2026-05-19", 0.90, "low", "Sensor retest during next inspection", "Minor sensor anomalies corrected", "v1.0", "HSR106"),
                (1107, "VH107", "2026-04-15 09:12:00", 28.0, "critical", 24.0, 21.0, 36.0, 30.0, 2, "2026-04-17", 0.97, "critical", "Ground vehicle and replace transmission", "Critical DTC with high thermal stress", "v1.0", "HSR107"),
                (1108, "VH108", "2026-04-15 09:14:00", 83.0, "good", 85.0, 80.0, 86.0, 81.0, 41, "2026-05-26", 0.92, "low", "Routine preventive checks only", "Strong subsystem scores", "v1.0", "HSR108"),
                (1109, "VH109", "2026-04-15 09:16:00", 46.0, "poor", 43.0, 40.0, 50.0, 48.0, 8, "2026-04-23", 0.94, "high", "Immediate maintenance before patrol", "Battery warning and repeated harsh braking", "v1.0", "HSR109"),
                (1110, "VH110", "2026-04-15 09:18:00", 76.0, "good", 79.0, 73.0, 78.0, 74.0, 33, "2026-05-18", 0.90, "low", "Maintain current service schedule", "No active faults and stable telemetry", "v1.0", "HSR110"),
                (1111, "VH111", "2026-04-15 09:20:00", 81.0, "good", 83.0, 79.0, 82.0, 80.0, 39, "2026-05-24", 0.91, "low", "Continue patrol readiness checks", "No active major faults", "v1.0", "HSR111"),
                (1112, "VH112", "2026-04-15 09:22:00", 85.0, "good", 86.0, 83.0, 88.0, 82.0, 44, "2026-05-29", 0.92, "low", "Maintain ambulance preventive routine", "Stable vitals transport telemetry", "v1.0", "HSR112"),
                (1113, "VH113", "2026-04-15 09:24:00", 66.0, "fair", 69.0, 61.0, 68.0, 65.0, 17, "2026-05-02", 0.87, "medium", "Inspect drivetrain before next deployment", "Increased load on recent combat run", "v1.0", "HSR113"),
                (1114, "VH114", "2026-04-15 09:26:00", 71.0, "good", 73.0, 69.0, 72.0, 70.0, 25, "2026-05-10", 0.89, "medium", "Schedule axle recheck in two weeks", "Differential wear trend observed", "v1.0", "HSR114"),
                (1115, "VH115", "2026-04-15 09:28:00", 19.0, "critical", 18.0, 16.0, 24.0, 21.0, 1, "2026-04-16", 0.98, "critical", "Keep decommissioned; strip reusable parts only", "Aged platform with multiple critical faults", "v1.0", "HSR115"),
            ]
            inserted["health_scores"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO health_scores
                (score_id, vehicle_id, assessment_date, overall_health_score, health_status, engine_health_score,
                 transmission_health_score, brake_system_score, electrical_system_score, predicted_days_to_service,
                 predicted_service_date, confidence_level, risk_category, recommended_action, risk_evidence,
                 model_version, health_score_record_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                health_scores,
            )

            tamper_rows = [
                (
                    "BLK101",
                    "maintenance_log",
                    sha256_hex("MR101-VH101-2026-04-02"),
                    '{"record_id":"MR101","vehicle_id":"VH101","cost":42000.00}',
                    "maintenance",
                    "MR101",
                    "ADM001",
                ),
                (
                    "BLK102",
                    "spare_part",
                    sha256_hex("SP101-VH101-Engine Oil Filter"),
                    '{"part_id":"SP101","vehicle_id":"VH101","qty":36}',
                    "spare_part",
                    "SP101",
                    "ADM001",
                ),
                (
                    "BLK103",
                    "health_score",
                    sha256_hex("HSR101-VH101-0.18"),
                    '{"health_score_id":"HSR101","vehicle_id":"VH101","risk":18.00}',
                    "health_score",
                    "HSR101",
                    "ADM001",
                ),
                (
                    "BLK104",
                    "audit",
                    sha256_hex("LOG101-vehicle-create-VH101"),
                    '{"entity":"Vehicle","entity_id":"VH101","action":"Create"}',
                    "audit",
                    "LOG101",
                    "ADM001",
                ),
            ]
            inserted["tamper_proof_record"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO tamper_proof_record
                (block_id, tamper_tag, hash, attribute, record_type, record_ref_id, verified_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                tamper_rows,
            )

            audit_rows = [
                ("LOG101", "ADM002", "Created seeded maintenance record MR101 for VH101", "maintainance_record", "MR101", "127.0.0.1", "BLK101"),
                ("LOG102", "ADM002", "Added seeded spare part SP101 for VH101", "spare_parts", "SP101", "127.0.0.1", "BLK102"),
                ("LOG103", "ADM001", "Validated seeded health score HSR101", "health_score_record", "HSR101", "127.0.0.1", "BLK103"),
                ("LOG104", "ADM001", "Verified seeded vehicle entry VH101", "Vehicle", "VH101", "127.0.0.1", "BLK104"),
            ]
            inserted["audit_log"] = execute_many(
                cursor,
                """
                INSERT IGNORE INTO audit_log
                (log_id, user_id, action, entity_type, entity_id, ip_address, block_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                audit_rows,
            )

        conn.commit()

    except Exception as exc:
        conn.rollback()
        print(f"Demo data seed failed: {exc}")
        return 1
    finally:
        conn.close()

    print("Demo seed completed. Rows inserted in this run:")
    for table_name in [
        "Admin",
        "Vehicle",
        "maintainance_record",
        "spare_parts",
        "health_score_record",
        "vehicle_telemetry",
        "operational_log",
        "diagnostic_code",
        "fuel_record",
        "health_scores",
        "tamper_proof_record",
        "audit_log",
    ]:
        print(f"- {table_name}: {inserted.get(table_name, 0)}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
