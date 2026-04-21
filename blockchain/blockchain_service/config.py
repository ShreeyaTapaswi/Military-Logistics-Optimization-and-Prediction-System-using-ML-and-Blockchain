"""
config.py -  Blockchain connection settings.

Change these if your Ganache setup differs from defaults.
"""

import os

# ── Ganache Connection ──────────────────────────────────────
GANACHE_URL = os.environ.get(
	"GANACHE_URL",
	os.environ.get("GANACHE_RPC_URL", "http://127.0.0.1:7545")
)

# ── Account Indexes ─────────────────────────────────────────
# Ganache provides 10 accounts by default (index 0-9).
# Account 0 is used as Super Admin (deploys the contracts).
SUPER_ADMIN_ACCOUNT_INDEX = 0

# Account 1 can be used as the Django backend account (for Layer 2 writes).
BACKEND_ACCOUNT_INDEX = 1

# Accounts 2-9 are available for base admins.
BASE_ADMIN_START_INDEX = 2

# ── Contract Build Artifacts ────────────────────────────────
# After `truffle compile`, JSON ABIs are generated here.
BUILD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "build", "contracts")

ASSET_LEDGER_ARTIFACT  = os.path.join(BUILD_DIR, "AssetLedger.json")
AUDIT_TRAIL_ARTIFACT   = os.path.join(BUILD_DIR, "AuditTrail.json")

# ── Gas Settings (irrelevant on Ganache but required by Web3) ──
DEFAULT_GAS       = 6_721_975
DEFAULT_GAS_PRICE = 20_000_000_000   # 20 gwei
