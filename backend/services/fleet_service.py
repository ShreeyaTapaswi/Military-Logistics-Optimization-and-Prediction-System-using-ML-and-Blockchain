from backend.repositories.health_repository import HealthRepository
from backend.repositories.vehicle_repository import VehicleRepository


class FleetService:
    def __init__(
        self,
        vehicle_repository: VehicleRepository,
        health_repository: HealthRepository,
    ):
        self.vehicle_repository = vehicle_repository
        self.health_repository = health_repository

    def list_vehicles(self, status: str = "", state: str = "", limit: int = 100):
        return self.vehicle_repository.list_vehicles(
            status=status,
            state=state,
            limit=limit,
        )

    def get_latest_health(self, vehicle_id: str):
        return self.health_repository.get_latest_by_vehicle_id(vehicle_id)

    def get_fleet_summary(self):
        return self.health_repository.get_fleet_summary()
