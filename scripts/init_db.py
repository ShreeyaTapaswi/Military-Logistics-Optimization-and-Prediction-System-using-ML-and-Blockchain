import argparse
import sys
from pathlib import Path

import pymysql
from pymysql.constants import CLIENT


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize mlops_db using database/schema.sql")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=3306)
    parser.add_argument("--user", default="root")
    parser.add_argument("--password", default="root")
    parser.add_argument("--schema", default="database/schema.sql")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    schema_path = Path(args.schema)
    if not schema_path.exists():
        print(f"Schema file not found: {schema_path}")
        return 1

    sql = schema_path.read_text(encoding="utf-8")

    try:
        conn = pymysql.connect(
            host=args.host,
            port=args.port,
            user=args.user,
            password=args.password,
            autocommit=True,
            client_flag=CLIENT.MULTI_STATEMENTS,
        )
    except Exception as exc:
        print(f"Unable to connect to MySQL: {exc}")
        return 1

    try:
        with conn.cursor() as cursor:
            cursor.execute(sql)
            while cursor.nextset():
                pass
        print("Database initialized successfully: mlops_db")
        return 0
    except Exception as exc:
        print(f"Schema import failed: {exc}")
        return 1
    finally:
        conn.close()


if __name__ == "__main__":
    sys.exit(main())
