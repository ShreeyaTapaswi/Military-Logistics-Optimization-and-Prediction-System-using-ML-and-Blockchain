from collections import Counter
from statistics import mean
from typing import Dict, Optional

from backend.models import HealthScores


class HealthRepository:
    def get_latest_by_vehicle_id(self, vehicle_id: str) -> Optional[HealthScores]:
        return (
            HealthScores.objects.filter(vehicle_id=vehicle_id)
            .order_by("-assessment_date", "-score_id")
            .first()
        )

    def get_latest_by_vehicle_no(self, vehicle_no: str) -> Optional[HealthScores]:
        return (
            HealthScores.objects.filter(vehicle__vehicle_no=vehicle_no)
            .order_by("-assessment_date", "-score_id")
            .first()
        )

    def get_fleet_summary(self) -> Dict[str, object]:
        vehicle_ids = (
            HealthScores.objects.values_list("vehicle_id", flat=True)
            .distinct()
            .order_by("vehicle_id")
        )

        latest_scores = []
        for vehicle_id in vehicle_ids:
            score = self.get_latest_by_vehicle_id(vehicle_id)
            if score is not None:
                latest_scores.append(score)

        if not latest_scores:
            return {
                "vehicle_count": 0,
                "average_health_score": 0.0,
                "risk_distribution": {},
                "status_distribution": {},
            }

        risk_counter = Counter([row.risk_category for row in latest_scores])
        status_counter = Counter([row.health_status for row in latest_scores])
        avg_score = mean([row.overall_health_score for row in latest_scores])

        return {
            "vehicle_count": len(latest_scores),
            "average_health_score": round(float(avg_score), 2),
            "risk_distribution": dict(risk_counter),
            "status_distribution": dict(status_counter),
        }
