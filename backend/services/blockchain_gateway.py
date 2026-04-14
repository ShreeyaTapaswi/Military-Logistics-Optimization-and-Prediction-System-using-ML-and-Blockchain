import logging
import sys
from pathlib import Path
from typing import Any, Dict


logger = logging.getLogger(__name__)


class BlockchainGateway:
    def __init__(self, enabled: bool = True):
        self.enabled = enabled
        self._bridge = None
        self._last_error = ""

        if self.enabled:
            self._load_bridge()

    def _load_bridge(self) -> None:
        try:
            repo_root = Path(__file__).resolve().parents[2]
            blockchain_dir = repo_root / "blockchain"
            if str(blockchain_dir) not in sys.path:
                sys.path.insert(0, str(blockchain_dir))

            from blockchain_service.django_integration import BlockchainBridge

            bridge = BlockchainBridge()
            if not bridge.is_connected:
                self._last_error = "Blockchain bridge initialized but not connected."
                logger.warning(self._last_error)
                return

            self._bridge = bridge
            self._last_error = ""
            logger.info("Blockchain gateway connected.")
        except Exception as exc:
            self._last_error = str(exc)
            logger.exception("Failed to initialize blockchain gateway.")

    @property
    def is_ready(self) -> bool:
        return bool(self.enabled and self._bridge and self._bridge.is_connected)

    def health(self) -> Dict[str, Any]:
        return {
            "enabled": self.enabled,
            "ready": self.is_ready,
            "error": self._last_error,
        }

    def record_vehicle_movement(
        self,
        wallet_address: str,
        base_id: str,
        vehicle_number: str,
        movement_type: str,
        quantity_change: int,
        reason: str,
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"success": False, "error": "BLOCKCHAIN_DISABLED"}
        if not self.is_ready:
            return {"success": False, "error": self._last_error or "BLOCKCHAIN_NOT_READY"}

        return self._bridge.record_vehicle_action(
            wallet_address=wallet_address,
            base_id=base_id,
            vehicle_number=vehicle_number,
            action=movement_type,
            quantity=quantity_change,
            reason=reason,
        )

    def log_audit_entry(
        self,
        base_id: str,
        category: str,
        layer1_ref_id: int,
        action_summary: str,
        performed_by: str,
        mysql_row_data: Dict[str, Any],
        affected_asset: str,
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"success": False, "error": "BLOCKCHAIN_DISABLED"}
        if not self.is_ready:
            return {"success": False, "error": self._last_error or "BLOCKCHAIN_NOT_READY"}

        return self._bridge.record_audit_entry(
            base_id=base_id,
            category=category,
            layer1_ref_id=layer1_ref_id,
            action_summary=action_summary,
            performed_by=performed_by,
            mysql_row_data=mysql_row_data,
            affected_asset=affected_asset,
        )

    def record_ml_prediction(
        self,
        base_id: str,
        prediction_type: str,
        description: str,
        severity: str,
        affected_asset: str,
        confidence: int,
        recommended_action: str,
    ) -> Dict[str, Any]:
        if not self.enabled:
            return {"success": False, "error": "BLOCKCHAIN_DISABLED"}
        if not self.is_ready:
            return {"success": False, "error": self._last_error or "BLOCKCHAIN_NOT_READY"}

        return self._bridge.record_ml_prediction(
            base_id=base_id,
            prediction_type=prediction_type,
            description=description,
            severity=severity,
            affected_asset=affected_asset,
            confidence=confidence,
            recommended_action=recommended_action,
        )
