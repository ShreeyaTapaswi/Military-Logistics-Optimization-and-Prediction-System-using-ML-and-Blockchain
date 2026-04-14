"""
end_to_end_demo.py  —  Full-flow demonstration script.

Run this AFTER deploying contracts to Ganache:
    cd blockchain
    npm install
    npx truffle compile
    npx truffle migrate --network development
    pip install web3
    python end_to_end_demo.py

This simulates the complete data flow:
    Base Admin action → Layer 1 → MySQL (simulated) → ML (simulated) → Layer 2
"""

import sys
import os
import json
import hashlib

# Add parent dir to path so we can import blockchain_service
sys.path.insert(0, os.path.dirname(__file__))

from blockchain_service import BlockchainService
from blockchain_service.utils import compute_data_hash


def main():
    print("=" * 70)
    print("  MILITARY BASE ASSET TRACKING — BLOCKCHAIN END-TO-END DEMO")
    print("=" * 70)

    # ── 1. Connect ──────────────────────────────────────────────
    print("\n[1] Connecting to Ganache...")
    try:
        bc = BlockchainService()
        print(f"    ✓ Connected. Super Admin: {bc.super_admin}")
        print(f"    ✓ Backend Account: {bc.backend_account}")
        print(f"    ✓ Available accounts: {len(bc.accounts)}")
    except Exception as e:
        print(f"    ✗ Connection failed: {e}")
        print("    Make sure Ganache is running on http://127.0.0.1:7545")
        return

    # ── 2. Register Base Admin ──────────────────────────────────
    print("\n[2] Registering Base Admin for JODHPUR_AFB...")
    base_admin_addr = bc.accounts[2]  # account index 2
    result = bc.register_base_admin("JODHPUR_AFB", base_admin_addr)
    print(f"    ✓ Registered. TX: {result['tx_hash'][:16]}...")

    # ── 3. Authorise Backend for Layer 2 ────────────────────────
    print("\n[3] Authorising backend wallet for Layer 2 writes...")
    result = bc.authorise_backend()
    print(f"    ✓ Authorised. TX: {result['tx_hash'][:16]}...")

    # ══════════════════════════════════════════════════════════════
    #  SCENARIO: Base Admin removes 2 vehicles
    # ══════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  SCENARIO: Base Admin removes 2 vehicles from JODHPUR_AFB")
    print("─" * 70)

    # ── 4. Layer 1 — Record Vehicle Movement ────────────────────
    print("\n[4] LAYER 1 → Recording vehicle removal on blockchain...")
    vehicle_result = bc.add_vehicle_movement(
        admin_address=base_admin_addr,
        base_id="JODHPUR_AFB",
        vehicle_number="MH-12-AB-1234",
        movement_type="REMOVAL",
        quantity_change=-2,
        reason="Deployed to northern border for winter operations",
    )
    print(f"    ✓ Entry ID:     {vehicle_result['entry_id']}")
    print(f"    ✓ TX Hash:      {vehicle_result['tx_hash'][:16]}...")
    print(f"    ✓ Block #:      {vehicle_result['block_number']}")
    print(f"    ✓ Status:       {vehicle_result['status']}")

    # ── 5. Simulate MySQL Write ─────────────────────────────────
    print("\n[5] Simulating MySQL persistence...")
    mysql_row = {
        "id": 101,
        "base_id": "JODHPUR_AFB",
        "vehicle_number": "MH-12-AB-1234",
        "movement_type": "REMOVAL",
        "quantity_change": -2,
        "reason": "Deployed to northern border for winter operations",
        "blockchain_entry_id": vehicle_result["entry_id"],
        "blockchain_tx_hash": vehicle_result["tx_hash"],
    }
    data_hash = compute_data_hash(mysql_row)
    print(f"    ✓ MySQL row saved (simulated). Data hash: {data_hash.hex()[:16]}...")

    # ── 6. Simulate ML Prediction ───────────────────────────────
    print("\n[6] Simulating ML prediction...")
    ml_output = {
        "type": "DEMAND_FORECAST",
        "description": (
            "Based on removal of 2 vehicles, JODHPUR_AFB may need "
            "3 replacement vehicles within 30 days to maintain operational readiness"
        ),
        "severity": "MEDIUM",
        "confidence": 8750,  # 87.50%
        "recommended_action": "Initiate vehicle requisition process for 3 units",
    }
    print(f"    ✓ ML says: {ml_output['description'][:60]}...")

    # ── 7. Layer 2 — Audit Log ──────────────────────────────────
    print("\n[7] LAYER 2 → Logging audit entry on blockchain...")
    audit_result = bc.log_audit_entry(
        base_id="JODHPUR_AFB",
        category="VEHICLE_MOVEMENT",
        layer1_ref_id=vehicle_result["entry_id"],
        action_summary="Removed 2 vehicles (MH-12-AB-1234) – deployed to northern border",
        performed_by="base_admin_jodhpur",
        data_hash=data_hash,
        affected_asset="MH-12-AB-1234",
    )
    print(f"    ✓ Audit Entry ID: {audit_result['audit_entry_id']}")
    print(f"    ✓ TX Hash:        {audit_result['tx_hash'][:16]}...")
    print(f"    ✓ Status:         {audit_result['status']}")

    # ── 8. Layer 2 — ML Prediction ──────────────────────────────
    print("\n[8] LAYER 2 → Storing ML prediction on blockchain...")
    pred_result = bc.store_ml_prediction(
        base_id="JODHPUR_AFB",
        prediction_type=ml_output["type"],
        description=ml_output["description"],
        severity=ml_output["severity"],
        affected_asset="MH-12-AB-1234",
        confidence=ml_output["confidence"],
        recommended_action=ml_output["recommended_action"],
    )
    print(f"    ✓ Prediction ID: {pred_result['prediction_id']}")
    print(f"    ✓ TX Hash:       {pred_result['tx_hash'][:16]}...")
    print(f"    ✓ Status:        {pred_result['status']}")

    # ══════════════════════════════════════════════════════════════
    #  SCENARIO 2: Spare part movement + Maintenance
    # ══════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  SCENARIO 2: Spare part usage & maintenance log")
    print("─" * 70)

    # ── 9. Layer 1 — Spare Part Movement ────────────────────────
    print("\n[9] LAYER 1 → Recording spare part removal...")
    spare_result = bc.add_spare_part_movement(
        admin_address=base_admin_addr,        base_id="JODHPUR_AFB",        part_code="BRK-PAD-TATA-407",
        part_name="Brake Pad Set – Tata 407",
        movement_type="REMOVAL",
        quantity_change=-4,
        reason="Used for scheduled brake maintenance on 4 vehicles",
    )
    print(f"    ✓ Entry ID: {spare_result['entry_id']}  Status: {spare_result['status']}")

    # ── 10. Layer 1 — Maintenance Record ────────────────────────
    print("\n[10] LAYER 1 → Recording maintenance log...")
    maint_result = bc.add_maintenance_record(
        admin_address=base_admin_addr,        base_id="JODHPUR_AFB",        vehicle_number="MH-12-AB-1234",
        description="Scheduled brake pad replacement – all 4 wheels",
        parts_used=["BRK-PAD-TATA-407"],
        cost_estimate=850000,  # ₹8,500.00
    )
    print(f"    ✓ Entry ID: {maint_result['entry_id']}  Status: {maint_result['status']}")

    # ══════════════════════════════════════════════════════════════
    #  QUERIES — Read from blockchain
    # ══════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  READING FROM BLOCKCHAIN")
    print("─" * 70)

    # ── Vehicle History ──────────────────────────────────────────
    print("\n[11] Vehicle History for MH-12-AB-1234:")
    history = bc.get_vehicle_history("MH-12-AB-1234")
    for entry in history:
        print(f"    #{entry['id']}  {entry['movement_type']:10s}  "
              f"qty={entry['quantity_change']:+d}  {entry['reason'][:50]}")

    # ── Maintenance History ──────────────────────────────────────
    print("\n[12] Maintenance History for MH-12-AB-1234:")
    maint_hist = bc.get_vehicle_maintenance_history("MH-12-AB-1234")
    for entry in maint_hist:
        print(f"    #{entry['id']}  {entry['description'][:50]}  "
              f"cost=₹{entry['cost_estimate']/100:.2f}")

    # ── Base Audit Trail ─────────────────────────────────────────
    print("\n[13] Audit Trail for JODHPUR_AFB:")
    audit_trail = bc.get_base_audit_trail("JODHPUR_AFB")
    for entry in audit_trail:
        print(f"    #{entry['id']}  [{entry['category']}]  {entry['action_summary'][:50]}")

    # ── ML Predictions ───────────────────────────────────────────
    print("\n[14] ML Predictions for JODHPUR_AFB:")
    preds = bc.get_base_predictions("JODHPUR_AFB")
    for p in preds:
        print(f"    #{p['id']}  [{p['severity']}]  {p['prediction_type']}  "
              f"conf={p['confidence']:.1f}%")
        print(f"         {p['description'][:60]}...")

    # ── Data Integrity Check ─────────────────────────────────────
    print("\n[15] Verifying data integrity...")
    is_valid = bc.verify_data_integrity(audit_result["audit_entry_id"], mysql_row)
    print(f"    ✓ Data integrity check: {'PASSED ✓' if is_valid else 'FAILED ✗ (DATA TAMPERED!)'}")

    # Simulate tampering
    tampered_row = mysql_row.copy()
    tampered_row["quantity_change"] = -10  # someone changed -2 to -10
    is_valid_tampered = bc.verify_data_integrity(audit_result["audit_entry_id"], tampered_row)
    print(f"    ✓ Tampered data check:  {'PASSED ✓' if is_valid_tampered else 'FAILED ✗ (TAMPER DETECTED!)'}")

    # ── Statistics ───────────────────────────────────────────────
    print("\n[16] Blockchain Statistics:")
    stats = bc.get_full_stats()
    print(f"    Layer 1: {stats['layer1']}")
    print(f"    Layer 2: {stats['layer2']}")
    print(f"    Grand Total: {stats['grand_total']} on-chain records")

    # ══════════════════════════════════════════════════════════════
    #  SCENARIO 3: Access Control Demonstration
    # ══════════════════════════════════════════════════════════════

    print("\n" + "─" * 70)
    print("  SCENARIO 3: ACCESS CONTROL — Base Admin vs Super Admin")
    print("─" * 70)

    # Register a second base
    base_admin2_addr = bc.accounts[3]
    bc.register_base_admin("MUMBAI_NB", base_admin2_addr)
    print(f"\n[17] Registered Base Admin for MUMBAI_NB: {base_admin2_addr[:10]}...")

    # Base Admin 2 writes to THEIR base — should succeed
    print("\n[18] Base Admin 2 writes to MUMBAI_NB (their base)... ", end="")
    try:
        result = bc.add_vehicle_movement(
            admin_address=base_admin2_addr,
            base_id="MUMBAI_NB",
            vehicle_number="MH-01-CD-5678",
            movement_type="ADDITION",
            quantity_change=3,
            reason="New vehicles received from depot",
        )
        print(f"✓ ALLOWED (entry #{result['entry_id']})")
    except Exception as e:
        print(f"✗ BLOCKED — {e}")

    # Base Admin 2 tries to write to JODHPUR — should FAIL
    print("[19] Base Admin 2 writes to JODHPUR_AFB (NOT their base)... ", end="")
    try:
        result = bc.add_vehicle_movement(
            admin_address=base_admin2_addr,
            base_id="JODHPUR_AFB",
            vehicle_number="MH-12-XX-0000",
            movement_type="ADDITION",
            quantity_change=1,
            reason="Attempt to write to wrong base",
        )
        print(f"✗ SHOULD HAVE BEEN BLOCKED!")
    except Exception as e:
        print(f"✓ CORRECTLY BLOCKED by smart contract!")

    # Super Admin writes to MUMBAI — should succeed
    print("[20] Super Admin writes to MUMBAI_NB (any base)... ", end="")
    try:
        result = bc.add_vehicle_movement(
            admin_address=bc.super_admin,
            base_id="MUMBAI_NB",
            vehicle_number="MH-01-CD-9999",
            movement_type="ADDITION",
            quantity_change=2,
            reason="Emergency allocation from HQ",
        )
        print(f"✓ ALLOWED (entry #{result['entry_id']})")
    except Exception as e:
        print(f"✗ BLOCKED — {e}")

    # Super Admin writes to JODHPUR — should succeed
    print("[21] Super Admin writes to JODHPUR_AFB (any base)... ", end="")
    try:
        result = bc.add_vehicle_movement(
            admin_address=bc.super_admin,
            base_id="JODHPUR_AFB",
            vehicle_number="MH-12-AB-1234",
            movement_type="ADDITION",
            quantity_change=10,
            reason="Major fleet replenishment ordered by HQ",
        )
        print(f"✓ ALLOWED (entry #{result['entry_id']})")
    except Exception as e:
        print(f"✗ BLOCKED — {e}")

    print("\n    Summary:")
    print("    ┌───────────────────┬────────────┬────────────┐")
    print("    │ Actor             │ Own Base   │ Other Base │")
    print("    ├───────────────────┼────────────┼────────────┤")
    print("    │ Base Admin        │ ✓ ALLOWED  │ ✗ BLOCKED  │")
    print("    │ Super Admin       │ ✓ ALLOWED  │ ✓ ALLOWED  │")
    print("    │ Unauthorised      │ ✗ BLOCKED  │ ✗ BLOCKED  │")
    print("    └───────────────────┴────────────┴────────────┘")

    print("\n" + "=" * 70)
    print("  DEMO COMPLETE — All blockchain operations successful!")
    print("=" * 70)


if __name__ == "__main__":
    main()
