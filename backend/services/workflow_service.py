from typing import Any, Dict

from backend.services.fleet_service import FleetService
from backend.services.ml_gateway import MLGateway
from backend.services.operations_orchestrator import OperationsOrchestrator
from backend.services.types import ServiceResult


class WorkflowService:
    def __init__(
        self,
        operations_orchestrator: OperationsOrchestrator,
        ml_gateway: MLGateway,
        fleet_service: FleetService,
    ):
        self.operations_orchestrator = operations_orchestrator
        self.ml_gateway = ml_gateway
        self.fleet_service = fleet_service

    @staticmethod
    def _map_status_to_severity(health_status: str) -> str:
        mapping = {
            "critical": "CRITICAL",
            "poor": "HIGH",
            "fair": "MEDIUM",
            "good": "LOW",
            "excellent": "INFO",
        }
        return mapping.get((health_status or "").lower(), "MEDIUM")

    @staticmethod
    def _confidence_to_basis_points(confidence_level: Any) -> int:
        try:
            raw = float(confidence_level if confidence_level is not None else 0)
        except (TypeError, ValueError):
            raw = 0
        return max(0, min(10000, int(round(raw * 100))))

    def run_vehicle_movement_and_inference(self, payload: Dict[str, Any]) -> ServiceResult:
        operation_result = self.operations_orchestrator.process_vehicle_movement(payload)
        if not operation_result.success:
            return operation_result

        timeout_seconds = int(payload.get("timeout_seconds", 1200))
        ml_result = self.ml_gateway.run_inference(timeout_seconds=timeout_seconds)

        combined_data = {
            "operation": operation_result.to_dict(),
            "ml_inference": ml_result,
            "prediction_blockchain": {
                "attempted": False,
                "success": False,
                "error": "NOT_ATTEMPTED",
            },
        }

        if not ml_result.get("success"):
            return ServiceResult(
                success=False,
                message="Operation persisted, but ML inference failed.",
                data=combined_data,
                error="ML_INFERENCE_FAILED",
            )

        latest_health = self.fleet_service.get_latest_health_by_vehicle_no(payload["vehicle_number"])
        if latest_health is None:
            return ServiceResult(
                success=False,
                message="ML inference completed but latest health score was not found.",
                data=combined_data,
                error="HEALTH_SCORE_NOT_FOUND",
            )

        severity = self._map_status_to_severity(latest_health.health_status)
        confidence_bp = self._confidence_to_basis_points(latest_health.confidence_level)

        prediction_result = self.operations_orchestrator.blockchain_gateway.record_ml_prediction(
            base_id=payload["base_id"],
            prediction_type="MAINTENANCE_ALERT",
            description=(
                f"Vehicle {payload['vehicle_number']} classified as "
                f"{latest_health.health_status.upper()} with risk {latest_health.risk_category}."
            ),
            severity=severity,
            affected_asset=payload["vehicle_number"],
            confidence=confidence_bp,
            recommended_action=latest_health.recommended_action or "Review vehicle immediately.",
        )

        combined_data["prediction_blockchain"] = {
            "attempted": True,
            **prediction_result,
        }

        if not prediction_result.get("success"):
            return ServiceResult(
                success=False,
                message="Operation and ML inference succeeded, but prediction write to blockchain failed.",
                data=combined_data,
                error="PREDICTION_BLOCKCHAIN_FAILED",
            )

        return ServiceResult(
            success=True,
            message="Operation, inference, and prediction blockchain logging completed.",
            data=combined_data,
        )
