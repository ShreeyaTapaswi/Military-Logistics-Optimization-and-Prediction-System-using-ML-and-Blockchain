import os

def fix_assign(p):
    with open(p, 'r', encoding='utf-8') as f: text = f.read()
    text = text.replace("'military_vehicle_health'", "'mlops_db'")
    text = text.replace("maintenance_records", "maintainance_record")
    text = text.replace("maintenance_id", "record_id")
    text = text.replace("diagnostic_codes", "diagnostic_code")
    text = text.replace("detected_timestamp", "detected_at")
    text = text.replace("resolved_timestamp", "resolved_at")
    with open(p, 'w', encoding='utf-8') as f: f.write(text)

def fix_fe(p):
    with open(p, 'r', encoding='utf-8') as f: text = f.read()
    text = text.replace("'military_vehicle_health'", "'mlops_db'")
    text = text.replace("FROM telemetry_data", "FROM v_ml_telemetry_input")
    text = text.replace("FROM   fuel_records", "FROM   fuel_record")
    text = text.replace("fuel_efficiency_kmpl", "fuel_efficiency")
    text = text.replace("FROM   operational_logs", "FROM   operational_log")
    text = text.replace("terrain_difficulty_score", "terrain_difficulty")
    text = text.replace("fuel_consumed_liters", "fuel_consumed_litres")
    text = text.replace("FROM   diagnostic_codes", "FROM   diagnostic_code")
    text = text.replace("FROM   vehicles", "FROM   Vehicle")
    text = text.replace("vehicle_type", "type")
    text = text.replace("acquisition_date", "manufacture_date")
    text = text.replace("LEFT   JOIN telemetry_data t", "LEFT   JOIN vehicle_telemetry t")
    with open(p, 'w', encoding='utf-8') as f: f.write(text)

if __name__ == '__main__':
    base = r"d:\Shreeya (D)\PICT (D)\PBL\Army_Logistics_Optimization_and_Prediction_System\Army_ML_Pipeline_and_Files"
    fix_assign(os.path.join(base, "assign_vehicle_status.py"))
    fix_fe(os.path.join(base, "feature_engineering.py"))
    print("Fixed scripts!")
