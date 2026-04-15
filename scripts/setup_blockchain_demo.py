import argparse
import sys
from pathlib import Path

from web3 import Web3


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Register base admin and authorize backend on blockchain")
    parser.add_argument("--rpc-url", default="http://127.0.0.1:7545")
    parser.add_argument("--base-id", default="BASE_PUNE")
    parser.add_argument("--admin-index", type=int, default=2)
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    blockchain_dir = repo_root / "blockchain"
    if str(blockchain_dir) not in sys.path:
        sys.path.insert(0, str(blockchain_dir))

    from blockchain_service.django_integration import BlockchainBridge

    web3 = Web3(Web3.HTTPProvider(args.rpc_url))
    if not web3.is_connected():
        print(f"Cannot connect to Ganache at {args.rpc_url}")
        return 1

    accounts = web3.eth.accounts
    if args.admin_index >= len(accounts):
        print(f"Admin index {args.admin_index} out of range. Accounts available: {len(accounts)}")
        return 1

    admin_wallet = accounts[args.admin_index]

    bridge = BlockchainBridge()
    if not bridge.is_connected:
        print("Blockchain bridge is not connected.")
        return 1

    result = bridge.setup_base(base_id=args.base_id, admin_wallet=admin_wallet)
    print("Blockchain demo setup completed.")
    print(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
