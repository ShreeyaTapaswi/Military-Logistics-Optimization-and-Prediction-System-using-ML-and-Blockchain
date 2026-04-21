from django.urls import path

from backend.api.views import (
    AuthLoginView,
    FleetSummaryView,
    InventoryDetailView,
    InventoryListView,
    MaintenanceListView,
    MaintenanceDetailView,
    MLLatestView,
    MovementInferenceWorkflowView,
    SystemHealthView,
    TriggerInferenceView,
    VehicleCreateView,
    VehicleDetailView,
    VehicleHealthView,
    VehicleListView,
    VehicleOperationView,
    VehicleMovementOperationView,
)

urlpatterns = [
    path("auth/login/", AuthLoginView.as_view(), name="auth-login"),
    path("health/", SystemHealthView.as_view(), name="system-health"),
    path("vehicles/", VehicleListView.as_view(), name="vehicles"),
    path("vehicles/create/", VehicleCreateView.as_view(), name="vehicle-create"),
    path("vehicles/operate/", VehicleOperationView.as_view(), name="vehicle-operate"),
    path("vehicles/<str:vehicle_id>/", VehicleDetailView.as_view(), name="vehicle-detail"),
    path("maintenance/", MaintenanceListView.as_view(), name="maintenance-list"),
    path("maintenance/<str:record_id>/", MaintenanceDetailView.as_view(), name="maintenance-detail"),
    path("inventory/", InventoryListView.as_view(), name="inventory-list"),
    path("inventory/<str:part_id>/", InventoryDetailView.as_view(), name="inventory-detail"),
    path("ml/latest/", MLLatestView.as_view(), name="ml-latest"),
    path("vehicles/<str:vehicle_id>/health/", VehicleHealthView.as_view(), name="vehicle-health"),
    path("fleet/summary/", FleetSummaryView.as_view(), name="fleet-summary"),
    path("operations/vehicle-movement/", VehicleMovementOperationView.as_view(), name="vehicle-movement"),
    path(
        "workflows/vehicle-movement-inference/",
        MovementInferenceWorkflowView.as_view(),
        name="workflow-vehicle-movement-inference",
    ),
    path("ml/run-inference/", TriggerInferenceView.as_view(), name="ml-run-inference"),
]
