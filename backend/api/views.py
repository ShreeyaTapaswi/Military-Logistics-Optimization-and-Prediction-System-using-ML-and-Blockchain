from django.db import connection
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api.serializers import (
    HealthScoreSerializer,
    InferenceTriggerSerializer,
    MovementInferenceWorkflowSerializer,
    VehicleMovementRequestSerializer,
    VehicleQuerySerializer,
    VehicleSerializer,
)
from backend.services.container import get_service_container


class SystemHealthView(APIView):
    def get(self, request):
        db_ok = True
        db_error = ""
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception as exc:
            db_ok = False
            db_error = str(exc)

        container = get_service_container()
        payload = {
            "success": True,
            "services": {
                "database": {"ready": db_ok, "error": db_error},
                "blockchain": container.blockchain_gateway.health(),
                "ml": container.ml_gateway.health(),
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


class VehicleListView(APIView):
    def get(self, request):
        serializer = VehicleQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        container = get_service_container()
        vehicles = container.fleet_service.list_vehicles(
            status=data.get("status", ""),
            state=data.get("state", ""),
            limit=data.get("limit", 100),
        )
        output = VehicleSerializer(vehicles, many=True)
        return Response({"success": True, "data": output.data}, status=status.HTTP_200_OK)


class VehicleHealthView(APIView):
    def get(self, request, vehicle_id: str):
        container = get_service_container()
        score = container.fleet_service.get_latest_health(vehicle_id)
        if score is None:
            return Response(
                {"success": False, "message": "No health score found for this vehicle."},
                status=status.HTTP_404_NOT_FOUND,
            )

        output = HealthScoreSerializer(score)
        return Response({"success": True, "data": output.data}, status=status.HTTP_200_OK)


class FleetSummaryView(APIView):
    def get(self, request):
        container = get_service_container()
        summary = container.fleet_service.get_fleet_summary()
        return Response({"success": True, "data": summary}, status=status.HTTP_200_OK)


class VehicleMovementOperationView(APIView):
    def post(self, request):
        serializer = VehicleMovementRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_service_container()
        result = container.operations_orchestrator.process_vehicle_movement(serializer.validated_data)

        http_status = status.HTTP_200_OK if result.success else status.HTTP_400_BAD_REQUEST
        return Response(result.to_dict(), status=http_status)


class TriggerInferenceView(APIView):
    def post(self, request):
        serializer = InferenceTriggerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_service_container()
        result = container.ml_gateway.run_inference(
            timeout_seconds=serializer.validated_data["timeout_seconds"]
        )

        http_status = status.HTTP_200_OK if result.get("success") else status.HTTP_500_INTERNAL_SERVER_ERROR
        return Response(result, status=http_status)


class MovementInferenceWorkflowView(APIView):
    def post(self, request):
        serializer = MovementInferenceWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_service_container()
        result = container.workflow_service.run_vehicle_movement_and_inference(
            serializer.validated_data
        )

        http_status = status.HTTP_200_OK if result.success else status.HTTP_400_BAD_REQUEST
        return Response(result.to_dict(), status=http_status)
