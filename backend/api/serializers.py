from rest_framework import serializers

from backend.models import HealthScores, Vehicle


class VehicleQuerySerializer(serializers.Serializer):
    status = serializers.CharField(required=False, allow_blank=True)
    state = serializers.CharField(required=False, allow_blank=True)
    limit = serializers.IntegerField(required=False, min_value=1, max_value=500, default=100)


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
    timeout_seconds = serializers.IntegerField(required=False, min_value=60, max_value=7200, default=1200)
