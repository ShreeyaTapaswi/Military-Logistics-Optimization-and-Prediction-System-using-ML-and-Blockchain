import hashlib
import json
import uuid
from datetime import date
from decimal import Decimal

from django.db import connection, transaction
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from backend.api.serializers import (
    HealthScoreSerializer,
    InferenceTriggerSerializer,
    InventoryQuerySerializer,
    InventoryRecordSerializer,
    InventoryWriteSerializer,
    LoginRequestSerializer,
    MaintenanceQuerySerializer,
    MaintenanceRecordSerializer,
    MaintenanceWriteSerializer,
    MLLatestQuerySerializer,
    MovementInferenceWorkflowSerializer,
    VehicleCreateSerializer,
    VehicleDeleteSerializer,
    VehicleMovementRequestSerializer,
    VehicleOperationSerializer,
    VehicleQuerySerializer,
    VehicleSerializer,
    VehicleUpdateSerializer,
)
from backend.models import Admin, AuditLog, HealthScores, MaintainanceRecord, SpareParts, TamperProofRecord, Vehicle
from backend.services.access_policy import (
    BASE_ID_TO_CITY,
    BASE_ID_TO_STATE,
    can_edit_base,
    can_trigger_ml,
    next_prediction_due,
    normalize_state_to_base_id,
    resolve_base_for_admin,
    resolve_base_for_vehicle,
    resolve_wallet_for_admin,
    role_label,
)
from backend.services.container import get_service_container


BASE_ID_TO_PINCODE = {
    "base_delhi": "110010",
    "base_leh": "194101",
    "base_pune": "411001",
    "base_jaisalmer": "345001",
    "base_kolkata": "700001",
}


def _hash_password(value: str) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def _make_id(prefix: str, width: int = 8) -> str:
    return f"{prefix}{uuid.uuid4().hex[:width].upper()}"


def _make_vehicle_number(base_id: str, vehicle_type: str) -> str:
    base_code = base_id.replace("base_", "").upper()[:4]
    type_code = "".join(ch for ch in vehicle_type.upper() if ch.isalnum())[:4] or "VH"
    token = uuid.uuid4().hex[:6].upper()
    return f"MIL-{base_code}-{type_code}-{token}"[:30]


def _to_paise(value: Decimal) -> int:
    return int((Decimal(value) * 100).quantize(Decimal("1")))


def _get_active_admin(user_id: str):
    return Admin.objects.filter(user_id=user_id, is_active=True).first()


def _log_local_audit(actor: Admin, entity_type: str, entity_id: str, action: str, payload: dict, ip_address: str = None):
    with transaction.atomic():
        tamper_row = TamperProofRecord.objects.create(
            block_id=uuid.uuid4().hex,
            tamper_tag=f"{entity_type}_write",
            hash=hashlib.sha256(json.dumps(payload, default=str, sort_keys=True).encode("utf-8")).hexdigest(),
            attribute=json.dumps(payload, default=str),
            record_type="audit",
            record_ref_id=_make_id("LOG", 12),
            verified_by=None,
        )

        AuditLog.objects.create(
            log_id=_make_id("LOG", 12),
            user=actor,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            ip_address=ip_address,
            block=tamper_row,
        )


def _log_layer2_audit(
    container,
    *,
    base_id: str,
    category: str,
    layer1_ref_id: int,
    action_summary: str,
    performed_by: str,
    mysql_row_data: dict,
    affected_asset: str,
):
    return container.blockchain_gateway.log_audit_entry(
        base_id=base_id,
        category=category,
        layer1_ref_id=layer1_ref_id,
        action_summary=action_summary,
        performed_by=performed_by,
        mysql_row_data=mysql_row_data,
        affected_asset=affected_asset,
    )


class AuthLoginView(APIView):
    def post(self, request):
        serializer = LoginRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data["username"].strip()
        password = serializer.validated_data["password"]

        admin = Admin.objects.filter(username=username, is_active=True).first()
        if admin is None or _hash_password(password) != admin.password_hash:
            return Response(
                {"success": False, "message": "Invalid username or password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        container = get_service_container()
        base_id = resolve_base_for_admin(admin)
        wallet = resolve_wallet_for_admin(admin, container.blockchain_gateway)

        return Response(
            {
                "success": True,
                "data": {
                    "username": admin.username,
                    "actor_user_id": admin.user_id,
                    "role": role_label(admin.role),
                    "role_key": admin.role,
                    "base_id": base_id,
                    "wallet": wallet,
                    "permissions": {
                        "can_trigger_ml": can_trigger_ml(admin),
                        "can_edit_all_bases": admin.role == "super_admin",
                        "can_edit_own_base": True,
                        "can_view_all_vehicles": True,
                        "can_view_all_inventory": True,
                        "can_view_all_maintenance": True,
                    },
                },
            },
            status=status.HTTP_200_OK,
        )


class SystemHealthView(APIView):
    def get(self, request):
        db_ok = True
        db_error = ""
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
                cursor.fetchone()
        except Exception as exc:
            db_ok = False
            db_error = str(exc)

        container = get_service_container()
        payload = {
            "success": True,
            "services": {
                "database": {"ready": db_ok, "error": db_error},
                "blockchain": container.blockchain_gateway.health(),
                "ml": container.ml_gateway.health(),
            },
        }
        return Response(payload, status=status.HTTP_200_OK)


class VehicleListView(APIView):
    def get(self, request):
        serializer = VehicleQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        requested_base_id = data.get("base_id", "").strip()
        state_filter = data.get("state", "").strip()
        if requested_base_id and not state_filter:
            state_filter = BASE_ID_TO_STATE.get(requested_base_id, "")

        container = get_service_container()
        vehicles = container.fleet_service.list_vehicles(
            status=data.get("status", ""),
            state=state_filter,
            limit=data.get("limit", 100),
        )
        output = VehicleSerializer(vehicles, many=True)
        return Response({"success": True, "data": output.data}, status=status.HTTP_200_OK)


class VehicleCreateView(APIView):
    def post(self, request):
        serializer = VehicleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        base_id = data["base_id"]
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        vehicle_no = data["vehicle_no"].strip().upper()
        if Vehicle.objects.filter(vehicle_no__iexact=vehicle_no).exists():
            return Response(
                {"success": False, "message": f"Vehicle number {vehicle_no} already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        state = BASE_ID_TO_STATE.get(base_id, "Delhi")
        city = BASE_ID_TO_CITY.get(base_id, "Delhi")
        pincode = BASE_ID_TO_PINCODE.get(base_id, "110001")
        reason = data.get("reason") or "Vehicle created from dashboard"

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response(
                {"success": False, "message": "No blockchain wallet is mapped for this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        layer1 = container.blockchain_gateway.record_vehicle_movement(
            wallet_address=wallet,
            base_id=base_id,
            vehicle_number=vehicle_no,
            movement_type="ADDITION",
            quantity_change=1,
            reason=reason,
        )
        if not layer1.get("success"):
            return Response(
                {"success": False, "message": "Blockchain validation failed.", "layer1": layer1},
                status=status.HTTP_400_BAD_REQUEST,
            )

        row = Vehicle.objects.create(
            vehicle_id=_make_id("VH", 6),
            vehicle_no=vehicle_no,
            type=data["vehicle_type"],
            model=data.get("model") or f"{data['vehicle_type']} Mk-I",
            manufacture_date=data.get("manufacture_date") or date.today(),
            city=city,
            state=state,
            pincode=pincode,
            operational_status=data.get("operational_status") or "available",
        )

        payload = {
            "vehicle_id": row.vehicle_id,
            "vehicle_no": row.vehicle_no,
            "type": row.type,
            "base_id": base_id,
            "reason": reason,
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="vehicle",
            entity_id=row.vehicle_id,
            action=f"Vehicle created: {row.vehicle_no}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="VEHICLE_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"ADDITION 1 {row.type}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=row.vehicle_no,
        )

        output = VehicleSerializer(row)
        return Response(
            {
                "success": True,
                "message": "Vehicle created successfully.",
                "data": {
                    "vehicle": output.data,
                    "layer1": layer1,
                    "layer2": layer2,
                },
            },
            status=status.HTTP_201_CREATED,
        )


class VehicleOperationView(APIView):
    def post(self, request):
        serializer = VehicleOperationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        base_id = data["base_id"]
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        state = BASE_ID_TO_STATE.get(base_id, "Delhi")
        city = BASE_ID_TO_CITY.get(base_id, "Delhi")
        pincode = BASE_ID_TO_PINCODE.get(base_id, "110001")

        operation = data["operation"]
        vehicle_type = data["vehicle_type"]
        quantity = data["quantity"]
        reason = data["reason"]

        if operation == "REMOVAL":
            removable_count = (
                Vehicle.objects.filter(type=vehicle_type, state__iexact=state)
                .exclude(operational_status="decommissioned")
                .count()
            )
            if removable_count < quantity:
                return Response(
                    {"success": False, "message": "Not enough active vehicles to reduce this count."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response(
                {"success": False, "message": "No blockchain wallet is mapped for this user."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        movement_type = "ADDITION" if operation == "ADDITION" else "REMOVAL"
        movement_quantity = quantity if operation == "ADDITION" else -quantity

        layer1 = container.blockchain_gateway.record_vehicle_movement(
            wallet_address=wallet,
            base_id=base_id,
            vehicle_number=f"{vehicle_type}:{base_id}",
            movement_type=movement_type,
            quantity_change=movement_quantity,
            reason=reason,
        )
        if not layer1.get("success"):
            return Response(
                {"success": False, "message": "Blockchain validation failed.", "layer1": layer1},
                status=status.HTTP_400_BAD_REQUEST,
            )

        changed_ids = []
        with transaction.atomic():
            if operation == "ADDITION":
                template = (
                    Vehicle.objects.filter(type=vehicle_type, state__iexact=state)
                    .order_by("vehicle_id")
                    .first()
                )
                for _ in range(quantity):
                    row = Vehicle.objects.create(
                        vehicle_id=_make_id("VH", 6),
                        vehicle_no=_make_vehicle_number(base_id, vehicle_type),
                        type=vehicle_type,
                        model=data.get("model") or (template.model if template else f"{vehicle_type} Mk-I"),
                        manufacture_date=template.manufacture_date if template else date(2020, 1, 1),
                        city=city,
                        state=state,
                        pincode=pincode,
                        operational_status="available",
                    )
                    changed_ids.append(row.vehicle_id)
            else:
                rows = list(
                    Vehicle.objects.filter(type=vehicle_type, state__iexact=state)
                    .exclude(operational_status="decommissioned")
                    .order_by("vehicle_id")[:quantity]
                )
                for row in rows:
                    row.operational_status = "decommissioned"
                    row.save(update_fields=["operational_status", "updated_at"])
                    changed_ids.append(row.vehicle_id)

        payload = {
            "operation": operation,
            "base_id": base_id,
            "vehicle_type": vehicle_type,
            "quantity": quantity,
            "reason": reason,
            "changed_ids": changed_ids,
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="vehicle",
            entity_id=vehicle_type,
            action=f"Vehicle {operation.lower()} x{quantity} on {base_id}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="VEHICLE_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"{operation} {quantity} {vehicle_type}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=vehicle_type,
        )

        return Response(
            {
                "success": True,
                "message": "Vehicle operation completed.",
                "data": {
                    "changed_count": len(changed_ids),
                    "changed_ids": changed_ids,
                    "layer1": layer1,
                    "layer2": layer2,
                },
            },
            status=status.HTTP_200_OK,
        )


class VehicleDetailView(APIView):
    def put(self, request, vehicle_id: str):
        serializer = VehicleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        vehicle = Vehicle.objects.filter(vehicle_id=vehicle_id).first()
        if vehicle is None:
            return Response({"success": False, "message": "Vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id_before = resolve_base_for_vehicle(vehicle)
        if not can_edit_base(actor, base_id_before):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        target_state = data.get("state", vehicle.state)
        base_id_after = normalize_state_to_base_id(target_state)
        is_transfer = base_id_after != base_id_before
        if is_transfer and actor.role != "super_admin":
            return Response(
                {"success": False, "message": "Only Super Admin can transfer a vehicle between bases."},
                status=status.HTTP_403_FORBIDDEN,
            )

        container = get_service_container()
        layer1 = {"success": True, "status": "SKIPPED", "entry_id": 0}
        if is_transfer:
            wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
            if not wallet:
                return Response(
                    {"success": False, "message": "No blockchain wallet is mapped for this user."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            transfer_reason = data.get("reason") or f"Vehicle transfer {base_id_before} -> {base_id_after}"
            layer1 = container.blockchain_gateway.record_vehicle_movement(
                wallet_address=wallet,
                base_id=base_id_after,
                vehicle_number=vehicle.vehicle_no,
                movement_type="TRANSFER",
                quantity_change=0,
                reason=transfer_reason,
            )
            if not layer1.get("success"):
                return Response(
                    {"success": False, "message": "Blockchain transfer validation failed.", "layer1": layer1},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        before = VehicleSerializer(vehicle).data
        changed = False
        for field in ["type", "model", "operational_status"]:
            if field in data:
                setattr(vehicle, field, data[field])
                changed = True

        if is_transfer:
            vehicle.state = BASE_ID_TO_STATE.get(base_id_after, data.get("state", vehicle.state))
            vehicle.city = BASE_ID_TO_CITY.get(base_id_after, data.get("city", vehicle.city))
            vehicle.pincode = BASE_ID_TO_PINCODE.get(base_id_after, data.get("pincode", vehicle.pincode))
            changed = True
        else:
            for field in ["city", "state", "pincode"]:
                if field in data:
                    setattr(vehicle, field, data[field])
                    changed = True

        if changed:
            vehicle.save()

        after = VehicleSerializer(vehicle).data
        payload = {
            "vehicle_id": vehicle_id,
            "vehicle_no": vehicle.vehicle_no,
            "base_id_before": base_id_before,
            "base_id_after": base_id_after,
            "before": before,
            "after": after,
            "reason": data.get("reason") or "Vehicle metadata correction",
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="vehicle_update",
            entity_id=vehicle.vehicle_no,
            action=f"Vehicle metadata updated for {vehicle.vehicle_no}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        summary = f"Vehicle metadata update: {vehicle.vehicle_no}"
        if is_transfer:
            summary = f"Vehicle transfer {vehicle.vehicle_no} {base_id_before} -> {base_id_after}"

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id_after,
            category="VEHICLE_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=summary,
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=vehicle.vehicle_no,
        )

        return Response(
            {
                "success": True,
                "data": {
                    "vehicle": after,
                    "layer1": layer1,
                    "layer2": layer2,
                },
            },
            status=status.HTTP_200_OK,
        )

    def delete(self, request, vehicle_id: str):
        actor_user_id = request.query_params.get("actor_user_id", "").strip() or str(request.data.get("actor_user_id", "")).strip()
        serializer = VehicleDeleteSerializer(
            data={
                "actor_user_id": actor_user_id,
                "reason": request.query_params.get("reason", "").strip() or str(request.data.get("reason", "")).strip(),
            }
        )
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        vehicle = Vehicle.objects.filter(vehicle_id=vehicle_id).first()
        if vehicle is None:
            return Response({"success": False, "message": "Vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        if vehicle.operational_status == "decommissioned":
            return Response(
                {"success": False, "message": "Vehicle is already decommissioned."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        reason = data.get("reason") or "Vehicle decommissioned from dashboard"
        layer1 = container.blockchain_gateway.record_vehicle_movement(
            wallet_address=wallet,
            base_id=base_id,
            vehicle_number=vehicle.vehicle_no,
            movement_type="REMOVAL",
            quantity_change=-1,
            reason=reason,
        )
        if not layer1.get("success"):
            return Response(
                {"success": False, "message": "Blockchain validation failed.", "layer1": layer1},
                status=status.HTTP_400_BAD_REQUEST,
            )

        vehicle.operational_status = "decommissioned"
        vehicle.save(update_fields=["operational_status", "updated_at"])

        output = VehicleSerializer(vehicle).data
        payload = {
            "vehicle_id": vehicle.vehicle_id,
            "vehicle_no": vehicle.vehicle_no,
            "base_id": base_id,
            "reason": reason,
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="vehicle",
            entity_id=vehicle.vehicle_id,
            action=f"Vehicle decommissioned: {vehicle.vehicle_no}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="VEHICLE_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"REMOVAL 1 {vehicle.type}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=vehicle.vehicle_no,
        )

        return Response(
            {
                "success": True,
                "message": "Vehicle decommissioned successfully.",
                "data": {
                    "vehicle": output,
                    "layer1": layer1,
                    "layer2": layer2,
                },
            },
            status=status.HTTP_200_OK,
        )


class VehicleHealthView(APIView):
    def get(self, request, vehicle_id: str):
        container = get_service_container()
        score = container.fleet_service.get_latest_health(vehicle_id)
        if score is None:
            return Response(
                {"success": False, "message": "No health score found for this vehicle."},
                status=status.HTTP_404_NOT_FOUND,
            )

        output = HealthScoreSerializer(score)
        return Response({"success": True, "data": output.data}, status=status.HTTP_200_OK)


class FleetSummaryView(APIView):
    def get(self, request):
        container = get_service_container()
        summary = container.fleet_service.get_fleet_summary()
        return Response({"success": True, "data": summary}, status=status.HTTP_200_OK)


class MaintenanceListView(APIView):
    def get(self, request):
        serializer = MaintenanceQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        actor = None
        if data.get("actor_user_id"):
            actor = _get_active_admin(data["actor_user_id"])
            if actor is None:
                return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        container = get_service_container()
        records = container.fleet_service.list_maintenance_records(
            service_type=data.get("service_type", ""),
            vehicle_no=data.get("vehicle_no", ""),
            limit=data.get("limit", 200),
        )

        requested_base_id = data.get("base_id", "").strip()
        if requested_base_id:
            state = BASE_ID_TO_STATE.get(requested_base_id, "")
            if state:
                records = records.filter(vehicle__state__iexact=state)

        output = MaintenanceRecordSerializer(records, many=True)
        return Response({"success": True, "data": output.data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = MaintenanceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        vehicle = Vehicle.objects.filter(vehicle_id=data["vehicle_id"]).first()
        if vehicle is None:
            return Response({"success": False, "message": "Vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        layer1 = container.blockchain_gateway.record_maintenance_action(
            wallet_address=wallet,
            base_id=base_id,
            vehicle_number=vehicle.vehicle_no,
            description=data["outcome"],
            parts_used=[],
            cost_estimate=_to_paise(data["cost"]),
        )
        if not layer1.get("success"):
            return Response({"success": False, "message": "Blockchain validation failed.", "layer1": layer1}, status=status.HTTP_400_BAD_REQUEST)

        record = MaintainanceRecord.objects.create(
            record_id=_make_id("MR", 6),
            vehicle=vehicle,
            service_date=data["service_date"],
            cost=data["cost"],
            outcome=data["outcome"],
            service_type=data["service_type"],
            duration_hours=data["duration_hours"],
            technician=actor,
        )

        payload = {
            "record_id": record.record_id,
            "vehicle_id": record.vehicle_id,
            "service_type": record.service_type,
            "service_date": str(record.service_date),
            "cost": str(record.cost),
            "reason": data.get("reason") or "Maintenance record created",
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="maintenance",
            entity_id=record.record_id,
            action=f"Maintenance created for {vehicle.vehicle_no}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="MAINTENANCE",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"Maintenance created for {vehicle.vehicle_no}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=vehicle.vehicle_no,
        )

        output = MaintenanceRecordSerializer(record)
        return Response({"success": True, "data": output.data, "layer2": layer2}, status=status.HTTP_201_CREATED)


class MaintenanceDetailView(APIView):
    def put(self, request, record_id: str):
        serializer = MaintenanceWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        record = MaintainanceRecord.objects.select_related("vehicle").filter(record_id=record_id).first()
        if record is None:
            return Response({"success": False, "message": "Maintenance record not found."}, status=status.HTTP_404_NOT_FOUND)

        target_vehicle = Vehicle.objects.filter(vehicle_id=data["vehicle_id"]).first()
        if target_vehicle is None:
            return Response({"success": False, "message": "Target vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(target_vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        layer1 = container.blockchain_gateway.record_maintenance_action(
            wallet_address=wallet,
            base_id=base_id,
            vehicle_number=target_vehicle.vehicle_no,
            description=f"EDIT {record_id}: {data['outcome']}",
            parts_used=[],
            cost_estimate=_to_paise(data["cost"]),
        )
        if not layer1.get("success"):
            return Response({"success": False, "message": "Blockchain validation failed.", "layer1": layer1}, status=status.HTTP_400_BAD_REQUEST)

        record.vehicle = target_vehicle
        record.service_date = data["service_date"]
        record.cost = data["cost"]
        record.outcome = data["outcome"]
        record.service_type = data["service_type"]
        record.duration_hours = data["duration_hours"]
        record.technician = actor
        record.save()

        payload = {
            "record_id": record.record_id,
            "vehicle_id": record.vehicle_id,
            "service_type": record.service_type,
            "service_date": str(record.service_date),
            "cost": str(record.cost),
            "reason": data.get("reason") or "Maintenance record updated",
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="maintenance",
            entity_id=record.record_id,
            action=f"Maintenance updated for {target_vehicle.vehicle_no}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="MAINTENANCE",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"Maintenance updated for {target_vehicle.vehicle_no}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=target_vehicle.vehicle_no,
        )

        output = MaintenanceRecordSerializer(record)
        return Response({"success": True, "data": output.data, "layer2": layer2}, status=status.HTTP_200_OK)

    def delete(self, request, record_id: str):
        actor_user_id = request.query_params.get("actor_user_id", "").strip() or str(request.data.get("actor_user_id", "")).strip()
        actor = _get_active_admin(actor_user_id)
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        record = MaintainanceRecord.objects.select_related("vehicle").filter(record_id=record_id).first()
        if record is None:
            return Response({"success": False, "message": "Maintenance record not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(record.vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        layer1 = container.blockchain_gateway.record_maintenance_action(
            wallet_address=wallet,
            base_id=base_id,
            vehicle_number=record.vehicle.vehicle_no,
            description=f"DELETE {record.record_id}: {record.outcome}",
            parts_used=[],
            cost_estimate=_to_paise(record.cost),
        )
        if not layer1.get("success"):
            return Response({"success": False, "message": "Blockchain validation failed.", "layer1": layer1}, status=status.HTTP_400_BAD_REQUEST)

        payload = {
            "record_id": record.record_id,
            "vehicle_id": record.vehicle_id,
            "service_type": record.service_type,
            "service_date": str(record.service_date),
            "cost": str(record.cost),
            "reason": "Maintenance record deleted",
            "layer1_entry_id": layer1.get("entry_id"),
        }
        record.delete()

        _log_local_audit(
            actor,
            entity_type="maintenance",
            entity_id=payload["record_id"],
            action=f"Maintenance deleted for {payload['vehicle_id']}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="MAINTENANCE",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"Maintenance deleted for {payload['vehicle_id']}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=payload["vehicle_id"],
        )

        return Response({"success": True, "message": "Maintenance record deleted.", "layer2": layer2}, status=status.HTTP_200_OK)


class InventoryListView(APIView):
    def get(self, request):
        serializer = InventoryQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = None
        if data.get("actor_user_id"):
            actor = _get_active_admin(data["actor_user_id"])
            if actor is None:
                return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        queryset = SpareParts.objects.select_related("vehicle", "record").all().order_by("part_id")
        if data.get("vehicle_no"):
            queryset = queryset.filter(vehicle__vehicle_no__icontains=data["vehicle_no"])
        if data.get("part_name"):
            queryset = queryset.filter(part_name__icontains=data["part_name"])

        requested_base_id = data.get("base_id", "").strip()
        if requested_base_id:
            state = BASE_ID_TO_STATE.get(requested_base_id, "")
            if state:
                queryset = queryset.filter(vehicle__state__iexact=state)

        queryset = queryset[: data.get("limit", 200)]

        output = InventoryRecordSerializer(queryset, many=True)
        return Response({"success": True, "data": output.data}, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = InventoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        vehicle = Vehicle.objects.filter(vehicle_id=data["vehicle_id"]).first()
        if vehicle is None:
            return Response({"success": False, "message": "Vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        reason = data.get("reason") or "Inventory part added"
        chain_part_code = _make_id("SP", 6)
        layer1 = container.blockchain_gateway.record_spare_part_movement(
            wallet_address=wallet,
            base_id=base_id,
            part_code=chain_part_code,
            part_name=data["part_name"],
            movement_type="ADDITION",
            quantity_change=int(data["quantity"]),
            reason=reason,
        )
        if not layer1.get("success"):
            return Response({"success": False, "message": "Blockchain validation failed.", "layer1": layer1}, status=status.HTTP_400_BAD_REQUEST)

        record = None
        if data.get("record_id"):
            record = MaintainanceRecord.objects.filter(record_id=data["record_id"]).first()

        part = SpareParts.objects.create(
            part_id=_make_id("SP", 6),
            part_name=data["part_name"],
            quantity=int(data["quantity"]),
            vehicle=vehicle,
            record=record,
            unit_cost=data.get("unit_cost") or Decimal("0"),
            supplier=data.get("supplier") or "",
        )

        payload = {
            "part_id": part.part_id,
            "chain_part_code": chain_part_code,
            "part_name": part.part_name,
            "vehicle_id": part.vehicle_id,
            "quantity": part.quantity,
            "reason": reason,
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="spare_part",
            entity_id=part.part_id,
            action=f"Spare part created for {vehicle.vehicle_no}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="SPARE_PART_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"Spare part added: {part.part_name}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=part.part_name,
        )

        output = InventoryRecordSerializer(part)
        return Response({"success": True, "data": output.data, "layer2": layer2}, status=status.HTTP_201_CREATED)


class InventoryDetailView(APIView):
    def put(self, request, part_id: str):
        serializer = InventoryWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        part = SpareParts.objects.select_related("vehicle", "record").filter(part_id=part_id).first()
        if part is None:
            return Response({"success": False, "message": "Part not found."}, status=status.HTTP_404_NOT_FOUND)

        target_vehicle = Vehicle.objects.filter(vehicle_id=data["vehicle_id"]).first()
        if target_vehicle is None:
            return Response({"success": False, "message": "Target vehicle not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(target_vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        new_qty = int(data["quantity"])
        delta = new_qty - int(part.quantity)
        reason = data.get("reason") or "Inventory part updated"

        layer1 = {"success": True, "status": "SKIPPED", "entry_id": 0}
        if delta != 0:
            layer1 = container.blockchain_gateway.record_spare_part_movement(
                wallet_address=wallet,
                base_id=base_id,
                part_code=part.part_id,
                part_name=data["part_name"],
                movement_type="ADDITION" if delta > 0 else "REMOVAL",
                quantity_change=abs(delta),
                reason=reason,
            )
            if not layer1.get("success"):
                return Response({"success": False, "message": "Blockchain validation failed.", "layer1": layer1}, status=status.HTTP_400_BAD_REQUEST)

        part.part_name = data["part_name"]
        part.quantity = new_qty
        part.vehicle = target_vehicle
        part.unit_cost = data.get("unit_cost") or Decimal("0")
        part.supplier = data.get("supplier") or ""
        if data.get("record_id"):
            part.record = MaintainanceRecord.objects.filter(record_id=data["record_id"]).first()
        part.save()

        payload = {
            "part_id": part.part_id,
            "part_name": part.part_name,
            "vehicle_id": part.vehicle_id,
            "quantity": part.quantity,
            "delta": delta,
            "reason": reason,
            "layer1_entry_id": layer1.get("entry_id"),
        }
        _log_local_audit(
            actor,
            entity_type="spare_part",
            entity_id=part.part_id,
            action=f"Spare part updated: {part.part_name}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="SPARE_PART_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"Spare part updated: {part.part_name}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=part.part_name,
        )

        output = InventoryRecordSerializer(part)
        return Response({"success": True, "data": output.data, "layer2": layer2}, status=status.HTTP_200_OK)

    def delete(self, request, part_id: str):
        actor_user_id = request.query_params.get("actor_user_id", "").strip() or str(request.data.get("actor_user_id", "")).strip()
        actor = _get_active_admin(actor_user_id)
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        part = SpareParts.objects.select_related("vehicle").filter(part_id=part_id).first()
        if part is None:
            return Response({"success": False, "message": "Part not found."}, status=status.HTTP_404_NOT_FOUND)

        base_id = resolve_base_for_vehicle(part.vehicle)
        if not can_edit_base(actor, base_id):
            return Response({"success": False, "message": "You cannot edit this base."}, status=status.HTTP_403_FORBIDDEN)

        container = get_service_container()
        wallet = resolve_wallet_for_admin(actor, container.blockchain_gateway)
        if not wallet:
            return Response({"success": False, "message": "No blockchain wallet is mapped for this user."}, status=status.HTTP_400_BAD_REQUEST)

        layer1 = {"success": True, "status": "SKIPPED", "entry_id": 0}
        if part.quantity > 0:
            layer1 = container.blockchain_gateway.record_spare_part_movement(
                wallet_address=wallet,
                base_id=base_id,
                part_code=part.part_id,
                part_name=part.part_name,
                movement_type="REMOVAL",
                quantity_change=int(part.quantity),
                reason="Inventory part deleted",
            )
            if not layer1.get("success"):
                return Response({"success": False, "message": "Blockchain validation failed.", "layer1": layer1}, status=status.HTTP_400_BAD_REQUEST)

        payload = {
            "part_id": part.part_id,
            "part_name": part.part_name,
            "vehicle_id": part.vehicle_id,
            "quantity": part.quantity,
            "reason": "Inventory part deleted",
            "layer1_entry_id": layer1.get("entry_id"),
        }
        part.delete()

        _log_local_audit(
            actor,
            entity_type="spare_part",
            entity_id=payload["part_id"],
            action=f"Spare part deleted: {payload['part_name']}",
            payload=payload,
            ip_address=request.META.get("REMOTE_ADDR"),
        )

        layer2 = _log_layer2_audit(
            container,
            base_id=base_id,
            category="SPARE_PART_MOVEMENT",
            layer1_ref_id=int(layer1.get("entry_id") or 0),
            action_summary=f"Spare part deleted: {payload['part_name']}",
            performed_by=actor.username,
            mysql_row_data=payload,
            affected_asset=payload["part_name"],
        )

        return Response({"success": True, "message": "Part deleted.", "layer2": layer2}, status=status.HTTP_200_OK)


class MLLatestView(APIView):
    def get(self, request):
        serializer = MLLatestQuerySerializer(data=request.query_params)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        actor = _get_active_admin(data["actor_user_id"])
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)

        limit = data.get("limit", 200)
        actor_base = resolve_base_for_admin(actor)

        latest_by_vehicle = {}
        rows = HealthScores.objects.select_related("vehicle").order_by("vehicle_id", "-assessment_date", "-score_id")
        for row in rows:
            if row.vehicle_id in latest_by_vehicle:
                continue
            base_id = resolve_base_for_vehicle(row.vehicle)
            if actor.role == "base_admin" and base_id != actor_base:
                continue
            latest_by_vehicle[row.vehicle_id] = {
                "vehicle_id": row.vehicle.vehicle_id,
                "vehicle_no": row.vehicle.vehicle_no,
                "base_id": base_id,
                "assessment_date": row.assessment_date,
                "overall_health_score": row.overall_health_score,
                "health_status": row.health_status,
                "risk_category": row.risk_category,
                "predicted_days_to_service": row.predicted_days_to_service,
                "confidence_level": row.confidence_level,
                "recommended_action": row.recommended_action,
                "model_version": row.model_version,
            }
            if len(latest_by_vehicle) >= limit:
                break

        predictions = list(latest_by_vehicle.values())
        latest_assessment_date = None
        if predictions:
            latest_assessment_date = max(item["assessment_date"].date() for item in predictions)
        due_date, is_stale = next_prediction_due(latest_assessment_date)

        return Response(
            {
                "success": True,
                "data": {
                    "role": role_label(actor.role),
                    "base_scope": actor_base,
                    "can_trigger": can_trigger_ml(actor),
                    "stale_after_days": 7,
                    "latest_assessment_date": latest_assessment_date,
                    "next_due_date": due_date,
                    "is_stale": is_stale,
                    "predictions": predictions,
                },
            },
            status=status.HTTP_200_OK,
        )


class VehicleMovementOperationView(APIView):
    def post(self, request):
        serializer = VehicleMovementRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_service_container()
        result = container.operations_orchestrator.process_vehicle_movement(serializer.validated_data)

        http_status = status.HTTP_200_OK if result.success else status.HTTP_400_BAD_REQUEST
        return Response(result.to_dict(), status=http_status)


class TriggerInferenceView(APIView):
    def post(self, request):
        serializer = InferenceTriggerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        actor_user_id = (serializer.validated_data.get("actor_user_id") or "").strip()
        if not actor_user_id:
            return Response(
                {"success": False, "message": "actor_user_id is required for ML trigger."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = _get_active_admin(actor_user_id)
        if actor is None:
            return Response({"success": False, "message": "Invalid actor_user_id."}, status=status.HTTP_400_BAD_REQUEST)
        if not can_trigger_ml(actor):
            return Response(
                {"success": False, "message": "Only Super Admin can trigger ML inference."},
                status=status.HTTP_403_FORBIDDEN,
            )

        container = get_service_container()
        result = container.ml_gateway.run_inference(
            timeout_seconds=serializer.validated_data["timeout_seconds"]
        )

        http_status = status.HTTP_200_OK if result.get("success") else status.HTTP_500_INTERNAL_SERVER_ERROR
        return Response(result, status=http_status)


class MovementInferenceWorkflowView(APIView):
    def post(self, request):
        serializer = MovementInferenceWorkflowSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        container = get_service_container()
        result = container.workflow_service.run_vehicle_movement_and_inference(
            serializer.validated_data
        )

        http_status = status.HTTP_200_OK if result.success else status.HTTP_400_BAD_REQUEST
        return Response(result.to_dict(), status=http_status)
