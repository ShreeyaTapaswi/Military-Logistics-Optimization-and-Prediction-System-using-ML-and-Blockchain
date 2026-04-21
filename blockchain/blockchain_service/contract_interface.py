"""
contract_interface.py -  Main Python ↔ Blockchain bridge.

Usage from Django views / services:
    from blockchain_service import BlockchainService

    bc = BlockchainService()

    # Layer 1- Base Admin records a vehicle removal (base_id enforced on-chain)
    tx = bc.add_vehicle_movement(
        admin_address="0x...",
        base_id="JODHPUR_AFB",
        vehicle_number="MH-12-AB-1234",
        movement_type="REMOVAL",
        quantity_change=-2,
        reason="Deployed to northern border"
    )
    # On-chain: Base Admin can only write to their registered base.
    # On-chain: Super Admin (account[0]) can write to ANY base.

    # Layer 2- log audit entry after MySQL write
    bc.log_audit_entry(
        base_id="JODHPUR_AFB",
        category="VEHICLE_MOVEMENT",
        layer1_ref_id=tx["entry_id"],
        action_summary="Removed 2 vehicles – deployed to border",
        performed_by="base_admin_jodhpur",
        data_hash=sha256_of_mysql_row,
        affected_asset="MH-12-AB-1234"
    )

    # Layer 2- store ML prediction
    bc.store_ml_prediction(
        base_id="JODHPUR_AFB",
        prediction_type="MAINTENANCE_ALERT",
        description="Vehicle MH-12-AB-1234 due for engine service in 15 days",
        severity="HIGH",
        affected_asset="MH-12-AB-1234",
        confidence=9200,   # 92.00%
        recommended_action="Schedule engine service within 2 weeks"
    )
"""

from web3 import Web3
from web3.middleware import ExtraDataToPOAMiddleware

from . import config
from .utils import (
    load_contract_artifact,
    get_contract_abi,
    get_deployed_address,
    compute_data_hash,
    timestamp_to_datetime,
    format_movement_type,
    format_record_status,
    format_alert_severity,
    format_action_category,
    confidence_to_percentage,
)


class BlockchainService:
    """
    High-level Python interface to both blockchain layers.

    Layer 1 (AssetLedger)  → entry validation & recording
    Layer 2 (AuditTrail)   → immutable audit log & ML predictions
    """

    # ── Enum Mappings (Python string → Solidity uint8) ──────
    MOVEMENT_TYPES = {"ADDITION": 0, "REMOVAL": 1, "TRANSFER": 2}
    ACTION_CATEGORIES = {"VEHICLE_MOVEMENT": 0, "SPARE_PART_MOVEMENT": 1, "MAINTENANCE": 2}
    ALERT_SEVERITIES = {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

    def __init__(self, ganache_url: str = None):
        url = ganache_url or config.GANACHE_URL
        self.w3 = Web3(Web3.HTTPProvider(url))
        self.w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)

        if not self.w3.is_connected():
            raise ConnectionError(
                f"Cannot connect to Ganache at {url}. "
                "Make sure Ganache is running."
            )

        # Load accounts
        self.accounts = self.w3.eth.accounts
        self.super_admin = self.accounts[config.SUPER_ADMIN_ACCOUNT_INDEX]
        self.backend_account = self.accounts[config.BACKEND_ACCOUNT_INDEX]

        # Load contract artifacts & instantiate contracts
        self._load_contracts()

    # ─────────────────── INTERNAL SETUP ───────────────────

    def _load_contracts(self):
        """Load compiled contract ABIs and deployed addresses."""
        current_network_id = str(self.w3.net.version)

        # Asset Ledger (Layer 1)
        ledger_artifact = load_contract_artifact(config.ASSET_LEDGER_ARTIFACT)
        ledger_abi = get_contract_abi(ledger_artifact)
        ledger_address = get_deployed_address(ledger_artifact, current_network_id)
        self.asset_ledger = self.w3.eth.contract(
            address=Web3.to_checksum_address(ledger_address),
            abi=ledger_abi,
        )

        # Audit Trail (Layer 2)
        trail_artifact = load_contract_artifact(config.AUDIT_TRAIL_ARTIFACT)
        trail_abi = get_contract_abi(trail_artifact)
        trail_address = get_deployed_address(trail_artifact, current_network_id)
        self.audit_trail = self.w3.eth.contract(
            address=Web3.to_checksum_address(trail_address),
            abi=trail_abi,
        )

    def _send_tx(self, contract_fn, sender: str) -> dict:
        """Build, sign, send a transaction and wait for the receipt."""
        tx = contract_fn.build_transaction({
            "from": sender,
            "gas": config.DEFAULT_GAS,
            "gasPrice": config.DEFAULT_GAS_PRICE,
            "nonce": self.w3.eth.get_transaction_count(sender),
        })
        # Ganache auto-signs; send raw
        tx_hash = self.w3.eth.send_transaction({
            "from": sender,
            "to": tx["to"],
            "data": tx["data"],
            "gas": tx["gas"],
            "gasPrice": tx["gasPrice"],
        })
        receipt = self.w3.eth.wait_for_transaction_receipt(tx_hash)
        return receipt

    # ══════════════════════════════════════════════════════
    #  ADMIN MANAGEMENT
    # ══════════════════════════════════════════════════════

    def register_base_admin(self, base_id: str, admin_address: str) -> dict:
        """
        Register a wallet as Base Admin for a given base.
        Must be called by Super Admin.
        Returns transaction receipt.
        """
        fn = self.asset_ledger.functions.registerBaseAdmin(
            base_id, Web3.to_checksum_address(admin_address)
        )
        receipt = self._send_tx(fn, self.super_admin)
        return {"tx_hash": receipt.transactionHash.hex(), "status": receipt.status}

    def revoke_base_admin(self, admin_address: str) -> dict:
        fn = self.asset_ledger.functions.revokeBaseAdmin(
            Web3.to_checksum_address(admin_address)
        )
        receipt = self._send_tx(fn, self.super_admin)
        return {"tx_hash": receipt.transactionHash.hex(), "status": receipt.status}

    def authorise_backend(self, backend_address: str = None) -> dict:
        """
        Authorise the Django backend wallet to write to Layer 2.
        Defaults to self.backend_account if not supplied.
        """
        addr = backend_address or self.backend_account
        fn = self.audit_trail.functions.authoriseBackend(
            Web3.to_checksum_address(addr)
        )
        receipt = self._send_tx(fn, self.super_admin)
        return {"tx_hash": receipt.transactionHash.hex(), "status": receipt.status}

    # ══════════════════════════════════════════════════════
    #  LAYER 1 -  VEHICLE MOVEMENTS
    # ══════════════════════════════════════════════════════

    def add_vehicle_movement(
        self,
        admin_address: str,
        base_id: str,             # e.g. "JODHPUR_AFB"- enforced on-chain per role
        vehicle_number: str,
        movement_type: str,       # "ADDITION" | "REMOVAL" | "TRANSFER"
        quantity_change: int,
        reason: str,
    ) -> dict:
        """
        Record a vehicle movement on-chain (Layer 1).

        ACCESS CONTROL (enforced in smart contract):
          - Base Admin  → base_id MUST match their registered base, else tx reverts.
          - Super Admin → can pass ANY base_id.

        Returns dict with entry_id, tx_hash, block_number, status.
        """
        mt = self.MOVEMENT_TYPES[movement_type.upper()]
        fn = self.asset_ledger.functions.addVehicleMovement(
            base_id, vehicle_number, mt, quantity_change, reason
        )
        receipt = self._send_tx(fn, Web3.to_checksum_address(admin_address))

        # Reliable ID retrieval: read latest counter from chain after successful tx.
        # This avoids web3 event-decoding issues across versions.
        entry_id = None
        if receipt.status == 1:
            entry_id = self.asset_ledger.functions.vehicleMovementCount().call()

        return {
            "entry_id": entry_id,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "status": "VALIDATED" if receipt.status == 1 else "FAILED",
        }

    # ══════════════════════════════════════════════════════
    #  LAYER 1 -  SPARE PART MOVEMENTS
    # ══════════════════════════════════════════════════════

    def add_spare_part_movement(
        self,
        admin_address: str,
        base_id: str,
        part_code: str,
        part_name: str,
        movement_type: str,
        quantity_change: int,
        reason: str,
    ) -> dict:
        """
        Record a spare-part movement on-chain (Layer 1).
        Base Admin can only write to own base; Super Admin can write to any.
        """
        mt = self.MOVEMENT_TYPES[movement_type.upper()]
        fn = self.asset_ledger.functions.addSparePartMovement(
            base_id, part_code, part_name, mt, quantity_change, reason
        )
        receipt = self._send_tx(fn, Web3.to_checksum_address(admin_address))

        entry_id = None
        if receipt.status == 1:
            entry_id = self.asset_ledger.functions.sparePartMovementCount().call()

        return {
            "entry_id": entry_id,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "status": "VALIDATED" if receipt.status == 1 else "FAILED",
        }

    # ══════════════════════════════════════════════════════
    #  LAYER 1 -  MAINTENANCE RECORDS
    # ══════════════════════════════════════════════════════

    def add_maintenance_record(
        self,
        admin_address: str,
        base_id: str,
        vehicle_number: str,
        description: str,
        parts_used: list[str],
        cost_estimate: int,       # in paise (₹1 = 100 paise)
    ) -> dict:
        """
        Record a maintenance log on-chain (Layer 1).
        Base Admin can only write to own base; Super Admin can write to any.
        """
        fn = self.asset_ledger.functions.addMaintenanceRecord(
            base_id, vehicle_number, description, parts_used, cost_estimate
        )
        receipt = self._send_tx(fn, Web3.to_checksum_address(admin_address))

        entry_id = None
        if receipt.status == 1:
            entry_id = self.asset_ledger.functions.maintenanceRecordCount().call()

        return {
            "entry_id": entry_id,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "gas_used": receipt.gasUsed,
            "status": "VALIDATED" if receipt.status == 1 else "FAILED",
        }

    # ══════════════════════════════════════════════════════
    #  LAYER 2 -  AUDIT LOG
    # ══════════════════════════════════════════════════════

    def log_audit_entry(
        self,
        base_id: str,
        category: str,            # "VEHICLE_MOVEMENT" | "SPARE_PART_MOVEMENT" | "MAINTENANCE"
        layer1_ref_id: int,
        action_summary: str,
        performed_by: str,
        data_hash: bytes,         # 32-byte SHA-256 hash of the MySQL row
        affected_asset: str,
    ) -> dict:
        """
        Write an immutable audit entry (Layer 2).
        Called by the Django backend AFTER successful MySQL persistence.
        """
        cat = self.ACTION_CATEGORIES[category.upper()]
        fn = self.audit_trail.functions.logAuditEntry(
            base_id, cat, layer1_ref_id,
            action_summary, performed_by,
            data_hash, affected_asset,
        )
        receipt = self._send_tx(fn, self.backend_account)

        entry_id = None
        if receipt.status == 1:
            entry_id = self.audit_trail.functions.auditEntryCount().call()

        return {
            "audit_entry_id": entry_id,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "status": "LOGGED" if receipt.status == 1 else "FAILED",
        }

    # ══════════════════════════════════════════════════════
    #  LAYER 2 -  ML PREDICTIONS
    # ══════════════════════════════════════════════════════

    def store_ml_prediction(
        self,
        base_id: str,
        prediction_type: str,
        description: str,
        severity: str,            # "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
        affected_asset: str,
        confidence: int,          # 0-10000 basis points
        recommended_action: str,
    ) -> dict:
        """
        Store an ML prediction on-chain (Layer 2).
        Called by Django after the ML pipeline produces output.
        """
        sev = self.ALERT_SEVERITIES[severity.upper()]
        fn = self.audit_trail.functions.storeMLPrediction(
            base_id, prediction_type, description,
            sev, affected_asset, confidence, recommended_action,
        )
        receipt = self._send_tx(fn, self.backend_account)

        pred_id = None
        if receipt.status == 1:
            pred_id = self.audit_trail.functions.mlPredictionCount().call()

        return {
            "prediction_id": pred_id,
            "tx_hash": receipt.transactionHash.hex(),
            "block_number": receipt.blockNumber,
            "status": "STORED" if receipt.status == 1 else "FAILED",
        }

    # ══════════════════════════════════════════════════════
    #  READ FUNCTIONS -  HISTORY & DETAILS
    # ══════════════════════════════════════════════════════

    def get_vehicle_history(self, vehicle_number: str) -> list[dict]:
        """Fetch all on-chain movements for a vehicle (Layer 1)."""
        ids = self.asset_ledger.functions.getVehicleHistory(vehicle_number).call()
        results = []
        for mid in ids:
            raw = self.asset_ledger.functions.getVehicleMovementDetails(mid).call()
            results.append({
                "id": mid,
                "base_id": raw[0].hex(),
                "vehicle_number": raw[1],
                "movement_type": format_movement_type(raw[2]),
                "quantity_change": raw[3],
                "reason": raw[4],
                "recorded_by": raw[5],
                "timestamp": timestamp_to_datetime(raw[6]).isoformat(),
                "status": format_record_status(raw[7]),
            })
        return results

    def get_vehicle_maintenance_history(self, vehicle_number: str) -> list[dict]:
        """Fetch all on-chain maintenance records for a vehicle (Layer 1)."""
        ids = self.asset_ledger.functions.getVehicleMaintenanceHistory(vehicle_number).call()
        results = []
        for mid in ids:
            raw = self.asset_ledger.functions.getMaintenanceRecordDetails(mid).call()
            results.append({
                "id": mid,
                "base_id": raw[0].hex(),
                "vehicle_number": raw[1],
                "description": raw[2],
                "parts_used": list(raw[3]),
                "cost_estimate": raw[4],
                "recorded_by": raw[5],
                "timestamp": timestamp_to_datetime(raw[6]).isoformat(),
                "status": format_record_status(raw[7]),
            })
        return results

    def get_spare_part_history(self, part_code: str) -> list[dict]:
        """Fetch all on-chain movements for a spare part (Layer 1)."""
        ids = self.asset_ledger.functions.getSparePartHistory(part_code).call()
        results = []
        for mid in ids:
            raw = self.asset_ledger.functions.getSparePartMovementDetails(mid).call()
            results.append({
                "id": mid,
                "base_id": raw[0].hex(),
                "part_code": raw[1],
                "part_name": raw[2],
                "movement_type": format_movement_type(raw[3]),
                "quantity_change": raw[4],
                "reason": raw[5],
                "recorded_by": raw[6],
                "timestamp": timestamp_to_datetime(raw[7]).isoformat(),
                "status": format_record_status(raw[8]),
            })
        return results

    def get_base_audit_trail(self, base_id: str) -> list[dict]:
        """Fetch all audit entries for a base (Layer 2)."""
        ids = self.audit_trail.functions.getBaseAuditTrail(base_id).call()
        results = []
        for eid in ids:
            raw = self.audit_trail.functions.getAuditEntryDetails(eid).call()
            results.append({
                "id": eid,
                "base_id": raw[0].hex(),
                "category": format_action_category(raw[1]),
                "layer1_ref_id": raw[2],
                "action_summary": raw[3],
                "performed_by": raw[4],
                "data_hash": raw[5].hex(),
                "timestamp": timestamp_to_datetime(raw[6]).isoformat(),
            })
        return results

    def get_base_predictions(self, base_id: str) -> list[dict]:
        """Fetch all ML predictions for a base (Layer 2)."""
        ids = self.audit_trail.functions.getBasePredictions(base_id).call()
        results = []
        for pid in ids:
            raw = self.audit_trail.functions.getMLPredictionDetails(pid).call()
            results.append({
                "id": pid,
                "base_id": raw[0].hex(),
                "prediction_type": raw[1],
                "description": raw[2],
                "severity": format_alert_severity(raw[3]),
                "affected_asset": raw[4],
                "confidence": confidence_to_percentage(raw[5]),
                "recommended_action": raw[6],
                "timestamp": timestamp_to_datetime(raw[7]).isoformat(),
            })
        return results

    def get_asset_audit_trail(self, asset: str) -> list[dict]:
        """Fetch all audit entries for a specific asset (Layer 2)."""
        ids = self.audit_trail.functions.getAssetAuditTrail(asset).call()
        results = []
        for eid in ids:
            raw = self.audit_trail.functions.getAuditEntryDetails(eid).call()
            results.append({
                "id": eid,
                "base_id": raw[0].hex(),
                "category": format_action_category(raw[1]),
                "layer1_ref_id": raw[2],
                "action_summary": raw[3],
                "performed_by": raw[4],
                "data_hash": raw[5].hex(),
                "timestamp": timestamp_to_datetime(raw[6]).isoformat(),
            })
        return results

    def verify_data_integrity(self, audit_entry_id: int, mysql_row_data: dict) -> bool:
        """
        Verify that a MySQL record matches what was hashed on-chain.
        Returns True if hashes match, False if data was tampered.
        """
        expected_hash = compute_data_hash(mysql_row_data)
        return self.audit_trail.functions.verifyDataIntegrity(
            audit_entry_id, expected_hash
        ).call()

    # ══════════════════════════════════════════════════════
    #  STATISTICS
    # ══════════════════════════════════════════════════════

    def get_layer1_stats(self) -> dict:
        """Get total entry counts from Layer 1."""
        return {
            "vehicle_movements": self.asset_ledger.functions.vehicleMovementCount().call(),
            "spare_part_movements": self.asset_ledger.functions.sparePartMovementCount().call(),
            "maintenance_records": self.asset_ledger.functions.maintenanceRecordCount().call(),
            "total": self.asset_ledger.functions.getTotalEntries().call(),
        }

    def get_layer2_stats(self) -> dict:
        """Get total record counts from Layer 2."""
        audits, predictions = self.audit_trail.functions.getTotalRecords().call()
        return {
            "audit_entries": audits,
            "ml_predictions": predictions,
            "total": audits + predictions,
        }

    def get_full_stats(self) -> dict:
        """Combined statistics from both layers."""
        l1 = self.get_layer1_stats()
        l2 = self.get_layer2_stats()
        return {
            "layer1": l1,
            "layer2": l2,
            "grand_total": l1["total"] + l2["total"],
        }
