from dataclasses import dataclass
from functools import lru_cache

from django.conf import settings

from backend.repositories.health_repository import HealthRepository
from backend.repositories.maintenance_repository import MaintenanceRepository
from backend.repositories.vehicle_repository import VehicleRepository
from backend.services.blockchain_gateway import BlockchainGateway
from backend.services.fleet_service import FleetService
from backend.services.ml_gateway import MLGateway
from backend.services.operations_orchestrator import OperationsOrchestrator
from backend.services.workflow_service import WorkflowService


@dataclass(frozen=True)
class ServiceContainer:
    fleet_service: FleetService
    blockchain_gateway: BlockchainGateway
    ml_gateway: MLGateway
    operations_orchestrator: OperationsOrchestrator
    workflow_service: WorkflowService


@lru_cache(maxsize=1)
def get_service_container() -> ServiceContainer:
    vehicle_repo = VehicleRepository()
    health_repo = HealthRepository()
    maintenance_repo = MaintenanceRepository()

    fleet_service = FleetService(
        vehicle_repository=vehicle_repo,
        health_repository=health_repo,
        maintenance_repository=maintenance_repo,
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

    workflow_service = WorkflowService(
        operations_orchestrator=operations_orchestrator,
        ml_gateway=ml_gateway,
        fleet_service=fleet_service,
    )

    return ServiceContainer(
        fleet_service=fleet_service,
        blockchain_gateway=blockchain_gateway,
        ml_gateway=ml_gateway,
        operations_orchestrator=operations_orchestrator,
        workflow_service=workflow_service,
    )
