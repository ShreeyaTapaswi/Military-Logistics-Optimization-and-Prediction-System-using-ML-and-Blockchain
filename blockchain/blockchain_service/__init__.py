"""
blockchain_service  —  Python Web3 bridge for Django integration.

Your Django teammate imports from this package:
    from blockchain_service import BlockchainService       # low-level
    from blockchain_service import BlockchainBridge        # Django-friendly wrapper
"""

from .contract_interface import BlockchainService
from .django_integration import BlockchainBridge

__all__ = ["BlockchainService", "BlockchainBridge"]
