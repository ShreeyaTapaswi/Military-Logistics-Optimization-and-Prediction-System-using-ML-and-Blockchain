from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from backend.models import Admin, Vehicle
from backend.services.blockchain_gateway import BlockchainGateway


STATE_TO_BASE_ID = {
    "delhi": "base_delhi",
    "ladakh": "base_leh",
    "jammu and kashmir": "base_leh",
    "maharashtra": "base_pune",
    "rajasthan": "base_jaisalmer",
    "west bengal": "base_kolkata",
}

BASE_ID_TO_STATE = {
    "base_delhi": "Delhi",
    "base_leh": "Ladakh",
    "base_pune": "Maharashtra",
    "base_jaisalmer": "Rajasthan",
    "base_kolkata": "West Bengal",
}

BASE_ID_TO_CITY = {
    "base_delhi": "Delhi",
    "base_leh": "Leh",
    "base_pune": "Pune",
    "base_jaisalmer": "Jaisalmer",
    "base_kolkata": "Kolkata",
}

ADMIN_BASE_BY_USERNAME = {
    "priya.patil": "base_pune",
    "rohan.verma": "base_delhi",
    "aman.rawat": "base_leh",
    "kavya.singh": "base_jaisalmer",
    "neha.iyer": "base_kolkata",
}

ADMIN_WALLET_INDEX_BY_USERNAME = {
    "arjun.sharma": 0,
    "priya.patil": 2,
    "rohan.verma": 3,
    "aman.rawat": 4,
    "kavya.singh": 5,
    "neha.iyer": 6,
}


@dataclass(frozen=True)
class ActorContext:
    admin: Admin
    role_label: str
    base_id: str
    wallet: str



def normalize_state_to_base_id(state: str) -> str:
    key = str(state or "").strip().lower()
    if key in STATE_TO_BASE_ID:
        return STATE_TO_BASE_ID[key]
    return "base_delhi"



def resolve_base_for_vehicle(vehicle: Vehicle) -> str:
    return normalize_state_to_base_id(vehicle.state)



def resolve_base_for_admin(admin: Admin) -> str:
    if admin.role == "super_admin":
        return "all"
    return ADMIN_BASE_BY_USERNAME.get(admin.username, "base_delhi")



def resolve_wallet_for_admin(admin: Admin, blockchain_gateway: BlockchainGateway) -> str:
    index = ADMIN_WALLET_INDEX_BY_USERNAME.get(admin.username)
    if index is None:
        return ""
    return blockchain_gateway.get_wallet_by_index(index)



def role_label(role_value: str) -> str:
    if role_value == "super_admin":
        return "Super Admin"
    return "Base Admin"



def can_edit_base(admin: Admin, base_id: str) -> bool:
    if admin.role == "super_admin":
        return True
    return resolve_base_for_admin(admin) == base_id



def can_view_maintenance(admin: Admin, base_id: str) -> bool:
    if admin.role == "super_admin":
        return True
    return resolve_base_for_admin(admin) == base_id



def can_trigger_ml(admin: Admin) -> bool:
    return admin.role == "super_admin"



def next_prediction_due(latest_assessment: Optional[date]):
    if latest_assessment is None:
        return None, True
    due = latest_assessment.fromordinal(latest_assessment.toordinal() + 7)
    is_stale = date.today() >= due
    return due, is_stale
