"""
============================================================
 MLOPS- ML Pipeline Database Connector
 Military Logistics Optimization & Prediction System
 Group G4 | PICT | 2025-26
============================================================
 Connects to mlops_db using PyMySQL.
 Provides read functions for feature engineering and
 write functions for ML outputs with blockchain anchoring.

 Usage:
   from db_connector import (
       get_telemetry_for_vehicle,
       get_maintenance_history,
       get_operational_logs,
       write_health_score,
   )

 Credentials loaded from .env- never hardcoded.
============================================================
"""

import os
import hashlib
import json
import uuid
import warnings
from datetime import datetime
from typing import Dict, Any, Optional

import pandas as pd

# Load credentials from .env (python-decouple)
try:
    from decouple import config as _decouple_config
    _USE_DECOUPLE = True
except ImportError:
    _USE_DECOUPLE = False
    warnings.warn(
        "python-decouple not installed. Falling back to os.environ. "
        "Install with: pip install python-decouple",
        stacklevel=2
    )

def _cfg(key: str, default: str = '') -> str:
    if _USE_DECOUPLE:
        from decouple import config as dc
        return dc(key, default=default)
    return os.environ.get(key, default)


# ── DB Config (loaded from .env) ─────────────────────────────
DB_CONFIG = {
    'host':     _cfg('DB_HOST',     'localhost'),
    'port':     int(_cfg('DB_PORT', '3306')),
    'database': _cfg('DB_NAME',     'mlops_db'),
    'user':     _cfg('DB_USER',     'root'),
    'password': _cfg('DB_PASSWORD', ''),
    'charset':  'utf8mb4',
}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# CONNECTION HELPER
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _get_connection():
    """
    Returns a PyMySQL connection to mlops_db.
    Tries PyMySQL first (no compiled drivers needed),
    falls back to mysql-connector-python if installed.
    """
    try:
        import pymysql
        pymysql.install_as_MySQLdb()           # make it behave like MySQLdb
        conn = pymysql.connect(
            host     = DB_CONFIG['host'],
            port     = DB_CONFIG['port'],
            database = DB_CONFIG['database'],
            user     = DB_CONFIG['user'],
            password = DB_CONFIG['password'],
            charset  = DB_CONFIG['charset'],
            cursorclass = pymysql.cursors.DictCursor,
            autocommit  = False,
        )
        return conn
    except ImportError:
        pass

    # Fallback to mysql-connector-python
    try:
        import mysql.connector
        conn = mysql.connector.connect(
            host              = DB_CONFIG['host'],
            port              = DB_CONFIG['port'],
            database          = DB_CONFIG['database'],
            user              = DB_CONFIG['user'],
            password          = DB_CONFIG['password'],
            charset           = DB_CONFIG['charset'],
            use_pure          = True,
            connection_timeout= 10,
        )
        return conn
    except ImportError:
        raise ImportError(
            "No MySQL driver found. Install one:\n"
            "  pip install pymysql\n"
            "  OR\n"
            "  pip install mysql-connector-python"
        )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# READ FUNCTIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def get_telemetry_for_vehicle(vehicle_id: str) -> pd.DataFrame:
    """
    Returns the last 50 telemetry readings for a vehicle
    via v_ml_telemetry_input view (column names already mapped
    to ML pipeline expected names).

    Columns returned:
        vehicle_id, timestamp,
        engine_coolant_temp_celsius, engine_oil_temp_celsius,
        battery_voltage, engine_rpm, engine_load_percent,
        fuel_consumption_lph, idle_time_minutes,
        current_speed_kmph, odometer_km, engine_hours,
        fuel_level_percent, oil_pressure_psi, tire_pressure_psi_avg
    """
    sql = """
        SELECT *
        FROM   v_ml_telemetry_input
        WHERE  vehicle_id = %s
        ORDER  BY `timestamp` DESC
        LIMIT  50
    """
    try:
        conn   = _get_connection()
        df     = pd.read_sql(sql, conn, params=[vehicle_id])
        conn.close()
        return df.sort_values('timestamp').reset_index(drop=True)
    except Exception as exc:
        print(f"[db_connector] ERROR get_telemetry_for_vehicle({vehicle_id}): {exc}")
        return pd.DataFrame()


def get_all_vehicle_ids() -> list:
    """Returns list of all vehicle_id values in Vehicle table."""
    try:
        conn   = _get_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT vehicle_id FROM Vehicle ORDER BY vehicle_id")
        ids = [row['vehicle_id'] for row in cursor.fetchall()]
        conn.close()
        return ids
    except Exception as exc:
        print(f"[db_connector] ERROR get_all_vehicle_ids: {exc}")
        return []


def get_maintenance_history(vehicle_id: str) -> pd.DataFrame:
    """
    Returns all maintenance records for a vehicle,
    ordered by most recent service first.

    Key columns: record_id, service_date, service_type, cost,
                 outcome, duration_hours, vehicle_status
    """
    sql = """
        SELECT  record_id, vehicle_id, service_date, service_type,
                cost, outcome, duration_hours, vehicle_status, created_at
        FROM    maintainance_record
        WHERE   vehicle_id = %s
        ORDER   BY service_date DESC
    """
    try:
        conn = _get_connection()
        df   = pd.read_sql(sql, conn, params=[vehicle_id])
        conn.close()
        return df
    except Exception as exc:
        print(f"[db_connector] ERROR get_maintenance_history({vehicle_id}): {exc}")
        return pd.DataFrame()


def get_operational_logs(vehicle_id: str) -> pd.DataFrame:
    """
    Returns all mission/trip logs for a vehicle.

    Key columns: mission_date, mission_type, terrain_difficulty,
                 cargo_weight_kg, harsh_braking_count,
                 harsh_acceleration_count, trip_distance_km,
                 fuel_consumed_litres
    """
    sql = """
        SELECT  log_id, vehicle_id, mission_date, mission_type,
                terrain_difficulty, cargo_weight_kg,
                harsh_braking_count, harsh_acceleration_count,
                trip_distance_km, fuel_consumed_litres, created_at
        FROM    operational_log
        WHERE   vehicle_id = %s
        ORDER   BY mission_date DESC
    """
    try:
        conn = _get_connection()
        df   = pd.read_sql(sql, conn, params=[vehicle_id])
        conn.close()
        return df
    except Exception as exc:
        print(f"[db_connector] ERROR get_operational_logs({vehicle_id}): {exc}")
        return pd.DataFrame()


def get_active_faults(vehicle_id: str) -> pd.DataFrame:
    """Returns all currently active diagnostic fault codes for a vehicle."""
    sql = """
        SELECT  code_id, vehicle_id, fault_code, description,
                severity, detected_at
        FROM    diagnostic_code
        WHERE   vehicle_id = %s AND is_active = 1
        ORDER   BY FIELD(severity, 'critical', 'major', 'minor')
    """
    try:
        conn = _get_connection()
        df   = pd.read_sql(sql, conn, params=[vehicle_id])
        conn.close()
        return df
    except Exception as exc:
        print(f"[db_connector] ERROR get_active_faults({vehicle_id}): {exc}")
        return pd.DataFrame()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# WRITE FUNCTIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode('utf-8')).hexdigest()


def write_health_score(score_dict: Dict[str, Any], logged_by: str = 'ADM001') -> bool:
    """
    Atomically writes one vehicle's health prediction by:
      1. Inserting into health_scores       (ML output)
      2. Inserting into health_score_record (ER entity- links to blockchain)
      3. Inserting into tamper_proof_record (blockchain hash anchor)
      4. Inserting into audit_log           (immutable action trail)

    Parameters
    ----------
    score_dict : dict with keys:
        vehicle_id              str
        overall_health_score    float
        health_status           str  ('critical'/'poor'/'fair'/'good'/'excellent')
        risk_category           str  ('critical'/'high'/'medium'/'low')
        failure_probability     float (0–1)
        risk_score              float
        recommended_action      str
        risk_evidence           str
        model_version           str
        confidence_level        float
        predicted_days_to_service  int | None
        predicted_service_date  date | None
        engine_health_score     float | None
        transmission_health_score float | None
        brake_system_score      float | None
        electrical_system_score float | None

    logged_by : Admin user_id performing this action (default: super_admin)

    Returns
    -------
    bool- True on success, False on error
    """
    vid         = score_dict['vehicle_id']
    now         = datetime.utcnow()
    hsr_id      = f"HSR-{vid}-{now.strftime('%Y%m%d%H%M%S')}"
    block_id    = str(uuid.uuid4()).replace('-', '')[:64]
    log_id      = f"LOG-{vid}-{now.strftime('%Y%m%d%H%M%S')}"

    # SHA-256 hash of the health_score_record key fields
    hash_payload = (
        f"{hsr_id}-{vid}-"
        f"{score_dict.get('failure_probability', 0)}-"
        f"{score_dict.get('risk_score', 0)}-"
        f"{now.isoformat()}"
    )
    block_hash = _sha256(hash_payload)

    attribute_json = json.dumps({
        'health_score_id':    hsr_id,
        'vehicle_id':         vid,
        'failure_probability': score_dict.get('failure_probability', 0),
        'risk_score':          score_dict.get('risk_score', 0),
        'overall_health_score': score_dict.get('overall_health_score', 0),
        'health_status':       score_dict.get('health_status', ''),
        'model_version':       score_dict.get('model_version', 'v1.0'),
        'timestamp':           now.isoformat(),
    })

    try:
        conn   = _get_connection()
        cursor = conn.cursor()

        # 1. Insert health_score_record (ER entity)
        cursor.execute("""
            INSERT INTO health_score_record
                (health_score_id, vehicle_id, failure_probability, risk_score, date, model_version)
            VALUES (%s, %s, %s, %s, %s, %s)
        """, (
            hsr_id, vid,
            score_dict.get('failure_probability', 0),
            score_dict.get('risk_score', 0),
            now,
            score_dict.get('model_version', 'v1.0'),
        ))

        # 2. Insert tamper_proof_record (blockchain anchor)
        cursor.execute("""
            INSERT INTO tamper_proof_record
                (block_id, tamper_tag, hash, attribute, record_type, record_ref_id, created_at, verified_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            block_id,
            'ml_health_score',
            block_hash,
            attribute_json,
            'health_score',
            hsr_id,
            now,
            None,   # verified_by- NULL until an Admin explicitly verifies
        ))

        # 3. Insert into health_scores (ML output)
        cursor.execute("""
            INSERT INTO health_scores (
                vehicle_id, assessment_date,
                overall_health_score, health_status,
                engine_health_score, transmission_health_score,
                brake_system_score, electrical_system_score,
                predicted_days_to_service, predicted_service_date,
                confidence_level, risk_category,
                recommended_action, risk_evidence,
                model_version, health_score_record_id, created_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            vid,
            now,
            score_dict.get('overall_health_score', 0),
            score_dict.get('health_status', 'fair'),
            score_dict.get('engine_health_score'),
            score_dict.get('transmission_health_score'),
            score_dict.get('brake_system_score'),
            score_dict.get('electrical_system_score'),
            score_dict.get('predicted_days_to_service'),
            score_dict.get('predicted_service_date'),
            score_dict.get('confidence_level'),
            score_dict.get('risk_category', 'medium'),
            score_dict.get('recommended_action', ''),
            score_dict.get('risk_evidence', ''),
            score_dict.get('model_version', 'v1.0'),
            hsr_id,
            now,
        ))

        # 4. Write to audit_log
        cursor.execute("""
            INSERT INTO audit_log
                (log_id, user_id, action, entity_type, entity_id, ip_address, timestamp, block_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            log_id,
            logged_by,
            f"ML pipeline wrote health score for {vid} | status={score_dict.get('health_status')} | risk={score_dict.get('risk_category')}",
            'health_scores',
            hsr_id,
            '127.0.0.1',   # ML pipeline runs locally
            now,
            block_id,
        ))

        conn.commit()
        cursor.close()
        conn.close()
        return True

    except Exception as exc:
        print(f"[db_connector] ERROR write_health_score({vid}): {exc}")
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return False


def update_vehicle_status_in_maintenance(vehicle_id: str, new_status: str) -> bool:
    """
    Updates vehicle_status in the most recent maintainance_record
    for the given vehicle_id. Called post-inference.

    new_status values: 'Critical' | 'Poor' | 'Attention' | 'Good' | 'Excellent'
    """
    sql = """
        UPDATE maintainance_record
        SET    vehicle_status = %s
        WHERE  vehicle_id = %s
        ORDER  BY service_date DESC
        LIMIT  1
    """
    try:
        conn   = _get_connection()
        cursor = conn.cursor()
        cursor.execute(sql, (new_status, vehicle_id))
        affected = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return affected > 0
    except Exception as exc:
        print(f"[db_connector] ERROR update_vehicle_status_in_maintenance({vehicle_id}): {exc}")
        return False


def batch_write_health_scores(
    vehicle_ids,
    scores,
    pred_classes,
    adjusted_confidence,
    evidence,
    status_order,
    recommendations,
    risk_map,
    health_status_map,
    model_version='v1.0',
) -> int:
    """
    Batch version of write_health_score for use in run_inference.py.
    Writes all vehicle predictions in a single transaction.

    Returns number of rows successfully written.
    """
    import numpy as np
    from datetime import date

    midpoints_map = {
        'Critical': 15.0, 'Poor': 35.0, 'Attention': 55.0,
        'Good': 75.0, 'Excellent': 92.0
    }

    today   = date.today()
    success = 0

    try:
        conn   = _get_connection()
        cursor = conn.cursor()

        # Clear today's rows (idempotent re-run)
        cursor.execute("DELETE FROM health_scores WHERE DATE(assessment_date) = %s", (today,))

        for i, vid in enumerate(vehicle_ids):
            status_name  = status_order[pred_classes[i]]
            health_score = float(np.clip(scores[i], 0, 100))
            conf_level   = float(adjusted_confidence[i])
            h_status     = health_status_map[status_name]
            risk_cat     = risk_map[status_name]
            action       = recommendations[status_name]
            failure_prob = risk_score = float(1 - (health_score / 100))
            now          = datetime.utcnow()

            score_dict = {
                'vehicle_id':               vid,
                'overall_health_score':     health_score,
                'health_status':            h_status,
                'risk_category':            risk_cat,
                'failure_probability':      round(failure_prob, 4),
                'risk_score':               round(risk_score * 100, 2),
                'recommended_action':       action,
                'risk_evidence':            evidence[i] if evidence else '',
                'model_version':            model_version,
                'confidence_level':         conf_level,
                'predicted_days_to_service': None,
                'predicted_service_date':   None,
            }

            ok = write_health_score(score_dict)
            if ok:
                # Update vehicle_status in latest maintenance record
                update_vehicle_status_in_maintenance(vid, status_name)
                success += 1

        conn.close()

    except Exception as exc:
        print(f"[db_connector] ERROR batch_write_health_scores: {exc}")

    print(f"[db_connector] Wrote {success}/{len(vehicle_ids)} health scores to mlops_db.")
    return success
