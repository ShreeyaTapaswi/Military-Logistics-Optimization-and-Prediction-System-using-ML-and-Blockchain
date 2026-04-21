from typing import Optional

from backend.models import MaintainanceRecord


class MaintenanceRepository:
    def list_records(
        self,
        service_type: Optional[str] = None,
        vehicle_no: Optional[str] = None,
        limit: int = 200,
    ):
        queryset = (
            MaintainanceRecord.objects.select_related("vehicle", "technician")
            .all()
            .order_by("-service_date", "-created_at")
        )

        if service_type:
            queryset = queryset.filter(service_type__iexact=service_type)
        if vehicle_no:
            queryset = queryset.filter(vehicle__vehicle_no__icontains=vehicle_no)

        return queryset[:limit]