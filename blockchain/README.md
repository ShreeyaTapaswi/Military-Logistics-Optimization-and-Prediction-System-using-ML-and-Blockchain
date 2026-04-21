# Blockchain Module- Military Base Asset Tracking

Private Ethereum blockchain layer (Ganache) that provides **tamper-proof recording** and **verifiable audit trails** for vehicle movements, spare-part movements, and maintenance logs across army bases.

---

## Architecture- Two Blockchain Layers

```
┌──────────────┐      ┌──────────────────────┐      ┌───────────┐
│  Base Admin   │─────►│  LAYER 1: AssetLedger │─────►│   MySQL   │
│  Dashboard    │      │  (Entry Validation)   │      │ (Django)  │
└──────────────┘      └──────────────────────┘      └─────┬─────┘
                                                          │
                                                          ▼
┌──────────────┐      ┌──────────────────────┐      ┌───────────┐
│  Dashboard    │◄─────│  LAYER 2: AuditTrail  │◄─────│ ML Engine │
│  (Alerts)     │      │  (Audit + ML Preds)   │      │ (Python)  │
└──────────────┘      └──────────────────────┘      └───────────┘
```

| Layer | Contract | Purpose |
|-------|----------|---------|
| **Layer 1** | `AssetLedger.sol` | Records every base admin action (vehicle add/remove, spare parts, maintenance) **before** it hits MySQL. Acts as entry validation. |
| **Layer 2** | `AuditTrail.sol` | Stores immutable audit logs and ML predictions **after** MySQL + ML processing. Enables tamper detection and verifiable alerts. |

---

## Prerequisites

1. **Ganache**- running on `http://127.0.0.1:7545` (default GUI port)
2. **Node.js** v16+ and npm
3. **Python** 3.10+ with pip
4. **Truffle** (installed via npm)

### Why `node_modules` is ignored

- `node_modules` is generated content and should be recreated with `npm install`.
- Keeping it out of git avoids huge commits and merge noise.
- If VS Code still shows the folder in red, that is usually an ignored-resource decoration or stale UI state, not a pending tracked change.
- Verify with `git status --short --ignored`.

Run the preflight helper from repo root:

```powershell
.\scripts\preflight_validation.ps1
```

---

## Setup & Deployment

```bash
# 1. Navigate to the blockchain folder
cd blockchain

# 2. Install Node dependencies (Truffle, OpenZeppelin)
npm install

# 3. Install Truffle globally (if not already)
npm install -g truffle

# 4. Make sure Ganache is running, then compile & deploy
truffle compile
truffle migrate --network development

# 5. Run Solidity tests
truffle test --network development

# 6. Install Python dependencies
pip install -r requirements.txt

# 7. Run the end-to-end demo
python end_to_end_demo.py
```

---

## Smart Contract Functions

### AssetLedger.sol (Layer 1)

| Function | Description |
|----------|-------------|
| `registerBaseAdmin(baseId, admin)` | Super Admin registers a base admin wallet |
| `revokeBaseAdmin(admin)` | Revoke base admin access |
| `addVehicleMovement(vehicleNumber, type, qty, reason)` | Record vehicle add/remove/transfer |
| `addSparePartMovement(partCode, partName, type, qty, reason)` | Record spare part movement |
| `addMaintenanceRecord(vehicleNumber, desc, partsUsed, cost)` | Log a maintenance activity |
| `getVehicleHistory(vehicleNumber)` | Get all movement IDs for a vehicle |
| `getVehicleMaintenanceHistory(vehicleNumber)` | Get all maintenance IDs for a vehicle |
| `getSparePartHistory(partCode)` | Get all movement IDs for a part |

### AuditTrail.sol (Layer 2)

| Function | Description |
|----------|-------------|
| `authoriseBackend(wallet)` | Super Admin authorises Django backend wallet |
| `logAuditEntry(baseId, category, refId, summary, actor, hash, asset)` | Write immutable audit log |
| `storeMLPrediction(baseId, type, desc, severity, asset, confidence, action)` | Store ML prediction on-chain |
| `getBaseAuditTrail(baseId)` | Get all audit entries for a base |
| `getBasePredictions(baseId)` | Get all ML predictions for a base |
| `verifyDataIntegrity(entryId, expectedHash)` | Compare MySQL row hash with on-chain hash |

---

## Python Integration (for Django teammate)

```python
from blockchain_service import BlockchainService

bc = BlockchainService()

# Layer 1- called when base admin takes an action
result = bc.add_vehicle_movement(
    admin_address="0x...",
    vehicle_number="MH-12-AB-1234",
    movement_type="REMOVAL",
    quantity_change=-2,
    reason="Deployed to northern border"
)
# result = {"entry_id": 1, "tx_hash": "0x...", "block_number": 5, "status": "VALIDATED"}

# --- MySQL write happens here (Django ORM) ---

# Layer 2- called after MySQL + ML
from blockchain_service.utils import compute_data_hash
data_hash = compute_data_hash(mysql_row_dict)

bc.log_audit_entry(
    base_id="JODHPUR_AFB",
    category="VEHICLE_MOVEMENT",
    layer1_ref_id=result["entry_id"],
    action_summary="Removed 2 vehicles – deployed to border",
    performed_by="base_admin_jodhpur",
    data_hash=data_hash,
    affected_asset="MH-12-AB-1234"
)

bc.store_ml_prediction(
    base_id="JODHPUR_AFB",
    prediction_type="MAINTENANCE_ALERT",
    description="Engine service due in 15 days",
    severity="HIGH",
    affected_asset="MH-12-AB-1234",
    confidence=9200,
    recommended_action="Schedule service within 2 weeks"
)
```

---

## File Structure

```
blockchain/
├── contracts/
│   ├── Migrations.sol              # Truffle helper
│   ├── AssetLedger.sol             # LAYER 1- entry validation & recording
│   └── AuditTrail.sol              # LAYER 2- audit log & ML predictions
├── migrations/
│   ├── 1_initial_migration.js
│   ├── 2_deploy_asset_ledger.js
│   └── 3_deploy_audit_trail.js
├── test/
│   └── test_contracts.js           # Solidity contract tests
├── blockchain_service/
│   ├── __init__.py
│   ├── config.py                   # Ganache connection settings
│   ├── contract_interface.py       # Main Python ↔ Blockchain bridge
│   └── utils.py                    # Helpers (hashing, formatting)
├── end_to_end_demo.py              # Full flow demo script
├── truffle-config.js               # Truffle network config
├── package.json                    # Node dependencies
├── requirements.txt                # Python dependencies
└── README.md                       # This file
```

---

## Ganache Account Allocation

| Index | Role | Purpose |
|-------|------|---------|
| 0 | Super Admin | Deploys contracts, registers base admins |
| 1 | Backend | Django backend wallet (writes to Layer 2) |
| 2-9 | Base Admins | One per base (assigned via `registerBaseAdmin`) |

---

## Data Integrity Verification

Every audit entry stores a SHA-256 hash of the corresponding MySQL row. At any time, you can verify no tampering occurred:

```python
is_valid = bc.verify_data_integrity(audit_entry_id=1, mysql_row_data=row_dict)
# True = data intact, False = TAMPERED
```

This ensures that even if someone modifies the MySQL database directly, the blockchain will detect it.
