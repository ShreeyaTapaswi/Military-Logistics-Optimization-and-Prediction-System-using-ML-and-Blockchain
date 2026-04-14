import hashlib
import json
import uuid
from datetime import datetime
from typing import Any, Dict

from django.db import transaction
from django.utils import timezone

from backend.models import Admin, AuditLog, TamperProofRecord, Vehicle
from backend.services.blockchain_gateway import BlockchainGateway
from backend.services.types import ServiceResult


class OperationsOrchestrator:
    def __init__(self, blockchain_gateway: BlockchainGateway, strict_layer1: bool = True):
        self.blockchain_gateway = blockchain_gateway
        self.strict_layer1 = strict_layer1

    @staticmethod
    def _make_log_id() -> str:
        return f"LOG{datetime.utcnow().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:8].upper()}"

    @staticmethod
    def _make_block_id() -> str:
        return uuid.uuid4().hex

    @staticmethod
    def _hash_payload(payload: Dict[str, Any]) -> str:
        encoded = json.dumps(payload, default=str, sort_keys=True).encode("utf-8")
        return hashlib.sha256(encoded).hexdigest()

    def process_vehicle_movement(self, payload: Dict[str, Any]) -> ServiceResult:
        actor = Admin.objects.filter(user_id=payload["actor_user_id"], is_active=True).first()
        if actor is None:
            return ServiceResult(
                success=False,
                message="Invalid actor_user_id or inactive admin.",
                error="ACTOR_NOT_FOUND",
            )

        vehicle = Vehicle.objects.filter(vehicle_no=payload["vehicle_number"]).first()
        if vehicle is None:
            return ServiceResult(
                success=False,
                message="Vehicle not found for given vehicle_number.",
                error="VEHICLE_NOT_FOUND",
            )

        layer1_result = self.blockchain_gateway.record_vehicle_movement(
            wallet_address=payload["actor_wallet"],
            base_id=payload["base_id"],
            vehicle_number=payload["vehicle_number"],
            movement_type=payload["movement_type"],
            quantity_change=payload["quantity_change"],
            reason=payload["reason"],
        )

        if self.strict_layer1 and not layer1_result.get("success"):
            return ServiceResult(
                success=False,
                message="Layer 1 validation failed. Request blocked before DB write.",
                data={"layer1": layer1_result},
                error="LAYER1_VALIDATION_FAILED",
            )

        log_id = self._make_log_id()
        action_payload = {
            "log_id": log_id,
            "vehicle_number": payload["vehicle_number"],
            "movement_type": payload["movement_type"],
            "quantity_change": payload["quantity_change"],
            "reason": payload["reason"],
            "base_id": payload["base_id"],
            "actor_user_id": payload["actor_user_id"],
            "layer1_entry_id": layer1_result.get("entry_id"),
            "generated_at": timezone.now().isoformat(),
        }
        data_hash = self._hash_payload(action_payload)

        with transaction.atomic():
            tamper_row = TamperProofRecord.objects.create(
                block_id=self._make_block_id(),
                tamper_tag="vehicle_movement_orchestration",
                hash=data_hash,
                attribute=json.dumps(action_payload, default=str),
                record_type="audit",
                record_ref_id=log_id,
                verified_by=None,
            )

            action_text = (
                f"Vehicle movement accepted | {payload['movement_type']} | "
                f"{payload['vehicle_number']} | qty={payload['quantity_change']}"
            )
            if not layer1_result.get("success"):
                action_text += " | LAYER1_BYPASSED_NON_STRICT"

            AuditLog.objects.create(
                log_id=log_id,
                user=actor,
                action=action_text,
                entity_type="vehicle_movement",
                entity_id=payload["vehicle_number"],
                ip_address=payload.get("ip_address"),
                block=tamper_row,
            )

        layer2_result = self.blockchain_gateway.log_audit_entry(
            base_id=payload["base_id"],
            category="VEHICLE_MOVEMENT",
            layer1_ref_id=int(layer1_result.get("entry_id") or 0),
            action_summary=(
                f"{payload['movement_type']} {payload['vehicle_number']} "
                f"qty={payload['quantity_change']}"
            ),
            performed_by=actor.username,
            mysql_row_data=action_payload,
            affected_asset=payload["vehicle_number"],
        )

        layer2_status = "logged" if layer2_result.get("success") else "pending_retry"

        return ServiceResult(
            success=True,
            message="Vehicle movement processed.",
            data={
                "log_id": log_id,
                "vehicle_id": vehicle.vehicle_id,
                "layer1": layer1_result,
                "layer2": layer2_result,
                "layer2_status": layer2_status,
                "strict_layer1": self.strict_layer1,
            },
        )
