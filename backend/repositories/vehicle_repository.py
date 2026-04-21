from typing import Optional

from backend.models import Vehicle


class VehicleRepository:
    def list_vehicles(
        self,
        status: Optional[str] = None,
        state: Optional[str] = None,
        limit: int = 100,
    ):
        queryset = Vehicle.objects.all().order_by("-created_at", "-updated_at", "vehicle_id")

        if status:
            queryset = queryset.filter(operational_status=status)
        if state:
            queryset = queryset.filter(state__iexact=state)

        return queryset[:limit]

    def get_by_id(self, vehicle_id: str) -> Optional[Vehicle]:
        return Vehicle.objects.filter(vehicle_id=vehicle_id).first()

    def get_by_vehicle_no(self, vehicle_no: str) -> Optional[Vehicle]:
        return Vehicle.objects.filter(vehicle_no=vehicle_no).first()
