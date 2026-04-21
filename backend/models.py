"""
============================================================
 MLOPS- Django ORM Models
 Military Logistics Optimization & Prediction System
 Group G4 | PICT | 2025-26
============================================================
 db_table names match schema.sql exactly.
 managed = False is set for health_scores (ML pipeline owns it).
 maintainance_record spelling kept as-is (matches ER diagram).
============================================================
"""

from django.db import models


# ============================================================
#  PART A- CORE ER TABLES
# ============================================================

class Admin(models.Model):
    """System users- Super Admin and Base Admin."""

    ROLE_CHOICES = [
        ('super_admin', 'Super Admin'),
        ('base_admin',  'Base Admin'),
    ]

    user_id       = models.CharField(max_length=20, primary_key=True)
    f_name        = models.CharField(max_length=50)
    l_name        = models.CharField(max_length=50)
    phone_no      = models.CharField(max_length=15, unique=True)
    rank          = models.CharField(max_length=50)
    role          = models.CharField(max_length=20, choices=ROLE_CHOICES, default='base_admin')
    username      = models.CharField(max_length=50, unique=True)
    password_hash = models.CharField(max_length=255)
    is_active     = models.BooleanField(default=True)
    created_at    = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'Admin'

    def __str__(self):
        return f"{self.rank} {self.f_name} {self.l_name} [{self.role}]"


class Vehicle(models.Model):
    """Core military vehicle registry."""

    STATUS_CHOICES = [
        ('available',        'Available'),
        ('in_maintenance',   'In Maintenance'),
        ('unavailable',      'Unavailable'),
        ('mission_deployed', 'Mission Deployed'),
        ('decommissioned',   'Decommissioned'),
    ]

    vehicle_id         = models.CharField(max_length=20, primary_key=True)
    vehicle_no         = models.CharField(max_length=30, unique=True)
    type               = models.CharField(max_length=50)
    model              = models.CharField(max_length=100)
    manufacture_date   = models.DateField()
    # vehicle_age is a generated/stored column in MySQL- read-only in Django
    vehicle_age        = models.IntegerField(editable=False, null=True, blank=True)
    city               = models.CharField(max_length=100)
    state              = models.CharField(max_length=100)
    pincode            = models.CharField(max_length=10)
    operational_status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default='available'
    )
    created_at         = models.DateTimeField(auto_now_add=True)
    updated_at         = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'Vehicle'

    def __str__(self):
        return f"{self.vehicle_no}- {self.type} ({self.model})"


class HealthScoreRecord(models.Model):
    """
    ML-generated health score ER entity.
    Linked to tamper_proof_record for blockchain trail.
    """
    health_score_id     = models.CharField(max_length=30, primary_key=True)
    vehicle             = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    failure_probability = models.DecimalField(max_digits=5, decimal_places=4)
    risk_score          = models.DecimalField(max_digits=5, decimal_places=2)
    date                = models.DateTimeField(auto_now_add=True)
    model_version       = models.CharField(max_length=20, default='v1.0')

    class Meta:
        db_table = 'health_score_record'

    def __str__(self):
        return f"{self.health_score_id}- Vehicle {self.vehicle_id} | Risk {self.risk_score}"


class MaintainanceRecord(models.Model):
    """All service and repair events per vehicle. (Spelling kept as per ER diagram.)"""

    record_id      = models.CharField(max_length=30, primary_key=True)
    vehicle        = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    service_date   = models.DateField()
    cost           = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    outcome        = models.CharField(max_length=255)
    service_type   = models.CharField(max_length=100)
    duration_hours = models.IntegerField(default=0)
    technician     = models.ForeignKey(
        Admin, on_delete=models.CASCADE,
        db_column='technician_id', to_field='user_id'
    )
    # Written by ML pipeline post-inference
    vehicle_status = models.CharField(max_length=50, null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'maintainance_record'

    def __str__(self):
        return f"{self.record_id}- {self.vehicle_id} on {self.service_date} ({self.service_type})"


class SpareParts(models.Model):
    """Spare parts inventory linked to vehicles and maintenance records."""

    part_id      = models.CharField(max_length=30, primary_key=True)
    part_name    = models.CharField(max_length=100)
    quantity     = models.IntegerField(default=0)
    vehicle      = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    record       = models.ForeignKey(
        MaintainanceRecord, on_delete=models.SET_NULL,
        db_column='record_id', to_field='record_id',
        null=True, blank=True
    )
    unit_cost    = models.DecimalField(max_digits=10, decimal_places=2, default=0.00)
    supplier     = models.CharField(max_length=100, null=True, blank=True)
    last_updated = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'spare_parts'

    def __str__(self):
        return f"{self.part_name} (Qty: {self.quantity})- Vehicle {self.vehicle_id}"


class TamperProofRecord(models.Model):
    """
    Blockchain anchor- SHA-256 hash of every critical record.
    Immutable once written; verified by Admin.
    """

    RECORD_TYPE_CHOICES = [
        ('health_score', 'Health Score'),
        ('maintenance',  'Maintenance'),
        ('spare_part',   'Spare Part'),
        ('audit',        'Audit'),
        ('route',        'Route'),
    ]

    block_id      = models.CharField(max_length=64, primary_key=True)
    tamper_tag    = models.CharField(max_length=100)
    hash          = models.CharField(max_length=128, unique=True)
    attribute     = models.TextField(help_text='JSON snapshot of hashed record')
    record_type   = models.CharField(max_length=20, choices=RECORD_TYPE_CHOICES)
    record_ref_id = models.CharField(max_length=64)
    created_at    = models.DateTimeField(auto_now_add=True)
    verified_by   = models.ForeignKey(
        Admin, on_delete=models.SET_NULL,
        db_column='verified_by', to_field='user_id',
        null=True, blank=True
    )

    class Meta:
        db_table = 'tamper_proof_record'

    def __str__(self):
        return f"Block {self.block_id[:12]}... [{self.record_type}]"


class AuditLog(models.Model):
    """Immutable audit trail of every user action."""

    log_id      = models.CharField(max_length=30, primary_key=True)
    user        = models.ForeignKey(
        Admin, on_delete=models.CASCADE,
        db_column='user_id', to_field='user_id'
    )
    action      = models.CharField(max_length=255)
    entity_type = models.CharField(max_length=50)
    entity_id   = models.CharField(max_length=64)
    ip_address  = models.GenericIPAddressField(null=True, blank=True)
    timestamp   = models.DateTimeField(auto_now_add=True)
    block       = models.ForeignKey(
        TamperProofRecord, on_delete=models.SET_NULL,
        db_column='block_id', to_field='block_id',
        null=True, blank=True
    )

    class Meta:
        db_table = 'audit_log'
        ordering = ['-timestamp']

    def __str__(self):
        return f"[{self.timestamp:%Y-%m-%d %H:%M}] {self.user_id}: {self.action}"


# ============================================================
#  PART B- SUPPORTING OPERATIONAL TABLES
# ============================================================

class VehicleTelemetry(models.Model):
    """Periodic OBD/sensor readings per vehicle."""

    telemetry_id          = models.CharField(max_length=40, primary_key=True)
    vehicle               = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    recorded_at           = models.DateTimeField(auto_now_add=True)
    # Engine
    engine_coolant_temp   = models.FloatField(null=True, blank=True)
    engine_oil_temp       = models.FloatField(null=True, blank=True)
    engine_rpm            = models.FloatField(null=True, blank=True)
    engine_load_percent   = models.FloatField(null=True, blank=True)
    engine_hours          = models.FloatField(null=True, blank=True)
    # Fuel & Electrical
    battery_voltage       = models.FloatField(null=True, blank=True)
    fuel_consumption_rate = models.FloatField(null=True, blank=True)
    fuel_level_percent    = models.FloatField(null=True, blank=True)
    # Movement
    current_speed         = models.FloatField(null=True, blank=True)
    odometer_km           = models.FloatField(null=True, blank=True)
    idle_time_minutes     = models.FloatField(null=True, blank=True)
    # Other sensors
    oil_pressure          = models.FloatField(null=True, blank=True)
    tyre_pressure_avg     = models.FloatField(null=True, blank=True)

    class Meta:
        db_table = 'vehicle_telemetry'
        ordering = ['-recorded_at']

    def __str__(self):
        return f"Telemetry {self.telemetry_id}- Vehicle {self.vehicle_id} @ {self.recorded_at}"


class OperationalLog(models.Model):
    """Mission and trip records per vehicle."""

    MISSION_CHOICES = [
        ('combat',    'Combat'),
        ('patrol',    'Patrol'),
        ('training',  'Training'),
        ('transport', 'Transport'),
    ]

    log_id                   = models.CharField(max_length=30, primary_key=True)
    vehicle                  = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    mission_date             = models.DateField()
    mission_type             = models.CharField(max_length=20, choices=MISSION_CHOICES, default='patrol')
    terrain_difficulty       = models.IntegerField(default=1)
    cargo_weight_kg          = models.FloatField(null=True, blank=True)
    harsh_braking_count      = models.IntegerField(default=0)
    harsh_acceleration_count = models.IntegerField(default=0)
    trip_distance_km         = models.FloatField(null=True, blank=True)
    fuel_consumed_litres     = models.FloatField(null=True, blank=True)
    logged_by                = models.ForeignKey(
        Admin, on_delete=models.CASCADE,
        db_column='logged_by', to_field='user_id'
    )
    created_at               = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'operational_log'
        ordering = ['-mission_date']

    def __str__(self):
        return f"{self.log_id}- {self.vehicle_id} | {self.mission_type} on {self.mission_date}"


class DiagnosticCode(models.Model):
    """Fault and diagnostic codes per vehicle (active/resolved)."""

    SEVERITY_CHOICES = [
        ('critical', 'Critical'),
        ('major',    'Major'),
        ('minor',    'Minor'),
    ]

    code_id     = models.CharField(max_length=30, primary_key=True)
    vehicle     = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    fault_code  = models.CharField(max_length=20)
    description = models.CharField(max_length=255, null=True, blank=True)
    severity    = models.CharField(max_length=10, choices=SEVERITY_CHOICES, default='minor')
    is_active   = models.BooleanField(default=True)
    detected_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    detected_by = models.ForeignKey(
        Admin, on_delete=models.CASCADE,
        db_column='detected_by', to_field='user_id'
    )

    class Meta:
        db_table = 'diagnostic_code'
        ordering = ['-detected_at']

    def __str__(self):
        status = 'ACTIVE' if self.is_active else 'resolved'
        return f"{self.fault_code} [{self.severity}]- {self.vehicle_id} ({status})"


class FuelRecord(models.Model):
    """Refuelling events and fuel efficiency tracking."""

    fuel_id            = models.CharField(max_length=30, primary_key=True)
    vehicle            = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    refuel_date        = models.DateField()
    litres_added       = models.FloatField()
    fuel_efficiency    = models.FloatField(null=True, blank=True)
    odometer_at_refuel = models.FloatField(null=True, blank=True)
    cost               = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    recorded_by        = models.ForeignKey(
        Admin, on_delete=models.CASCADE,
        db_column='recorded_by', to_field='user_id'
    )
    created_at         = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'fuel_record'
        ordering = ['-refuel_date']

    def __str__(self):
        return f"{self.fuel_id}- {self.vehicle_id} | {self.litres_added}L on {self.refuel_date}"


# ============================================================
#  PART C- ML OUTPUT TABLE
#  managed = False: written by run_inference.py, not Django migrations
# ============================================================

class HealthScores(models.Model):
    """
    ML pipeline output- health predictions written by run_inference.py.
    Django uses managed=False so migrations never touch this table.
    """

    score_id                  = models.AutoField(primary_key=True)
    vehicle                   = models.ForeignKey(
        Vehicle, on_delete=models.CASCADE,
        db_column='vehicle_id', to_field='vehicle_id'
    )
    assessment_date           = models.DateTimeField(auto_now_add=True)
    overall_health_score      = models.FloatField()
    health_status             = models.CharField(max_length=20)
    engine_health_score       = models.FloatField(null=True, blank=True)
    transmission_health_score = models.FloatField(null=True, blank=True)
    brake_system_score        = models.FloatField(null=True, blank=True)
    electrical_system_score   = models.FloatField(null=True, blank=True)
    predicted_days_to_service = models.IntegerField(null=True, blank=True)
    predicted_service_date    = models.DateField(null=True, blank=True)
    confidence_level          = models.FloatField(null=True, blank=True)
    risk_category             = models.CharField(max_length=20)
    recommended_action        = models.TextField(null=True, blank=True)
    risk_evidence             = models.TextField(null=True, blank=True)
    model_version             = models.CharField(max_length=20, default='v1.0')
    health_score_record       = models.ForeignKey(
        HealthScoreRecord, on_delete=models.SET_NULL,
        db_column='health_score_record_id', to_field='health_score_id',
        null=True, blank=True
    )
    created_at                = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'health_scores'
        managed  = False          # ML pipeline owns this table- no Django migrations
        ordering = ['-assessment_date']

    def __str__(self):
        return (
            f"Vehicle {self.vehicle_id} | {self.health_status.upper()} "
            f"({self.overall_health_score:.1f}) on {self.assessment_date:%Y-%m-%d}"
        )
