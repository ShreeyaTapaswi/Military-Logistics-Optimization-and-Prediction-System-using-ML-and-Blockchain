from dataclasses import dataclass
from functools import lru_cache

from django.conf import settings

from backend.repositories.health_repository import HealthRepository
from backend.repositories.vehicle_repository import VehicleRepository
from backend.services.blockchain_gateway import BlockchainGateway
from backend.services.fleet_service import FleetService
from backend.services.ml_gateway import MLGateway
from backend.services.operations_orchestrator import OperationsOrchestrator


@dataclass(frozen=True)
class ServiceContainer:
    fleet_service: FleetService
    blockchain_gateway: BlockchainGateway
    ml_gateway: MLGateway
    operations_orchestrator: OperationsOrchestrator


@lru_cache(maxsize=1)
def get_service_container() -> ServiceContainer:
    vehicle_repo = VehicleRepository()
    health_repo = HealthRepository()

    fleet_service = FleetService(
        vehicle_repository=vehicle_repo,
        health_repository=health_repo,
    )

    blockchain_gateway = BlockchainGateway(enabled=settings.BLOCKCHAIN_ENABLED)
    ml_gateway = MLGateway(
        pipeline_root=settings.ML_PIPELINE_ROOT,
        python_executable=settings.ML_PYTHON_EXECUTABLE,
    )

    operations_orchestrator = OperationsOrchestrator(
        blockchain_gateway=blockchain_gateway,
        strict_layer1=settings.BLOCKCHAIN_STRICT_LAYER1,
    )

    return ServiceContainer(
        fleet_service=fleet_service,
        blockchain_gateway=blockchain_gateway,
        ml_gateway=ml_gateway,
        operations_orchestrator=operations_orchestrator,
    )
