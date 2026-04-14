"""
django_integration.py  —  Drop-in helper for the Django backend teammate.

SETUP:
  1. Copy the entire `blockchain_service/` folder into your Django project root.
  2. pip install web3
  3. Import this module in your Django views / services.

This module wraps BlockchainService with Django-friendly helpers:
  - Automatic wallet resolution from Django user model
  - Full pipeline function: blockchain → MySQL → ML → blockchain
  - Error handling that returns Django-friendly responses
  - Utility to hash Django model instances for integrity checks

USAGE IN DJANGO VIEWS:

    from blockchain_service.django_integration import BlockchainBridge

    bridge = BlockchainBridge()

    # ─── In your Django view when Base Admin submits a vehicle action ───
    def vehicle_action_view(request):
        user = request.user   # Django auth user

        # Step 1: Write to blockchain (Layer 1) FIRST
        bc_result = bridge.record_vehicle_action(
            user=user,
            base_id=user.profile.base_id,     # e.g. "JODHPUR_AFB"
            vehicle_number="MH-12-AB-1234",
            action="REMOVAL",
            quantity=-2,
            reason="Deployed to northern border"
        )

        if bc_result["success"]:
            # Step 2: NOW save to MySQL (only after blockchain confirms)
            obj = VehicleMovement.objects.create(
                base_id=user.profile.base_id,
                vehicle_number="MH-12-AB-1234",
                movement_type="REMOVAL",
                quantity_change=-2,
                reason="Deployed to northern border",
                blockchain_entry_id=bc_result["entry_id"],
                blockchain_tx_hash=bc_result["tx_hash"],
            )

            # Step 3: After MySQL + ML, write audit to blockchain (Layer 2)
            bridge.record_audit_and_prediction(
                base_id=user.profile.base_id,
                category="VEHICLE_MOVEMENT",
                layer1_ref_id=bc_result["entry_id"],
                action_summary=f"Removed 2 vehicles – {obj.reason}",
                performed_by=user.username,
                mysql_row_data=model_to_dict(obj),
                affected_asset="MH-12-AB-1234",
                ml_predictions=[...]   # from your ML teammate's output
            )
"""

import logging
from typing import Optional

from .contract_interface import BlockchainService
from .utils import compute_data_hash

logger = logging.getLogger("blockchain")


class BlockchainBridge:
    """
    Django-friendly wrapper around BlockchainService.

    Manages wallet address resolution and provides pipeline helpers
    that combine Layer 1 + Layer 2 operations.
    """

    def __init__(self):
        try:
            self._bc = BlockchainService()
            self._connected = True
            logger.info("Blockchain bridge connected to Ganache")
        except ConnectionError as e:
            self._bc = None
            self._connected = False
            logger.error(f"Blockchain connection failed: {e}")

    @property
    def is_connected(self) -> bool:
        return self._connected

    # ══════════════════════════════════════════════════════
    #  WALLET MANAGEMENT
    # ══════════════════════════════════════════════════════

    # Maps Django user IDs to Ganache wallet addresses.
    # In production, you'd store this in MySQL.  For your PBL demo,
    # we map users to Ganache accounts by index.
    _wallet_map: dict = {}

    def assign_wallet(self, user_id: int, wallet_address: str):
        """Assign a Ganache wallet address to a Django user."""
        self._wallet_map[user_id] = wallet_address

    def get_wallet(self, user_id: int) -> Optional[str]:
        """Get the wallet address for a Django user."""
        return self._wallet_map.get(user_id)

    def get_super_admin_wallet(self) -> str:
        """Get the Super Admin wallet (Ganache account[0])."""
        return self._bc.super_admin

    def get_available_wallets(self) -> list:
        """List all Ganache accounts (for assigning to users)."""
        return list(self._bc.accounts)

    # ══════════════════════════════════════════════════════
    #  INITIAL SETUP  (call once at startup or via management command)
    # ══════════════════════════════════════════════════════

    def setup_base(self, base_id: str, admin_wallet: str) -> dict:
        """
        Register a base and its admin on the blockchain.
        Also authorises the backend wallet for Layer 2 writes.

        Call this once per base during initial deployment.
        """
        results = {}

        # Register base admin on Layer 1
        r1 = self._bc.register_base_admin(base_id, admin_wallet)
        results["register_admin"] = r1

        # Authorise backend wallet on Layer 2 (idempotent)
        r2 = self._bc.authorise_backend()
        results["authorise_backend"] = r2

        logger.info(f"Base '{base_id}' setup complete. Admin: {admin_wallet[:10]}...")
        return results

    # ══════════════════════════════════════════════════════
    #  LAYER 1 — RECORD ACTIONS (called from Django views)
    # ══════════════════════════════════════════════════════

    def record_vehicle_action(
        self,
        wallet_address: str,
        base_id: str,
        vehicle_number: str,
        action: str,           # "ADDITION" | "REMOVAL" | "TRANSFER"
        quantity: int,
        reason: str,
    ) -> dict:
        """
        Record a vehicle action on blockchain Layer 1.

        ACCESS CONTROL IS ENFORCED ON-CHAIN:
          - If wallet is a Base Admin for `base_id` → allowed
          - If wallet is Super Admin → allowed for any base_id
          - Otherwise → transaction reverts, returns success=False

        Call this BEFORE saving to MySQL.
        """
        if not self._connected:
            return {"success": False, "error": "Blockchain not connected"}

        try:
            result = self._bc.add_vehicle_movement(
                admin_address=wallet_address,
                base_id=base_id,
                vehicle_number=vehicle_number,
                movement_type=action,
                quantity_change=quantity,
                reason=reason,
            )
            return {
                "success": result["status"] == "VALIDATED",
                **result,
            }
        except Exception as e:
            logger.error(f"Blockchain vehicle action failed: {e}")
            return {"success": False, "error": str(e)}

    def record_spare_part_action(
        self,
        wallet_address: str,
        base_id: str,
        part_code: str,
        part_name: str,
        action: str,
        quantity: int,
        reason: str,
    ) -> dict:
        """Record a spare part action on blockchain Layer 1."""
        if not self._connected:
            return {"success": False, "error": "Blockchain not connected"}

        try:
            result = self._bc.add_spare_part_movement(
                admin_address=wallet_address,
                base_id=base_id,
                part_code=part_code,
                part_name=part_name,
                movement_type=action,
                quantity_change=quantity,
                reason=reason,
            )
            return {"success": result["status"] == "VALIDATED", **result}
        except Exception as e:
            logger.error(f"Blockchain spare part action failed: {e}")
            return {"success": False, "error": str(e)}

    def record_maintenance_action(
        self,
        wallet_address: str,
        base_id: str,
        vehicle_number: str,
        description: str,
        parts_used: list,
        cost_estimate: int,
    ) -> dict:
        """Record a maintenance log on blockchain Layer 1."""
        if not self._connected:
            return {"success": False, "error": "Blockchain not connected"}

        try:
            result = self._bc.add_maintenance_record(
                admin_address=wallet_address,
                base_id=base_id,
                vehicle_number=vehicle_number,
                description=description,
                parts_used=parts_used,
                cost_estimate=cost_estimate,
            )
            return {"success": result["status"] == "VALIDATED", **result}
        except Exception as e:
            logger.error(f"Blockchain maintenance action failed: {e}")
            return {"success": False, "error": str(e)}

    # ══════════════════════════════════════════════════════
    #  LAYER 2 — AUDIT + ML  (called after MySQL + ML)
    # ══════════════════════════════════════════════════════

    def record_audit_entry(
        self,
        base_id: str,
        category: str,
        layer1_ref_id: int,
        action_summary: str,
        performed_by: str,
        mysql_row_data: dict,
        affected_asset: str,
    ) -> dict:
        """
        Write an audit entry to blockchain Layer 2.
        Computes SHA-256 hash of the MySQL row for integrity verification.
        """
        if not self._connected:
            return {"success": False, "error": "Blockchain not connected"}

        try:
            data_hash = compute_data_hash(mysql_row_data)
            result = self._bc.log_audit_entry(
                base_id=base_id,
                category=category,
                layer1_ref_id=layer1_ref_id,
                action_summary=action_summary,
                performed_by=performed_by,
                data_hash=data_hash,
                affected_asset=affected_asset,
            )
            return {"success": result["status"] == "LOGGED", **result}
        except Exception as e:
            logger.error(f"Blockchain audit entry failed: {e}")
            return {"success": False, "error": str(e)}

    def record_ml_prediction(
        self,
        base_id: str,
        prediction_type: str,
        description: str,
        severity: str,
        affected_asset: str,
        confidence: int,
        recommended_action: str,
    ) -> dict:
        """Store an ML prediction on blockchain Layer 2."""
        if not self._connected:
            return {"success": False, "error": "Blockchain not connected"}

        try:
            result = self._bc.store_ml_prediction(
                base_id=base_id,
                prediction_type=prediction_type,
                description=description,
                severity=severity,
                affected_asset=affected_asset,
                confidence=confidence,
                recommended_action=recommended_action,
            )
            return {"success": result["status"] == "STORED", **result}
        except Exception as e:
            logger.error(f"Blockchain ML prediction failed: {e}")
            return {"success": False, "error": str(e)}

    def record_audit_and_predictions(
        self,
        base_id: str,
        category: str,
        layer1_ref_id: int,
        action_summary: str,
        performed_by: str,
        mysql_row_data: dict,
        affected_asset: str,
        ml_predictions: list[dict] = None,
    ) -> dict:
        """
        Convenience: write audit entry + all ML predictions in one call.

        ml_predictions is a list of dicts, each with keys:
            prediction_type, description, severity, confidence, recommended_action

        Example:
            bridge.record_audit_and_predictions(
                base_id="JODHPUR_AFB",
                category="VEHICLE_MOVEMENT",
                layer1_ref_id=1,
                action_summary="Removed 2 vehicles",
                performed_by="admin_jodhpur",
                mysql_row_data={...},
                affected_asset="MH-12-AB-1234",
                ml_predictions=[
                    {
                        "prediction_type": "DEMAND_FORECAST",
                        "description": "Need 3 replacements in 30 days",
                        "severity": "MEDIUM",
                        "confidence": 8750,
                        "recommended_action": "Initiate requisition"
                    }
                ]
            )
        """
        results = {"audit": None, "predictions": []}

        # Write audit entry
        audit_result = self.record_audit_entry(
            base_id=base_id,
            category=category,
            layer1_ref_id=layer1_ref_id,
            action_summary=action_summary,
            performed_by=performed_by,
            mysql_row_data=mysql_row_data,
            affected_asset=affected_asset,
        )
        results["audit"] = audit_result

        # Write ML predictions
        if ml_predictions:
            for pred in ml_predictions:
                pred_result = self.record_ml_prediction(
                    base_id=base_id,
                    prediction_type=pred["prediction_type"],
                    description=pred["description"],
                    severity=pred["severity"],
                    affected_asset=affected_asset,
                    confidence=pred["confidence"],
                    recommended_action=pred["recommended_action"],
                )
                results["predictions"].append(pred_result)

        results["success"] = (
            audit_result.get("success", False) and
            all(p.get("success", False) for p in results["predictions"])
        )

        return results

    # ══════════════════════════════════════════════════════
    #  READ — for Dashboard / API views
    # ══════════════════════════════════════════════════════

    def get_vehicle_history(self, vehicle_number: str) -> list:
        return self._bc.get_vehicle_history(vehicle_number) if self._connected else []

    def get_vehicle_maintenance_history(self, vehicle_number: str) -> list:
        return self._bc.get_vehicle_maintenance_history(vehicle_number) if self._connected else []

    def get_spare_part_history(self, part_code: str) -> list:
        return self._bc.get_spare_part_history(part_code) if self._connected else []

    def get_base_audit_trail(self, base_id: str) -> list:
        return self._bc.get_base_audit_trail(base_id) if self._connected else []

    def get_base_predictions(self, base_id: str) -> list:
        return self._bc.get_base_predictions(base_id) if self._connected else []

    def verify_integrity(self, audit_entry_id: int, mysql_row_data: dict) -> bool:
        """Check if MySQL data matches what's on the blockchain."""
        if not self._connected:
            return False
        return self._bc.verify_data_integrity(audit_entry_id, mysql_row_data)

    def get_stats(self) -> dict:
        if not self._connected:
            return {"error": "Not connected"}
        return self._bc.get_full_stats()
