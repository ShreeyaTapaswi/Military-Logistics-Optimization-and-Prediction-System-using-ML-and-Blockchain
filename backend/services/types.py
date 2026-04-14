from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass
class ServiceResult:
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "message": self.message,
            "data": self.data or {},
            "error": self.error,
        }
