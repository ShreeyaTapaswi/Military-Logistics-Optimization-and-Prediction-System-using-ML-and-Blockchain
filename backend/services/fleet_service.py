from backend.repositories.health_repository import HealthRepository
from backend.repositories.maintenance_repository import MaintenanceRepository
from backend.repositories.vehicle_repository import VehicleRepository


class FleetService:
    def __init__(
        self,
        vehicle_repository: VehicleRepository,
        health_repository: HealthRepository,
        maintenance_repository: MaintenanceRepository,
    ):
        self.vehicle_repository = vehicle_repository
        self.health_repository = health_repository
        self.maintenance_repository = maintenance_repository

    def list_vehicles(self, status: str = "", state: str = "", limit: int = 100):
        return self.vehicle_repository.list_vehicles(
            status=status,
            state=state,
            limit=limit,
        )

    def get_latest_health(self, vehicle_id: str):
        return self.health_repository.get_latest_by_vehicle_id(vehicle_id)

    def get_latest_health_by_vehicle_no(self, vehicle_no: str):
        return self.health_repository.get_latest_by_vehicle_no(vehicle_no)

    def get_fleet_summary(self):
        return self.health_repository.get_fleet_summary()

    def list_maintenance_records(self, service_type: str = "", vehicle_no: str = "", limit: int = 200):
        return self.maintenance_repository.list_records(
            service_type=service_type,
            vehicle_no=vehicle_no,
            limit=limit,
        )
