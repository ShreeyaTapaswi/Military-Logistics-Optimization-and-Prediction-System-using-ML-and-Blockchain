"""
utils.py  —  Helper utilities for blockchain operations.
"""

import json
import hashlib
from datetime import datetime


def load_contract_artifact(artifact_path: str) -> dict:
    """Load a Truffle-compiled JSON artifact and return ABI + networks info."""
    with open(artifact_path, "r", encoding="utf-8") as f:
        artifact = json.load(f)
    return artifact


def get_contract_abi(artifact: dict) -> list:
    """Extract the ABI from a Truffle artifact."""
    return artifact["abi"]


def get_deployed_address(artifact: dict, network_id: str = None) -> str:
    """
    Get the deployed contract address from a Truffle artifact.
    If network_id is None, returns the most recently deployed address.
    """
    networks = artifact.get("networks", {})
    if not networks:
        raise ValueError("Contract has not been deployed. Run `truffle migrate` first.")
    if network_id:
        if network_id not in networks:
            raise ValueError(f"Contract not deployed on network {network_id}")
        return networks[network_id]["address"]
    # Return the last deployed network's address
    last_network = list(networks.keys())[-1]
    return networks[last_network]["address"]


def compute_data_hash(data: dict) -> bytes:
    """
    Compute a SHA-256 hash of a dictionary (MySQL row data).
    Used for data integrity verification between MySQL and blockchain.
    Returns bytes32 suitable for Solidity.
    """
    # Sort keys for deterministic output
    serialised = json.dumps(data, sort_keys=True, default=str)
    hash_hex = hashlib.sha256(serialised.encode("utf-8")).hexdigest()
    return bytes.fromhex(hash_hex)


def timestamp_to_datetime(unix_ts: int) -> datetime:
    """Convert a Unix timestamp from the blockchain to a Python datetime."""
    return datetime.utcfromtimestamp(unix_ts)


def format_movement_type(movement_type_int: int) -> str:
    """Convert Solidity MovementType enum to readable string."""
    mapping = {0: "ADDITION", 1: "REMOVAL", 2: "TRANSFER"}
    return mapping.get(movement_type_int, "UNKNOWN")


def format_record_status(status_int: int) -> str:
    """Convert Solidity RecordStatus enum to readable string."""
    mapping = {0: "PENDING", 1: "VALIDATED", 2: "REJECTED"}
    return mapping.get(status_int, "UNKNOWN")


def format_alert_severity(severity_int: int) -> str:
    """Convert Solidity AlertSeverity enum to readable string."""
    mapping = {0: "INFO", 1: "LOW", 2: "MEDIUM", 3: "HIGH", 4: "CRITICAL"}
    return mapping.get(severity_int, "UNKNOWN")


def format_action_category(category_int: int) -> str:
    """Convert Solidity ActionCategory enum to readable string."""
    mapping = {0: "VEHICLE_MOVEMENT", 1: "SPARE_PART_MOVEMENT", 2: "MAINTENANCE"}
    return mapping.get(category_int, "UNKNOWN")


def confidence_to_percentage(basis_points: int) -> float:
    """Convert basis points (0-10000) to a percentage (0.00-100.00)."""
    return basis_points / 100.0
