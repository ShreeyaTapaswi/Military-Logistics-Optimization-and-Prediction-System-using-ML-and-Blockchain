from rest_framework import serializers

from backend.models import HealthScores, MaintainanceRecord, SpareParts, Vehicle


class LoginRequestSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=50)
    password = serializers.CharField(max_length=255)


class VehicleQuerySerializer(serializers.Serializer):
    status = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    base_id = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=100)


class MaintenanceQuerySerializer(serializers.Serializer):
    service_type = serializers.CharField(required=False, allow_blank=True)
    vehicle_no = serializers.CharField(required=False, allow_blank=True)
    actor_user_id = serializers.CharField(required=False, allow_blank=True)
    base_id = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=200)


class VehicleOperationSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    base_id = serializers.CharField(max_length=64)
    operation = serializers.ChoiceField(choices=["ADDITION", "REMOVAL"])
    vehicle_type = serializers.CharField(max_length=50)
    model = serializers.CharField(required=False, allow_blank=True, max_length=100)
    quantity = serializers.IntegerField(min_value=1, max_value=200)
    reason = serializers.CharField(max_length=255)


class VehicleCreateSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    base_id = serializers.CharField(max_length=64)
    vehicle_no = serializers.CharField(max_length=30)
    vehicle_type = serializers.CharField(max_length=50)
    model = serializers.CharField(required=False, allow_blank=True, max_length=100)
    operational_status = serializers.ChoiceField(
        required=False,
        choices=[
            "available",
            "in_maintenance",
            "unavailable",
            "mission_deployed",
            "decommissioned",
        ],
        default="available",
    )
    manufacture_date = serializers.DateField(required=False)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class VehicleUpdateSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    type = serializers.CharField(required=False, allow_blank=True, max_length=50)
    model = serializers.CharField(required=False, allow_blank=True, max_length=100)
    city = serializers.CharField(required=False, allow_blank=True, max_length=100)
    state = serializers.CharField(required=False, allow_blank=True, max_length=100)
    pincode = serializers.CharField(required=False, allow_blank=True, max_length=10)
    operational_status = serializers.ChoiceField(
        required=False,
        choices=[
            "available",
            "in_maintenance",
            "unavailable",
            "mission_deployed",
            "decommissioned",
        ],
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class VehicleDeleteSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class MaintenanceWriteSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    vehicle_id = serializers.CharField(max_length=20)
    service_date = serializers.DateField()
    service_type = serializers.CharField(max_length=100)
    outcome = serializers.CharField(max_length=255)
    duration_hours = serializers.IntegerField(min_value=0, max_value=1000)
    cost = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class InventoryQuerySerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(required=False, allow_blank=True)
    vehicle_no = serializers.CharField(required=False, allow_blank=True)
    part_name = serializers.CharField(required=False, allow_blank=True)
    base_id = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=200)


class InventoryWriteSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    vehicle_id = serializers.CharField(max_length=20)
    part_name = serializers.CharField(max_length=100)
    quantity = serializers.IntegerField(min_value=0, max_value=100000)
    unit_cost = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False, default=0)
    supplier = serializers.CharField(required=False, allow_blank=True, max_length=100)
    record_id = serializers.CharField(required=False, allow_blank=True, max_length=30)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class MLLatestQuerySerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=200)


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            "vehicle_id",
            "vehicle_no",
            "type",
            "model",
            "city",
            "state",
            "pincode",
            "operational_status",
        ]


class HealthScoreSerializer(serializers.ModelSerializer):
    vehicle_id = serializers.CharField(source="vehicle.vehicle_id")

    class Meta:
        model = HealthScores
        fields = [
            "score_id",
            "vehicle_id",
            "assessment_date",
            "overall_health_score",
            "health_status",
            "risk_category",
            "predicted_days_to_service",
            "confidence_level",
            "recommended_action",
            "risk_evidence",
            "model_version",
        ]


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    vehicle_id = serializers.CharField(source="vehicle.vehicle_id")
    vehicle_no = serializers.CharField(source="vehicle.vehicle_no")
    technician_id = serializers.CharField(source="technician.user_id")
    technician_name = serializers.SerializerMethodField()

    class Meta:
        model = MaintainanceRecord
        fields = [
            "record_id",
            "vehicle_id",
            "vehicle_no",
            "service_date",
            "service_type",
            "outcome",
            "technician_id",
            "technician_name",
            "cost",
            "duration_hours",
            "vehicle_status",
        ]

    @staticmethod
    def get_technician_name(obj: MaintainanceRecord) -> str:
        tech = obj.technician
        return f"{tech.rank} {tech.f_name} {tech.l_name}".strip()


class InventoryRecordSerializer(serializers.ModelSerializer):
    vehicle_id = serializers.CharField(source="vehicle.vehicle_id")
    vehicle_no = serializers.CharField(source="vehicle.vehicle_no")
    state = serializers.CharField(source="vehicle.state")
    city = serializers.CharField(source="vehicle.city")
    record_id = serializers.SerializerMethodField()

    class Meta:
        model = SpareParts
        fields = [
            "part_id",
            "part_name",
            "quantity",
            "vehicle_id",
            "vehicle_no",
            "state",
            "city",
            "record",
            "record_id",
            "unit_cost",
            "supplier",
            "last_updated",
        ]

    @staticmethod
    def get_record_id(obj: SpareParts):
        return obj.record.record_id if obj.record else ""


class VehicleMovementRequestSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(max_length=20)
    actor_wallet = serializers.CharField(max_length=100)
    base_id = serializers.CharField(max_length=64)
    vehicle_number = serializers.CharField(max_length=30)
    movement_type = serializers.ChoiceField(choices=["ADDITION", "REMOVAL", "TRANSFER"])
    quantity_change = serializers.IntegerField()
    reason = serializers.CharField(max_length=255)
    ip_address = serializers.IPAddressField(required=False, allow_null=True)


class InferenceTriggerSerializer(serializers.Serializer):
    actor_user_id = serializers.CharField(required=False, allow_blank=True)
    timeout_seconds = serializers.IntegerField(required=False, min_value=60, max_value=7200, default=1200)


class MovementInferenceWorkflowSerializer(VehicleMovementRequestSerializer):
    timeout_seconds = serializers.IntegerField(required=False, min_value=60, max_value=7200, default=1200)
