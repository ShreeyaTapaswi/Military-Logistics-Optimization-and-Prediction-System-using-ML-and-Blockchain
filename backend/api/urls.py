from django.urls import path

from backend.api.views import (
    FleetSummaryView,
    SystemHealthView,
    TriggerInferenceView,
    VehicleHealthView,
    VehicleListView,
    VehicleMovementOperationView,
)

urlpatterns = [
    path("health/", SystemHealthView.as_view(), name="system-health"),
    path("vehicles/", VehicleListView.as_view(), name="vehicles"),
    path("vehicles/<str:vehicle_id>/health/", VehicleHealthView.as_view(), name="vehicle-health"),
    path("fleet/summary/", FleetSummaryView.as_view(), name="fleet-summary"),
    path("operations/vehicle-movement/", VehicleMovementOperationView.as_view(), name="vehicle-movement"),
    path("ml/run-inference/", TriggerInferenceView.as_view(), name="ml-run-inference"),
]
